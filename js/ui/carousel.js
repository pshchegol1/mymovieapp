import { escapeHtml, stripTags } from '../util/dom.js';
import { showImage } from '../api.js';
import * as modal from './modal.js';

let trackEl, indicatorsEl, prevBtn, nextBtn, rootEl;
let slides = [];
let index = 0;
let timer = null;
let interval = 3500;
let isPaused = false;
let scrollSettle = null;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function renderSlide(show, idx) {
  const backdrop = showImage(show, 'original');
  const poster = showImage(show, 'medium');
  const rating = show.rating?.average;
  const year = show.premiered ? show.premiered.slice(0, 4) : null;
  const network = show.network?.name || show.webChannel?.name;
  const meta = [
    rating != null ? `<span><i class="fa-solid fa-star" aria-hidden="true"></i> ${Number(rating).toFixed(1)}</span>` : '',
    year ? `<span>${year}</span>` : '',
    network ? `<span>${escapeHtml(network)}</span>` : '',
  ].filter(Boolean).join('');
  const summary = stripTags(show.summary);
  const loading = idx === 0 ? 'eager' : 'lazy';
  return `
    <div class="carousel__slide" role="group" aria-roledescription="slide" aria-label="${escapeHtml(show.name)}"
         data-slide-idx="${idx}">
      <img class="carousel__backdrop" src="${escapeHtml(backdrop)}" alt="" loading="${loading}">
      <div class="carousel__shade"></div>
      <img class="carousel__poster" src="${escapeHtml(poster)}" alt="" loading="${loading}">
      <div class="carousel__caption">
        ${show.genres?.length ? `<span class="carousel__caption-pill">${escapeHtml(show.genres.slice(0, 3).join(' · '))}</span>` : ''}
        <h3 class="carousel__title">${escapeHtml(show.name)}</h3>
        ${meta ? `<p class="carousel__meta">${meta}</p>` : ''}
        ${summary ? `<p class="carousel__summary">${escapeHtml(summary)}</p>` : ''}
        <button type="button" class="btn btn--primary btn--sm carousel__open" data-slide-open>
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i> Details
        </button>
      </div>
    </div>`;
}

function syncIndicators() {
  Array.from(indicatorsEl.children).forEach((el, k) =>
    el.setAttribute('aria-selected', k === index ? 'true' : 'false')
  );
}

function renderIndicators(count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<button type="button" class="carousel__indicator" role="tab"
              aria-label="Go to slide ${i + 1}"
              aria-selected="${i === 0 ? 'true' : 'false'}"
              data-idx="${i}"></button>`;
  }
  indicatorsEl.innerHTML = out;
}

function goTo(i, opts = {}) {
  if (!slides.length) return;
  index = ((i % slides.length) + slides.length) % slides.length;
  const target = trackEl.children[index];
  if (target) {
    const smooth = !opts.instant && !reducedMotion?.matches;
    trackEl.scrollTo({ left: target.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  }
  syncIndicators();
}

// After a manual swipe/scroll settles, adopt whichever slide is in view.
function onTrackScroll() {
  clearTimeout(scrollSettle);
  scrollSettle = setTimeout(() => {
    if (!slides.length || !trackEl.clientWidth) return;
    const i = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
    if (i === index || i < 0 || i >= slides.length) return;
    index = i;
    syncIndicators();
    start();
  }, 120);
}

function onSlideClick(e) {
  const slide = e.target.closest('[data-slide-idx]');
  const show = slide && slides[Number(slide.dataset.slideIdx)];
  if (show) modal.open(show, e.target.closest('[data-slide-open]') || slide);
}

function next() { goTo(index + 1); }
function prev() { goTo(index - 1); }

function start() {
  stop();
  if (slides.length <= 1 || reducedMotion?.matches || document.hidden) return;
  timer = setInterval(() => { if (!isPaused) next(); }, interval);
}
function stop() { if (timer) clearInterval(timer); timer = null; }

export function init({ root, track, indicators, prev: pBtn, next: nBtn }) {
  rootEl = root; trackEl = track; indicatorsEl = indicators;
  prevBtn = pBtn; nextBtn = nBtn;
  interval = Number(root.dataset.autoplay || 3500);

  prevBtn.addEventListener('click', () => { prev(); start(); });
  nextBtn.addEventListener('click', () => { next(); start(); });
  indicatorsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel__indicator');
    if (!btn) return;
    goTo(Number(btn.dataset.idx));
    start();
  });
  rootEl.addEventListener('mouseenter', () => { isPaused = true; });
  rootEl.addEventListener('mouseleave', () => { isPaused = false; });
  rootEl.addEventListener('focusin', () => { isPaused = true; });
  rootEl.addEventListener('focusout', () => { isPaused = false; });
  trackEl.addEventListener('scroll', onTrackScroll, { passive: true });
  trackEl.addEventListener('click', onSlideClick);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reducedMotion?.addEventListener?.('change', start);
}

export function setShows(shows) {
  slides = shows.filter((s) => s.image && s.image.original).slice(0, 8);
  if (!slides.length) return;
  trackEl.innerHTML = slides.map((s, i) => renderSlide(s, i)).join('');
  renderIndicators(slides.length);
  index = 0;
  start();
}

export function showError() {
  trackEl.innerHTML = `
    <div class="carousel__slide" style="display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);">
      Couldn't load trending shows.
    </div>`;
  indicatorsEl.innerHTML = '';
}
