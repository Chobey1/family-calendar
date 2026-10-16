(() => {
  const toggle = document.querySelector('#theme-toggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  const heading = document.querySelector('.intro h1');
  const subtitle = document.querySelector('.intro .muted');
  function apply(theme) {
    const hearth = theme === 'hearth';
    document.documentElement.dataset.theme = hearth ? 'hearth' : 'modern';
    toggle.textContent = hearth ? 'Theme: Hearth' : 'Theme: Modern';
    toggle.setAttribute('aria-pressed', String(hearth));
    meta.content = hearth ? '#493b2b' : '#315e4e';
    heading.textContent = hearth ? 'A full calendar. A warm hearth.' : 'A little more together.';
    subtitle.textContent = hearth ? 'For the places we go and the people we come home to.' : 'School days, small adventures, and everything in between.';
  }
  let saved = 'modern';
  try { saved = localStorage.getItem('hearth-theme') || 'modern'; } catch {}
  apply(saved);
  toggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'hearth' ? 'modern' : 'hearth';
    apply(theme);
    try { localStorage.setItem('hearth-theme', theme); } catch {}
  });
})();
