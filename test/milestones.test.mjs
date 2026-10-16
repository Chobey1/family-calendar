import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { validateEvent,occurrences,ordinal,calendarFeed,emailBody } from '../lib/calendar.mjs';
import { reminderSubject,styledEmail } from '../lib/email.mjs';
const time=value=>DateTime.fromISO(value,{zone:'America/Chicago'});
const base={title:'Annual gathering',start:'2026-08-30T00:00',end:'2026-08-31T00:00',repeat:'yearly',allDay:true,reminder:1440,members:['colby']};
const make=overrides=>({id:'annual-event',version:1,updated_at:new Date('2026-01-01Z'),data:validateEvent({...base,...overrides})});
test('yearly events repeat on the original month and day and honor repeat-through dates',()=>{
  const items=occurrences(make({until:'2028-08-30'}),time('2026-01-01'),time('2030-01-01'));
  assert.deepEqual(items.map(e=>time(e.start).toISODate()),['2026-08-30','2027-08-30','2028-08-30']);
  assert.ok(items.every(e=>e.data.title==='Annual gathering'));
});
test('birthdays calculate age separately for each year, including the requested 41st birthday',()=>{
  const items=occurrences(make({type:'birthday',honoree:'Colby',milestoneDate:'1986-08-30'}),time('2026-01-01'),time('2029-01-01'));
  assert.deepEqual(items.map(e=>e.data.title),['Colby’s 40th Birthday!','Colby’s 41st Birthday!','Colby’s 42nd Birthday!']);
  assert.equal(time(items[1].start).toISODate(),'2027-08-30');
});
test('anniversaries calculate their own year counts',()=>{
  const items=occurrences(make({type:'anniversary',honoree:'Colby & Jessica',milestoneDate:'2015-08-30'}),time('2026-01-01'),time('2029-01-01'));
  assert.deepEqual(items.map(e=>e.data.title),['Colby & Jessica’s 11th Anniversary!','Colby & Jessica’s 12th Anniversary!','Colby & Jessica’s 13th Anniversary!']);
});
test('ordinal suffixes handle teens and later decades',()=>{
  assert.deepEqual([1,2,3,4,11,12,13,21,22,23,41,101,111].map(ordinal),['1st','2nd','3rd','4th','11th','12th','13th','21st','22nd','23rd','41st','101st','111th']);
});
test('Feb 29 observes Feb 28 in non-leap years and returns to Feb 29 in leap years',()=>{
  const e=make({type:'birthday',honoree:'Leap',milestoneDate:'2000-02-29',start:'2026-02-28T00:00',end:'2026-03-01T00:00'});
  const items=occurrences(e,time('2026-01-01'),time('2030-01-01'));
  assert.deepEqual(items.map(e=>time(e.start).toISODate()),['2026-02-28','2027-02-28','2028-02-29','2029-02-28']);
  assert.ok(items.every(e=>time(e.end).toISODate()===time(e.start).plus({days:1}).toISODate()));
});
test('birthday title is correct in reminder subjects, HTML/text emails, and calendar feeds',()=>{
  const e=make({type:'birthday',honoree:'Colby',milestoneDate:'1986-08-30'});
  const items=occurrences(e,time('2027-08-30'),time('2027-08-31'));
  const members=[{id:'colby',name:'Colby'}],title='Colby’s 41st Birthday!';
  assert.ok(reminderSubject({name:'Worley Family'},items[0]).includes(title));
  assert.ok(emailBody(items,members,'Reminder').includes(title));
  assert.ok(calendarFeed(items,members).includes('SUMMARY:'+title));
  assert.ok(styledEmail({family:{name:'Worley Family'},items,members,heading:'Birthday'}).html.includes(title));
});
test('milestones require real original dates and consistent yearly all-day schedules',()=>{
  for(const changes of [{milestoneDate:'1986-02-30'},{honoree:''},{repeat:'weekly'},{allDay:false},{start:'2026-08-31T00:00',end:'2026-09-01T00:00'},{milestoneDate:'2030-08-30'}])assert.throws(()=>make({type:'birthday',honoree:'Colby',milestoneDate:'1986-08-30',...changes}));
});
