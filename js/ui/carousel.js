import { $, escapeHtml } from '../util/dom.js';
import { showImage } from '../api.js';

const FACTS = [
  'The first movie ever made was in 1888.',
  'The Oscar statuette is officially called the "Academy Award of Merit".',
  'The longest movie ever made is over 85 hours long.',
  'James Cameron drew the sketch of Rose in Titanic himself.',
  'Psycho was the first American film to show a toilet flushing.',
  'Velociraptor sounds in Jurassic Park are actually mating tortoises.',
];

let trackEl, indicatorsEl, prevBtn, nextBtn, rootEl;
let slides = [];
let index = 0;
let timer = null;
let interval = 3500;
let isPaused = false;

function renderSlide(show, fact, isFirst) {
  const img = showImage(show, 'original');
  const genres = (show.genres && show.genres.length) ? show.genres.join(', ') : 'Drama';
  const rating = show.rating?.average ?? 'N/A';
  return `
    <div class="carousel__slide" role="group" aria-roledescription="slide" aria-label="${escapeHtml(show.name)}">
      <img class="carousel__img" src="${escapeHtml(img)}" alt=""
           loading="${isFirst ? 'eager' : 'lazy'}"
           onerror="this.onerror=null;this.src='./img/noimg.jpg';">
      <div class="carousel__shade"></div>
      <div class="carousel__caption">
        <span class="carousel__caption-pill"><i class="fa-solid fa-tags"></i> ${escapeHtml(genres)}</span>
        <h3 class="carousel__title">${escapeHtml(show.name)}</h3>
        <p class="carousel__fact"><i class="fa-solid fa-lightbulb"></i> ${escapeHtml(fact)}</p>
      </div>
    </div>`;
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
    trackEl.scrollTo({ left: target.offsetLeft, behavior: opts.instant ? 'auto' : 'smooth' });
  }
  Array.from(indicatorsEl.children).forEach((el, k) =>
    el.setAttribute('aria-selected', k === index ? 'true' : 'false')
  );
}

function next() { goTo(index + 1); }
function prev() { goTo(index - 1); }

function start() {
  stop();
  if (slides.length <= 1) return;
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
}

export function setShows(shows) {
  slides = shows.filter((s) => s.image && s.image.original).slice(0, 8);
  if (!slides.length) return;
  trackEl.innerHTML = slides.map((s, i) => renderSlide(s, FACTS[i % FACTS.length], i === 0)).join('');
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
