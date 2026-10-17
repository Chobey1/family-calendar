import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { configureTodos } from '../public/todos.js';
test('task panel sorts, filters, shares completion, and restores tasks without adding calendar entries',async()=>{
  const dom=new JSDOM(await readFile(new URL('../public/index.html',import.meta.url),'utf8'),{url:'http://calendar.test'});
  const w=dom.window;Object.assign(globalThis,{document:w.document,FormData:w.FormData,confirm:()=>true});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  document.querySelector('#app').hidden=false;
  const members=[{id:'colby',name:'Colby'},{id:'jessica',name:'Jessica'}];
  let tasks=[
    {id:'undated',version:1,data:{title:'Undated',due:null,members:['colby']}},
    {id:'groceries',version:1,data:{title:'Get groceries',due:'2026-10-17',members:['colby','jessica'],notes:'Milk'}},
    {id:'overdue',version:1,data:{title:'Overdue task',due:'2026-10-15',members:['jessica']}},
    {id:'today',version:1,data:{title:'Today task',due:'2026-10-16',members:['colby']}}
  ];
  const calls=[];
  const api=async(path,input)=>{
    calls.push({path,input});
    if(path==='todos/complete'){const t=tasks.find(t=>t.id===input.id);t.completed_at=input.completed?'2026-10-16T12:00:00Z':null;t.completed_by=input.completed?'colby':null;t.version++;return {ok:true};}
    if(path==='todos' && input){tasks.push({id:'new',version:1,data:input});return {id:'new'};}
    return {todos:structuredClone(tasks)};
  };
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel=configureTodos({api,notify:()=>{},escapeHtml:h,tone:()=>'',today:()=> '2026-10-16'});
  try {
    panel.render({family:{id:'family'},account:{id:'colby'},members,todos:structuredClone(tasks)});
    const active=()=>Array.from(document.querySelectorAll('#todo-active .todo-title')).map(e=>e.textContent);
    assert.deepEqual(active(),['Overdue task','Today task','Get groceries','Undated']);
    assert.equal(document.querySelector('#todo-completed').open,false);
    assert.equal(document.querySelector('.calendar-pane #calendar')!==null,true);
    assert.equal(document.querySelector('.calendar-todo-layout > .todo-panel')!==null,true);
    assert.equal(document.querySelector('#calendar').children.length,0);
    document.querySelector('[data-person="colby"]').click();assert.deepEqual(active(),['Today task','Get groceries','Undated']);
    document.querySelector('[data-complete="groceries"]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.ok(!active().includes('Get groceries'));
    document.querySelector('[data-person="jessica"]').click();assert.deepEqual(active(),['Overdue task']);
    assert.equal(document.querySelector('#todo-completed-count').textContent,'(1)');
    assert.equal(document.querySelector('#todo-done .todo-title').textContent,'Get groceries');
    assert.equal(document.querySelector('#todo-completed').open,false);
    document.querySelector('#todo-completed').open=true;
    document.querySelector('#todo-done [data-complete="groceries"]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(active(),['Overdue task','Get groceries']);assert.equal(document.querySelector('#todo-completed').open,true);
    document.querySelector('#add-todo').click();
    const form=document.querySelector('#todo-form');form.elements.title.value='Pack lunch';form.elements.notes.value='Bring water';
    form.elements.due.value='2026-10-19';
    for(const checkbox of form.querySelectorAll('[name="members"]'))checkbox.checked=true;
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.find(call=>call.input?.title==='Pack lunch').path,'todos');
    assert.ok(active().includes('Pack lunch'));assert.equal(document.querySelector('#calendar').children.length,0);
    assert.equal(document.querySelector('#todo-dialog').open,false);
  }finally{panel.dispose();dom.window.close();}
});
