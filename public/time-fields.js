// Separate date + time controls provide identical quarter-hour choices on phones and desktops.
export function configureTimeFields(form) {
  const fields = ['start', 'end'].map(name => {
    const original = form.elements[name];
    const label = original.closest('label');
    const group = document.createElement('fieldset');
    group.className = 'date-time-field';
    const legend = document.createElement('legend');
    legend.textContent = name === 'start' ? 'Starts' : 'Ends';
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Date';
    const date = document.createElement('input');
    date.type = 'date'; date.required = true;
    dateLabel.append(date);
    const timeLabel = document.createElement('label');
    timeLabel.textContent = 'Time';
    const time = document.createElement('select');
    time.required = true;
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
      const hour = Math.floor(minutes / 60), minute = String(minutes % 60).padStart(2, '0');
      time.add(new Option(`${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`, `${String(hour).padStart(2, '0')}:${minute}`));
    }
    timeLabel.append(time);
    label.replaceWith(group);
    original.hidden = true;
    original.required = false;
    group.append(legend, original, dateLabel, timeLabel);
    const sync = () => {
      const [day, clock = ''] = original.value.split('T');
      date.value = day || '';
      time.querySelector('option[data-existing]')?.remove();
      const value = clock.slice(0, 5);
      // Preserve existing off-quarter times until deliberately changed, rather than silently shifting events.
      if (value && !Array.from(time.options).some(option => option.value === value)) {
        const hour = Number(value.slice(0, 2));
        const option = new Option(`${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? 'AM' : 'PM'} (existing)`, value);
        option.dataset.existing = 'true';
        time.add(option);
      }
      time.value = value;
    };
    const update = () => {
      original.value = date.value && time.value ? `${date.value}T${time.value}` : '';
      original.dispatchEvent(new Event('change', {bubbles: true}));
    };
    date.addEventListener('change', update);
    time.addEventListener('change', update);
    original.addEventListener('change', sync);
    return sync;
  });
  return () => fields.forEach(sync => sync());
}
