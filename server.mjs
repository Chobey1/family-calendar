import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DateTime } from 'luxon';
import { db as defaultDb, initialize, familyData as loadFamilyData } from './lib/db.mjs';
import { zone, token, digest, passwordHash, passwordMatches, validateEvent, occurrences, calendarFeed } from './lib/calendar.mjs';
import { familyCode, familyName, createFamily, requestJoin, reviewJoin } from './lib/families.mjs';

export async function createApplication(db=defaultDb) {
await initialize(db);
const familyData=id=>loadFamilyData(id,db);
if (!process.env.APP_URL) throw new Error('APP_URL must be configured.');
const origin = new URL(process.env.APP_URL).origin;
const secure = process.env.COOKIE_SECURE !== 'false';
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const emailValid = value => typeof value === 'string' && value.length < 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const attempts = new Map();
function rateLimit(key) {
  const now = Date.now();
  for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  const entry = attempts.get(key) || {count: 0, until: now + 15 * 60000};
  attempts.set(key, entry);
  if (++entry.count > 20) throw Object.assign(new Error('Too many attempts. Try again in 15 minutes.'), {status:429});
}
function send(res, status, value, headers={}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers});
  res.end(JSON.stringify(value));
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {text += chunk; if (Buffer.byteLength(text) > 64000) throw Object.assign(new Error('Request too large.'), {status:413});}
  try {return JSON.parse(text || '{}');} catch {throw Object.assign(new Error('Invalid request.'), {status:400});}
}
async function user(req) {
  const cookie = /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  if (!cookie) return null;
  return (await db.query('SELECT m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>now()', [digest(cookie)])).rows[0] || null;
}
const cookieHeader = (value, maxAge=60*60*24*14) => `session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
async function login(res, member) {
  const session = token();
  await db.query('INSERT INTO sessions VALUES ($1,$2,now()+interval \'14 days\')', [digest(session),member.id]);
  send(res,200,{ok:true},{'Set-Cookie':cookieHeader(session)});
}
const files = new Map([['/',['public/index.html','text/html']],['/app.js',['public/app.js','text/javascript']],['/style.css',['public/style.css','text/css']],['/email-header.png',['public/email-header.png','image/png']]]);
files.set('/families.css',['public/families.css','text/css']);
files.set('/favicon.svg',['public/favicon.svg','image/svg+xml']);
files.set('/themes.css',['public/themes.css','text/css']);
files.set('/theme.js',['public/theme.js','text/javascript']);
files.set('/time-fields.js',['public/time-fields.js','text/javascript']);
files.set('/hearth-landscape.svg',['public/hearth-landscape.svg','image/svg+xml']);
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url,'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/health') {await db.query('SELECT 1'); return send(res,200,{ok:true});}
    if (req.method === 'GET' && files.has(path)) {
      const [file,type] = files.get(path); res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-cache'}); return res.end(await readFile(new URL(file,import.meta.url)));
    }
    if (req.method === 'GET' && path.startsWith('/calendar/')) {
      const match = /^\/calendar\/([a-f0-9]{64})\.ics$/.exec(path);
      const family = match && (await db.query('SELECT id FROM families WHERE feed_token=$1',[digest(match[1])])).rows[0];
      if (!family) return send(res,404,{error:'Calendar not found.'});
      const data = await familyData(family.id);
      const now = DateTime.now().setZone(zone);
      const events = data.events.flatMap(e=>occurrences(e,now.minus({months:1}),now.plus({months:12})));
      res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'private, max-age=300'});
      return res.end(calendarFeed(events,data.members));
    }
    if (!path.startsWith('/api/')) return send(res,404,{error:'Not found.'});
    if (req.method !== 'GET' && (req.headers.origin !== origin || !String(req.headers['content-type'] || '').startsWith('application/json'))) return send(res,403,{error:'Request origin did not match APP_URL. Open the configured application address.'});
    if (req.method === 'GET' && path === '/api/status') return send(res,200,{setupRequired:!(await db.query("SELECT 1 FROM members WHERE kind='adult' LIMIT 1")).rowCount});
    if (req.method === 'POST' && path === '/api/register') {
      rateLimit('register:' + req.socket.remoteAddress);
      const input=await body(req);
      if(typeof input.name!=='string' || !input.name.trim() || input.name.length>80 || !emailValid(input.email) || typeof input.password!=='string' || input.password.length<12 || input.password.length>128) throw new Error('Enter a name, valid email, and password of 12–128 characters.');
      const client=await db.connect();
      let id;
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(724111)');
        if(!(await client.query("SELECT 1 FROM members WHERE kind='adult' LIMIT 1")).rowCount) {
          const expected=process.env.SETUP_TOKEN || '';
          if(expected.length<24 || typeof input.token!=='string' || digest(input.token)!==digest(expected)) throw new Error('The first account requires the server setup token.');
        }
        id=randomUUID();
        await client.query("INSERT INTO members (id,name,kind,email,password_hash) VALUES ($1,$2,'adult',$3,$4)",[id,input.name.trim(),input.email.trim().toLowerCase(),passwordHash(input.password)]);
        await client.query('COMMIT');
      } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      return login(res,{id});
    }
    if (req.method === 'POST' && path === '/api/setup') {
      rateLimit('setup');
      const input = await body(req);
      const expected = process.env.SETUP_TOKEN || '';
      if (expected.length < 24 || !input.token || !timingSafeEqual(Buffer.from(digest(input.token)),Buffer.from(digest(expected)))) return send(res,403,{error:'Setup token is incorrect or not configured (minimum 24 characters).'});
      if (!Array.isArray(input.adults) || input.adults.length !== 2) throw new Error('Add both adult accounts.');
      for (const a of input.adults) if (!String(a.name || '').trim() || String(a.name).length>80 || !emailValid(a.email) || typeof a.password!=='string' || a.password.length<12 || a.password.length>128) throw new Error('Each adult needs a name, valid email, and password of 12–128 characters.');
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(724111)');
        if ((await client.query('SELECT 1 FROM families LIMIT 1')).rowCount) {await client.query('ROLLBACK'); return send(res,409,{error:'Setup is already complete.'});}
        const familyId = randomUUID();
        await client.query('INSERT INTO families (id,name,feed_token,join_code) VALUES ($1,$2,$3,$4)',[familyId,'Our family',digest(token()),familyCode()]);
        let first;
        for (const [i,a] of input.adults.entries()) {
          const id = randomUUID(); first ||= id;
          await client.query('INSERT INTO members (id,family_id,name,kind,email,password_hash,color) VALUES ($1,$2,$3,\'adult\',$4,$5,$6)',[id,familyId,a.name.trim(),a.email.trim().toLowerCase(),passwordHash(a.password),i?'#9a642f':'#487968']);
        }
        await client.query('COMMIT');
        return login(res,{id:first});
      } catch(e) {await client.query('ROLLBACK'); throw e;} finally {client.release();}
    }
    if (req.method === 'POST' && path === '/api/login') {
      rateLimit('login:' + req.socket.remoteAddress);
      const input = await body(req);
      if (typeof input.email!=='string' || typeof input.password!=='string' || input.password.length>128) throw new Error('Enter your email and password.');
      const member = (await db.query('SELECT * FROM members WHERE email=$1',[input.email.trim().toLowerCase()])).rows[0];
      if (!member?.password_hash || !passwordMatches(input.password,member.password_hash)) return send(res,401,{error:'Email or password is incorrect.'});
      return login(res,member);
    }
    const account = await user(req);
    if (!account) return send(res,401,{error:'Please sign in.'});
    if (req.method==='POST' && path==='/api/logout') {
      const value=/(?:^|;\s*)session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
      if(value) await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(value)]);
      return send(res,200,{ok:true},{'Set-Cookie':cookieHeader('',0)});
    }
    if (req.method==='GET' && path==='/api/data') {
      if(!account.family_id) {
        const pending=!!(await db.query('SELECT 1 FROM join_requests WHERE member_id=$1',[account.id])).rowCount;
        return send(res,200,{needsFamily:true,pending,account:{id:account.id,name:account.name}});
      }
      const data=await familyData(account.family_id);
      const family=(await db.query('SELECT id,name,join_code FROM families WHERE id=$1',[account.family_id])).rows[0];
      const requests=(await db.query('SELECT m.id,m.name,m.email,r.created_at FROM join_requests r JOIN members m ON m.id=r.member_id WHERE r.family_id=$1 ORDER BY r.created_at',[account.family_id])).rows;
      const from=DateTime.fromISO(url.searchParams.get('from') || DateTime.now().toISODate(),{zone}).startOf('day');
      const to=DateTime.fromISO(url.searchParams.get('to') || from.plus({days:42}).toISODate(),{zone}).startOf('day');
      if (!from.isValid || !to.isValid || to<=from || to.diff(from,'days').days>370) throw new Error('Choose a date range of up to one year.');
      return send(res,200,{family,requests,members:data.members,events:data.events.flatMap(e=>occurrences(e,from,to)).sort((a,b)=>a.start.localeCompare(b.start)),account:{id:account.id,name:account.name},zone,mailMode:process.env.MAIL_MODE || 'preview'});
    }
    if(req.method==='POST' && path==='/api/family/create') {
      const input=await body(req); await createFamily(db,account.id,input.name); return send(res,201,{ok:true});
    }
    if(req.method==='POST' && path==='/api/family/join') {
      rateLimit('join:'+account.id);rateLimit('join-ip:'+req.socket.remoteAddress);
      const input=await body(req); await requestJoin(db,account.id,input.code); return send(res,200,{ok:true});
    }
    if(req.method==='POST' && path==='/api/family/cancel') {
      await db.query('DELETE FROM join_requests WHERE member_id=$1',[account.id]);return send(res,200,{ok:true});
    }
    // All remaining APIs require approved adult membership. Pending applicants cannot read calendar, members, email, or settings.
    if(!account.family_id || account.kind!=='adult') return send(res,403,{error:'Join or create a family first. Joining requires adult approval.'});
    if(req.method==='POST' && path==='/api/family/name') {
      const input=await body(req);await db.query('UPDATE families SET name=$1 WHERE id=$2',[familyName(input.name),account.family_id]);return send(res,200,{ok:true});
    }
    if(req.method==='POST' && path==='/api/family/code') {
      await db.query('UPDATE families SET join_code=$1 WHERE id=$2',[familyCode(),account.family_id]);return send(res,200,{ok:true});
    }
    if(req.method==='POST' && path==='/api/family/review') {
      const input=await body(req);if(!uuid(input.id) || typeof input.approve!=='boolean') throw new Error('Choose a valid request.');
      await reviewJoin(db,account.id,input.id,input.approve);return send(res,200,{ok:true});
    }
    if(req.method==='GET' && path.startsWith('/api/mail/preview/')) {
      const id=decodeURIComponent(path.slice('/api/mail/preview/'.length));
      const job=(await db.query('SELECT html FROM mail_jobs WHERE id=$1 AND family_id=$2',[id,account.family_id])).rows[0];
      if(!job?.html) return send(res,404,{error:'Styled preview not available for this message.'});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'"});
      return res.end(job.html.replaceAll('cid:family-header','/email-header.png'));
    }
    if(req.method==='POST' && path==='/api/members') {
      const input=await body(req);
      if(typeof input.name!=='string' || !input.name.trim() || input.name.length>80) throw new Error('Enter a name of 1–80 characters.');
      const id=randomUUID();
      await db.query('INSERT INTO members (id,family_id,name,kind,color) VALUES ($1,$2,$3,\'child\',$4)',[id,account.family_id,input.name.trim(),['#487968','#9a642f','#6c62a4','#287f99','#b15770'][Math.floor(Math.random()*5)]]);
      return send(res,201,{id});
    }
    if(req.method==='POST' && path==='/api/events') {
      const input=await body(req); const data=validateEvent(input);
      const members=(await familyData(account.family_id)).members;
      if(!data.members.every(id=>members.some(m=>m.id===id))) throw new Error('Choose members of your family.');
      if(input.id) {
        if(!uuid(input.id)) throw new Error('Invalid event.');
        const result=await db.query('UPDATE events SET data=$1, version=version+1, updated_at=now() WHERE id=$2 AND family_id=$3 AND deleted=false AND version=$4 RETURNING id',[data,input.id,account.family_id,input.version]);
        if(!result.rowCount) return send(res,409,{error:'This event changed in another session. Refresh and try again.'});
        return send(res,200,{id:input.id});
      }
      const id=randomUUID(); await db.query('INSERT INTO events (id,family_id,data) VALUES ($1,$2,$3)',[id,account.family_id,data]);
      return send(res,201,{id});
    }
    if(req.method==='POST' && path==='/api/events/delete') {
      const input=await body(req); if(!uuid(input.id)) throw new Error('Invalid event.');
      const result=await db.query('UPDATE events SET deleted=true, version=version+1, updated_at=now() WHERE id=$1 AND family_id=$2 AND version=$3 AND deleted=false RETURNING id',[input.id,account.family_id,input.version]);
      if(!result.rowCount) return send(res,409,{error:'This event changed. Refresh and try again.'});
      return send(res,200,{ok:true});
    }
    if(req.method==='POST' && path==='/api/feed') {
      const value=token(); await db.query('UPDATE families SET feed_token=$1 WHERE id=$2',[digest(value),account.family_id]);
      return send(res,200,{url:`${origin}/calendar/${value}.ics`});
    }
    if(req.method==='GET' && path==='/api/mail') {
      const result=await db.query('SELECT id,recipient,subject,body,status,due_at,sent_at,attempts,last_error,(html IS NOT NULL) AS styled FROM mail_jobs WHERE family_id=$1 ORDER BY due_at DESC LIMIT 40',[account.family_id]);
      return send(res,200,{jobs:result.rows});
    }
    return send(res,404,{error:'Not found.'});
  } catch(error) {
    console.error('Request failed:',error.code || error.message);
    send(res,error.status || (error.code ? 500 : 400),{error:error.code ? 'The request could not be completed. Check for duplicate email addresses or try again.' : error.message});
  }
});
server.requestTimeout=15000;
return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=await createApplication();
  server.listen(3000,'0.0.0.0',()=>console.log('Family Calendar listening on port 3000'));
}
