import { $, escapeHtml } from '../util/dom.js';
import { showImage } from '../api.js';
import { gridSkeleton } from './skeleton.js';
import * as modal from './modal.js';

let gridEl, paginationEl;
let pool = [];
let currentPage = 1;
const perPage = 8;
let activeShows = [];

function badgesFor(genres) {
  const variants = ['', '--violet', '--amber', '--cyan', '--rose'];
  return (genres || []).slice(0, 3).map((g, i) =>
    `<span class="badge badge${variants[i % variants.length]}">${escapeHtml(g)}</span>`
  ).join('');
}

function renderCard(show, idx) {
  const img = showImage(show, 'medium');
  const rating = show.rating?.average;
  const ratingStr = (rating === null || rating === undefined) ? '—' : rating.toFixed(1);
  const genres = (show.genres && show.genres.length) ? show.genres : ['Unknown'];
  const premiered = show.premiered ? new Date(show.premiered).getFullYear() : '—';

  return `
    <article class="show-card glass" tabindex="0" role="button"
             aria-label="${escapeHtml(show.name)} — open details"
             data-show-card data-show-idx="${idx}" style="--i: ${idx}">
      <div class="show-card__media">
        <img class="show-card__img" src="${escapeHtml(img)}" alt="${escapeHtml(show.name)}"
             loading="lazy" onerror="this.onerror=null;this.src='./img/noimg.jpg';">
        <span class="show-card__rating"><i class="fa-solid fa-star"></i> ${escapeHtml(ratingStr)}</span>
      </div>
      <div class="show-card__body">
        <h3 class="show-card__title">${escapeHtml(show.name)}</h3>
        <span class="show-card__premiered">${escapeHtml(premiered)}</span>
        <div class="show-card__meta">${badgesFor(genres)}</div>
      </div>
    </article>`;
}

function renderEmpty(query) {
  return `
    <div class="empty-state">
      <i class="fa-solid fa-magnifying-glass empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">No shows found${query ? ` for &ldquo;${escapeHtml(query)}&rdquo;` : ''}</h3>
      <p>Try a different title.</p>
    </div>`;
}

function renderPagination(totalPages) {
  if (!paginationEl) return;
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

  const btn = (label, page, opts = {}) => {
    const attrs = [
      `data-page="${page}"`,
      opts.current ? 'aria-current="page"' : '',
      opts.disabled ? 'disabled' : '',
    ].filter(Boolean).join(' ');
    return `<li><button type="button" class="pagination__btn" ${attrs}>${label}</button></li>`;
  };

  let out = '<ul class="pagination__list">';
  out += btn('<i class="fa-solid fa-chevron-left"></i>', 'prev', { disabled: currentPage === 1 });
  for (let i = 1; i <= totalPages; i++) {
    out += btn(String(i), i, { current: i === currentPage });
  }
  out += btn('<i class="fa-solid fa-chevron-right"></i>', 'next', { disabled: currentPage === totalPages });
  out += '</ul>';
  paginationEl.innerHTML = out;
}

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(pool.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  activeShows = pool.slice(start, start + perPage);
  gridEl.innerHTML = activeShows.map((s, i) => renderCard(s, i)).join('');
  renderPagination(totalPages);
}

function onCardActivate(e) {
  const card = e.target.closest('[data-show-card]');
  if (!card) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  if (e.type === 'keydown') e.preventDefault();
  const idx = Number(card.dataset.showIdx);
  const show = activeShows[idx];
  if (show) modal.open(show, card);
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
  gridEl.addEventListener('click', onCardActivate);
  gridEl.addEventListener('keydown', onCardActivate);
  paginationEl.addEventListener('click', onPaginationClick);
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

export function showEmpty(query) {
  if (gridEl) gridEl.innerHTML = renderEmpty(query);
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
