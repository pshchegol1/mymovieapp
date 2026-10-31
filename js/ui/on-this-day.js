import { escapeHtml } from '../util/dom.js';
import { fetchSchedule, showImage } from '../api.js';
import { episodeText } from '../util/episode.js';
import * as modal from './modal.js';

const FIRST_YEAR = 1995;  // TVMaze's US schedule gets thin before this
const MAX_ITEMS = 3;
const MIN_WEIGHT = 60;    // TVMaze's 0–100 popularity score; keeps it to shows people know
const ATTEMPTS = 4;       // years to try before giving up for this click
const SKIP_TYPES = new Set(['Sports', 'News', 'Talk Show']);

let rootEl;
let day = null;           // { year, picks }
let tried = new Set();
let requestId = 0;

const pad = (n) => String(n).padStart(2, '0');

// Past years that have today's date (Feb 29 only exists in leap years).
function candidateYears(month, date) {
  const years = [];
  for (let y = FIRST_YEAR; y < new Date().getFullYear(); y++) {
    if (new Date(y, month, date).getDate() === date) years.push(y);
  }
  return years;
}

// The most popular shows that aired an episode on today's date in a random past year.
async function findDay() {
  const today = new Date();
  const month = today.getMonth();
  const date = today.getDate();
  let pool = candidateYears(month, date).filter((y) => !tried.has(y));
  if (!pool.length) {
    // Every year has been shown; start over, but not with the one on screen.
    tried = new Set(day ? [day.year] : []);
    pool = candidateYears(month, date).filter((y) => !tried.has(y));
  }
  for (let i = 0; i < ATTEMPTS && pool.length; i++) {
    const year = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    tried.add(year);
    const eps = await fetchSchedule('US', `${year}-${pad(month + 1)}-${pad(date)}`);
    const seen = new Set();
    const picks = eps
      .filter((ep) => ep.show?.image && (ep.show.weight ?? 0) >= MIN_WEIGHT && !SKIP_TYPES.has(ep.show.type))
      .sort((a, b) => b.show.weight - a.show.weight)
      .filter((ep) => !seen.has(ep.show.id) && seen.add(ep.show.id))
      .slice(0, MAX_ITEMS);
    if (picks.length) return { year, picks };
  }
  return null;
}

function render() {
  const body = rootEl.querySelector('[data-otd-body]');
  if (!day) {
    body.innerHTML = '<p class="otd__note">Nothing notable found for this date. Try another year.</p>';
    return;
  }
  const now = new Date();
  const when = new Date(day.year, now.getMonth(), now.getDate())
    .toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const ago = now.getFullYear() - day.year;
  body.innerHTML = `
    <p class="otd__date"><strong>${escapeHtml(when)}</strong> · ${ago} year${ago === 1 ? '' : 's'} ago</p>
    <ul class="otd__list">
      ${day.picks.map((ep, i) => {
        const text = episodeText(ep);
        return `
        <li>
          <button type="button" class="otd__item" data-otd-idx="${i}"
                  aria-label="${escapeHtml(`${ep.show.name}${text ? `, ${text}` : ''}. Open details`)}">
            <img class="otd__thumb" src="${escapeHtml(showImage(ep.show))}" alt="" loading="lazy">
            <span class="otd__text">
              <span class="otd__show">${escapeHtml(ep.show.name)}</span>
              ${text ? `<span class="otd__ep">${escapeHtml(text)}</span>` : ''}
            </span>
          </button>
        </li>`;
      }).join('')}
    </ul>`;
}

async function load() {
  const reqId = ++requestId;
  const more = rootEl.querySelector('[data-otd-more]');
  more.disabled = true;
  try {
    const found = await findDay();
    if (reqId !== requestId) return;
    day = found;
    render();
  } catch (err) {
    if (reqId !== requestId) return;
    console.error(err);
    rootEl.querySelector('[data-otd-body]').innerHTML = '<p class="otd__note">Couldn’t load TV history.</p>';
  } finally {
    if (reqId === requestId) more.disabled = false;
  }
}

export function init({ root }) {
  rootEl = root;
  if (!rootEl) return;
  rootEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-otd-more]')) { load(); return; }
    const btn = e.target.closest('[data-otd-idx]');
    const ep = btn && day?.picks[Number(btn.dataset.otdIdx)];
    if (ep) modal.open(ep.show, btn);
  });
  load();
}
