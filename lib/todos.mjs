import { DateTime } from 'luxon';
export function validateTodo(input,members) {
  if(typeof input.title!=='string' || !input.title.trim() || input.title.trim().length>200) throw new Error('Enter a task title of 1–200 characters.');
  if(input.notes!=null && (typeof input.notes!=='string' || input.notes.length>5000)) throw new Error('Notes can contain up to 5,000 characters.');
  const due=input.due || null;
  if(due && (typeof due!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !DateTime.fromISO(due).isValid)) throw new Error('Choose a valid due date or leave it blank.');
  if(!Array.isArray(input.members) || !input.members.length || !input.members.every(id=>members.some(member=>member.id===id))) throw new Error('Tag at least one member of your family.');
  return {title:input.title.trim(),notes:input.notes || '',due,members:[...new Set(input.members)]};
}
