(() => {
  const toggle = document.querySelector('#theme-toggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  function apply(theme) {
    const hearth = theme === 'hearth';
    document.documentElement.dataset.theme = hearth ? 'hearth' : 'modern';
    toggle.textContent = hearth ? 'Theme: Hearth' : 'Theme: Modern';
    toggle.setAttribute('aria-pressed', String(hearth));
    meta.content = hearth ? '#493b2b' : '#315e4e';
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
