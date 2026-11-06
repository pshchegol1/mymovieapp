import { escapeHtml } from '../util/dom.js';
import { fetchSchedule, fetchNextEpisode, localDate, showImage } from '../api.js';
import { getWatchlist, isInWatchlist, toggleWatchlist, subscribe } from '../storage.js';
import { episodeLabel, episodeText } from '../util/episode.js';
import { mapLimit } from '../util/async.js';
import * as modal from './modal.js';
import * as toast from './toast.js';

const PREMIERE_COUNT = 4;
const LOOKAHEAD_DAYS = 14;
const DAYS_PER_BATCH = 3;
const BAR_WINDOW_MS = 7 * 86400000; // the bar fills over the final week
const SKIP_TYPES = new Set(['Sports', 'News', 'Talk Show']);

const NEXT_COUNT = 6;
const WEEK_MS = 7 * 86400000;
const SUGGEST_COUNT = 3;
const CHIP_WITHIN_MS = 12 * 3600000; // further out, the day heading and time say enough
const NEXT_LOOKUP_MAX = 20; // watchlist shows checked, to stay inside TVMaze's rate limit
const NEXT_CONCURRENCY = 3;

let premieres = [];
let nextEps = [];
let nextKey = null;
let nextReq = 0;
let catalog = [];
let suggestions = [];

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

// ---- Your next episodes: an "Up next" card, then a mini TV guide by day ----

const networkOf = (show) => (typeof show.network === 'string' ? show.network : show.network?.name)
  || show.webChannel?.name || '';
const runtimeOf = (x) => x.ep.runtime || x.show.runtime || x.show.averageRuntime || 0;
const isLive = (x, now = Date.now()) => x.airs <= now && now < x.airs + (runtimeOf(x) || 30) * 60000;

// "Season premiere", "Series premiere" or "Special"; null for a regular episode.
// `short` fits the narrow guide rows.
function episodeBadge(ep) {
  if (ep.type === 'significant_special') return { cls: 'special', text: 'Special', short: 'Special' };
  if (ep.number === 1) return ep.season === 1
    ? { cls: 'new', text: 'Series premiere', short: 'New show' }
    : { cls: 'new', text: 'Season premiere', short: 'Premiere' };
  return null;
}

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// "Tonight · 8:00 PM · CBS", or the date instead of "Tonight" further out.
function whenLine(x) {
  return [dayWord(x.airs) || shortDate(x.airs), timeOf(x.airs), networkOf(x.show)].filter(Boolean).join(' · ');
}

function hoursMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

// "This week: 5 episodes · 3h 40m of TV".
function summaryText(items) {
  const week = items.filter((x) => x.airs - Date.now() < WEEK_MS);
  if (!week.length) return `Nothing this week · next one ${shortLeft(items[0].airs)}`;
  const minutes = week.reduce((sum, x) => sum + runtimeOf(x), 0);
  return `This week: ${week.length} episode${week.length === 1 ? '' : 's'}${minutes ? ` · ${hoursMinutes(minutes)} of TV` : ''}`;
}

