import { escapeHtml, stripTags } from '../util/dom.js';
import { showImage, fetchShowImages } from '../api.js';
import { isInWatchlist, toggleWatchlist, subscribe } from '../storage.js';
import * as modal from './modal.js';
import * as toast from './toast.js';

const SURPRISE_MIN_RATING = 7.5;
// Where each slide's slow zoom heads, so consecutive slides don't all move alike.
const ZOOM_ORIGINS = ['70% 30%', '30% 60%', '60% 70%', '40% 25%'];

let trackEl, indicatorsEl, prevBtn, nextBtn, rootEl, surpriseBtn;
let slides = [];
let pool = [];            // shows "Surprise me" picks from
let index = 0;
let scrollSettle = null;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function heartIcon(inList) {
  return `<i class="fa-${inList ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>`;
}

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
  const genres = (show.genres || []).slice(0, 3);
  const summary = stripTags(show.summary);
  const loading = idx === 0 ? 'eager' : 'lazy';
  const inList = isInWatchlist(show.id);
  const list = rootEl.getAttribute('aria-label') || 'Trending';
  return `
    <div class="carousel__slide" role="group" aria-roledescription="slide" aria-label="${escapeHtml(show.name)}"
         data-slide-idx="${idx}" style="--zoom-origin: ${ZOOM_ORIGINS[idx % ZOOM_ORIGINS.length]}">
      <img class="carousel__backdrop" src="${escapeHtml(backdrop)}" alt="" loading="${loading}">
      <div class="carousel__shade"></div>
      <img class="carousel__poster" src="${escapeHtml(poster)}" alt="" loading="${loading}">
      <div class="carousel__caption">
        <span class="carousel__kicker"><i class="fa-solid fa-fire" aria-hidden="true"></i> #${idx + 1} in ${escapeHtml(list)}</span>
        <h3 class="carousel__title">${escapeHtml(show.name)}</h3>
        ${meta ? `<p class="carousel__meta">${meta}</p>` : ''}
        ${genres.length ? `<ul class="carousel__genres" aria-label="Genres">${genres.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
        ${summary ? `<p class="carousel__summary">${escapeHtml(summary)}</p>` : ''}
        <div class="carousel__actions">
          <button type="button" class="btn btn--primary btn--sm" data-slide-open>
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i> Details
          </button>
          <button type="button" class="carousel__watch${inList ? ' is-on' : ''}" data-slide-watch aria-pressed="${inList}">
            ${heartIcon(inList)}<span>${inList ? 'In your list' : 'My list'}</span>
          </button>
        </div>
      </div>
    </div>`;
}

// The widest landscape background TVMaze has for a show (its "main" one first), or null.
function pickBackdrop(images) {
  const wide = (images || [])
    .filter((im) => im.type === 'background')
    .map((im) => ({ main: im.main, ...im.resolutions?.original }))
    .filter((r) => r.url && r.width / r.height >= 1.3);
  wide.sort((a, b) => (b.main - a.main) || (b.width - a.width));
  return wide[0]?.url ?? null;
}

// Swap the blurred poster for a real backdrop once it has downloaded.
async function loadBackdrop(i) {
  const slide = trackEl.children[i];
  const show = slides[i];
  if (!slide || !show || slide.dataset.artRequested) return;
  slide.dataset.artRequested = 'true';
  try {
    const url = pickBackdrop(await fetchShowImages(show.id));
    if (!url) return;
    // Decode off-DOM, so a failed image just keeps the blurred poster.
    const img = new Image();
    img.src = url;
    await img.decode();
    if (slides[i] !== show) return;   // the shows were replaced meanwhile
    img.className = 'carousel__art';
    img.alt = '';
    slide.querySelector('.carousel__backdrop').after(img);
    requestAnimationFrame(() => img.classList.add('is-loaded'));
  } catch {
    // No backdrop; the blurred poster stays.
  }
}

function syncActive({ intro = false } = {}) {
  Array.from(indicatorsEl.children).forEach((el, k) =>
    el.setAttribute('aria-selected', k === index ? 'true' : 'false')
  );
  Array.from(trackEl.children).forEach((el, k) => {
    el.classList.toggle('is-active', k === index);
    // The caption animates in on a slide change, but not after a swipe the
    // user already watched.
    if (k !== index) el.classList.remove('is-intro');
  });
  const active = trackEl.children[index];
  if (intro && active) {
    active.classList.remove('is-intro');
    void active.offsetWidth;    // restart the animation
    active.classList.add('is-intro');
  }
  loadBackdrop(index);
  loadBackdrop((index + 1) % slides.length);
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
  syncActive({ intro: true });
}

// After a manual swipe/scroll settles, adopt whichever slide is in view.
function onTrackScroll() {
  clearTimeout(scrollSettle);
  scrollSettle = setTimeout(() => {
    if (!slides.length || !trackEl.clientWidth) return;
    const i = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
    if (i === index || i < 0 || i >= slides.length) return;
    index = i;
    syncActive();
  }, 120);
}

function syncWatchButtons() {
  trackEl.querySelectorAll('[data-slide-watch]').forEach((btn) => {
    const show = slides[Number(btn.closest('[data-slide-idx]').dataset.slideIdx)];
    const inList = isInWatchlist(show.id);
    btn.classList.toggle('is-on', inList);
    btn.setAttribute('aria-pressed', String(inList));
    btn.innerHTML = `${heartIcon(inList)}<span>${inList ? 'In your list' : 'My list'}</span>`;
  });
}

function onSlideClick(e) {
  const slide = e.target.closest('[data-slide-idx]');
  const show = slide && slides[Number(slide.dataset.slideIdx)];
  if (!show) return;
  if (e.target.closest('[data-slide-watch]')) {
    const added = toggleWatchlist(show);
    toast.show(added ? `Added “${show.name}” to your list` : `Removed “${show.name}” from your list`,
      { icon: added ? 'fa-solid fa-heart' : 'fa-solid fa-heart-crack', tone: added ? 'success' : 'info' });
    return;
  }
  modal.open(show, e.target.closest('[data-slide-open]') || slide);
}

// Open a random well-rated show that isn't already in the carousel.
function surprise() {
  const shown = new Set(slides.map((s) => s.id));
  const fresh = pool.filter((s) => !shown.has(s.id));
  const good = fresh.filter((s) => (s.rating?.average ?? 0) >= SURPRISE_MIN_RATING);
  const picks = good.length ? good : fresh.length ? fresh : slides;
  if (!picks.length) return;
  const icon = surpriseBtn.querySelector('i');
  icon.classList.remove('is-rolling');
  void icon.offsetWidth;        // restart the animation
  icon.classList.add('is-rolling');
  modal.open(picks[Math.floor(Math.random() * picks.length)], surpriseBtn);
}

function next() { goTo(index + 1); }
function prev() { goTo(index - 1); }

// Autoplay runs off the active indicator's progress bar: when its CSS
// animation ends, the next slide comes up, so pausing the bar pauses autoplay.
function start() {
  const on = slides.length > 1 && !reducedMotion?.matches && !document.hidden;
  rootEl.classList.toggle('is-playing', on);
}
function setPaused(paused) { rootEl.classList.toggle('is-paused', paused); }

export function init({ root, track, indicators, prev: pBtn, next: nBtn, surprise: sBtn }) {
  rootEl = root; trackEl = track; indicatorsEl = indicators;
  prevBtn = pBtn; nextBtn = nBtn; surpriseBtn = sBtn;
  rootEl.style.setProperty('--autoplay', `${Number(root.dataset.autoplay || 6000)}ms`);

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  surpriseBtn?.addEventListener('click', surprise);
  indicatorsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel__indicator');
    if (btn) goTo(Number(btn.dataset.idx));
  });
  indicatorsEl.addEventListener('animationend', (e) => {
    if (e.target.getAttribute('aria-selected') === 'true' && rootEl.classList.contains('is-playing')) next();
  });
  rootEl.addEventListener('mouseenter', () => setPaused(true));
  rootEl.addEventListener('mouseleave', () => setPaused(false));
  rootEl.addEventListener('focusin', () => setPaused(true));
  rootEl.addEventListener('focusout', () => setPaused(false));
  trackEl.addEventListener('scroll', onTrackScroll, { passive: true });
  trackEl.addEventListener('click', onSlideClick);
  document.addEventListener('visibilitychange', start);
  reducedMotion?.addEventListener?.('change', start);
  subscribe(syncWatchButtons);
}

// `featured` fill the slides; "Surprise me" picks from `surprisePool`.
export function setShows(featured, surprisePool = featured) {
  slides = featured.filter((s) => s.image && s.image.original).slice(0, 8);
  pool = surprisePool.filter((s) => s.image);
  if (!slides.length) return;
  trackEl.innerHTML = slides.map((s, i) => renderSlide(s, i)).join('');
  renderIndicators(slides.length);
  index = 0;
  syncActive({ intro: true });
  start();
}

export function showError() {
  trackEl.innerHTML = `
    <div class="carousel__slide" style="display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);">
      Couldn't load trending shows.
    </div>`;
  indicatorsEl.innerHTML = '';
}
