import { escapeHtml } from '../util/dom.js';
import { fetchSchedule, fetchNextEpisode, localDate } from '../api.js';
import { getWatchlist, subscribe } from '../storage.js';
import { episodeLabel } from '../util/episode.js';
import { mapLimit } from '../util/async.js';
import * as modal from './modal.js';

const FUN_FACTS = [
  'The longest movie ever made is over 85 hours long.',
  'The first feature-length animated movie was made in 1917.',
  'James Cameron drew the sketch of Rose in Titanic himself.',
  'The sound of velociraptors in Jurassic Park is mating tortoises.',
  'Psycho was the first American film to show a toilet flushing.',
];

const QUOTES = [
  'May the Force be with you.',
  "Here's looking at you, kid.",
  "I'll be back.",
  'You talking to me?',
  'To infinity and beyond!',
  "I'm king of the world!",
  'Why so serious?',
  'Houston, we have a problem.',
];

const PREMIERE_COUNT = 3;
const LOOKAHEAD_DAYS = 14;
const DAYS_PER_BATCH = 3;
const BAR_WINDOW_MS = 7 * 86400000; // the bar fills over the final week
const SKIP_TYPES = new Set(['Sports', 'News', 'Talk Show']);

const NEXT_COUNT = 5;
const NEXT_LOOKUP_MAX = 20; // watchlist shows checked, to stay inside TVMaze's rate limit
const NEXT_CONCURRENCY = 3;

let premieres = [];
let nextEps = [];
let nextKey = null;
let nextReq = 0;

// Next few season premieres (episode 1) airing in the US, soonest first.
// Days are fetched a few at a time and we stop as soon as we have enough.
async function loadPremieres() {
  const now = Date.now();
  const found = new Map();
  for (let day = 0; day < LOOKAHEAD_DAYS && found.size < PREMIERE_COUNT; day += DAYS_PER_BATCH) {
    const offsets = Array.from({ length: Math.min(DAYS_PER_BATCH, LOOKAHEAD_DAYS - day) }, (_, i) => day + i);
    const days = await Promise.all(offsets.map((o) => fetchSchedule('US', localDate(o))));
    for (const ep of days.flat()) {
      const show = ep.show;
      const airs = Date.parse(ep.airstamp);
      if (ep.number !== 1 || !show?.image || SKIP_TYPES.has(show.type) || !(airs > now)) continue;
      if (!found.has(show.id)) found.set(show.id, { show, season: ep.season, airs });
    }
  }
  return [...found.values()].sort((a, b) => a.airs - b.airs).slice(0, PREMIERE_COUNT);
}

function pad(n) { return String(n).padStart(2, '0'); }

