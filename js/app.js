import { $, $$, escapeHtml } from './util/dom.js';
import { fetchShows, showImage } from './api.js';
import * as grid from './ui/grid.js';
import * as carousel from './ui/carousel.js';
import * as search from './ui/search.js';
import * as modal from './ui/modal.js';
import * as sidebar from './ui/sidebar.js';
import * as footer from './ui/footer.js';
import * as genreFilter from './ui/genre-filter.js';
import * as catTabs from './ui/category-tabs.js';
import * as sort from './ui/sort.js';
import * as schedule from './ui/schedule.js';
import * as theme from './ui/theme.js';
import * as router from './router.js';
import { getWatchlist, getRecent, subscribe, isInWatchlist, toggleWatchlist, clearRecent } from './storage.js';

let initialShows = [];
let activeCategory = 'trending';

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

const searchInput = $('[data-search-input]');

genreFilter.init({
  container: $('[data-genre-filter]'),
  onSelect: () => {
    if (searchInput) searchInput.value = '';
    refreshGrid();
  },
});

catTabs.init({
  container: $('[data-cat-tabs]'),
  onSelect: (key) => { activeCategory = key; refreshGrid(); },
});

sort.init({
  sortSelect: $('[data-sort-select]'),
  yearSelect: $('[data-year-select]'),
  onChange: () => refreshGrid(),
});

theme.init({ button: $('[data-theme-toggle]') });

search.init({
  form: $('[data-search-form]'),
  input: searchInput,
  onSearch: () => {
    genreFilter.setActive(null);
    sort.reset();
  },
  onReset: () => {
    genreFilter.setActive(null);
    sort.reset();
    refreshGrid();
  },
});

sidebar.init({
  countdownList: $('[data-countdown-items]'),
  funFact: $('[data-fun-fact]'),
  quote: $('[data-quote]'),
});

footer.init({ quoteEl: $('[data-footer-quote]') });

const recentClearBtn = $('[data-recent-clear]');
if (recentClearBtn) recentClearBtn.addEventListener('click', () => clearRecent());

function refreshGrid() {
  if (searchInput && searchInput.value) searchInput.value = '';
  let working = catTabs.applyCategory(initialShows, activeCategory);
  const g = genreFilter.getActive();
  if (g) working = working.filter((s) => s.genres && s.genres.includes(g));
  working = sort.apply(working);
  const countEl = $('[data-result-count]');
  if (countEl) countEl.textContent = `${working.length} show${working.length === 1 ? '' : 's'}`;
  grid.setShows(working);
  modal.setSimilarPool(initialShows);
}

function renderListGrid(mountSel, shows, emptyHTML) {
  const mount = $(mountSel);
  if (!mount) return;
  if (!shows.length) { mount.innerHTML = emptyHTML; return; }
  mount.innerHTML = shows.map((show, idx) => {
    const img = showImage(show, 'medium');
    const rating = show.rating?.average;
    const ratingStr = (rating === null || rating === undefined) ? '—' : Number(rating).toFixed(1);
    const genres = (show.genres && show.genres.length) ? show.genres : ['Unknown'];
    const variants = ['', '--violet', '--amber', '--cyan', '--rose'];
    const badges = genres.slice(0, 3).map((gn, i) =>
      `<span class="badge badge${variants[i % variants.length]}">${escapeHtml(gn)}</span>`).join('');
    const premiered = show.premiered ? new Date(show.premiered).getFullYear() : '—';
    const inList = isInWatchlist(show.id);
    return `
      <article class="show-card glass" tabindex="0" role="button"
               aria-label="${escapeHtml(show.name)} — open details"
               data-list-card data-list-idx="${idx}" style="--i: ${idx}">
        <div class="show-card__media">
          <img class="show-card__img" src="${escapeHtml(img)}" alt="${escapeHtml(show.name)}"
               loading="lazy" onerror="this.onerror=null;this.src='./img/noimg.jpg';">
          <span class="show-card__rating"><i class="fa-solid fa-star"></i> ${escapeHtml(ratingStr)}</span>
          <button type="button" class="show-card__heart${inList ? ' is-on' : ''}" data-list-heart
                  aria-label="${inList ? 'Remove from your list' : 'Add to your list'}"
                  aria-pressed="${inList}">
            <i class="fa-${inList ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>
          </button>
        </div>
        <div class="show-card__body">
          <h3 class="show-card__title">${escapeHtml(show.name)}</h3>
          <span class="show-card__premiered">${escapeHtml(premiered)}</span>
          <div class="show-card__meta">${badges}</div>
        </div>
      </article>`;
  }).join('');

  mount.onclick = (e) => onListActivate(e, shows);
  mount.onkeydown = (e) => onListActivate(e, shows);
}

