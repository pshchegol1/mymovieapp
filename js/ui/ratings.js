import { escapeHtml } from '../util/dom.js';
import { fetchShow } from '../api.js';
import { getRatedShows, saveRatedShows, subscribe } from '../storage.js';
import { mapLimit } from '../util/async.js';
import { renderCard, onCardEvent } from './show-card.js';

const SORTS = [
  { key: 'score',  label: 'Your score' },
  { key: 'recent', label: 'Recently rated' },
  { key: 'diff',   label: 'Most different from TVMaze' },
  { key: 'az',     label: 'A → Z' },
];

// Score ranges for the filter; exact scores ("1"–"10") are added below them.
const RANGES = [
  { key: 'all',  label: 'All scores', min: 1, max: 10 },
  { key: 'high', label: '8–10',       min: 8, max: 10 },
  { key: 'mid',  label: '5–7',        min: 5, max: 7 },
  { key: 'low',  label: '1–4',        min: 1, max: 4 },
];

let rootEl, statsEl, barEl, gridEl, sortEl, filterEl, countEl;
let shown = [];
let backfilling = false;
const failed = new Set();

function range(key) {
  const r = RANGES.find((x) => x.key === key);
  return r ? [r.min, r.max] : [Number(key), Number(key)];
}

const tvmaze = (show) => show.rating?.average ?? null;
const fmtSigned = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`;

function sortItems(items, key) {
  const byScore = (a, b) => (b.value - a.value) || ((b.ratedAt ?? 0) - (a.ratedAt ?? 0));
  const diff = (x) => (tvmaze(x.show) == null ? 0 : Math.abs(x.value - tvmaze(x.show)));
  switch (key) {
    case 'recent': return items.sort((a, b) => ((b.ratedAt ?? 0) - (a.ratedAt ?? 0)) || byScore(a, b));
    case 'diff':   return items.sort((a, b) => (diff(b) - diff(a)) || byScore(a, b));
    case 'az':     return items.sort((a, b) => a.show.name.localeCompare(b.show.name));
    default:       return items.sort(byScore);
  }
}

function statsHTML(items) {
  const avg = items.reduce((sum, x) => sum + x.value, 0) / items.length;
  const compared = items.filter((x) => x.show && tvmaze(x.show) != null);
  const vs = compared.length
    ? compared.reduce((sum, x) => sum + x.value - tvmaze(x.show), 0) / compared.length
    : null;

  const counts = Array.from({ length: 10 }, (_, i) => items.filter((x) => x.value === i + 1).length);
  const max = Math.max(...counts);
  const filter = filterEl.value;
  const bars = counts.map((n, i) => {
    const score = i + 1;
    const label = `Score ${score}: ${n} show${n === 1 ? '' : 's'}`;
    return `
      <button type="button" class="ratings-hist__bar" data-score="${score}" style="--h: ${(n / max) * 100}%"
              aria-pressed="${filter === String(score)}" aria-label="${label}. Show only these"
              ${n ? '' : 'disabled'}>
        <span class="ratings-hist__tip" aria-hidden="true">${label}</span>
      </button>`;
  }).join('');

  return `
    <dl class="ratings-stats__numbers">
      <div class="ratings-stat"><dt>Rated</dt><dd>${items.length}</dd></div>
      <div class="ratings-stat"><dt>Your average</dt><dd>${avg.toFixed(1)}</dd></div>
      ${vs == null ? '' : `<div class="ratings-stat" title="Your score minus the TVMaze average, across shows that have one">
        <dt>vs TVMaze</dt><dd>${fmtSigned(vs)}</dd></div>`}
    </dl>
    <figure class="ratings-hist">
      <figcaption class="ratings-hist__title">Your scores</figcaption>
      <div class="ratings-hist__bars">${bars}</div>
      <div class="ratings-hist__axis" aria-hidden="true">${counts.map((_, i) => `<span>${i + 1}</span>`).join('')}</div>
    </figure>`;
}

function emptyHTML(icon, title, sub) {
  return `
    <div class="empty-state">
      <i class="${icon} empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">${escapeHtml(title)}</h3>
      ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
    </div>`;
}

// Older ratings were saved without the show; fetch those once and store copies.
async function backfill(items) {
  const missing = items.filter((x) => !x.show && !failed.has(x.id));
  if (backfilling || !missing.length) return;
  backfilling = true;
  const shows = await mapLimit(missing, 3, async (x) => {
    try {
      return await fetchShow(x.id);
    } catch (err) {
      console.error(err);
      failed.add(x.id);
      return null;
    }
  });
  backfilling = false;
  const found = shows.filter(Boolean);
  if (found.length) saveRatedShows(found); // re-renders via subscribe
  else render();
}

export function render() {
  if (!rootEl || rootEl.hidden) return;
  const items = getRatedShows();
  backfill(items);

  const hasAny = items.length > 0;
  statsEl.hidden = !hasAny;
  barEl.hidden = !hasAny;
  if (!hasAny) {
    shown = [];
    gridEl.innerHTML = emptyHTML('fa-regular fa-star', 'No ratings yet', 'Open any show and tap a star to rate it.');
    return;
  }
  statsEl.innerHTML = statsHTML(items);

  const [min, max] = range(filterEl.value);
  const pending = items.filter((x) => !x.show && !failed.has(x.id)).length;
  const lost = items.filter((x) => !x.show && failed.has(x.id)).length;
  const matching = sortItems(items.filter((x) => x.show && x.value >= min && x.value <= max), sortEl.value);
  shown = matching.map((x) => x.show);

  const notes = [`${shown.length} show${shown.length === 1 ? '' : 's'}`];
  if (pending) notes.push(`loading ${pending} more…`);
  if (lost) notes.push(`${lost} couldn’t be loaded`);
  countEl.textContent = notes.join(' · ');

  gridEl.innerHTML = shown.length
    ? shown.map(renderCard).join('')
    : pending
      ? ''
      : emptyHTML('fa-solid fa-filter', 'No shows with these scores', 'Try a different filter.');
}

export function init({ root }) {
  rootEl = root;
  if (!rootEl) return;
  statsEl = rootEl.querySelector('[data-ratings-stats]');
  barEl = rootEl.querySelector('[data-ratings-bar]');
  gridEl = rootEl.querySelector('[data-ratings-grid]');
  sortEl = rootEl.querySelector('[data-ratings-sort]');
  filterEl = rootEl.querySelector('[data-ratings-filter]');
  countEl = rootEl.querySelector('[data-ratings-count]');

  sortEl.innerHTML = SORTS.map((s) => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('');
  filterEl.innerHTML = RANGES.map((r) => `<option value="${r.key}">${escapeHtml(r.label)}</option>`).join('')
    + `<optgroup label="Exact score">${Array.from({ length: 10 }, (_, i) => 10 - i)
      .map((n) => `<option value="${n}">Only ${n}s</option>`).join('')}</optgroup>`;

  sortEl.addEventListener('change', render);
  filterEl.addEventListener('change', render);
  // A histogram bar filters to that score; clicking the active bar clears it.
  statsEl.addEventListener('click', (e) => {
    const bar = e.target.closest('[data-score]');
    if (!bar) return;
    filterEl.value = filterEl.value === bar.dataset.score ? 'all' : bar.dataset.score;
    render();
  });
  gridEl.addEventListener('click', (e) => onCardEvent(e, shown));
  gridEl.addEventListener('keydown', (e) => onCardEvent(e, shown));
  subscribe(render);
}
