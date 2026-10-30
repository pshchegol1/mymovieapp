import { escapeHtml } from '../util/dom.js';
import { gridSkeleton } from './skeleton.js';
import { renderCard, syncHeart, onCardEvent } from './show-card.js';
import { isInWatchlist, subscribe } from '../storage.js';

let gridEl, paginationEl;
let pool = [];
let currentPage = 1;
const perPage = 12;
let activeShows = [];

function renderEmpty(query, opts = {}) {
  const icon = opts.icon || 'fa-solid fa-magnifying-glass';
  const title = opts.title || `No shows found${query ? ` for "${escapeHtml(query)}"` : ''}`;
  const sub = opts.sub || 'Try a different title.';
  return `
    <div class="empty-state">
      <i class="${icon} empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">${title}</h3>
      <p>${sub}</p>
    </div>`;
}

// First, last, and current ±1 pages; null marks a gap ("…").
// Gaps of a single page are filled in, since "…" would be no shorter.
function pageWindow(current, total) {
  const pages = [];
  let prev = 0;
  for (let p = 1; p <= total; p++) {
    if (p !== 1 && p !== total && Math.abs(p - current) > 1) continue;
    if (p - prev === 2) pages.push(prev + 1);
    else if (p - prev > 2) pages.push(null);
    pages.push(p);
    prev = p;
  }
  return pages;
}

function renderPagination(totalPages) {
  if (!paginationEl) return;
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

  const btn = (label, page, opts = {}) => {
    const attrs = [
      `data-page="${page}"`,
      opts.current ? 'aria-current="page"' : '',
      opts.disabled ? 'disabled' : '',
      opts.label ? `aria-label="${opts.label}"` : '',
    ].filter(Boolean).join(' ');
    return `<li><button type="button" class="pagination__btn" ${attrs}>${label}</button></li>`;
  };

  let out = '<ul class="pagination__list">';
  out += btn('<i class="fa-solid fa-chevron-left"></i>', 'prev', { disabled: currentPage === 1, label: 'Previous page' });
  for (const p of pageWindow(currentPage, totalPages)) {
    out += p === null
      ? '<li><span class="pagination__gap" aria-hidden="true">…</span></li>'
      : btn(String(p), p, { current: p === currentPage, label: `Page ${p}` });
  }
  out += btn('<i class="fa-solid fa-chevron-right"></i>', 'next', { disabled: currentPage === totalPages, label: 'Next page' });
  out += '</ul>';
  paginationEl.innerHTML = out;
}

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(pool.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  activeShows = pool.slice(start, start + perPage);
  if (activeShows.length === 0) {
    gridEl.innerHTML = renderEmpty();
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }
  gridEl.innerHTML = activeShows.map((s, i) => renderCard(s, i)).join('');
  renderPagination(totalPages);
}

function refreshCardStates() {
  if (!gridEl) return;
  gridEl.querySelectorAll('[data-show-card]').forEach((card) => {
    const idx = Number(card.dataset.showIdx);
    const show = activeShows[idx];
    if (!show) return;
    const heart = card.querySelector('[data-watch-toggle]');
    if (heart) syncHeart(heart, isInWatchlist(show.id));
  });
}

function onPaginationClick(e) {
  const btn = e.target.closest('.pagination__btn');
  if (!btn || btn.hasAttribute('disabled')) return;
  const totalPages = Math.max(1, Math.ceil(pool.length / perPage));
  const raw = btn.dataset.page;
  let page = raw === 'prev' ? currentPage - 1
           : raw === 'next' ? currentPage + 1
           : Number(raw);
  page = Math.min(Math.max(1, page), totalPages);
  if (page === currentPage) return;
  currentPage = page;
  renderPage();
  gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function init({ grid, pagination }) {
  gridEl = grid; paginationEl = pagination;
  gridEl.innerHTML = gridSkeleton(perPage);
  gridEl.addEventListener('click', (e) => onCardEvent(e, activeShows));
  gridEl.addEventListener('keydown', (e) => onCardEvent(e, activeShows));
  paginationEl.addEventListener('click', onPaginationClick);
  subscribe(refreshCardStates);
}

export function setShows(shows) {
  pool = shows.filter((s) => s.image && s.image.medium);
  currentPage = 1;
  renderPage();
}

export function showLoading() {
  if (gridEl) gridEl.innerHTML = gridSkeleton(perPage);
  if (paginationEl) paginationEl.innerHTML = '';
}

export function showEmpty(query, opts) {
  if (gridEl) gridEl.innerHTML = renderEmpty(query, opts);
  if (paginationEl) paginationEl.innerHTML = '';
}

export function showError(msg) {
  if (gridEl) gridEl.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-circle-exclamation empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">Something went wrong</h3>
      <p>${escapeHtml(msg || 'Try refreshing the page.')}</p>
    </div>`;
  if (paginationEl) paginationEl.innerHTML = '';
}
