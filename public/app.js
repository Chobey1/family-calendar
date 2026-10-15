const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={members:[],events:[]},selected=null,view='agenda',anchor=new Date(),noticeTimer;
const zone='America/Chicago';
function notify(message){$('#notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').textContent='',7000);}
async function api(path,body){const res=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok){if(res.status===401 && path!=='login')showAuth(false);throw new Error(data.error||'Something went wrong.');}return data;}
function guarded(fn){return async event=>{try{await fn(event);}catch(error){notify(error.message);}};}
function isoDay(date){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function localInput(value){const d=new Date(value);const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);return parts.replace(' ','T');}
function dayAdd(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d;}
function clock(value){return new Date(value).toLocaleTimeString('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'});}
function tone(member){return 'tone-'+Math.max(0,['#487968','#9a642f','#6c62a4','#287f99','#b15770'].indexOf(member.color));}
function showAuth(setup){$('#app').hidden=true;$('#auth').hidden=false;$('#setup-form').hidden=!setup;$('#login-form').hidden=setup;if(setup)$('#adult-fields').innerHTML=[0,1].map(i=>`<h3>${i?'Second':'First'} parent</h3><label>Name<input name="name${i}" required maxlength="80" autocomplete="name"></label><label>Email<input name="email${i}" type="email" required autocomplete="username"></label><label>Password<input name="password${i}" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label>`).join('');}
function range(){if(view==='month'){const start=new Date(anchor.getFullYear(),anchor.getMonth(),1,12);return {from:dayAdd(start,-start.getDay()),to:dayAdd(start,42)};}const start=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate(),12);return {from:start,to:dayAdd(start,28)};}
async function load(){const {from,to}=range();state=await api(`data?from=${isoDay(from)}&to=${isoDay(to)}`);$('#auth').hidden=true;$('#app').hidden=false;render();}
function render(){
  $('#today').textContent=new Date().toLocaleDateString('en-US',{timeZone:zone,weekday:'long',month:'long',day:'numeric'});
  $('#period').textContent=anchor.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  $('#agenda-view').setAttribute('aria-pressed',view==='agenda');$('#month-view').setAttribute('aria-pressed',view==='month');
  $('#filters').innerHTML=`<button data-member="" aria-pressed="${!selected}">Everyone</button>`+state.members.map(m=>`<button data-member="${m.id}" aria-pressed="${selected===m.id}"><span class="dot ${tone(m)}"></span>${esc(m.name)}</button>`).join('');
  const events=state.events.filter(e=>!selected||e.data.members.includes(selected));
  if(view==='agenda'){
    const groups=new Map();for(const event of events){const key=isoDay(new Date(event.start));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event);}
    $('#calendar').innerHTML=groups.size?[...groups].map(([date,items])=>`<section class="day-group"><div class="date-label">${new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})}<strong>${Number(date.slice(-2))}</strong>${new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short'})}</div><div class="events">${items.map(card).join('')}</div></section>`).join(''):`<div class="empty"><h2>A little room to breathe.</h2><p>No events in this view for the next four weeks.</p><button id="empty-add">Add your first plan</button></div>`;
  }else{
    const {from}=range();$('#calendar').innerHTML=`<div class="month-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="weekday">${d}</div>`).join('')}${Array.from({length:42},(_,i)=>{const day=dayAdd(from,i),key=isoDay(day);return `<div class="month-cell ${day.getMonth()!==anchor.getMonth()?'outside':''} ${key===isoDay(new Date())?'today':''}"><div class="day-number">${day.getDate()}</div>${events.filter(e=>isoDay(new Date(e.start))===key).map(e=>`<button class="month-event" data-edit="${e.id}">${esc(e.data.allDay?'':clock(e.start)+' ')}${esc(e.data.title)}</button>`).join('')}</div>`;}).join('')}</div>`;
  }
  $('#footer').textContent=`All times shown in ${zone}. ${state.mailMode==='preview'?'Email preview mode is on — no emails are sent.':'Email delivery is enabled.'}`;
}
function card(event){const d=event.data;return `<article class="event-card"><div class="event-time">${d.allDay?'All day':esc(clock(event.start))+'<br>'+esc(clock(event.end))}</div><div><button class="event-title" data-edit="${event.id}">${esc(d.title)}</button>${d.location||d.address?`<p class="event-detail">${esc([d.location,d.address].filter(Boolean).join(' · '))}</p>`:''}${d.notes?`<p class="event-detail">${esc(d.notes)}</p>`:''}${d.directions?`<p class="event-detail">${esc(d.directions)}</p>`:''}<div class="tags">${state.members.filter(m=>d.members.includes(m.id)).map(m=>`<span class="tag"><span class="dot ${tone(m)}"></span>${esc(m.name)}</span>`).join('')}${d.repeat!=='none'?'<span class="tag">Repeats '+esc(d.repeat)+'</span>':''}</div></div>${d.address?`<a class="map-link" href="https://maps.apple.com/?q=${encodeURIComponent(d.address)}" target="_blank" rel="noreferrer">Directions ↗</a>`:''}</article>`;}
function openEvent(id){
  const form=$('#event-form');form.reset();const event=state.events.find(e=>e.id===id);
  $('#event-heading').textContent=event?'Edit this plan':'A new plan';$('#delete-event').hidden=!event;
  $('#event-members').innerHTML=state.members.map(m=>`<label><input type="checkbox" name="members" value="${m.id}" ${event?.data.members.includes(m.id)||(!event&&m.id===state.account.id)?'checked':''}>${esc(m.name)}</label>`).join('');
  form.elements.id.value=event?.id||'';form.elements.version.value=event?.version||'';
  if(event){for(const name of ['title','location','address','notes','directions','repeat','until','reminder'])form.elements[name].value=event.data[name]??'';form.elements.start.value=localInput(event.data.start);form.elements.end.value=localInput(event.data.end);form.elements.allDay.checked=event.data.allDay;}
  else{const start=new Date();start.setMinutes(0,0,0);start.setHours(start.getHours()+1);form.elements.start.value=localInput(start);form.elements.end.value=localInput(new Date(+start+3600000));form.elements.reminder.value='60';}
  $('#event-dialog').showModal();
}
$('#login-form').addEventListener('submit',guarded(async e=>{e.preventDefault();await api('login',Object.fromEntries(new FormData(e.target)));await load();}));
$('#setup-form').addEventListener('submit',guarded(async e=>{e.preventDefault();const f=new FormData(e.target);await api('setup',{token:f.get('token'),adults:[0,1].map(i=>({name:f.get('name'+i),email:f.get('email'+i),password:f.get('password'+i)}))});e.target.reset();await load();}));
$('#logout').onclick=guarded(async()=>{await api('logout',{});showAuth(false);});
$('#add-event').onclick=()=>openEvent();
$('#calendar').onclick=e=>{const edit=e.target.closest('[data-edit]');if(edit)openEvent(edit.dataset.edit);if(e.target.id==='empty-add')openEvent();};
$('#filters').onclick=e=>{const target=e.target.closest('[data-member]');if(target){selected=target.dataset.member||null;render();}};
for(const dialog of document.querySelectorAll('dialog'))dialog.querySelector('.close').onclick=()=>dialog.close();
$('#event-form').addEventListener('submit',guarded(async e=>{
  e.preventDefault();const f=new FormData(e.target);const data=Object.fromEntries(f);data.members=f.getAll('members');data.allDay=f.has('allDay');data.version=Number(data.version);
  if(data.allDay){data.start=data.start.slice(0,10)+'T00:00';data.end=data.end.slice(0,10)+'T00:00';if(data.end<=data.start){const next=dayAdd(new Date(data.start.slice(0,10)+'T12:00:00'),1);data.end=isoDay(next)+'T00:00';}}
  await api('events',data);$('#event-dialog').close();await load();notify('Plan saved.');
}));
$('#delete-event').onclick=guarded(async()=>{if(!confirm('Delete this event? For a repeating event, this deletes the entire series.'))return;const f=$('#event-form');await api('events/delete',{id:f.elements.id.value,version:Number(f.elements.version.value)});$('#event-dialog').close();await load();notify('Event deleted.');});
$('#agenda-view').onclick=guarded(async()=>{view='agenda';await load();});$('#month-view').onclick=guarded(async()=>{view='month';await load();});
$('#prev').onclick=guarded(async()=>{anchor=view==='month'?new Date(anchor.getFullYear(),anchor.getMonth()-1,1,12):dayAdd(anchor,-28);await load();});$('#next').onclick=guarded(async()=>{anchor=view==='month'?new Date(anchor.getFullYear(),anchor.getMonth()+1,1,12):dayAdd(anchor,28);await load();});$('#now').onclick=guarded(async()=>{anchor=new Date();await load();});
function renderFamily(){$('#family-list').innerHTML=state.members.map(m=>`<div class="family-row"><span class="dot ${tone(m)}"></span><strong>${esc(m.name)}</strong><small>${m.kind==='child'?'Child · no login':esc(m.email)}</small></div>`).join('');$('#mail-mode').textContent=state.mailMode==='preview'?'Preview mode: messages are saved here instead of being sent.':'SMTP mode: messages are sent through your configured provider.';}
$('#settings-button').onclick=()=>{renderFamily();$('#settings-dialog').showModal();};
$('#child-form').addEventListener('submit',guarded(async e=>{e.preventDefault();await api('members',Object.fromEntries(new FormData(e.target)));e.target.reset();await load();renderFamily();notify('Child profile added.');}));
$('#feed-button').onclick=guarded(async()=>{if(!confirm('Create a subscription link? This disables any previous link.'))return;const result=await api('feed',{});$('#feed-url').value=result.url;$('#feed-result').hidden=false;$('#feed-url').select();});
$('#mail-button').onclick=guarded(async()=>{const {jobs}=await api('mail');$('#mail-list').innerHTML=jobs.length?jobs.map(j=>`<details class="mail-item"><summary>${esc(j.subject)} · ${esc(j.status)}</summary><p>${esc(j.recipient)} · ${esc(new Date(j.due_at).toLocaleString('en-US',{timeZone:zone}))}</p><pre>${esc(j.body)}</pre>${j.last_error?`<p>${esc(j.last_error)}</p>`:''}</details>`).join(''):'<p class="muted">No email activity yet. Create an event with a reminder to get started.</p>';});
try{const status=await api('status');if(status.setupRequired)showAuth(true);else await load();}catch(error){notify(error.message);}
