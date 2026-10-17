import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvitation } from '../lib/ics-import.mjs';
const file=(lines,method='REQUEST')=>['BEGIN:VCALENDAR','VERSION:2.0','METHOD:'+method,'BEGIN:VEVENT',...lines,'END:VEVENT','END:VCALENDAR'].join('\r\n');
const base=['UID:meeting@example.invalid','SUMMARY:Planning meeting','DTSTART:20261020T150000Z','DTEND:20261020T160000Z'];
test('ICS parser decodes text and converts UTC invitation times',()=>{
  const [entry]=parseInvitation(file([...base,'DESCRIPTION:Bring notes\\nSecond line','LOCATION:Room 1\\, Main building']));
  assert.equal(entry.error,undefined);assert.equal(entry.data.start,'2026-10-20T10:00:00.000-05:00');
  assert.equal(entry.data.end,'2026-10-20T11:00:00.000-05:00');assert.equal(entry.data.notes,'Bring notes\nSecond line');assert.equal(entry.data.location,'Room 1, Main building');
  assert.equal(entry.data.reminder,0);assert.equal(entry.data.repeat,'none');
});
test('date-only ICS events use exclusive ends and default to one full day',()=>{
  const [entry]=parseInvitation(file(['UID:day','SUMMARY:Day off','DTSTART;VALUE=DATE:20261020']));
  assert.equal(entry.data.allDay,true);assert.ok(entry.data.end.startsWith('2026-10-21T00:00'));
});
test('floating times warn, IANA zones convert, unknown zones are rejected',()=>{
  const [floating]=parseInvitation(file(['UID:floating','SUMMARY:Meet','DTSTART:20261020T090000']));assert.ok(floating.warnings.some(w=>w.includes('No time zone')));
  const [zoned]=parseInvitation(file(['UID:zoned','SUMMARY:Meet','DTSTART;TZID=America/New_York:20261020T090000','DURATION:PT45M']));assert.ok(zoned.data.start.includes('T08:00'));assert.ok(zoned.data.end.includes('T08:45'));
  const [unknown]=parseInvitation(file(['UID:unknown','SUMMARY:Meet','DTSTART;TZID=Unknown/Zone:20261020T090000']));assert.match(unknown.error,/Unsupported time zone/);
});
test('embedded VTIMEZONE definitions handle custom invitation zone names',()=>{
  const text=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTIMEZONE','TZID:Custom Eastern','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:-0500','TZOFFSETTO:-0500','END:STANDARD','END:VTIMEZONE','BEGIN:VEVENT','UID:custom','SUMMARY:Custom zone meeting','DTSTART;TZID=Custom Eastern:20261220T090000','DTEND;TZID=Custom Eastern:20261220T100000','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const [entry]=parseInvitation(text);assert.equal(entry.error,undefined);assert.ok(entry.data.start.includes('T08:00'));
});
test('simple weekly count rules are preserved; complex recurrence is not flattened',()=>{
  const [weekly]=parseInvitation(file(['UID:weekly','SUMMARY:Practice','DTSTART;TZID=America/Chicago:20261020T090000','DTEND;TZID=America/Chicago:20261020T100000','RRULE:FREQ=WEEKLY;COUNT=3']));
  assert.equal(weekly.data.repeat,'weekly');assert.equal(weekly.data.until,'2026-11-03');
  for(const extra of ['RRULE:FREQ=MONTHLY','RRULE:FREQ=WEEKLY;BYDAY=MO,WE','RRULE:FREQ=WEEKLY;INTERVAL=2','EXDATE:20261027T150000Z','RECURRENCE-ID:20261020T150000Z'])assert.ok(parseInvitation(file([...base,extra]))[0].error);
});
test('folded lines parse and stable UID deduplicates changed invitations',()=>{
  const original=parseInvitation(file([...base,'DESCRIPTION:One long\r\n  description']))[0];
  const changed=parseInvitation(file(base.map(line=>line==='SUMMARY:Planning meeting'?'SUMMARY:Changed meeting':line)))[0];
  assert.equal(original.data.notes,'One long description');assert.equal(original.key,changed.key);
});
test('cancellation notices, invalid ranges, and oversized files do not add events',()=>{
  assert.match(parseInvitation(file(base,'CANCEL'))[0].error,/Cancellation/);
  assert.ok(parseInvitation(file([...base.filter(l=>!l.startsWith('DTEND')),'DTEND:20261020T140000Z']))[0].error);
  assert.throws(()=>parseInvitation('not a calendar'));
  assert.throws(()=>parseInvitation('x'.repeat(256*1024+1)),/256 KB/);
});
