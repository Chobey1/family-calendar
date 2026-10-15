import { DateTime } from 'luxon';
import { escapeHtml as h, emailBody, zone } from './calendar.mjs';

export function leadTime(minutes) {
  if(minutes===1440) return '1 day';
  if(minutes===60) return '1 hour';
  return `${minutes} minutes`;
}
const safeSubject=value=>String(value).replace(/[\r\n]+/g,' ').slice(0,240);
export function reminderSubject(family,event,minutes=event.data.reminder) {
  return `${safeSubject(family.name)} – ${safeSubject(event.data.title)} in ${leadTime(minutes)}`;
}
export function digestSubject(family,from,to) {
  return `${safeSubject(family.name)} – Our week ahead · ${from.toFormat('LLL d')}–${to.minus({days:1}).toFormat('LLL d')}`;
}
function httpUrl(value) {try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function button(label,url,color='#315e4e') {
  const safe=httpUrl(url);return safe?`<a href="${h(safe)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 19px;font-size:14px;font-weight:bold;margin:8px 8px 0 0">${h(label)}</a>`:'';
}
function details(event,members) {
  const d=event.data, start=DateTime.fromISO(event.start).setZone(zone), end=DateTime.fromISO(event.end).setZone(zone);
  const when=d.allDay?`${start.toFormat('cccc, LLLL d')} · All day`:`${start.toFormat('cccc, LLLL d · h:mm a')} – ${end.toFormat('ccc, LLL d · h:mm a')} (${zone})`;
  const people=members.filter(m=>d.members.includes(m.id)).map(m=>m.name).join(', ');
  const row=(label,value)=>value?`<p style="margin:14px 0 0;font-size:14px;line-height:1.6"><strong style="color:#315e4e">${h(label)}</strong><br>${h(value).replace(/\n/g,'<br>')}</p>`:'';
  return `<div style="background:#ffffff;border:1px solid #dde4d8;border-radius:12px;padding:24px;margin:14px 0"><h2 style="font-size:23px;font-weight:normal;margin:0 0 10px;color:#263c34">${h(d.title)}</h2><p style="color:#53685d;font-size:14px;line-height:1.6;margin:0">${h(when)}</p>${row('Who’s going',people)}${row('Where',[d.location,d.address].filter(Boolean).join('\n'))}${row('Arrival & directions',d.directions)}${row('Details',d.notes)}${d.address?button('Get directions',`https://maps.apple.com/?q=${encodeURIComponent(d.address)}`,'#567969'):''}</div>`;
}
export function styledEmail({family,items,members,heading,digest=false}) {
  let content='';
  if(digest) {
    const groups=new Map();
    for(const event of items){const key=DateTime.fromISO(event.start).setZone(zone).toFormat('cccc, LLLL d');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event);}
    content=`<p style="color:#647364;line-height:1.7">${items.length?`${items.length} ${items.length===1?'plan':'plans'} coming up. Here’s your family’s week at a glance.`:'A little room to breathe. No events scheduled for the coming week.'}</p>`;
    for(const [day,events] of groups)content+=`<h2 style="font-size:15px;color:#315e4e;margin:28px 0 10px">${h(day)}</h2>`+events.map(e=>details(e,members)).join('');
  } else content=items.map(e=>details(e,members)).join('');
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(heading)}</title></head><body style="margin:0;padding:0;background:#e9eee5;font-family:Arial,Helvetica,sans-serif;color:#263c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9eee5"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#f6f5ef;border-radius:16px;overflow:hidden"><tr><td bgcolor="#315e4e" style="background:#315e4e;padding:0"><img src="cid:family-header" width="600" alt="A calendar, rolling hills, and a sunny sky" style="display:block;width:100%;max-width:600px;height:auto;border:0"><div style="padding:12px 28px 28px;color:#ffffff"><p style="font-size:11px;letter-spacing:2px;margin:0 0 9px;color:#dce8d7">ROOM FOR EVERYONE’S PLANS</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:normal;margin:0">${h(family.name)}</h1></div></td></tr><tr><td style="padding:28px"><h2 style="font-family:Georgia,serif;font-size:25px;font-weight:normal;margin:0 0 18px">${h(heading)}</h2>${content}${button('Open family calendar',process.env.APP_URL)}<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#758073">Sent by ${h(family.name)}’s shared calendar.<br>All times shown in ${h(zone)}.</p></td></tr></table></td></tr></table></body></html>`;
  return {html,text:`${family.name}\n${emailBody(items,members,heading)}`};
}
