import { escapeHtml } from '../util/dom.js';
import { fetchSchedule, fetchNextEpisode, localDate, showImage } from '../api.js';
import { getWatchlist, isInWatchlist, toggleWatchlist, subscribe } from '../storage.js';
import { episodeLabel } from '../util/episode.js';
import { mapLimit } from '../util/async.js';
import * as modal from './modal.js';
import * as toast from './toast.js';

const PREMIERE_COUNT = 4;
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

const UNITS = [['d', 'days', 86400000], ['h', 'hrs', 3600000], ['m', 'min', 60000], ['s', 'sec', 1000]];

// [days, hours, minutes, seconds] until `airs`, or null once it has started.
function parts(airs) {
  let diff = airs - Date.now();
  if (diff <= 0) return null;
  return UNITS.map(([, , ms]) => {
    const n = Math.floor(diff / ms);
    diff -= n * ms;
    return n;
  });
}

function timeLeft(airs) {
  const left = parts(airs);
  return left && left.map((n, i) => `${pad(n)}${UNITS[i][0]}`).join(' ');
}

// The two largest units: "in 1d 18h", "in 3h 12m", "in 45s".
function shortLeft(airs) {
  const left = parts(airs);
  if (!left) return null;
  let i = left.findIndex((n) => n > 0);
  if (i < 0) i = UNITS.length - 1;
  return `in ${left.slice(i, i + 2).map((n, k) => `${n}${UNITS[i + k][0]}`).join(' ')}`;
}

// "Tonight", "Today" or "Tomorrow" when the premiere is that close, else null.
function dayWord(airs) {
  const d = new Date(airs);
  const now = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate())
    - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days === 0) return d.getHours() >= 17 ? 'Tonight' : 'Today';
  return days === 1 ? 'Tomorrow' : null;
}

function barPercent(airs) {
  const remaining = airs - Date.now();
  return Math.min(100, Math.max(0, (1 - remaining / BAR_WINDOW_MS) * 100));
}

const shortDate = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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

const kindOf = (p) => (p.season === 1
  ? { cls: 'new', icon: 'fa-champagne-glasses', text: 'Series premiere' }
  : { cls: 'back', icon: 'fa-clapperboard', text: `Season ${p.season} returns` });

// "Remind me" adds the show to My list, so its episodes then show up under
// Your next episodes. The featured premiere's button is labelled; the rest are icons.
function syncFollow(btn, p) {
  const on = isInWatchlist(p.show.id);
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? `Following ${p.show.name}: it's in My list` : `Remind me: add ${p.show.name} to My list`);
  btn.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-bell" aria-hidden="true"></i>`
    + (btn.dataset.premiereFollow === '0' ? `<span>${on ? 'Following' : 'Remind me'}</span>` : '');
}

function premiereHTML(p, i) {
  const kind = kindOf(p);
  const network = p.show.network?.name || p.show.webChannel?.name || '';
  const label = `${p.show.name}, ${kind.text.toLowerCase()}, ${shortDate(p.airs)} at ${timeOf(p.airs)}${network ? ` on ${network}` : ''}. Open details`;
  const follow = `<button type="button" class="premiere__follow" data-premiere-follow="${i}"></button>`;
  const live = '<span class="premiere__live"><i class="fa-solid fa-circle" aria-hidden="true"></i> Airing now</span>';
  if (i === 0) {
    const day = dayWord(p.airs);
    const clock = UNITS.map(([u, name]) => `
      <span class="premiere__tile"><span class="premiere__num" data-unit="${u}">00</span><span class="premiere__unit">${name}</span></span>`).join('');
    return `
      <li class="premiere premiere--featured" data-premiere="0">
        <button type="button" class="premiere__main" data-countdown-idx="0" aria-label="${escapeHtml(label)}">
          <span class="premiere__art">
            <img class="premiere__poster" src="${escapeHtml(showImage(p.show))}" alt="">
            ${day ? `<span class="premiere__day">${day}</span>` : ''}
          </span>
          <span class="premiere__info">
            <span class="premiere__kind premiere__kind--${kind.cls}"><i class="fa-solid ${kind.icon}" aria-hidden="true"></i> ${escapeHtml(kind.text)}</span>
            <span class="premiere__title">${escapeHtml(p.show.name)}</span>
            <span class="premiere__when">${escapeHtml([shortDate(p.airs), timeOf(p.airs), network].filter(Boolean).join(' · '))}</span>
          </span>
        </button>
        <div class="premiere__clock" role="timer" data-premiere-clock>${clock}</div>
        ${live}
        ${follow}
      </li>`;
  }
  const sub = [p.season === 1 ? 'Series premiere' : `S${p.season}`, shortDate(p.airs), network].filter(Boolean).join(' · ');
  return `
    <li class="premiere" data-premiere="${i}">
      <button type="button" class="premiere__main" data-countdown-idx="${i}" aria-label="${escapeHtml(label)}">
        <img class="premiere__poster" src="${escapeHtml(showImage(p.show))}" alt="" loading="lazy">
        <span class="premiere__info">
          <span class="premiere__title">${escapeHtml(p.show.name)}</span>
          <span class="premiere__when">${escapeHtml(sub)}</span>
          <span class="premiere__chip" data-premiere-chip></span>
          ${live}
        </span>
      </button>
      ${follow}
    </li>`;
}