function onListActivate(e, shows) {
  const heart = e.target.closest('[data-list-heart]');
  if (heart) {
    e.preventDefault();
    e.stopPropagation();
    const card = heart.closest('[data-list-card]');
    const idx = Number(card.dataset.listIdx);
    const show = shows[idx];
    if (show) toggleWatchlist(show);
    return;
  }
  const card = e.target.closest('[data-list-card]');
  if (!card) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  if (e.type === 'keydown') e.preventDefault();
  const idx = Number(card.dataset.listIdx);
  const show = shows[idx];
  if (show) modal.open(show, card);
}

function renderWatchlist() {
  const items = getWatchlist();
  renderListGrid('[data-watchlist-grid]', items, `
    <div class="empty-state">
      <i class="fa-regular fa-heart empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">Your list is empty</h3>
      <p>Tap the heart on any show to add it here.</p>
    </div>`);
  const meta = $('[data-watchlist-meta]');
  if (meta) meta.textContent = items.length ? `${items.length} saved` : '';
}

function renderRecent() {
  const items = getRecent();
  renderListGrid('[data-recent-grid]', items, `
    <div class="empty-state">
      <i class="fa-solid fa-clock-rotate-left empty-state__icon" aria-hidden="true"></i>
      <h3 class="empty-state__title">Nothing here yet</h3>
      <p>Shows you open will appear here.</p>
    </div>`);
}

function updateBadges() {
  const count = getWatchlist().length;
  const badge = $('[data-watchlist-count]');
  if (badge) {
    if (count) { badge.hidden = false; badge.textContent = count; }
    else { badge.hidden = true; badge.textContent = ''; }
  }
}

function setView(view) {
  $$('[data-view]').forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  $$('[data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.nav === view);
  });
  if (view !== 'home') modal.close();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openShowById(id) {
  const numId = Number(id);
  const show = initialShows.find((s) => s.id === numId)
    || getWatchlist().find((s) => s.id === numId)
    || getRecent().find((s) => s.id === numId);
  if (show) modal.open(show);
}

router.on('', () => setView('home'));
router.on('watchlist', () => { setView('watchlist'); renderWatchlist(); });
router.on('recent', () => { setView('recent'); renderRecent(); });
router.on('schedule', () => { setView('schedule'); });
router.on('show/:id', ({ params }) => {
  setView('home');
  openShowById(params.id);
});
router.notFound(() => setView('home'));

subscribe(() => {
  updateBadges();
  if (!$('[data-view="watchlist"]').hidden) renderWatchlist();
  if (!$('[data-view="recent"]').hidden) renderRecent();
});

updateBadges();
schedule.init({ list: $('[data-schedule-list]'), status: $('[data-schedule-status]') });

(async () => {
  try {
    const shows = await fetchShows(1);
    initialShows = shows.filter((s) => s.image && s.image.medium);
    sort.setShows(initialShows);
    genreFilter.setShows(initialShows);
    refreshGrid();
    carousel.setShows(catTabs.applyCategory(initialShows, 'trending').slice(0, 8));
  } catch (err) {
    console.error('Failed to load shows', err);
    grid.showError('Failed to load shows. Check your connection.');
    carousel.showError();
  } finally {
    router.start();
  }
})();
