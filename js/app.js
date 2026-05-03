import { $ } from './util/dom.js';
import { fetchShows } from './api.js';
import * as grid from './ui/grid.js';
import * as carousel from './ui/carousel.js';
import * as search from './ui/search.js';
import * as modal from './ui/modal.js';
import * as sidebar from './ui/sidebar.js';
import * as footer from './ui/footer.js';

modal.init();

grid.init({
  grid: $('[data-shows-grid]'),
  pagination: $('[data-pagination]'),
});

carousel.init({
  root: $('[data-carousel]'),
  track: $('[data-carousel-track]'),
  indicators: $('[data-carousel-indicators]'),
  prev: $('[data-carousel-prev]'),
  next: $('[data-carousel-next]'),
});

search.init({
  form: $('[data-search-form]'),
  input: $('[data-search-input]'),
});

sidebar.init({
  countdownList: $('[data-countdown-items]'),
  funFact: $('[data-fun-fact]'),
  quote: $('[data-quote]'),
});

footer.init({ quoteEl: $('[data-footer-quote]') });

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-trailer]');
  if (!btn) return;
  const title = btn.getAttribute('data-trailer');
  const query = encodeURIComponent(`${title} official trailer`);
  window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank', 'noopener');
});

(async () => {
  try {
    const shows = await fetchShows(1);
    grid.setShows(shows);
    carousel.setShows(shows);
  } catch (err) {
    console.error('Failed to load shows', err);
    grid.showError('Failed to load shows. Check your connection.');
    carousel.showError();
  }
})();
