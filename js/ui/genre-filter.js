import { escapeHtml } from '../util/dom.js';

const ALL_KEY = '__all__';
const COLLAPSED_ROWS = 2;

let containerEl;
let onChange;
let activeGenre = null;
let expanded = false;
let lastWidth = 0;

function buildGenreCounts(shows) {
  const counts = new Map();
  for (const show of shows) {
    if (!show.genres || !show.genres.length) continue;
    for (const g of show.genres) {
      counts.set(g, (counts.get(g) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function pill(label, key, count, isActive) {
  const countHtml = count != null ? `<span class="genre-pill__count">${count}</span>` : '';
  return `
    <button type="button" class="genre-pill"
            data-genre="${escapeHtml(key)}"
            aria-pressed="${isActive ? 'true' : 'false'}">
      <span>${escapeHtml(label)}</span>${countHtml}
    </button>`;
}

function render(shows) {
  const genres = buildGenreCounts(shows);
  let out = pill('All', ALL_KEY, shows.length, activeGenre === null);
  for (const [name, count] of genres) {
    out += pill(name, name, count, activeGenre === name);
  }
  out += `<button type="button" class="genre-more" data-genre-more aria-expanded="false" hidden></button>`;
  containerEl.innerHTML = out;
  layout();
}

// Collapsed, show only the pills that fit in the first rows (most common genres
// first), plus a "+N more" button. The active genre always stays visible.
function layout() {
  const pills = [...containerEl.querySelectorAll('.genre-pill')];
  const more = containerEl.querySelector('[data-genre-more]');
  if (!more) return;
  pills.forEach((p) => { p.hidden = false; });
  more.hidden = true;
  // Hidden (e.g. another view is showing): nothing to measure yet.
  if (!containerEl.offsetWidth) return;

  const rowTops = [...new Set(pills.map((p) => p.offsetTop))];
  if (rowTops.length <= COLLAPSED_ROWS) return;

  more.hidden = false;
  more.setAttribute('aria-expanded', String(expanded));
  if (expanded) {
    more.textContent = 'Show fewer';
    more.removeAttribute('aria-label');
    return;
  }
  // Hide pills from the end until the button fits on the last allowed row.
  const lastRowTop = rowTops[COLLAPSED_ROWS - 1];
  let hidden = 0;
  for (let i = pills.length - 1; i > 0 && more.offsetTop > lastRowTop; i--) {
    if (pills[i].getAttribute('aria-pressed') === 'true') continue;
    pills[i].hidden = true;
    hidden++;
    more.textContent = `+${hidden} more`; // the label's width affects what fits
  }
  more.setAttribute('aria-label', `Show ${hidden} more genre${hidden === 1 ? '' : 's'}`);
}

export function init({ container, onSelect }) {
  containerEl = container;
  onChange = onSelect;
  containerEl.addEventListener('click', (e) => {
    const more = e.target.closest('[data-genre-more]');
    if (more) {
      expanded = !expanded;
      layout();
      more.focus();
      return;
    }
    const btn = e.target.closest('.genre-pill');
    if (!btn) return;
    const raw = btn.getAttribute('data-genre');
    const next = raw === ALL_KEY ? null : raw;
    if (next === activeGenre) return;
    setActive(next);
    onChange?.(next);
  });
  // Re-fit when the width changes, including going from hidden to visible.
  // (Height changes are ignored: they're caused by layout() itself.)
  new ResizeObserver(() => {
    if (containerEl.offsetWidth === lastWidth) return;
    lastWidth = containerEl.offsetWidth;
    layout();
  }).observe(containerEl);
}

export function setShows(shows) {
  if (!containerEl) return;
  render(shows);
}

export function setActive(genre) {
  activeGenre = genre || null;
  if (!containerEl) return;
  const targetKey = activeGenre === null ? ALL_KEY : activeGenre;
  containerEl.querySelectorAll('.genre-pill').forEach((p) => {
    p.setAttribute('aria-pressed', p.getAttribute('data-genre') === targetKey ? 'true' : 'false');
  });
  layout();
}

export function getActive() {
  return activeGenre;
}
