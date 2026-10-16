import { DateTime } from 'luxon';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const zone = process.env.TZ || 'America/Chicago';
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  return timingSafeEqual(Buffer.from(expected, 'hex'), scryptSync(password, salt, 64));
}
export const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ordinal(number) {
  const lastTwo=number%100;
  return `${number}${lastTwo>=11&&lastTwo<=13?'th':({1:'st',2:'nd',3:'rd'}[number%10] || 'th')}`;
}
export function milestoneTitle(data,year) {
  if(!['birthday','anniversary'].includes(data.type)) return data.title;
  const age=year-Number(data.milestoneDate.slice(0,4));
  return `${data.honoree}’s ${age>0?ordinal(age)+' ':''}${data.type==='birthday'?'Birthday':'Anniversary'}!`;
}

export function validateEvent(input) {
  const type=input.type || 'event';
  if(!['event','birthday','anniversary'].includes(type)) throw new Error('Choose a valid event type.');
  let honoree='',milestoneDate=null;
  if(type!=='event') {
    honoree=String(input.honoree || '').trim();
    const date=DateTime.fromISO(input.milestoneDate || '',{zone});
    if(!honoree || honoree.length>120) throw new Error('Enter the person or couple’s name (up to 120 characters).');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.milestoneDate || '') || !date.isValid) throw new Error('Enter a valid original birth or anniversary date, including the year.');
    milestoneDate=date.toISODate();
    const anchor=DateTime.fromISO(input.start || '',{zone});
    if(!anchor.isValid || anchor.toISODate()<milestoneDate) throw new Error('The first celebration cannot be before the original date.');
    const expected=date.set({year:anchor.year});
    if(anchor.month!==expected.month || anchor.day!==expected.day) throw new Error('The celebration date must match the original month and day. February 29 uses February 28 in non-leap years.');
    if(input.repeat!=='yearly' || !input.allDay) throw new Error('Birthdays and anniversaries must be all-day yearly events.');
    input={...input,title:milestoneTitle({type,honoree,milestoneDate},anchor.year)};
  }
  const title = String(input.title || '').trim();
  const start = DateTime.fromISO(input.start || '', {zone});
  const end = DateTime.fromISO(input.end || '', {zone});
  if (!title || title.length > 200) throw new Error('Enter a title of 1–200 characters.');
  if (!start.isValid || !end.isValid || end <= start) throw new Error('The end must be after a valid start time.');
  if (end.diff(start, 'days').days > 31) throw new Error('Events can last up to 31 days.');
  if (!['none', 'daily', 'weekly','yearly'].includes(input.repeat)) throw new Error('Choose a valid repeat schedule.');
  if (![0, 15, 30, 60, 1440].includes(Number(input.reminder))) throw new Error('Choose a valid reminder interval.');
  if (input.until && (!DateTime.fromISO(input.until, {zone}).isValid || input.until < start.toISODate())) throw new Error('Repeat end date must be on or after the start date.');
  for (const field of ['notes','location','address','directions']) if (String(input[field] || '').length > 5000) throw new Error('Event details are too long.');
  if (!Array.isArray(input.members) || !input.members.length) throw new Error('Tag at least one family member.');
  return {title, type, honoree, milestoneDate, start: start.toISO(), end: end.toISO(), allDay: !!input.allDay,
    repeat: input.repeat, until: input.until || null, reminder: Number(input.reminder),
    members: [...new Set(input.members)], notes: input.notes || '', location: input.location || '',
    address: input.address || '', directions: input.directions || ''};
}

