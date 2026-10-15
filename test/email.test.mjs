import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { reminderSubject, digestSubject, styledEmail } from '../lib/email.mjs';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
const family={name:'Worley Family'};
const event={start:'2026-10-15T16:25:00-05:00',end:'2026-10-15T17:25:00-05:00',data:{title:'Soccer practice',reminder:15,members:['kid'],address:'123 Main St',location:'Field',notes:'Bring water',directions:'West entrance'}};
const members=[{id:'kid',name:'Kid'}];
test('reminder subject uses the family, event, and selected lead time',()=>{
  assert.equal(reminderSubject(family,event),'Worley Family – Soccer practice in 15 minutes');
  assert.match(reminderSubject(family,event,60),/in 1 hour$/);assert.match(reminderSubject(family,event,1440),/in 1 day$/);
  assert.ok(!reminderSubject({name:'Family\r\nBcc: x'},event).includes('\n'));
});
test('styled reminder contains an embedded header, details, and text fallback',()=>{
  process.env.APP_URL='http://192.168.1.142:3080';
  const result=styledEmail({family,items:[event],members,heading:'Coming up in 15 minutes'});
  for(const text of ['cid:family-header','Worley Family','Soccer practice','Kid','Bring water','West entrance','Get directions','Open family calendar'])assert.ok(result.html.includes(text));
  assert.ok(result.text.includes('123 Main St'));assert.ok(result.text.includes('4:25 PM'));assert.ok(result.html.includes('http://192.168.1.142:3080'));
});
test('event and family text are escaped and invalid application URLs never become buttons',()=>{
  process.env.APP_URL='javascript:alert(1)';
  const result=styledEmail({family:{name:'<script>alert(1)</script>'},items:[{...event,data:{...event.data,title:'<img onerror=alert(1)>',notes:'<b>Text</b>'}}],members,heading:'Reminder'});
  assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<img onerror'));assert.ok(!result.html.includes('href="javascript:'));assert.ok(result.html.includes('&lt;b&gt;Text&lt;/b&gt;'));
});
test('weekly email groups events by day and handles empty weeks',()=>{
  const from=DateTime.fromISO('2026-10-19'),to=from.plus({weeks:1});
  assert.equal(digestSubject(family,from,to),'Worley Family – Our week ahead · Oct 19–Oct 25');
  const result=styledEmail({family,items:[event],members,heading:'Your family week ahead',digest:true});
  assert.ok(result.html.includes('1 plan coming up'));assert.ok(result.html.includes('Thursday, October 15'));
  assert.ok(styledEmail({family,items:[],members,heading:'Week ahead',digest:true}).html.includes('No events scheduled'));
});
test('SMTP message packages HTML, plain text, and the inline graphic together',async()=>{
  process.env.APP_URL='http://192.168.1.142:3080';
  const message=styledEmail({family,items:[event],members,heading:'Coming up in 15 minutes'});
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});
  const result=await transport.sendMail({from:'calendar@example.com',to:'parent@example.com',subject:reminderSubject(family,event),text:message.text,html:message.html,attachments:[{filename:'family-header.png',path:fileURLToPath(new URL('../public/email-header.png',import.meta.url)),cid:'family-header',contentDisposition:'inline'}]});
  const mime=result.message.toString();
  for(const part of ['multipart/alternative','multipart/related','text/plain','text/html','image/png','Content-ID: <family-header>'])assert.ok(mime.includes(part));
});
