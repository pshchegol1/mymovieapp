import { escapeHtml } from '../util/dom.js';
import { getWatchlist, getRecent, getRatings, subscribe } from '../storage.js';
import * as modal from './modal.js';

const TAGLINES = [
  'Lights, camera, binge.',
  'Every night is a premiere night.',
  'Streaming happiness, one episode at a time.',
  'Just one more episode…',
  'Your couch called. It misses you.',
];

let rootEl;
let getShows = () => [];

// Genres weighted by how much the user cares: saved shows count double.
function topGenre() {
  const counts = new Map();
  const add = (shows, weight) => {
    for (const s of shows) for (const g of s.genres || []) counts.set(g, (counts.get(g) || 0) + weight);
  };
  add(getWatchlist(), 2);
  add(getRecent(), 1);
  let best = null;
  for (const [g, n] of counts) if (!best || n > best[1]) best = [g, n];
  return best?.[0] || null;
}

function renderProfile() {
  const saved = getWatchlist().length;
  const ratings = Object.values(getRatings());
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
  const genre = topGenre();
  const mount = rootEl.querySelector('[data-footer-profile]');

  if (!saved && !ratings.length && !genre) {
    mount.innerHTML = '<p class="footer-profile__empty">Save or rate a few shows and your viewing profile will appear here.</p>';
  } else {
    mount.innerHTML = `
      <dl class="footer-stats">
        <div class="footer-stat"><dt>Saved</dt><dd>${saved}</dd></div>
        <div class="footer-stat"><dt>Rated</dt><dd>${ratings.length}${avg ? `<span class="footer-stat__sub"><i class="fa-solid fa-star" aria-hidden="true"></i> ${avg} avg</span>` : ''}</dd></div>
        <div class="footer-stat"><dt>Top genre</dt><dd>${genre ? escapeHtml(genre) : '—'}</dd></div>
      </dl>`;
  }

  const hint = rootEl.querySelector('[data-surprise-hint]');
  hint.textContent = genre ? `Leaning towards ${genre}, your top genre.` : 'A random pick from popular shows.';
}

// Something the user hasn't saved or opened yet, preferably in their top genre.
function surprise() {
  const seen = new Set([...getWatchlist(), ...getRecent()].map((s) => s.id));
  const fresh = getShows().filter((s) => !seen.has(s.id));
  const pool = fresh.length ? fresh : getShows();
  if (!pool.length) return;
  const genre = topGenre();
  const inGenre = genre ? pool.filter((s) => s.genres?.includes(genre)) : [];
  const from = inGenre.length ? inGenre : pool;
  modal.open(from[Math.floor(Math.random() * from.length)], rootEl.querySelector('[data-surprise]'));
}

export function init({ root, shows }) {
  if (!root) return;
  rootEl = root;
  getShows = shows;

  rootEl.querySelector('[data-footer-tagline]').textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
  rootEl.querySelector('[data-footer-year]').textContent = new Date().getFullYear();
  rootEl.querySelector('[data-surprise]').addEventListener('click', surprise);
  rootEl.querySelector('[data-back-to-top]').addEventListener('click', () => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  });

  renderProfile();
  subscribe(renderProfile);
}
