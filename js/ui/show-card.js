import { escapeHtml } from '../util/dom.js';
import { showImage } from '../api.js';
import { isInWatchlist, toggleWatchlist, getRating } from '../storage.js';
import * as modal from './modal.js';
import * as toast from './toast.js';

const BADGE_VARIANTS = ['', '--violet', '--amber', '--cyan', '--rose'];

// Two badges keep every card's meta on one line, so rows line up.
function badgesFor(genres) {
  return (genres || []).slice(0, 2).map((g, i) =>
    `<span class="badge badge${BADGE_VARIANTS[i % BADGE_VARIANTS.length]}">${escapeHtml(g)}</span>`
  ).join('');
}

function heartIcon(inList) {
  return `<i class="fa-${inList ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>`;
}

export function renderCard(show, idx) {
  const img = showImage(show, 'medium');
  const rating = show.rating?.average;
  const premiered = show.premiered ? new Date(show.premiered).getFullYear() : '—';
  const inList = isInWatchlist(show.id);
  const myRating = getRating(show.id);

  return `
    <article class="show-card glass" tabindex="0" role="button"
             aria-label="${escapeHtml(show.name)} — open details"
             data-show-card data-show-idx="${idx}" style="--i: ${idx}">
      <div class="show-card__media">
        <img class="show-card__img" src="${escapeHtml(img)}" alt="${escapeHtml(show.name)}"
             loading="lazy">
        ${rating == null ? '' : `<span class="show-card__rating"><i class="fa-solid fa-star" aria-hidden="true"></i> ${Number(rating).toFixed(1)}</span>`}
        <button type="button" class="show-card__heart${inList ? ' is-on' : ''}" data-watch-toggle
                aria-label="${inList ? 'Remove from your list' : 'Add to your list'}"
                aria-pressed="${inList}">
          ${heartIcon(inList)}
        </button>
        ${myRating ? `<span class="show-card__myrate" title="Your rating"><i class="fa-solid fa-star"></i> ${myRating}</span>` : ''}
      </div>
      <div class="show-card__body">
        <h3 class="show-card__title">${escapeHtml(show.name)}</h3>
        <span class="show-card__premiered">${escapeHtml(premiered)}</span>
        <div class="show-card__meta">${badgesFor(show.genres)}</div>
      </div>
    </article>`;
}

export function syncHeart(heart, inList) {
  heart.classList.toggle('is-on', inList);
  heart.setAttribute('aria-pressed', String(inList));
  heart.setAttribute('aria-label', inList ? 'Remove from your list' : 'Add to your list');
  heart.innerHTML = heartIcon(inList);
}

// Shared click/keydown handler for a container of cards rendered from `shows`.
export function onCardEvent(e, shows) {
  const heart = e.target.closest('[data-watch-toggle]');
  if (heart) {
    if (e.type === 'keydown') return; // the button's own click fires for Enter/Space
    e.preventDefault();
    e.stopPropagation();
    const show = shows[Number(heart.closest('[data-show-card]').dataset.showIdx)];
    if (!show) return;
    const added = toggleWatchlist(show);
    toast.show(added ? `Added "${show.name}" to your list` : 'Removed from your list',
      { icon: added ? 'fa-solid fa-heart' : 'fa-solid fa-heart-crack', tone: added ? 'success' : 'info' });
    return;
  }

  const card = e.target.closest('[data-show-card]');
  if (!card) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  if (e.type === 'keydown') e.preventDefault();
  const show = shows[Number(card.dataset.showIdx)];
  if (show) modal.open(show, card);
}