// Update the clock digits and chips in place; a digit that changed rolls in.
function tickPremieres(listEl) {
  listEl.querySelectorAll('[data-premiere]').forEach((item) => {
    const p = premieres[Number(item.dataset.premiere)];
    if (!p) return;
    const left = parts(p.airs);
    item.classList.toggle('is-live', !left);
    const clock = item.querySelector('[data-premiere-clock]');
    if (clock && left) {
      clock.querySelectorAll('[data-unit]').forEach((el, k) => {
        const text = pad(left[k]);
        if (el.textContent === text) return;
        el.textContent = text;
        el.classList.remove('is-tick');
        void el.offsetWidth;    // restart the animation
        el.classList.add('is-tick');
      });
      const spoken = `Starts in ${left[0]} days, ${left[1]} hours and ${left[2]} minutes`;
      if (clock.getAttribute('aria-label') !== spoken) clock.setAttribute('aria-label', spoken);
    }
    const chip = item.querySelector('[data-premiere-chip]');
    if (chip) chip.textContent = shortLeft(p.airs) || '';
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
  listEl.innerHTML = premieres.map(premiereHTML).join('');
  // The featured card's background is its own poster, blurred.
  listEl.querySelector('.premiere--featured')
    ?.style.setProperty('--poster', `url(${JSON.stringify(showImage(premieres[0].show))})`);
  listEl.querySelectorAll('[data-premiere-follow]').forEach((btn) => syncFollow(btn, premieres[Number(btn.dataset.premiereFollow)]));
  tickPremieres(listEl);
}

function onFollowClick(e) {
  const btn = e.target.closest('[data-premiere-follow]');
  const p = btn && premieres[Number(btn.dataset.premiereFollow)];
  if (!p) return;
  const added = toggleWatchlist(p.show);
  toast.show(added
    ? `We'll keep “${p.show.name}” under Your next episodes`
    : `Removed “${p.show.name}” from your list`,
  { icon: added ? 'fa-solid fa-bell' : 'fa-solid fa-bell-slash', tone: added ? 'success' : 'info' });
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

export function init({ nextList, countdownList }) {
  initPremieres(countdownList);
  openOnClick(countdownList, () => premieres);
  countdownList.addEventListener('click', onFollowClick);
  subscribe(() => countdownList.querySelectorAll('[data-premiere-follow]')
    .forEach((btn) => syncFollow(btn, premieres[Number(btn.dataset.premiereFollow)])));

  if (nextList) {
    loadNextEpisodes(nextList);
    subscribe(() => loadNextEpisodes(nextList));
    openOnClick(nextList, () => nextEps);
  }

  setInterval(() => {
    if (document.hidden) return;
    tickPremieres(countdownList);
    if (nextList) tick(nextList, nextEps);
  }, 1000);
}
