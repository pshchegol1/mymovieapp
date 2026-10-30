import { $, $$ } from './util/dom.js';
import { fetchShows, fetchShow } from './api.js';
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
import * as toast from './ui/toast.js';
import { renderCard, onCardEvent } from './ui/show-card.js';
import * as router from './router.js';
import { getWatchlist, getRecent, subscribe, clearRecent } from './storage.js';

let initialShows = [];
let activeCategory = 'trending';
let searchResults = null;
let searchQuery = '';

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
  onSelect: () => refreshGrid(),
});

catTabs.init({
  container: $('[data-cat-tabs]'),
  onSelect: (key) => {
    activeCategory = key;
    if (searchResults) clearSearch();
    refreshGrid();
  },
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
  // Searching goes through the URL so it can be bookmarked and Back works.
  onSubmit: (query) => router.go(`/search?q=${encodeURIComponent(query)}`),
  onSearch: (query) => {
    searchQuery = query;
    genreFilter.setActive(null);
    sort.reset();
  },
  onResults: (results, query) => {
    searchResults = results.filter((s) => s.image && s.image.medium);
    searchQuery = query;
    genreFilter.setShows(searchResults);
    sort.setShows(searchResults);
    refreshGrid();
    $('[data-shows-grid]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  onReset: () => {
    clearSearch();
    refreshGrid();
  },
});

const searchClearBtn = $('[data-search-clear]');
if (searchClearBtn) searchClearBtn.addEventListener('click', () => { clearSearch(); refreshGrid(); });

function clearSearch() {
  search.cancel();
  if (location.hash.startsWith('#/search')) router.update('/');
  searchResults = null;
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  genreFilter.setActive(null);
  sort.reset();
  genreFilter.setShows(initialShows);
  sort.setShows(initialShows);
}

function renderSearchStatus() {
  const statusEl = $('[data-search-status]');
  if (!statusEl) return;
  statusEl.hidden = !searchResults;
  const termEl = $('[data-search-term]', statusEl);
  if (termEl) termEl.textContent = searchQuery;
}

sidebar.init({
  countdownList: $('[data-countdown-items]'),
  funFact: $('[data-fun-fact]'),
  quote: $('[data-quote]'),
});

footer.init({ quoteEl: $('[data-footer-quote]') });

const recentClearBtn = $('[data-recent-clear]');
if (recentClearBtn) recentClearBtn.addEventListener('click', () => clearRecent());

function refreshGrid() {
  let working = searchResults ?? catTabs.applyCategory(initialShows, activeCategory);
  const g = genreFilter.getActive();
  if (g) working = working.filter((s) => s.genres && s.genres.includes(g));
  working = sort.apply(working);
  const countEl = $('[data-result-count]');
  if (countEl) countEl.textContent = `${working.length} show${working.length === 1 ? '' : 's'}`;
  if (!working.length && searchResults) grid.showEmpty(searchQuery);
  else grid.setShows(working);
  modal.setSimilarPool(initialShows);
  renderSearchStatus();
}

function renderListGrid(mountSel, shows, emptyHTML) {
  const mount = $(mountSel);
  if (!mount) return;
  if (!shows.length) { mount.innerHTML = emptyHTML; return; }
  mount.innerHTML = shows.map(renderCard).join('');
  mount.onclick = (e) => onCardEvent(e, shows);
  mount.onkeydown = (e) => onCardEvent(e, shows);
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

let currentView = null;

function setView(view) {
  $$('[data-view]').forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  $$('[data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.nav === view);
  });
  if (view !== 'home') modal.close();
  // Only jump to the top on an actual page change (not e.g. closing a show).
  if (view !== currentView) window.scrollTo({ top: 0, behavior: 'auto' });
  currentView = view;
}

async function openShowById(id) {
  const numId = Number(id);
  let show = initialShows.find((s) => s.id === numId)
    || searchResults?.find((s) => s.id === numId)
    || getWatchlist().find((s) => s.id === numId)
    || getRecent().find((s) => s.id === numId);
  if (!show) {
    try {
      show = await fetchShow(numId);
    } catch (err) {
      console.error(err);
      toast.show('Could not find that show.', { icon: 'fa-solid fa-circle-exclamation', tone: 'warn' });
      return;
    }
    // The user may have navigated elsewhere while the show was loading.
    if (location.hash !== `#/show/${id}`) return;
  }
  modal.open(show);
}

router.on('', () => {
  // Back from a search (or loading "#/") shows the regular browse grid again.
  if (searchQuery) { clearSearch(); refreshGrid(); }
  setView('home');
});
router.on('search', ({ query }) => {
  const q = (query.q || '').trim();
  if (!q) { router.go('/'); return; }
  setView('home');
  if (q !== searchQuery || !searchResults) search.run(q);
});
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
    if (!searchResults) {
      sort.setShows(initialShows);
      genreFilter.setShows(initialShows);
      refreshGrid();
    }
    carousel.setShows(catTabs.applyCategory(initialShows, 'trending').slice(0, 8));
  } catch (err) {
    console.error('Failed to load shows', err);
    grid.showError('Failed to load shows. Check your connection.');
    carousel.showError();
  } finally {
    router.start();
  }
})();
