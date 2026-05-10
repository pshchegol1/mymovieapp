import { escapeHtml } from '../util/dom.js';

const ALL_KEY = '__all__';

let containerEl;
let onChange;
let activeGenre = null;

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
    <button type="button" class="genre-pill" role="button"
            data-genre="${escapeHtml(key)}"
            aria-pressed="${isActive ? 'true' : 'false'}">
      <span>${escapeHtml(label)}</span>${countHtml}
    </button>`;
}

function render(shows) {
  const genres = buildGenreCounts(shows);
  const total = shows.length;
  let out = pill('All', ALL_KEY, total, activeGenre === null);
  for (const [name, count] of genres) {
    out += pill(name, name, count, activeGenre === name);
  }
  containerEl.innerHTML = out;
}

function attachWheelScroll(el) {
  el.addEventListener('wheel', (e) => {
    if (e.deltaY === 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const atStart = el.scrollLeft === 0 && e.deltaY < 0;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
}

export function init({ container, onSelect }) {
  containerEl = container;
  onChange = onSelect;
  containerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.genre-pill');
    if (!btn) return;
    const raw = btn.getAttribute('data-genre');
    const next = raw === ALL_KEY ? null : raw;
    if (next === activeGenre) return;
    setActive(next);
    onChange?.(next);
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
  attachWheelScroll(containerEl);
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
}

export function getActive() {
  return activeGenre;
}
