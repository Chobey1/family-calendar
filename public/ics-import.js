export function configureInvitationImport({api,notify,escapeHtml:h,getState,reload}) {
  const add=document.querySelector('#add-event'),actions=document.createElement('div');actions.className='intro-actions';
  add.before(actions);actions.append(add);
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Import .ics';actions.append(button);
  const dialog=document.createElement('dialog');dialog.id='import-dialog';
  dialog.innerHTML=`<div class="dialog-scroll"><form id="import-form"><div class="dialog-heading"><h2>Import invitation</h2><button type="button" class="quiet close" aria-label="Close">✕</button></div><p class="muted small">Choose an .ics attachment downloaded from your email or a calendar export. Review before adding. This copies events into Hearth; it does not send an RSVP or keep them synchronized.</p><label>Calendar file<input id="ics-file" type="file" accept=".ics,text/calendar" required></label><p id="import-status" class="muted small" role="status" aria-live="polite"></p><div id="import-preview"></div><fieldset id="import-tag-fields" hidden><legend>Tag these family members on the imported events</legend><div id="import-members" class="member-choices"></div><label>Email reminder<select name="reminder"><option value="0">No reminder</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label></fieldset><div class="dialog-actions"><button id="confirm-import" type="submit" disabled>Import selected events</button></div></form></div>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  let text='',generation=0;
  function status(message){$('#import-status').textContent=message;}
  button.onclick=()=>{
    ++generation;text='';$('#import-form').reset();$('#import-preview').textContent='';$('#import-tag-fields').hidden=true;$('#confirm-import').disabled=true;status('Files up to 256 KB and 100 events. Unsupported repeat patterns are flagged rather than changed.');
    const state=getState();$('#import-members').innerHTML=state.members.map(m=>`<label><input name="members" type="checkbox" value="${m.id}" ${m.id===state.account.id?'checked':''}>${h(m.name)}</label>`).join('');dialog.showModal();
  };
  $('.close').onclick=()=>{++generation;dialog.close();};
  $('#ics-file').addEventListener('change',async()=>{
    const current=++generation;$('#confirm-import').disabled=true;$('#import-tag-fields').hidden=true;$('#import-preview').textContent='';text='';
    try {
      const file=$('#ics-file').files[0];if(!file)return;
      if(file.size>256*1024)throw new Error('Choose a file smaller than 256 KB.');
      status('Reading invitation…');const contents=await file.text();const result=await api('import/preview',{text:contents});
      if(current!==generation)return;text=contents;
      $('#import-preview').innerHTML=result.entries.map(entry=>{
        const disabled=!!entry.error || entry.duplicate;
        const data=entry.data;
        let details='';
        if(data){const format=value=>new Date(value).toLocaleString('en-US',{timeZone:result.zone,dateStyle:'medium',...(data.allDay?{}:{timeStyle:'short'})});details=`<p class="muted small">${h(format(data.start))}${data.allDay?' · All day':' – '+h(format(data.end))}${data.repeat!=='none'?' · Repeats '+h(data.repeat):''}</p>${data.location?`<p class="small">${h(data.location)}</p>`:''}${data.notes?`<p class="import-notes">${h(data.notes)}</p>`:''}`;}
        return `<section class="import-entry"><label class="check"><input type="checkbox" name="selected" value="${entry.index}" ${disabled?'disabled':'checked'}><strong>${h(entry.title)}</strong></label>${details}${entry.error?`<p class="small">${h(entry.error)}</p>`:''}${entry.duplicate?'<p class="small">Already imported into this family. Skipped to prevent duplicates; edits and cancellations must be made in Hearth.</p>':''}${entry.warnings.map(w=>`<p class="muted small">${h(w)}</p>`).join('')}</section>`;
      }).join('');
      const supported=result.entries.filter(e=>!e.error&&!e.duplicate).length;
      status(`${result.entries.length} ${result.entries.length===1?'event':'events'} found · ${supported} available to import. Times shown in ${result.zone}.`);
      $('#import-tag-fields').hidden=!supported;$('#confirm-import').disabled=!supported;
    }catch(error){if(current===generation)status(error.message);}
  });
  $('#import-preview').addEventListener('change',()=>{$('#confirm-import').disabled=!$('#import-preview input:checked');});
  $('#import-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('#confirm-import');button.disabled=true;
    try{
      const form=new FormData(event.target),selected=form.getAll('selected').map(Number),members=form.getAll('members');
      if(!members.length)throw new Error('Tag at least one family member.');
      const result=await api('import/save',{text,selected,members,reminder:Number(form.get('reminder'))});
      dialog.close();await reload();notify(`${result.added} ${result.added===1?'event':'events'} imported.${result.skipped?' '+result.skipped+' duplicate(s) skipped.':''}`);
    }catch(error){status(error.message);}finally{button.disabled=false;}
  });
}