// Big clock on the Up next card: "21:16:29", with a day count in front when needed.
function clockText(airs) {
  const left = parts(airs);
  if (!left) return null;
  const [d, h, m, sec] = left;
  return `${d ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function nextLabel(x) {
  const code = episodeLabel(x.ep);
  const network = networkOf(x.show);
  return `${x.show.name}${code ? `, ${code}` : ''}, ${shortDate(x.airs)} at ${timeOf(x.airs)}${network ? ` on ${network}` : ''}. Open details`;
}

function badgeHTML(ep, short = false) {
  const b = episodeBadge(ep);
  return b ? `<span class="nx-badge nx-badge--${b.cls}" title="${b.text}">${short ? b.short : b.text}</span>` : '';
}

function featureHTML(x) {
  const still = x.ep.image?.original || x.ep.image?.medium;
  const art = still
    ? `<img class="nx-feature__img" src="${escapeHtml(still)}" alt="">`
    : `<img class="nx-feature__img nx-feature__img--poster" src="${escapeHtml(showImage(x.show))}" alt="">`;
  const ep = episodeText(x.ep);
  return `
    <li class="nx-feature" data-nx="0">
      <button type="button" class="nx-feature__main" data-countdown-idx="0" aria-label="${escapeHtml(nextLabel(x))}">
        <span class="nx-feature__art${still ? '' : ' nx-feature__art--poster'}"
              style="--poster: url(${escapeHtml(JSON.stringify(showImage(x.show)))})">
          ${art}
          <span class="nx-feature__kicker" data-nx-kicker>Up next</span>
          ${badgeHTML(x.ep)}
        </span>
        <span class="nx-feature__title">${escapeHtml(x.show.name)}</span>
        ${ep ? `<span class="nx-feature__ep">${escapeHtml(ep)}</span>` : ''}
      </button>
      <div class="nx-feature__foot">
        <span class="nx-feature__when">${escapeHtml(whenLine(x))}</span>
        <span class="nx-clock" role="timer" data-nx-clock></span>
      </div>
      <button type="button" class="nx-cal" data-nx-cal="0" aria-label="Add ${escapeHtml(x.show.name)} to your calendar">
        <i class="fa-regular fa-calendar-plus" aria-hidden="true"></i><span>Add to calendar</span>
      </button>
    </li>`;
}

// `sameSlot`: the row above airs at the same time, so the time isn't repeated.
function rowHTML(x, i, sameSlot) {
  const [time, ampm] = sameSlot ? ['', ''] : timeOf(x.airs).split(' ');
  const ep = episodeText(x.ep) || networkOf(x.show);
  return `
    <li class="nx-item" data-nx="${i}">
      <button type="button" class="nx-item__main" data-countdown-idx="${i}" aria-label="${escapeHtml(nextLabel(x))}">
        <span class="nx-item__time">${escapeHtml(time)}${ampm ? `<small>${escapeHtml(ampm)}</small>` : ''}</span>
        <img class="nx-item__poster" src="${escapeHtml(showImage(x.show))}" alt="" loading="lazy">
        <span class="nx-item__info">
          <span class="nx-item__title">${escapeHtml(x.show.name)}</span>
          ${badgeHTML(x.ep, true)}
          <span class="nx-item__ep">${escapeHtml(ep)}</span>
        </span>
      </button>
      <span class="nx-chip" data-nx-chip></span>
    </li>`;
}

// The Up next card, then the rest grouped under day headings.
function renderNextEpisodes(listEl, summaryEl) {
  let html = featureHTML(nextEps[0]);
  let day = null;
  const slots = new Set();
  nextEps.forEach((x, i) => {
    if (i === 0) return;
    if (dayKey(x.airs) !== day) {
      day = dayKey(x.airs);
      const word = dayWord(x.airs);
      html += `<li class="nx-day" aria-hidden="true"><span>${word || shortDate(x.airs).split(',')[0]}</span>${word ? shortDate(x.airs) : shortDate(x.airs).split(', ')[1]}</li>`;
    }
    // Several of your shows in the same slot: one note, before the first of them.
    const slot = nextEps.filter((y) => y.airs === x.airs);
    if (slot.length > 1 && !slots.has(x.airs)) {
      slots.add(x.airs);
      const n = slot.length === 2 ? 'Both' : `${slot.length} of your shows`;
      const verb = slot.length === 2 ? `${escapeHtml(slot[0].show.name)} and ${escapeHtml(slot[1].show.name)} air` : 'air';
      html += `<li class="nx-clash"><i class="fa-solid fa-bolt" aria-hidden="true"></i>
        <span>${slot.length === 2 ? verb : `${n} ${verb}`} at ${timeOf(x.airs)}. Time to pick one!</span></li>`;
    }
    html += rowHTML(x, i, i > 1 && nextEps[i - 1].airs === x.airs);
  });
  listEl.innerHTML = html;
  if (summaryEl) {
    summaryEl.textContent = summaryText(nextEps);
    summaryEl.hidden = false;
  }
  tickNext(listEl);
}

// Update the clock, chips and live state in place.
function tickNext(listEl) {
  const now = Date.now();
  listEl.querySelectorAll('[data-nx]').forEach((item) => {
    const x = nextEps[Number(item.dataset.nx)];
    if (!x) return;
    const live = isLive(x, now);
    item.classList.toggle('is-live', live);
    const clock = item.querySelector('[data-nx-clock]');
    if (clock) {
      clock.textContent = live ? 'On now' : (clockText(x.airs) || 'Starting');
      item.querySelector('[data-nx-kicker]').textContent = live ? 'Airing now' : 'Up next';
    }
    const chip = item.querySelector('[data-nx-chip]');
    if (chip) chip.textContent = live ? 'Live' : (x.airs - now < CHIP_WITHIN_MS && shortLeft(x.airs)) || '';
  });
}

// A one-event calendar file for the episode, using its real runtime.
function downloadIcs(x) {
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (str) => String(str).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const title = `${x.show.name}${episodeLabel(x.ep) ? ` (${episodeLabel(x.ep).replace(/ · /g, '')})` : ''}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MovieMatrix//Next episodes//EN',
    'BEGIN:VEVENT',
    `UID:mm-${x.show.id}-${x.ep.id || x.airs}@moviematrix`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(x.airs)}`,
    `DTEND:${stamp(x.airs + (runtimeOf(x) || 60) * 60000)}`,
    `SUMMARY:${text(title)}`,
    `DESCRIPTION:${text([episodeText(x.ep), networkOf(x.show)].filter(Boolean).join(' on '))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${text(title)} starts in 15 minutes`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${x.show.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'episode'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast.show(`Calendar event for “${x.show.name}” downloaded`, { icon: 'fa-regular fa-calendar-check' });
}

// Empty My list: suggest a few popular running shows to follow in one click.
function emptyHTML() {
  suggestions = catalog
    .filter((s) => s.status === 'Running' && !isInWatchlist(s.id))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, SUGGEST_COUNT);
  return `
    <li class="nx-empty">
      <span class="nx-empty__icon" aria-hidden="true"><i class="fa-solid fa-tv"></i></span>
      <p class="nx-empty__text"><strong>Your couch schedule is empty.</strong> Follow a show and its new episodes will line up here.</p>
    </li>
    ${suggestions.map((s, i) => `
    <li class="nx-suggest">
      <img class="nx-item__poster" src="${escapeHtml(showImage(s))}" alt="" loading="lazy">
      <span class="nx-item__info">
        <span class="nx-item__title">${escapeHtml(s.name)}</span>
        <span class="nx-item__ep">${escapeHtml([networkOf(s), s.genres?.[0]].filter(Boolean).join(' · '))}</span>
      </span>
      <button type="button" class="premiere__follow" data-nx-follow="${i}" aria-label="Follow ${escapeHtml(s.name)}: add it to My list">
        <i class="fa-regular fa-bell" aria-hidden="true"></i><span>Follow</span>
      </button>
    </li>`).join('')}`;
}

function onNextClick(e) {
  const cal = e.target.closest('[data-nx-cal]');
  if (cal) { downloadIcs(nextEps[Number(cal.dataset.nxCal)]); return; }
  const follow = e.target.closest('[data-nx-follow]');
  const s = follow && suggestions[Number(follow.dataset.nxFollow)];
  if (s) {
    toggleWatchlist(s);
    toast.show(`Following “${s.name}”`, { icon: 'fa-solid fa-bell' });
  }
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
async function loadNextEpisodes(listEl, summaryEl) {
  const shows = getWatchlist().filter((s) => s.status !== 'Ended').slice(0, NEXT_LOOKUP_MAX);
  const key = shows.map((s) => s.id).join(',');
  if (key === nextKey) return;
  nextKey = key;
  const reqId = ++nextReq;
  if (summaryEl) summaryEl.hidden = true;
  if (!shows.length) {
    nextEps = [];
    listEl.innerHTML = emptyHTML();
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
    .filter((x) => x.airs > now || (x.airs && isLive(x, now)))
    .sort((a, b) => a.airs - b.airs || a.show.name.localeCompare(b.show.name))
    .slice(0, NEXT_COUNT);
  if (!nextEps.length) {
    note(listEl, failed === shows.length
      ? 'Couldn’t load your next episodes.'
      : 'No upcoming episodes announced for your shows.');
    return;
  }
  renderNextEpisodes(listEl, summaryEl);
}

// The home page catalog, used to suggest shows when My list is empty.
export function setCatalog(shows) {
  catalog = shows || [];
  if (nextListEl && !getWatchlist().length) nextListEl.innerHTML = emptyHTML();
}

let nextListEl = null;

export function init({ nextList, nextSummary, countdownList }) {
  initPremieres(countdownList);
  openOnClick(countdownList, () => premieres);
  countdownList.addEventListener('click', onFollowClick);
  subscribe(() => countdownList.querySelectorAll('[data-premiere-follow]')
    .forEach((btn) => syncFollow(btn, premieres[Number(btn.dataset.premiereFollow)])));

  if (nextList) {
    nextListEl = nextList;
    loadNextEpisodes(nextList, nextSummary);
    subscribe(() => loadNextEpisodes(nextList, nextSummary));
    openOnClick(nextList, () => nextEps);
    nextList.addEventListener('click', onNextClick);
  }

  setInterval(() => {
    if (document.hidden) return;
    tickPremieres(countdownList);
    if (nextList) tickNext(nextList);
  }, 1000);
}
