import { escapeHtml } from '../util/dom.js';
import { showImage, fetchSchedule, fetchWebSchedule } from '../api.js';
import { episodeText } from '../util/episode.js';
import * as modal from './modal.js';

const MAX_ITEMS = 16;
const STREAMING_MAX_ITEMS = 24;
// Streaming lists are full of news feeds and talk-show clips; keep it to series.
const STREAMING_SKIP_TYPES = new Set(['News', 'Talk Show', 'Sports']);

const TABS = {
  tv: { title: 'On tonight', load: loadTv, count: (n) => `${n} airing` },
  streaming: { title: 'New on streaming', load: loadStreaming, count: (n) => `${n} show${n === 1 ? '' : 's'}` },
};

let rootEl, listEl, statusEl, titleEl;
let active = null;
const loads = {};         // tab → promise of items, so each tab loads once
let items = [];           // { show, episodes, channel, time } for the tab on screen

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function loadTv() {
  const data = await fetchSchedule('US');
  const seen = new Set();
  return (data || [])
    .filter((ep) => ep.show && ep.show.image)
    .sort((a, b) => (a.airtime || '').localeCompare(b.airtime || ''))
    // Back-to-back episodes of the same show would otherwise appear twice.
    .filter((ep) => !seen.has(ep.show.id) && seen.add(ep.show.id))
    .slice(0, MAX_ITEMS)
    .map((ep) => ({
      show: ep.show,
      episodes: [ep],
      channel: ep.show.network?.name || ep.show.webChannel?.name || '',
      time: ep.airtime,
    }));
}

// Today's streaming releases, one entry per show (a season drop lists every
// episode separately), most popular first.
async function loadStreaming() {
  // US-only services (Peacock, Hulu, …) plus the global ones.
  const lists = await Promise.all([fetchWebSchedule('US'), fetchWebSchedule('')]);
  const byShow = new Map();
  for (const ep of lists.flat()) {
    const show = ep._embedded?.show;
    if (!show?.image || STREAMING_SKIP_TYPES.has(show.type)) continue;
    if (!byShow.has(show.id)) {
      byShow.set(show.id, { show, episodes: [], channel: show.webChannel?.name || show.network?.name || '', time: '' });
    }
    byShow.get(show.id).episodes.push(ep);
  }
  return [...byShow.values()]
    .sort((a, b) => (b.show.weight ?? 0) - (a.show.weight ?? 0))
    .slice(0, STREAMING_MAX_ITEMS);
}

// "S2 · E5 · Title" for one episode; "S1 · 8 episodes" for a batch.
function releaseText(episodes) {
  if (episodes.length === 1) return episodeText(episodes[0]);
  const { season } = episodes[0];
  // Daily shows use the year as the season, which reads badly.
  const oneSeason = season && season < 1900 && episodes.every((ep) => ep.season === season);
  return [oneSeason ? `S${season}` : '', `${episodes.length} episodes`].filter(Boolean).join(' · ');
}

function render() {
  if (!items.length) {
    listEl.innerHTML = `<p class="schedule__empty">${active === 'streaming' ? 'No new releases today.' : 'Nothing scheduled.'}</p>`;
    return;
  }
  listEl.innerHTML = items.map(({ show, episodes, channel, time }, i) => {
    const img = showImage(show, 'medium');
    const when = fmtTime(time);
    const text = releaseText(episodes);
    const label = [show.name, when && `at ${when}`, channel && `on ${channel}`].filter(Boolean).join(' ');
    return `
      <article class="schedule-card" data-sched-idx="${i}" tabindex="0" role="button"
               aria-label="${escapeHtml(label)}">
        <img class="schedule-card__img" src="${escapeHtml(img)}" alt="" loading="lazy">
        <div class="schedule-card__body">
          ${when ? `<div class="schedule-card__time"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(when)}</div>` : ''}
          <div class="schedule-card__title">${escapeHtml(show.name || '')}</div>
          ${channel ? `<div class="schedule-card__net">${escapeHtml(channel)}</div>` : ''}
          ${text ? `<div class="schedule-card__ep">${escapeHtml(text)}</div>` : ''}
        </div>
      </article>`;
  }).join('');
}

function setActiveTab(tab) {
  titleEl.textContent = TABS[tab].title;
  rootEl.querySelectorAll('[data-sched-tab]').forEach((el) => {
    const on = el.dataset.schedTab === tab;
    el.classList.toggle('is-active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

// Switch to a tab ('tv' or 'streaming'), loading its schedule the first time.
export async function show(tab = 'tv') {
  if (!TABS[tab]) tab = 'tv';
  // Coming back to the tab on screen keeps it, unless its load failed.
  if (tab === active && loads[tab]) return;
  active = tab;
  setActiveTab(tab);
  items = [];
  listEl.innerHTML = '';
  statusEl.textContent = 'Loading…';
  loads[tab] ||= TABS[tab].load();
  try {
    const loaded = await loads[tab];
    if (tab !== active) return;
    items = loaded;
    const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    statusEl.textContent = `${TABS[tab].count(items.length)} · ${today}`;
    render();
  } catch (err) {
    console.error(err);
    delete loads[tab];      // let the next visit try again
    if (tab !== active) return;
    statusEl.textContent = '';
    listEl.innerHTML = '<p class="schedule__empty">Couldn’t load schedule.</p>';
  }
}

export function init({ root }) {
  rootEl = root;
  listEl = root.querySelector('[data-schedule-list]');
  statusEl = root.querySelector('[data-schedule-status]');
  titleEl = root.querySelector('[data-schedule-title]');
  listEl.addEventListener('click', onActivate);
  listEl.addEventListener('keydown', onActivate);
}

function onActivate(e) {
  const card = e.target.closest('[data-sched-idx]');
  if (!card) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  if (e.type === 'keydown') e.preventDefault();
  const item = items[Number(card.dataset.schedIdx)];
  if (item?.show) modal.open(item.show, card);
}
