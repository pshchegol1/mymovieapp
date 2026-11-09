import { html } from '../util/dom.js';
import { fetchShowEpisodes, localDate, showImage } from '../api.js';
import { getTrackedShows, subscribe } from '../storage.js';
import { episodeText } from '../util/episode.js';
import { mapLimit } from '../util/async.js';
import * as modal from './modal.js';

const LOOKUP_MAX = 6; // tracked shows checked, to stay inside TVMaze's rate limit
const CONCURRENCY = 3;

let root, list;
let items = [];
let itemsKey = null;
let req = 0;

// The first aired episode not yet watched, and progress through the aired ones.
function progressOf(tracked, eps) {
  const today = localDate();
  const watched = new Set(tracked.episodes);
  const aired = eps.filter((ep) => ep.airdate && ep.airdate <= today);
  const next = aired.find((ep) => !watched.has(ep.id));
  if (!next) return null;
  return { show: tracked.show, ep: next, watched: aired.filter((ep) => watched.has(ep.id)).length, total: aired.length };
}

function itemHTML(x, i) {
  const pct = Math.round((x.watched / x.total) * 100);
  return html`
    <li class="continue__item">
      <button type="button" class="continue__btn" data-continue-item="${i}">
        <img class="continue__poster" src="${showImage(x.show)}" alt="" loading="lazy">
        <span class="continue__info">
          <span class="continue__title">${x.show.name}</span>
          <span class="continue__ep">${episodeText(x.ep)}</span>
          <span class="continue__progress">${x.watched} of ${x.total} watched</span>
          <span class="continue__bar" aria-hidden="true"><span class="continue__fill" style="width: ${pct}%"></span></span>
        </span>
      </button>
    </li>`;
}

// Re-runs whenever storage changes, but only refetches when watched data has changed.
async function load() {
  const tracked = getTrackedShows().slice(0, LOOKUP_MAX);
  const key = tracked.map((t) => `${t.show.id}:${t.episodes.join('.')}`).join(',');
  if (key === itemsKey) return;
  itemsKey = key;
  const reqId = ++req;

  const found = await mapLimit(tracked, CONCURRENCY, async (t) => {
    try { return progressOf(t, await fetchShowEpisodes(t.show.id)); } catch (err) { console.error(err); return null; }
  });
  // Watched data changed again while these were loading.
  if (reqId !== req) return;

  items = found.filter(Boolean);
  list.innerHTML = items.map(itemHTML).join('');
  root.hidden = !items.length;
}

export function init({ root: rootEl }) {
  root = rootEl;
  list = root?.querySelector('[data-continue-list]');
  if (!list) return;
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-continue-item]');
    const x = btn && items[Number(btn.dataset.continueItem)];
    if (x) modal.open(x.show, btn, { reveal: { season: x.ep.season, number: x.ep.number } });
  });
  load();
  subscribe(load);
}
