export function configureMilestones(form,syncTimes,today) {
  const titleLabel=form.elements.title.closest('label');
  const typeLabel=document.createElement('label');
  typeLabel.textContent='Event type';
  const type=document.createElement('select');type.name='type';
  for(const [value,label] of [['event','Event'],['birthday','Birthday'],['anniversary','Anniversary']])type.add(new Option(label,value));
  typeLabel.append(type);
  const fields=document.createElement('div');fields.className='milestone-fields';
  const nameLabel=document.createElement('label');
  const nameText=document.createTextNode('Name');nameLabel.append(nameText);
  const honoree=document.createElement('input');honoree.name='honoree';honoree.maxLength=120;nameLabel.append(honoree);
  const dateLabel=document.createElement('label');
  const dateText=document.createTextNode('Date of birth');dateLabel.append(dateText);
  const date=document.createElement('input');date.type='date';date.name='milestoneDate';dateLabel.append(date);
  const preview=document.createElement('p');preview.className='muted small';preview.setAttribute('aria-live','polite');
  fields.append(nameLabel,dateLabel,preview);titleLabel.before(typeLabel,fields);
  form.elements.repeat.add(new Option('Every year','yearly'));
  function title(year) {
    const age=year-Number(date.value.slice(0,4)),suffix=age%100>=11&&age%100<=13?'th':({1:'st',2:'nd',3:'rd'}[age%10]||'th');
    return `${honoree.value.trim() || (type.value==='birthday'?'Name':'Couple’s names')}’s ${age>0?age+suffix+' ':''}${type.value==='birthday'?'Birthday':'Anniversary'}!`;
  }
  function updatePreview() {
    const year=Number(form.elements.start.value.slice(0,4));
    preview.textContent=date.value&&year?`${title(year)} · Repeats yearly as an all-day event. February 29 is observed February 28 in non-leap years.`:'Enter the original date, including the year. The age or anniversary number will update each year.';
    if(type.value!=='event')form.elements.title.value=title(year);
  }
  function schedule() {
    if(!date.value || type.value==='event')return;
    const [birthYear,month,day]=date.value.split('-').map(Number);
    const current=today();let year=Math.max(Number(current.slice(0,4)),birthYear);
    const dayInYear=y=>{
      const last=new Date(Date.UTC(y,month,0)).getUTCDate();
      return `${String(y).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
    };
    let next=dayInYear(year);if(next<current)next=dayInYear(++year);
    const end=new Date(next+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);
    form.elements.start.value=next+'T00:00';form.elements.end.value=end.toISOString().slice(0,16);
    syncTimes();updatePreview();
  }
  function mode(reset=false) {
    const special=type.value!=='event';
    fields.hidden=!special;titleLabel.hidden=special;form.elements.title.required=!special;
    honoree.required=special;date.required=special;
    nameText.textContent=type.value==='anniversary'?'Person or couple’s names':'Birthday person’s name';
    dateText.textContent=type.value==='anniversary'?'Original wedding / anniversary date':'Date of birth';
    form.querySelectorAll('.date-time-field').forEach(field=>{field.hidden=special;field.querySelectorAll('input[type="date"],select').forEach(input=>input.required=!special);});
    form.elements.allDay.closest('label').hidden=special;
    form.elements.repeat.closest('label').hidden=special;
    if(special){form.elements.allDay.checked=true;form.elements.repeat.value='yearly';if(reset){form.elements.reminder.value='1440';schedule();}}
    updatePreview();
  }
  type.addEventListener('change',()=>{mode(true);if(type.value==='event'){form.elements.allDay.checked=false;form.elements.repeat.value='none';syncTimes();}});
  date.addEventListener('change',schedule);honoree.addEventListener('input',updatePreview);
  return {load(event){type.value=event?.data.type || 'event';honoree.value=event?.data.honoree || '';date.value=event?.data.milestoneDate || '';mode();}};
}
