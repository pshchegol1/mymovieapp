import { $, escapeHtml, stripTags } from '../util/dom.js';
import { showImage } from '../api.js';

let modalRoot, dialog, titleEl, bodyEl, closeBtn, scrim;
let lastFocus = null;
let trapHandler = null;

function focusables() {
  return Array.from(dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function trap(e) {
  if (e.key !== 'Tab') return;
  const list = focusables();
  if (list.length === 0) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

function onKey(e) {
  if (e.key === 'Escape') close();
  else if (e.key === 'Tab') trap(e);
}

export function init() {
  modalRoot = $('[data-modal]');
  if (!modalRoot) return;
  dialog = modalRoot.querySelector('.modal__dialog');
  titleEl = modalRoot.querySelector('[data-modal-title]');
  bodyEl = modalRoot.querySelector('[data-modal-body]');
  closeBtn = modalRoot.querySelector('[data-modal-close]');
  scrim = modalRoot.querySelector('[data-modal-scrim]');

  closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', close);
}

export function open(show, triggerEl) {
  if (!modalRoot) return;
  lastFocus = triggerEl || document.activeElement;

  const img = showImage(show, 'original');
  const genres = (show.genres && show.genres.length) ? show.genres.join(', ') : 'Unknown';
  const rating = show.rating?.average ?? 'Unrated';
  const premiered = show.premiered || 'Unknown';
  const summary = stripTags(show.summary) || 'No summary available.';
  const site = show.officialSite || show.url || '';

  titleEl.textContent = show.name || 'Untitled';
  bodyEl.innerHTML = `
    <img src="${escapeHtml(img)}" alt="${escapeHtml(show.name || '')}" class="modal__hero" onerror="this.onerror=null;this.src='./img/noimg.jpg';">
    <div class="modal__row"><i class="fa-solid fa-tags" aria-hidden="true"></i><span><strong>Genres:</strong> ${escapeHtml(genres)}</span></div>
    <div class="modal__row"><i class="fa-solid fa-star" aria-hidden="true"></i><span><strong>Rating:</strong> ${escapeHtml(rating)}</span></div>
    <div class="modal__row"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i><span><strong>Premiered:</strong> ${escapeHtml(premiered)}</span></div>
    <p class="modal__summary">${escapeHtml(summary)}</p>
    <div class="modal__actions">
      ${site ? `<a class="btn btn--primary btn--sm" href="${escapeHtml(site)}" target="_blank" rel="noopener">Official site</a>` : ''}
      <button type="button" class="btn btn--accent btn--sm" data-trailer="${escapeHtml(show.name || '')}"><i class="fa-solid fa-play"></i> Watch trailer</button>
    </div>
  `;

  modalRoot.hidden = false;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  trapHandler = onKey;

  const firstFocus = focusables()[0] || closeBtn;
  firstFocus.focus();
}

export function close() {
  if (!modalRoot || modalRoot.hidden) return;
  modalRoot.hidden = true;
  document.body.style.overflow = '';
  if (trapHandler) document.removeEventListener('keydown', trapHandler);
  trapHandler = null;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}
