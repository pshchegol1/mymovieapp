import { escapeHtml } from '../util/dom.js';
import { fetchSchedule, localDate } from '../api.js';
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

let premieres = [];

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

function renderPremieres(listEl) {
  listEl.innerHTML = premieres.map((p, i) => {
    const date = new Date(p.airs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const label = `${p.show.name}, season ${p.season} premieres ${date}. Open details`;
    return `
    <li class="countdown-item">
      <button type="button" class="countdown-item__title" data-premiere-idx="${i}"
              aria-label="${escapeHtml(label)}">
        ${escapeHtml(p.show.name)} <span class="countdown-item__season">S${escapeHtml(p.season)} · ${escapeHtml(date)}</span>
      </button>
      <span class="countdown-item__time" data-premiere-time></span>
      <div class="countdown-item__bar"><div class="countdown-item__fill" data-premiere-fill></div></div>
    </li>`;
  }).join('');
}

// Update only the changing text/bar widths instead of rebuilding the list.
function tickPremieres(listEl) {
  if (document.hidden) return;
  listEl.querySelectorAll('.countdown-item').forEach((item, i) => {
    const p = premieres[i];
    const left = timeLeft(p.airs);
    const timeEl = item.querySelector('[data-premiere-time]');
    timeEl.textContent = left || 'Airing now';
    timeEl.classList.toggle('countdown-item__time--live', !left);
    item.querySelector('[data-premiere-fill]').style.width = `${barPercent(p.airs)}%`;
  });
}

async function initCountdown(listEl) {
  listEl.innerHTML = '<li class="countdown-item countdown-item--note">Loading premieres…</li>';
  try {
    premieres = await loadPremieres();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<li class="countdown-item countdown-item--note">Couldn’t load upcoming premieres.</li>';
    return;
  }
  if (!premieres.length) {
    listEl.innerHTML = '<li class="countdown-item countdown-item--note">No premieres in the next two weeks.</li>';
    return;
  }
  renderPremieres(listEl);
  tickPremieres(listEl);
  setInterval(() => tickPremieres(listEl), 1000);
  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-premiere-idx]');
    const p = btn && premieres[Number(btn.dataset.premiereIdx)];
    if (p) modal.open(p.show, btn);
  });
}

export function init({ countdownList, funFact, quote }) {
  initCountdown(countdownList);

  funFact.textContent = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
  quote.textContent = `“${QUOTES[Math.floor(Math.random() * QUOTES.length)]}”`;
}
