import { escapeHtml } from '../util/dom.js';
import { fetchPerson, fetchPersonCredits, personImage } from '../api.js';
import { renderCard, syncHeart, onCardEvent } from './show-card.js';
import { gridSkeleton } from './skeleton.js';
import { isInWatchlist, subscribe } from '../storage.js';

let headerEl, gridEl;
let shows = [];
let requestId = 0;

function fmtDate(iso) {
  return new Date(`${iso}T00:00`).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
}

// Whole years between two YYYY-MM-DD dates (`to` defaults to today).
function yearsBetween(from, to) {
  const a = new Date(`${from}T00:00`);
  const b = to ? new Date(`${to}T00:00`) : new Date();
  let years = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) years--;
  return years;
}

function headerHTML(person, count) {
  const rows = [];
  if (person.birthday) {
    const age = person.deathday ? '' : ` (age ${yearsBetween(person.birthday)})`;
    rows.push(['fa-cake-candles', 'Born', `${fmtDate(person.birthday)}${age}`]);
  }
  if (person.deathday) {
    const age = person.birthday ? ` (aged ${yearsBetween(person.birthday, person.deathday)})` : '';
    rows.push(['fa-dove', 'Died', `${fmtDate(person.deathday)}${age}`]);
  }
  if (person.country?.name) rows.push(['fa-earth-americas', 'Country', person.country.name]);

  return `
    <img class="person__photo" src="${escapeHtml(personImage(person))}" alt="">
    <div class="person__info">
      <h2 class="shows__title person__name" id="person-name" tabindex="-1" data-person-name>${escapeHtml(person.name || 'Unknown')}</h2>
      ${rows.map(([icon, label, value]) => `
        <div class="person__row"><i class="fa-solid ${icon}" aria-hidden="true"></i>
          <span><strong>${label}:</strong> ${escapeHtml(value)}</span></div>`).join('')}
      <p class="person__count">${count} show${count === 1 ? '' : 's'}</p>
      ${person.url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(person.url)}" target="_blank" rel="noopener">View on TVMaze</a>` : ''}
    </div>`;
}

function renderGrid() {
  gridEl.innerHTML = shows.length
    ? shows.map(renderCard).join('')
    : `<div class="empty-state">
        <i class="fa-solid fa-tv empty-state__icon" aria-hidden="true"></i>
        <h3 class="empty-state__title">No shows listed</h3>
      </div>`;
}

function showError(title, sub) {
  headerEl.innerHTML = '';
  gridEl.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-circle-exclamation empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">${escapeHtml(title)}</h3>
      <p>${escapeHtml(sub)}</p>
    </div>`;
}

export function init({ header, grid }) {
  headerEl = header;
  gridEl = grid;
  gridEl.addEventListener('click', (e) => onCardEvent(e, shows));
  gridEl.addEventListener('keydown', (e) => onCardEvent(e, shows));
  subscribe(() => {
    gridEl.querySelectorAll('[data-show-card]').forEach((card) => {
      const show = shows[Number(card.dataset.showIdx)];
      const heart = card.querySelector('[data-watch-toggle]');
      if (show && heart) syncHeart(heart, isInWatchlist(show.id));
    });
  });
}

export async function load(id) {
  const reqId = ++requestId;
  shows = [];
  headerEl.innerHTML = '<div class="person__loading">Loading…</div>';
  gridEl.innerHTML = gridSkeleton(8);
  let person, credits;
  try {
    [person, credits] = await Promise.all([fetchPerson(id), fetchPersonCredits(id)]);
  } catch (err) {
    if (reqId !== requestId) return;
    console.error(err);
    showError('Couldn’t load this person', 'Check your connection, or the link may be wrong.');
    return;
  }
  // Another person (or a different page) was opened while this one loaded.
  if (reqId !== requestId) return;

  // Someone can have several roles in one show; list each show once, newest first.
  const byId = new Map();
  for (const c of credits || []) {
    const show = c._embedded?.show;
    if (show && !byId.has(show.id)) byId.set(show.id, show);
  }
  shows = [...byId.values()].sort((a, b) => (b.premiered || '').localeCompare(a.premiered || ''));

  headerEl.innerHTML = headerHTML(person, shows.length);
  renderGrid();
  headerEl.querySelector('[data-person-name]')?.focus({ preventScroll: true });
}

export function cancel() {
  requestId++;
}
