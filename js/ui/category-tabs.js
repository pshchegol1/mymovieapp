import { escapeHtml } from '../util/dom.js';

const CATEGORIES = [
  { key: 'trending', label: 'Trending', icon: 'fa-fire' },
  { key: 'popular',  label: 'Popular',  icon: 'fa-bolt' },
  { key: 'top',      label: 'Top rated', icon: 'fa-trophy' },
  { key: 'new',      label: 'New',      icon: 'fa-sparkles' },
];

let containerEl, onChange;
let active = 'trending';

function render() {
  containerEl.innerHTML = CATEGORIES.map((c) => `
    <button type="button" class="cat-tab${active === c.key ? ' is-active' : ''}"
            data-cat="${c.key}" aria-pressed="${active === c.key}">
      <i class="fa-solid ${c.icon}" aria-hidden="true"></i>
      <span>${escapeHtml(c.label)}</span>
    </button>
  `).join('');
}

export function init({ container, onSelect }) {
  containerEl = container;
  onChange = onSelect;
  render();
  containerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    const key = btn.dataset.cat;
    if (key === active) return;
    active = key;
    render();
    onChange?.(key);
  });
}

export function getActive() { return active; }

export function applyCategory(shows, key) {
  const list = shows.filter((s) => s.image && s.image.medium);
  const byRating = (a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0);
  const byNewest = (a, b) => (Date.parse(b.premiered || 0) || 0) - (Date.parse(a.premiered || 0) || 0);
  const byWeight = (a, b) => (b.weight ?? 0) - (a.weight ?? 0);
  switch (key) {
    case 'top':      return [...list].sort(byRating);
    case 'new':      return [...list].sort(byNewest);
    case 'popular':  return [...list].sort(byWeight);
    case 'trending':
    default:
      return [...list].sort((a, b) => {
        const ra = (a.rating?.average ?? 0) * 0.6 + (a.weight ?? 0) * 0.04;
        const rb = (b.rating?.average ?? 0) * 0.6 + (b.weight ?? 0) * 0.04;
        return rb - ra;
      });
  }
}
