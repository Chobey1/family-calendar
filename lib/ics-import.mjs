import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import { digest,zone,validateEvent } from './calendar.mjs';

export const MAX_ICS_BYTES=256*1024;
function convert(property) {
  if(!property)throw new Error('Missing start date.');
  const t=property.getFirstValue(),tzid=property.getParameter('tzid');
  if(!t || typeof t.year!=='number')throw new Error('Invalid calendar date.');
  const fields={year:t.year,month:t.month,day:t.day,hour:t.isDate?0:t.hour,minute:t.isDate?0:t.minute,second:t.isDate?0:t.second};
  let date;
  if(t.isDate)date=DateTime.fromObject(fields,{zone});
  else if(tzid) {
    date=DateTime.fromObject(fields,{zone:tzid});
    if(!date.isValid && t.zone?.tzid && t.zone.tzid!=='floating')date=DateTime.fromJSDate(t.toJSDate());
    if(!date.isValid)throw new Error(`Unsupported time zone: ${tzid}.`);
  } else date=DateTime.fromObject(fields,{zone:t.zone?.tzid==='UTC'?'UTC':zone});
  if(!date.isValid)throw new Error('Invalid calendar date.');
  return {date:date.setZone(zone),isDate:t.isDate,sourceZone:tzid || (t.zone?.tzid==='UTC'?'UTC':zone)};
}
function recurrence(component,start) {
  const rules=component.getAllProperties('rrule');
  if(!rules.length)return {repeat:'none',until:null};
  if(rules.length!==1)throw new Error('Multiple repeat rules are not supported yet.');
  const rule=rules[0].getFirstValue(),freq=rule.freq;
  if(!['DAILY','WEEKLY','YEARLY'].includes(freq) || Number(rule.interval || 1)!==1)throw new Error('This repeat pattern is not supported yet. Hearth currently imports simple daily, weekly, or yearly series.');
  if(!start.isDate && start.sourceZone!==zone)throw new Error('Repeating events in another time zone are not supported yet.');
  const parts=rule.parts || {};
  if(Object.keys(parts).length)throw new Error('Repeat rules with selected weekdays/months are not supported yet.');
  if(freq==='YEARLY' && start.date.month===2 && start.date.day===29)throw new Error('Leap-day repeating invitations are not supported yet.');
  let until=null;
  if(rule.until) {
    const t=rule.until;
    const date=t.isDate?DateTime.fromISO(t.toString(),{zone}):DateTime.fromJSDate(t.toJSDate()).setZone(zone);
    // A timed UNTIL before the occurrence's clock time excludes that date.
    until=(!t.isDate && date.toFormat('HH:mm:ss')<start.date.toFormat('HH:mm:ss')?date.minus({days:1}):date).toISODate();
  }
  if(rule.count) {
    if(rule.count<1 || rule.count>10000)throw new Error('This repeat count is not supported.');
    const last=start.date.plus(freq==='YEARLY'?{years:rule.count-1}:{days:(rule.count-1)*(freq==='WEEKLY'?7:1)}).toISODate();
    until=until && until<last?until:last;
  }
  return {repeat:freq.toLowerCase()==='daily'?'daily':freq.toLowerCase()==='weekly'?'weekly':'yearly',until};
}
export function parseInvitation(text) {
  if(typeof text!=='string' || Buffer.byteLength(text)>MAX_ICS_BYTES)throw new Error('Choose an ICS file smaller than 256 KB.');
  let root;
  try{root=new ICAL.Component(ICAL.parse(text));}catch{throw new Error('This file could not be read as an ICS calendar.');}
  if(root.name!=='vcalendar')throw new Error('Choose a valid ICS calendar file.');
  const events=root.getAllSubcomponents('vevent');
  if(!events.length || events.length>100)throw new Error('Import files must contain between 1 and 100 events.');
  const exceptionUIDs=new Set(events.filter(e=>e.hasProperty('recurrence-id')).map(e=>e.getFirstPropertyValue('uid')));
  return events.map((component,index)=>{
    const title=String(component.getFirstPropertyValue('summary') || 'Untitled event');
    const result={index,title,warnings:[]};
    try {
      const uid=component.getFirstPropertyValue('uid');
      if(String(root.getFirstPropertyValue('method') || '').toUpperCase()==='CANCEL' || String(component.getFirstPropertyValue('status') || '').toUpperCase()==='CANCELLED')throw new Error('Cancellation notice: no event will be added. Existing events must be cancelled in Hearth manually.');
      if(component.hasProperty('recurrence-id') || exceptionUIDs.has(uid) || ['exdate','rdate','exrule'].some(name=>component.hasProperty(name)))throw new Error('This series has exceptions or extra dates, which are not supported yet. No occurrences from this series will be imported.');
      const start=convert(component.getFirstProperty('dtstart'));
      let end;
      if(component.hasProperty('dtend')) {
        const converted=convert(component.getFirstProperty('dtend'));
        if(converted.isDate!==start.isDate)throw new Error('Start and end must both be dates or both be times.');
        end=converted.date;
      } else if(component.hasProperty('duration'))end=start.date.plus({seconds:component.getFirstPropertyValue('duration').toSeconds()});
      else {end=start.date.plus(start.isDate?{days:1}:{hours:1});if(!start.isDate)result.warnings.push('No end time supplied; defaults to one hour.');}
      if(!start.isDate && !component.getFirstProperty('dtstart').getParameter('tzid') && component.getFirstPropertyValue('dtstart').zone?.tzid!=='UTC')result.warnings.push(`No time zone supplied; interpreted as ${zone}.`);
      const schedule=recurrence(component,start);
      const description=String(component.getFirstPropertyValue('description') || '');
      const url=String(component.getFirstPropertyValue('url') || '');
      const data=validateEvent({title,start:start.date.toISO(),end:end.toISO(),allDay:start.isDate,...schedule,reminder:0,members:['preview'],location:String(component.getFirstPropertyValue('location') || ''),notes:[description,url?'Event link: '+url:''].filter(Boolean).join('\n')});
      const key=digest('ics:'+ (uid?String(uid):JSON.stringify(data)));
      if(!uid)result.warnings.push('No invitation identifier; identical content will be treated as a duplicate.');
      return {...result,key,data};
    }catch(error){return {...result,error:error.message};}
  });
}