function timeLeft(airs) {
  let diff = airs - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000); diff -= days * 86400000;
  const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);    diff -= mins * 60000;
  const secs = Math.floor(diff / 1000);
  return `${pad(days)}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
}

function barPercent(airs) {
  const remaining = airs - Date.now();
  return Math.min(100, Math.max(0, (1 - remaining / BAR_WINDOW_MS) * 100));
}

const shortDate = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

function note(listEl, text) {
  listEl.innerHTML = `<li class="countdown-item countdown-item--note">${escapeHtml(text)}</li>`;
}

// One countdown row; `sub` is the small line under the title.
function countdownItemHTML(idx, title, sub, label) {
  return `
    <li class="countdown-item">
      <button type="button" class="countdown-item__title" data-countdown-idx="${idx}"
              aria-label="${escapeHtml(label)}">
        ${escapeHtml(title)} <span class="countdown-item__season">${escapeHtml(sub)}</span>
      </button>
      <span class="countdown-item__time" data-countdown-time></span>
      <div class="countdown-item__bar"><div class="countdown-item__fill" data-countdown-fill></div></div>
    </li>`;
}

// Update only the changing text/bar widths instead of rebuilding the list.
function tick(listEl, items) {
  listEl.querySelectorAll('[data-countdown-idx]').forEach((btn) => {
    const p = items[Number(btn.dataset.countdownIdx)];
    if (!p) return;
    const item = btn.closest('.countdown-item');
    const left = timeLeft(p.airs);
    const timeEl = item.querySelector('[data-countdown-time]');
    timeEl.textContent = left || 'Airing now';
    timeEl.classList.toggle('countdown-item__time--live', !left);
    item.querySelector('[data-countdown-fill]').style.width = `${barPercent(p.airs)}%`;
  });
}

// Clicking a row opens that show; `items` is read at click time since lists reload.
function openOnClick(listEl, items) {
  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-countdown-idx]');
    const p = btn && items()[Number(btn.dataset.countdownIdx)];
    if (p) modal.open(p.show, btn);
  });
}

async function initPremieres(listEl) {
  note(listEl, 'Loading premieres…');
  try {
    premieres = await loadPremieres();
  } catch (err) {
    console.error(err);
    note(listEl, 'Couldn’t load upcoming premieres.');
    return;
  }
  if (!premieres.length) {
    note(listEl, 'No premieres in the next two weeks.');
    return;
  }
  listEl.innerHTML = premieres.map((p, i) => {
    const date = shortDate(p.airs);
    return countdownItemHTML(i, p.show.name, `S${p.season} · ${date}`,
      `${p.show.name}, season ${p.season} premieres ${date}. Open details`);
  }).join('');
  tick(listEl, premieres);
}

// Next episode of each show in My list, soonest first. Re-runs whenever storage
// changes, but only refetches when the set of shows to check has changed.
async function loadNextEpisodes(listEl) {
  const shows = getWatchlist().filter((s) => s.status !== 'Ended').slice(0, NEXT_LOOKUP_MAX);
  const key = shows.map((s) => s.id).join(',');
  if (key === nextKey) return;
  nextKey = key;
  const reqId = ++nextReq;
  if (!shows.length) {
    nextEps = [];
    note(listEl, 'Add shows to My list to see when their next episodes air.');
    return;
  }
  if (!nextEps.length) note(listEl, 'Loading…');

  let failed = 0;
  const eps = await mapLimit(shows, NEXT_CONCURRENCY, async (show) => {
    try { return await fetchNextEpisode(show.id); } catch (err) { console.error(err); failed++; return null; }
  });
  // My list changed again while these were loading.
  if (reqId !== nextReq) return;

  const now = Date.now();
  nextEps = shows
    .map((show, i) => ({ show, ep: eps[i], airs: Date.parse(eps[i]?.airstamp) }))
    .filter((x) => x.airs > now)
    .sort((a, b) => a.airs - b.airs)
    .slice(0, NEXT_COUNT);
  if (!nextEps.length) {
    note(listEl, failed === shows.length
      ? 'Couldn’t load your next episodes.'
      : 'No upcoming episodes announced for your shows.');
    return;
  }
  listEl.innerHTML = nextEps.map((x, i) => {
    const date = shortDate(x.airs);
    const code = episodeLabel(x.ep);
    return countdownItemHTML(i, x.show.name, [code, date].filter(Boolean).join(' · '),
      `${x.show.name}, ${code ? `${code} ` : ''}airs ${date}. Open details`);
  }).join('');
  tick(listEl, nextEps);
}

export function init({ nextList, countdownList, funFact, quote }) {
  initPremieres(countdownList);
  openOnClick(countdownList, () => premieres);

  if (nextList) {
    loadNextEpisodes(nextList);
    subscribe(() => loadNextEpisodes(nextList));
    openOnClick(nextList, () => nextEps);
  }

  setInterval(() => {
    if (document.hidden) return;
    tick(countdownList, premieres);
    if (nextList) tick(nextList, nextEps);
  }, 1000);

  funFact.textContent = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
  quote.textContent = `“${QUOTES[Math.floor(Math.random() * QUOTES.length)]}”`;
}
