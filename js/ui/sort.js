import { escapeHtml } from '../util/dom.js';

const SORTS = [
  { key: 'default',   label: 'Default' },
  { key: 'rating',    label: 'Highest rated' },
  { key: 'newest',    label: 'Newest first' },
  { key: 'oldest',    label: 'Oldest first' },
  { key: 'az',        label: 'A → Z' },
  { key: 'za',        label: 'Z → A' },
];

let sortEl, yearEl, onChange;
let state = { sort: 'default', year: 'all' };

function buildYearOptions(shows) {
  const years = new Set();
  for (const s of shows) {
    if (!s.premiered) continue;
    const y = new Date(s.premiered).getFullYear();
    if (y) years.add(y);
  }
  const arr = [...years].sort((a, b) => b - a);
  return ['<option value="all">All years</option>']
    .concat(arr.map((y) => `<option value="${y}">${y}</option>`))
    .join('');
}

function render(shows) {
  sortEl.innerHTML = SORTS.map((s) => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('');
  sortEl.value = state.sort;
  if (yearEl) {
    yearEl.innerHTML = buildYearOptions(shows);
    yearEl.value = state.year;
  }
}

export function init({ sortSelect, yearSelect, onChange: cb }) {
  sortEl = sortSelect; yearEl = yearSelect; onChange = cb;
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; onChange?.(state); });
  if (yearEl) yearEl.addEventListener('change', () => { state.year = yearEl.value; onChange?.(state); });
}

export function setShows(shows) {
  if (!sortEl) return;
  render(shows);
}

export function apply(shows) {
  let out = [...shows];
  if (state.year !== 'all') {
    out = out.filter((s) => s.premiered && String(new Date(s.premiered).getFullYear()) === state.year);
  }
  switch (state.sort) {
    case 'rating': out.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0)); break;
    case 'newest': out.sort((a, b) => (Date.parse(b.premiered || 0) || 0) - (Date.parse(a.premiered || 0) || 0)); break;
    case 'oldest': out.sort((a, b) => (Date.parse(a.premiered || 0) || 0) - (Date.parse(b.premiered || 0) || 0)); break;
    case 'az':     out.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
    case 'za':     out.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
  }
  return out;
}

export function getState() { return { ...state }; }
export function reset() { state = { sort: 'default', year: 'all' }; if (sortEl) sortEl.value = 'default'; if (yearEl) yearEl.value = 'all'; }
