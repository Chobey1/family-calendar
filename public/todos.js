export function configureTodos({api,notify,escapeHtml:h,tone,today}) {
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/todos.css';document.head.append(stylesheet);
  const workspace=document.querySelector('.workspace');
  const split=document.createElement('div');split.className='calendar-todo-layout';
  const calendar=document.createElement('section');calendar.className='calendar-pane';calendar.setAttribute('aria-label','Calendar');
  workspace.querySelector('.toolbar').before(split);
  for(const selector of ['.toolbar','#filters','#calendar','#footer'])calendar.append(workspace.querySelector(selector));
  const panel=document.createElement('aside');panel.className='todo-panel';panel.setAttribute('aria-labelledby','todo-heading');
  panel.innerHTML=`<div class="todo-heading"><div><div class="eyebrow">A little less to remember</div><h2 id="todo-heading">To-Dos</h2></div><button id="add-todo" type="button">＋ Add task</button></div><div id="todo-filters" class="filters" aria-label="Filter tasks by family member"></div><div class="todo-list-heading"><p id="todo-count" class="muted small" role="status"></p><button id="refresh-todos" type="button" class="quiet">Refresh</button></div><div id="todo-active"></div><details id="todo-completed"><summary>Completed <span id="todo-completed-count"></span></summary><div id="todo-done"></div></details>`;
  split.append(calendar,panel);
  const dialog=document.createElement('dialog');dialog.id='todo-dialog';
  dialog.innerHTML=`<div class="dialog-scroll"><form id="todo-form"><div class="dialog-heading"><h2 id="todo-form-heading">A new task</h2><button type="button" class="quiet close" aria-label="Close">✕</button></div><input name="id" type="hidden"><input name="version" type="hidden"><label>What needs doing?<input name="title" required maxlength="200" placeholder="Get groceries"></label><fieldset><legend>Who’s involved?</legend><div id="todo-members" class="member-choices"></div></fieldset><label>Due date <span class="optional">optional</span><input name="due" type="date"></label><label>Notes<textarea name="notes" rows="3" maxlength="5000"></textarea></label><p class="muted small">This is one shared task. Completing it checks it off for everyone tagged. Tasks stay separate from calendar events.</p><div class="dialog-actions"><button type="button" id="delete-todo" class="danger" hidden>Delete task</button><button type="submit">Save task</button></div></form></div>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form');
  let state={members:[],todos:[]},selected=null,request=0;
  const $=selector=>panel.querySelector(selector);
  function guarded(fn){return async event=>{try{await fn(event);}catch(error){notify(error.message);}};}
  function renderLists() {
    const tasks=(state.todos || []).filter(task=>!selected || task.data.members.includes(selected));
    const open=tasks.filter(task=>!task.completed_at).sort((a,b)=>(a.data.due || '9999-99-99').localeCompare(b.data.due || '9999-99-99') || a.data.title.localeCompare(b.data.title) || a.id.localeCompare(b.id));
    const done=tasks.filter(task=>task.completed_at).sort((a,b)=>String(b.completed_at).localeCompare(String(a.completed_at)));
    $('#todo-filters').innerHTML=`<button type="button" data-person="" aria-pressed="${!selected}">Everyone</button>`+state.members.map(member=>`<button type="button" data-person="${member.id}" aria-pressed="${selected===member.id}"><span class="dot ${tone(member)}"></span>${h(member.name)}</button>`).join('');
    $('#todo-count').textContent=`${open.length} ${open.length===1?'task':'tasks'} to do`;
    $('#todo-active').innerHTML=open.map(task=>row(task)).join('') || `<p class="todo-empty">${selected?'Nothing to do for this person.':'A little room to breathe. Add a task when something comes to mind.'}</p>`;
    $('#todo-completed-count').textContent=`(${done.length})`;
    $('#todo-done').innerHTML=done.map(task=>row(task)).join('') || '<p class="todo-empty">Completed tasks will appear here.</p>';
  }
  function row(task) {
    const complete=!!task.completed_at, due=task.data.due,overdue=due && due<today() && !complete;
    const date=due?new Date(due+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null;
    const by=state.members.find(member=>member.id===task.completed_by);
    return `<article class="todo-row ${complete?'is-complete':''}"><button type="button" role="checkbox" aria-checked="${complete}" aria-label="${h((complete?'Mark incomplete: ':'Complete: ')+task.data.title)}" class="todo-check" data-complete="${task.id}">${complete?'✓':''}</button><div class="todo-content"><button type="button" class="todo-title" data-task="${task.id}">${h(task.data.title)}</button>${task.data.notes?`<p class="todo-notes">${h(task.data.notes)}</p>`:''}<div class="tags">${state.members.filter(member=>task.data.members.includes(member.id)).map(member=>`<span class="tag"><span class="dot ${tone(member)}"></span>${h(member.name)}</span>`).join('')}</div><p class="todo-due ${overdue?'overdue':''}">${due?h((overdue?'Overdue · ':due===today()?'Today · ':'Due ')+date):'No due date'}${complete&&by?' · Completed by '+h(by.name):''}</p></div></article>`;
  }
  async function refresh() {
    const current=++request, family=state.family?.id;
    const result=await api('todos');
    if(current!==request || family!==state.family?.id)return;
    state={...state,todos:result.todos};renderLists();
  }
  function open(id) {
    const task=state.todos?.find(item=>item.id===id);form.reset();
    form.elements.id.value=task?.id || '';form.elements.version.value=task?.version || '';
    for(const key of ['title','due','notes'])form.elements[key].value=task?.data[key] || '';
    dialog.querySelector('#todo-form-heading').textContent=task?'Edit shared task':'A new task';
    dialog.querySelector('#delete-todo').hidden=!task;
    dialog.querySelector('#todo-members').innerHTML=state.members.map(member=>`<label><input type="checkbox" name="members" value="${member.id}" ${task?.data.members.includes(member.id)||(!task&&member.id===state.account.id)?'checked':''}>${h(member.name)}</label>`).join('');
    dialog.showModal();
  }
  $('#add-todo').onclick=()=>open();
  $('#refresh-todos').onclick=guarded(refresh);
  $('#todo-filters').onclick=event=>{const button=event.target.closest('[data-person]');if(button){selected=button.dataset.person || null;renderLists();}};
  panel.addEventListener('click',guarded(async event=>{
    const edit=event.target.closest('[data-task]');if(edit){open(edit.dataset.task);return;}
    const button=event.target.closest('[data-complete]');if(!button)return;
    const task=state.todos.find(item=>item.id===button.dataset.complete);button.disabled=true;
    try {await api('todos/complete',{id:task.id,version:task.version,completed:!task.completed_at});await refresh();}
    catch(error){await refresh().catch(()=>{});throw error;}
    finally{button.disabled=false;}
  }));
  dialog.querySelector('.close').onclick=()=>dialog.close();
  form.addEventListener('submit',guarded(async event=>{
    event.preventDefault();const data=new FormData(form);const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{await api('todos',{...Object.fromEntries(data),version:Number(data.get('version')),members:data.getAll('members')});dialog.close();await refresh();notify('Task saved.');}
    finally{button.disabled=false;}
  }));
  dialog.querySelector('#delete-todo').onclick=guarded(async()=>{
    if(!confirm('Delete this shared task for everyone?'))return;
    await api('todos/delete',{id:form.elements.id.value,version:Number(form.elements.version.value)});dialog.close();await refresh();notify('Task deleted.');
  });
  const timer=setInterval(()=>{
    if(!document.hidden && !document.querySelector('#app').hidden && state.family)refresh().catch(()=>{});
  },30000);
  timer.unref?.();
  return {render(data){++request;state=data;if(selected&&!state.members.some(member=>member.id===selected))selected=null;renderLists();},dispose(){clearInterval(timer);}};
}
