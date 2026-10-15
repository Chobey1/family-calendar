import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { validateEvent, occurrences, recipients, weeklyWindow, calendarFeed, passwordHash, passwordMatches, emailBody } from '../lib/calendar.mjs';
const time=iso=>DateTime.fromISO(iso,{zone:'America/Chicago'});
const base={title:'Soccer practice',start:'2026-03-01T16:00',end:'2026-03-01T17:00',repeat:'weekly',reminder:60,members:['child'],location:'West fields',address:'123 Main St',directions:'West entrance',notes:'Bring water'};
const event=(overrides={})=>({id:'event-1',version:1,updated_at:new Date('2026-01-01T00:00Z'),data:validateEvent({...base,...overrides})});
test('weekly events preserve local time across spring daylight saving',()=>{
  const items=occurrences(event(),time('2026-03-01'),time('2026-03-16'));
  assert.equal(items.length,3);assert.equal(items[0].start,'2026-03-01T16:00:00.000-06:00');assert.equal(items[1].start,'2026-03-08T16:00:00.000-05:00');
});
test('repeat end date is inclusive',()=>{const items=occurrences(event({until:'2026-03-08'}),time('2026-03-01'),time('2026-04-01'));assert.equal(items.length,2);});
test('old recurring series seeks into the requested window',()=>{const items=occurrences(event({start:'2020-03-01T16:00',end:'2020-03-01T17:00'}),time('2026-03-01'),time('2026-03-16'));assert.equal(items.length,3);});
test('overlapping multi-day event remains visible',()=>{assert.equal(occurrences(event({repeat:'none',end:'2026-03-03T17:00'}),time('2026-03-02'),time('2026-03-04')).length,1);});
test('invalid times, empty tagging, and invalid repeat dates are rejected',()=>{
  for(const overrides of [{end:base.start},{start:'garbage'},{members:[]},{until:'2026-02-28'},{repeat:'monthly'},{reminder:8}])assert.throws(()=>validateEvent({...base,...overrides}));
});
const members=[{id:'mom',kind:'adult',name:'Mom',email:'mom@example.com'},{id:'dad',kind:'adult',name:'Dad',email:'dad@example.com'},{id:'child',kind:'child',name:'Kid'}];
test('tagging a child emails both parents, without duplicate recipients',()=>{assert.deepEqual(recipients(event({members:['mom','child']}),members).map(m=>m.id),['mom','dad']);});
test('adult-only events email just tagged adults',()=>{assert.deepEqual(recipients(event({members:['dad']}),members).map(m=>m.id),['dad']);});
test('Sunday digest covers the following Monday to Sunday in local time',()=>{const w=weeklyWindow(time('2026-11-01T15:01'));assert.equal(w.due.toISO(),'2026-11-01T15:00:00.000-06:00');assert.equal(w.from.toISODate(),'2026-11-02');assert.equal(w.to.toISODate(),'2026-11-09');});
test('feed has distinct recurrence identities and escaped event text',()=>{
  const items=occurrences(event({title:'Soccer, family; fun\nNext line'}),time('2026-03-01'),time('2026-03-16'));
  const feed=calendarFeed(items,members);assert.equal(new Set(feed.match(/UID:.*/g)).size,3);assert.match(feed,/SUMMARY:Soccer\\, family\\; fun\\nNext line/);assert.ok(feed.endsWith('\r\n'));
});
test('all-day feed uses exclusive date-only end',()=>{const items=occurrences(event({start:'2026-03-08T00:00',end:'2026-03-09T00:00',allDay:true,repeat:'none'}),time('2026-03-01'),time('2026-03-16'));const feed=calendarFeed(items,members);assert.match(feed,/DTSTART;VALUE=DATE:20260308/);assert.match(feed,/DTEND;VALUE=DATE:20260309/);});
test('calendar lines fold within 75 UTF-8 bytes',()=>{const items=occurrences(event({title:'家'.repeat(100)}),time('2026-03-01'),time('2026-03-02'));for(const line of calendarFeed(items,members).split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);});
test('email contains authoritative details and tagged member names',()=>{const items=occurrences(event(),time('2026-03-01'),time('2026-03-02'));const body=emailBody(items,members,'Week ahead');for(const text of ['Soccer practice','Kid','West fields','123 Main St','West entrance','Bring water','4:00 PM'])assert.ok(body.includes(text));});
test('passwords are salted and wrong passwords are rejected',()=>{const hash=passwordHash('correct horse battery staple');assert.notEqual(hash,passwordHash('correct horse battery staple'));assert.ok(passwordMatches('correct horse battery staple',hash));assert.equal(passwordMatches('wrong',hash),false);});