// Recurrence advances local dates, preserving local clock time through DST changes.
export function occurrences(event, from, to) {
  const data = event.data;
  let start = DateTime.fromISO(data.start, {zone}).setZone(zone);
  const originalEnd = DateTime.fromISO(data.end, {zone}).setZone(zone);
  const daySpan = Math.round(originalEnd.startOf('day').diff(start.startOf('day'), 'days').days);
  if(data.repeat==='yearly') {
    const result=[];
    const monthDay=data.milestoneDate?DateTime.fromISO(data.milestoneDate,{zone}):start;
    for(let year=Math.max(start.year,from.setZone(zone).year-1);year<=to.setZone(zone).year;year++) {
      // Rebuild from the original month/day each year so Feb 29 returns in leap years.
      const occurrence=start.set({year,month:monthDay.month,day:1}).set({day:Math.min(monthDay.day,DateTime.local(year,monthDay.month,1).daysInMonth)});
      if(occurrence<start || occurrence>=to || (data.until && occurrence.toISODate()>data.until)) continue;
      const end=occurrence.plus({days:daySpan}).set({hour:originalEnd.hour,minute:originalEnd.minute,second:originalEnd.second,millisecond:originalEnd.millisecond});
      if(end>from) result.push({...event,data:{...data,title:milestoneTitle(data,year)},start:occurrence.toISO(),end:end.toISO()});
    }
    return result;
  }
  const step = data.repeat === 'weekly' ? 7 : 1;
  if (data.repeat !== 'none') {
    const days = Math.floor(from.setZone(zone).startOf('day').diff(start.startOf('day'), 'days').days);
    start = start.plus({days: Math.max(0, Math.floor((days - daySpan - 1) / step)) * step});
  }
  const result = [];
  while (start < to) {
    if (data.until && start.toISODate() > data.until) break;
    const end = start.plus({days: daySpan}).set({hour: originalEnd.hour, minute: originalEnd.minute, second: originalEnd.second, millisecond: originalEnd.millisecond});
    if (end > from) result.push({...event, start: start.toISO(), end: end.toISO()});
    if (data.repeat === 'none') break;
    start = start.plus({days: step});
  }
  return result;
}

export function recipients(event, members) {
  const tagged = members.filter(m => event.data.members.includes(m.id));
  const includesChild = tagged.some(m => m.kind === 'child');
  return members.filter(m => m.kind === 'adult' && m.email && (includesChild || tagged.some(t => t.id === m.id)));
}

export function weeklyWindow(now) {
  const local = now.setZone(zone);
  const monday = local.startOf('week').plus({weeks: 1});
  return {from: monday, to: monday.plus({weeks: 1}), due: monday.minus({days: 1}).set({hour: 15})};
}

export function emailBody(items, members, heading) {
  const rows = items.map(e => {
    const d = e.data;
    const people = members.filter(m => d.members.includes(m.id)).map(m => m.name).join(', ');
    const start = DateTime.fromISO(e.start).setZone(zone);
    const end = DateTime.fromISO(e.end).setZone(zone);
    const when = d.allDay ? start.toFormat('ccc, LLL d') + ' · All day' : `${start.toFormat('ccc, LLL d, h:mm a')} – ${end.toFormat('ccc, LLL d, h:mm a')} (${zone})`;
    return `${d.title}\n${when}\n${people}\n${[d.location,d.address,d.directions,d.notes].filter(Boolean).join('\n')}`;
  });
  return `${heading}\n\n${rows.join('\n\n──────────\n\n') || 'No events scheduled.'}\n\nOpen your family calendar: ${process.env.APP_URL || ''}`;
}

const icsEscape = v => String(v || '').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utcStamp = v => DateTime.fromISO(v).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
export function calendarFeed(events, members) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Family Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Family Calendar'];
  for (const e of events) {
    const d = e.data;
    lines.push('BEGIN:VEVENT', `UID:${e.id}-${utcStamp(e.start)}@family-calendar`, `DTSTAMP:${utcStamp(e.updated_at.toISOString())}`,
      ...(d.allDay ? [`DTSTART;VALUE=DATE:${DateTime.fromISO(e.start).setZone(zone).toFormat('yyyyMMdd')}`, `DTEND;VALUE=DATE:${DateTime.fromISO(e.end).setZone(zone).toFormat('yyyyMMdd')}`] : [`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`]), `SUMMARY:${icsEscape(d.title)}`,
      `LOCATION:${icsEscape([d.location,d.address].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${icsEscape([members.filter(m => d.members.includes(m.id)).map(m=>m.name).join(', '),d.notes,d.directions].filter(Boolean).join('\n'))}`,
      'END:VEVENT');
  }
  // Fold by UTF-8 bytes; calendar lines must be at most 75 octets.
  return lines.flatMap(line => {
    const folded = []; let part = '';
    for (const char of line) { if (Buffer.byteLength(part + char) > 75) {folded.push(part); part = ' ';} part += char; }
    folded.push(part); return folded;
  }).join('\r\n') + '\r\n';
}
