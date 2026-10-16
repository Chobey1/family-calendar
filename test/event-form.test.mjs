import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('quarter-hour controls preserve old times, roll end dates forward, and save a repeating series',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://calendar.test'});
  const window=dom.window;
  Object.assign(globalThis,{document:window.document,Option:window.Option,Event:window.Event,FormData:window.FormData,confirm:()=>true});
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const data={family:{name:'Worley Family',join_code:'AABBCCDDEEFF0011'},requests:[],members:[{id:'parent',name:'Parent',kind:'adult',email:'parent@example.com',color:'#487968'}],events:[{id:'series',version:1,start:'2026-10-22T16:10:00-05:00',end:'2026-10-22T17:10:00-05:00',data:{title:'Weekly practice',start:'2026-10-15T16:10:00-05:00',end:'2026-10-15T17:10:00-05:00',repeat:'weekly',members:['parent'],reminder:15}}],account:{id:'parent',name:'Parent'},mailMode:'preview'};
  let submitted;
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/events')submitted=JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>url==='/api/status'?{setupRequired:false}:url.startsWith('/api/data')?structuredClone(data):{ok:true}};
  };
  try {
    await import('../public/app.js');
    document.querySelector('.series-edit').click();
    const form=document.querySelector('#event-form');
    const fields=form.querySelectorAll('.date-time-field');
    const startDate=fields[0].querySelector('input[type="date"]'),startTime=fields[0].querySelector('select');
    const endDate=fields[1].querySelector('input[type="date"]'),endTime=fields[1].querySelector('select');
    const regularOptions=Array.from(startTime.options).filter(o=>!o.dataset.existing);
    assert.equal(regularOptions.length,96);
    assert.ok(regularOptions.every(o=>['00','15','30','45'].includes(o.value.slice(3))));
    assert.equal(startDate.value,'2026-10-15'); // The first date in the series, not the clicked occurrence.
    assert.equal(startTime.value,'16:10'); // Never silently shift existing events.
    assert.equal(document.querySelector('#event-heading').textContent,'Edit repeating series');
    assert.equal(form.querySelector('[type="submit"]').textContent,'Save series');
    assert.equal(document.querySelector('#delete-event').textContent,'Delete series');
    assert.equal(document.querySelector('.series-notice').hidden,false);
    startTime.value='23:30';startTime.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(form.elements.end.value,'2026-10-16T00:30');
    assert.equal(endDate.value,'2026-10-16');assert.equal(endTime.value,'00:30');
    startDate.value='2026-12-31';startDate.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(form.elements.end.value,'2027-01-01T00:30');
    assert.equal(endDate.value,'2027-01-01');assert.equal(endTime.value,'00:30');
    endTime.value='01:45';endTime.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(form.elements.end.value,'2027-01-01T01:45');
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(submitted.id,'series');assert.equal(submitted.version,1);assert.equal(submitted.repeat,'weekly');
    assert.equal(submitted.start,'2026-12-31T23:30');assert.equal(submitted.end,'2027-01-01T01:45');
    assert.deepEqual(submitted.members,['parent']);
    document.querySelector('#add-event').click();
    assert.equal(document.querySelector('.series-notice').hidden,true);
    assert.equal(form.querySelector('[type="submit"]').textContent,'Save event');
    assert.equal(form.querySelectorAll('option[data-existing]').length,0);
  } finally {dom.window.close();}
});
