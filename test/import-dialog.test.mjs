import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { configureInvitationImport } from '../public/ics-import.js';
import { parseInvitation } from '../lib/ics-import.mjs';
test('invitation UI previews safely, collects family tags, and only imports on confirmation',async()=>{
  const dom=new JSDOM(await readFile(new URL('../public/index.html',import.meta.url),'utf8'),{url:'http://calendar.test'});
  const w=dom.window;Object.assign(globalThis,{document:w.document,FormData:w.FormData});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const text=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:ui-test','SUMMARY:Meeting <img src=x onerror=alert(1)>','DTSTART:20261020T150000Z','DTEND:20261020T160000Z','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const calls=[];let reloads=0;
  const api=async(path,input)=>{calls.push({path,input});return path==='import/preview'?{entries:parseInvitation(input.text),zone:'America/Chicago'}:{added:1,skipped:0};};
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  configureInvitationImport({api,notify:()=>{},escapeHtml:h,getState:()=>({account:{id:'parent'},members:[{id:'parent',name:'Parent'},{id:'kid',name:'Kid'}]}),reload:async()=>{reloads++;}});
  try {
    document.querySelector('.intro-actions .secondary').click();
    const file=document.querySelector('#ics-file');Object.defineProperty(file,'files',{value:[{size:text.length,text:async()=>text}]});
    file.dispatchEvent(new w.Event('change'));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1);assert.equal(calls[0].path,'import/preview');
    assert.ok(document.querySelector('#import-preview').textContent.includes('Meeting <img'));
    assert.equal(document.querySelector('#import-preview img'),null);
    assert.equal(document.querySelector('#confirm-import').disabled,false);
    document.querySelector('#import-members [value="kid"]').checked=true;
    document.querySelector('#import-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls[1].path,'import/save');assert.deepEqual(calls[1].input.members,['parent','kid']);assert.deepEqual(calls[1].input.selected,[0]);assert.equal(calls[1].input.reminder,0);
    assert.equal(reloads,1);assert.equal(document.querySelector('#import-dialog').open,false);
  }finally{dom.window.close();}
});
