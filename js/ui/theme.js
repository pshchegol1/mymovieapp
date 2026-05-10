import { getTheme, setTheme } from '../storage.js';

let buttonEl = null;

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function effective() {
  return getTheme() || (systemPrefersDark() ? 'dark' : 'light');
}

function apply() {
  const theme = effective();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  if (buttonEl) {
    const isDark = theme === 'dark';
    buttonEl.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    buttonEl.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    buttonEl.innerHTML = isDark
      ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
  }
}

export function init({ button }) {
  buttonEl = button;
  apply();
  if (buttonEl) {
    buttonEl.addEventListener('click', () => {
      const next = effective() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      apply();
    });
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (!getTheme()) apply();
    });
  }
}
