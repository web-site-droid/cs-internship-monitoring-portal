(function applyStoredTheme() {
  try {
    const stored = localStorage.getItem('sis-theme');
    const theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('sis-theme', next);
  } catch {
    /* ignore storage errors */
  }
  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    const active = btn.dataset.themeSet === next;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeSet));
  });
  setTheme(current);
});
