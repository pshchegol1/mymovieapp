import { escapeHtml } from '../util/dom.js';
import { fetchShowEpisodes } from '../api.js';
import { getWatchlist } from '../storage.js';
import * as modal from './modal.js';

let rootEl;
let shows = null;         // the home page's shows; null until loaded
let queue = [];
let lastFact = null;
let refs = new Map();     // show id → show, for show names rendered as buttons
let requestId = 0;

// A show name that opens its details.
function ref(show) {
  refs.set(show.id, show);
  return `<button type="button" class="trivia__show" data-trivia-show="${show.id}">${escapeHtml(show.name)}</button>`;
}

const pct = (n, total) => Math.round((n / total) * 100);
const yearOf = (show) => Number(show.premiered?.slice(0, 4)) || null;
const channel = (show) => show.network || show.webChannel || null;

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best;
}

function fmtDuration(minutes) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  const h = `${hours} hour${hours === 1 ? '' : 's'}`;
  return days ? `${days} day${days === 1 ? '' : 's'}${hours ? ` and ${h}` : ''}` : h;
}

// Each fact returns HTML, or null when the data doesn't support it.
const FACTS = [
  function oldest() {
    const dated = shows.filter(yearOf);
    if (!dated.length) return null;
    const show = dated.reduce((a, b) => (a.premiered <= b.premiered ? a : b));
    const ago = new Date().getFullYear() - yearOf(show);
    return `The oldest show on the home page, ${ref(show)}, premiered in ${yearOf(show)}: ${ago} years ago.`;
  },
  function topGenre() {
    const [genre, n] = mostCommon(shows.flatMap((s) => s.genres || [])) || [];
    if (!genre) return null;
    return `${escapeHtml(genre)} is the most common genre on the home page: ${n} of ${shows.length} shows (${pct(n, shows.length)}%).`;
  },
  function topNetwork() {
    const [name, n] = mostCommon(shows.map((s) => channel(s)?.name).filter(Boolean)) || [];
    if (!name || n < 2) return null;
    return `${escapeHtml(name)} has more shows on the home page than any other network or streaming service: ${n} of them.`;
  },
  function topRated() {
    const rated = shows.filter((s) => s.rating?.average != null);
    if (!rated.length) return null;
    const show = rated.reduce((a, b) => (b.rating.average > a.rating.average ? b : a));
    return `${ref(show)} is the highest-rated show on the home page, at ${show.rating.average.toFixed(1)} out of 10 on TVMaze.`;
  },
  function endedShare() {
    const ended = shows.filter((s) => s.status === 'Ended').length;
    const running = shows.filter((s) => s.status === 'Running').length;
    if (!ended || !running) return null;
    return `${pct(ended, shows.length)}% of the shows on the home page have ended. ${running} are still running.`;
  },
  function countries() {
    const set = new Set(shows.map((s) => channel(s)?.country?.name).filter(Boolean));
    if (set.size < 2) return null;
    const [top, n] = mostCommon(shows.map((s) => channel(s)?.country?.name).filter(Boolean));
    return `The shows on the home page come from ${set.size} countries. The most, ${n}, are from ${escapeHtml(top)}.`;
  },
  function longestEpisodes() {
    const timed = shows.filter((s) => s.averageRuntime || s.runtime);
    if (!timed.length) return null;
    const minutes = (s) => s.averageRuntime || s.runtime;
    const show = timed.reduce((a, b) => (minutes(b) > minutes(a) ? b : a));
    return `${ref(show)} has the longest episodes on the home page, averaging ${minutes(show)} minutes.`;
  },
  function yourList() {
    const list = getWatchlist();
    if (list.length < 2) return null;
    const running = list.filter((s) => s.status === 'Running').length;
    return `${running} of the ${list.length} shows in your list ${running === 1 ? 'is' : 'are'} still running.`;
  },
  // The only fact that makes a request: one show's full episode list.
  async function bingeTime() {
    const popular = shows.filter((s) => (s.weight ?? 0) >= 80);
    if (!popular.length) return null;
    const show = popular[Math.floor(Math.random() * popular.length)];
    const eps = await fetchShowEpisodes(show.id);
    const minutes = eps.reduce((sum, ep) => sum + (ep.runtime || show.averageRuntime || show.runtime || 0), 0);
    if (eps.length < 10 || !minutes) return null;
    return `${ref(show)} has aired ${eps.length} episodes. Watched back-to-back, that’s ${fmtDuration(minutes)}.`;
  },
];

// Shuffled, so every fact comes up once before any repeats.
function refill() {
  queue = [...FACTS];
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  if (queue.length > 1 && queue[0] === lastFact) queue.push(queue.shift());
}

async function next() {
  const reqId = ++requestId;
  const body = rootEl.querySelector('[data-trivia-body]');
  const more = rootEl.querySelector('[data-trivia-more]');
  more.disabled = true;
  // Skip facts the data can't support, but stop after one full pass.
  for (let i = 0; i < FACTS.length; i++) {
    if (!queue.length) refill();
    const fact = queue.shift();
    let html = null;
    refs = new Map();
    try {
      html = await fact();
    } catch (err) {
      console.error(err);
    }
    if (reqId !== requestId) return;
    if (html) {
      lastFact = fact;
      body.innerHTML = `<p class="trivia__fact">${html}</p>`;
      more.disabled = false;
      return;
    }
  }
  body.innerHTML = '<p class="trivia__fact">No trivia right now.</p>';
}

export function setShows(list) {
  shows = list || [];
  if (rootEl) next();
}

export function init({ root }) {
  rootEl = root;
  if (!rootEl) return;
  rootEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-trivia-more]')) { next(); return; }
    const btn = e.target.closest('[data-trivia-show]');
    const show = btn && refs.get(Number(btn.dataset.triviaShow));
    if (show) modal.open(show, btn);
  });
}
