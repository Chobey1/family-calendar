import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';
import { db, familyData } from './lib/db.mjs';
import { zone, occurrences, recipients, weeklyWindow } from './lib/calendar.mjs';
import { reminderSubject, digestSubject, styledEmail, leadTime } from './lib/email.mjs';
import { fileURLToPath } from 'node:url';

const mode=process.env.MAIL_MODE || 'preview';
if(!['preview','smtp'].includes(mode)) throw new Error('MAIL_MODE must be preview or smtp.');
if(mode==='smtp' && (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.MAIL_FROM)) throw new Error('Configure SMTP credentials and MAIL_FROM before enabling smtp mode.');
const transport=mode==='smtp' ? nodemailer.createTransport({host:process.env.SMTP_HOST || 'mail.smtp2go.com',port:Number(process.env.SMTP_PORT || 2525),secure:Number(process.env.SMTP_PORT)===465,requireTLS:Number(process.env.SMTP_PORT)!==465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:30000}) : null;
async function queue(client,id,family,event,recipient,subject,message,due) {
  await client.query("INSERT INTO mail_jobs (id,family_id,event_id,event_version,recipient,subject,body,due_at,html) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,html=EXCLUDED.html WHERE mail_jobs.status='pending' AND mail_jobs.html IS NULL",[id,family,event?.id || null,event?.version || null,recipient,subject,message.text,due.toISO(),message.html]);
}
async function tick() {
  const client=await db.connect();
  try {
    if(!(await client.query('SELECT pg_try_advisory_lock(724112) AS locked')).rows[0].locked) return;
    const now=DateTime.now().setZone(zone);
    const families=(await client.query('SELECT id,name FROM families')).rows;
    for(const family of families) {
      const {members,events}=await familyData(family.id);
      for(const event of events) {
        if(!event.data.reminder) continue;
        for(const occurrence of occurrences(event,now.minus({hours:24}),now.plus({days:2}))) {
          const due=DateTime.fromISO(occurrence.start).minus({minutes:event.data.reminder});
          // Avoid sending stale reminders after a long outage or newly entered past events.
          if(due<now.minus({minutes:15}) || DateTime.fromISO(occurrence.start)<=now) continue;
          const message=styledEmail({family,items:[occurrence],members,heading:`Coming up in ${leadTime(event.data.reminder)}`});
          for(const member of recipients(event,members)) await queue(client,`${event.id}:${event.version}:${occurrence.start}:${member.id}`,family.id,event,member.email,reminderSubject(family,event),message,due);
        }
      }
      const window=weeklyWindow(now);
      if(now>=window.due && now<window.from) {
        const items=events.flatMap(e=>occurrences(e,window.from,window.to)).sort((a,b)=>a.start.localeCompare(b.start));
        const message=styledEmail({family,items,members,heading:'Your family week ahead',digest:true});
        for(const adult of members.filter(m=>m.kind==='adult' && m.email)) await queue(client,`digest:${family.id}:${window.from.toISODate()}:${adult.id}`,family.id,null,adult.email,digestSubject(family,window.from,window.to),message,window.due);
      }
    }
    await client.query("UPDATE mail_jobs j SET status='cancelled' FROM events e WHERE j.event_id=e.id AND j.status='pending' AND (e.deleted OR e.version<>j.event_version)");
    const jobs=(await client.query("SELECT * FROM mail_jobs WHERE status='pending' AND due_at<=now() AND next_attempt<=now() ORDER BY due_at LIMIT 50")).rows;
    for(const job of jobs) {
      if(job.event_id && DateTime.fromJSDate(job.due_at)<now.minus({minutes:15})) {await client.query("UPDATE mail_jobs SET status='expired' WHERE id=$1",[job.id]);continue;}
      // Recheck event immediately before sending; edits cancel old versions.
      if(job.event_id && !(await client.query('SELECT 1 FROM events WHERE id=$1 AND version=$2 AND deleted=false',[job.event_id,job.event_version])).rowCount) {await client.query("UPDATE mail_jobs SET status='cancelled' WHERE id=$1",[job.id]);continue;}
      try {
        if(transport) await transport.sendMail({from:process.env.MAIL_FROM,to:job.recipient,subject:job.subject,text:job.body,html:job.html || undefined,attachments:job.html?[{filename:'family-header.png',path:fileURLToPath(new URL('./public/email-header.png',import.meta.url)),cid:'family-header',contentDisposition:'inline'}]:[],messageId:`<${Buffer.from(job.id).toString('base64url')}@family-calendar.local>`});
        await client.query('UPDATE mail_jobs SET status=$2, attempts=attempts+1, sent_at=now(),last_error=NULL WHERE id=$1',[job.id,transport?'sent':'preview']);
      } catch(error) {
        await client.query("UPDATE mail_jobs SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,last_error=$2,next_attempt=now()+interval '2 minutes' WHERE id=$1",[job.id,String(error.code || 'SMTP delivery failed')]);
        console.error('Email delivery failed:',error.code || 'SMTP error');
      }
    }
    await client.query('DELETE FROM sessions WHERE expires_at<now()');
    await client.query("DELETE FROM mail_jobs WHERE due_at<now()-interval '90 days'");
  } finally {await client.query('SELECT pg_advisory_unlock(724112)').catch(()=>{});client.release();}
}
async function run() {try{await tick();}catch(error){console.error('Worker cycle failed:',error.code || error.message);}setTimeout(run,60000);}
run();
