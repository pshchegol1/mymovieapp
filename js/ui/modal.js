import { $, escapeHtml, stripTags } from '../util/dom.js';
import { showImage, personImage, fetchCast, fetchSeasons, fetchSeasonEpisodes } from '../api.js';
import { isInWatchlist, toggleWatchlist, getRating, setRating, pushRecent, subscribe } from '../storage.js';
import * as toast from './toast.js';

let modalRoot, dialog, titleEl, bodyEl, closeBtn, scrim;
let lastFocus = null;
let trapHandler = null;
let currentShow = null;
let similarPool = [];
let unsub = null;

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

function ratingStars(value) {
  let out = '<div class="rate" role="radiogroup" aria-label="Your rating">';
  for (let i = 1; i <= 10; i++) {
    const filled = i <= value;
    out += `<button type="button" class="rate__star${filled ? ' is-on' : ''}" role="radio" aria-checked="${filled}" data-rate="${i}" aria-label="${i} out of 10">
      <i class="fa-${filled ? 'solid' : 'regular'} fa-star" aria-hidden="true"></i>
    </button>`;
  }
  out += `<button type="button" class="rate__clear" data-rate="0" aria-label="Clear rating"><i class="fa-solid fa-rotate-left"></i></button>`;
  out += '</div>';
  return out;
}

function bodyHTML(show) {
  const img = showImage(show, 'original');
  const genres = (show.genres && show.genres.length) ? show.genres.join(', ') : 'Unknown';
  const rating = show.rating?.average ?? 'Unrated';
  const premiered = show.premiered || 'Unknown';
  const summary = stripTags(show.summary) || 'No summary available.';
  const site = show.officialSite || show.url || '';
  const network = show.network?.name || show.webChannel?.name || '';
  const runtime = show.runtime || show.averageRuntime;
  const inList = isInWatchlist(show.id);
  const myRating = getRating(show.id);
  const trailerQ = encodeURIComponent(`${show.name || ''} official trailer`);

  return `
    <img src="${escapeHtml(img)}" alt="${escapeHtml(show.name || '')}" class="modal__hero" onerror="this.onerror=null;this.src='./img/noimg.jpg';">
    <div class="modal__meta-row">
      <div class="modal__row"><i class="fa-solid fa-tags" aria-hidden="true"></i><span><strong>Genres:</strong> ${escapeHtml(genres)}</span></div>
      <div class="modal__row"><i class="fa-solid fa-star" aria-hidden="true"></i><span><strong>Rating:</strong> ${escapeHtml(rating)}</span></div>
      <div class="modal__row"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i><span><strong>Premiered:</strong> ${escapeHtml(premiered)}</span></div>
      ${network ? `<div class="modal__row"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i><span><strong>Network:</strong> ${escapeHtml(network)}</span></div>` : ''}
      ${runtime ? `<div class="modal__row"><i class="fa-solid fa-clock" aria-hidden="true"></i><span><strong>Runtime:</strong> ${escapeHtml(runtime)} min</span></div>` : ''}
      ${show.status ? `<div class="modal__row"><i class="fa-solid fa-signal" aria-hidden="true"></i><span><strong>Status:</strong> ${escapeHtml(show.status)}</span></div>` : ''}
    </div>

    <p class="modal__summary">${escapeHtml(summary)}</p>

    <div class="modal__actions">
      <button type="button" class="btn btn--primary btn--sm" data-action="watchlist" aria-pressed="${inList}">
        <i class="fa-${inList ? 'solid' : 'regular'} fa-heart"></i>
        <span>${inList ? 'In your list' : 'Add to list'}</span>
      </button>
      <button type="button" class="btn btn--accent btn--sm" data-action="trailer">
        <i class="fa-solid fa-play"></i> Watch trailer
      </button>
      <button type="button" class="btn btn--ghost btn--sm" data-action="share">
        <i class="fa-solid fa-share-nodes"></i> Share
      </button>
      ${site ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(site)}" target="_blank" rel="noopener">Official site</a>` : ''}
    </div>

    <div class="modal__trailer" data-trailer-mount hidden></div>

    <section class="modal__section">
      <h3 class="modal__section-title">Your rating</h3>
      ${ratingStars(myRating)}
    </section>

    <section class="modal__section" data-cast-section>
      <h3 class="modal__section-title">Cast</h3>
      <div class="cast" data-cast><div class="cast__loading">Loading cast…</div></div>
    </section>

    <section class="modal__section" data-episodes-section>
      <h3 class="modal__section-title">Seasons &amp; episodes</h3>
      <div class="episodes" data-episodes><div class="episodes__loading">Loading episodes…</div></div>
    </section>

    <section class="modal__section" data-similar-section>
      <h3 class="modal__section-title">More like this</h3>
      <div class="similar" data-similar></div>
    </section>
  `;
}

async function loadCast(showId) {
  const mount = bodyEl.querySelector('[data-cast]');
  if (!mount) return;
  try {
    const cast = await fetchCast(showId);
    if (!cast || cast.length === 0) {
      mount.innerHTML = '<p class="cast__empty">No cast info available.</p>';
      return;
    }
    mount.innerHTML = cast.slice(0, 12).map((c) => `
      <article class="cast-card">
        <img class="cast-card__img" loading="lazy" src="${escapeHtml(personImage(c.person))}" alt="${escapeHtml(c.person?.name || '')}" onerror="this.onerror=null;this.src='./img/noimg.jpg';">
        <div class="cast-card__body">
          <div class="cast-card__name">${escapeHtml(c.person?.name || '')}</div>
          <div class="cast-card__char">${escapeHtml(c.character?.name || '')}</div>
        </div>
      </article>
    `).join('');
  } catch (err) {
    console.error(err);
    mount.innerHTML = '<p class="cast__empty">Couldn’t load cast.</p>';
  }
}

async function loadSeasons(showId) {
  const mount = bodyEl.querySelector('[data-episodes]');
  if (!mount) return;
  try {
    const seasons = (await fetchSeasons(showId)).filter((s) => s.number);
    if (seasons.length === 0) {
      mount.innerHTML = '<p class="episodes__empty">No seasons listed.</p>';
      return;
    }
    const tabs = seasons.map((s, i) => `
      <button type="button" class="episodes__tab${i === 0 ? ' is-active' : ''}" data-season-id="${s.id}" data-season-num="${s.number}">
        Season ${s.number}
      </button>
    `).join('');
    mount.innerHTML = `
      <div class="episodes__tabs" role="tablist">${tabs}</div>
      <div class="episodes__list" data-episodes-list><div class="episodes__loading">Loading…</div></div>
    `;
    const listEl = mount.querySelector('[data-episodes-list]');
    const showSeason = async (seasonId) => {
      listEl.innerHTML = '<div class="episodes__loading">Loading…</div>';
      try {
        const eps = await fetchSeasonEpisodes(seasonId);
        if (!eps || eps.length === 0) {
          listEl.innerHTML = '<p class="episodes__empty">No episodes.</p>';
          return;
        }
        listEl.innerHTML = eps.map((e) => `
          <article class="episode">
            <div class="episode__num">${escapeHtml(e.number ?? '')}</div>
            <div class="episode__body">
              <div class="episode__title">${escapeHtml(e.name || '')}</div>
              <div class="episode__meta">
                ${e.airdate ? `<span><i class="fa-regular fa-calendar"></i> ${escapeHtml(e.airdate)}</span>` : ''}
                ${e.runtime ? `<span><i class="fa-regular fa-clock"></i> ${escapeHtml(e.runtime)} min</span>` : ''}
              </div>
              ${e.summary ? `<p class="episode__summary">${escapeHtml(stripTags(e.summary))}</p>` : ''}
            </div>
          </article>
        `).join('');
      } catch (err) {
        console.error(err);
        listEl.innerHTML = '<p class="episodes__empty">Couldn’t load episodes.</p>';
      }
    };
    mount.querySelector('.episodes__tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.episodes__tab');
      if (!btn) return;
      mount.querySelectorAll('.episodes__tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      showSeason(btn.dataset.seasonId);
    });
    showSeason(seasons[0].id);
  } catch (err) {
    console.error(err);
    mount.innerHTML = '<p class="episodes__empty">Couldn’t load seasons.</p>';
  }
}

function renderSimilar(show) {
  const mount = bodyEl.querySelector('[data-similar]');
  if (!mount) return;
  const showGenres = new Set(show.genres || []);
  if (showGenres.size === 0 || similarPool.length === 0) {
    mount.innerHTML = '<p class="similar__empty">No suggestions available.</p>';
    return;
  }
  const scored = similarPool
    .filter((s) => s.id !== show.id && s.image?.medium)
    .map((s) => {
      const overlap = (s.genres || []).filter((g) => showGenres.has(g)).length;
      return { s, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => (b.overlap - a.overlap) || ((b.s.rating?.average ?? 0) - (a.s.rating?.average ?? 0)))
    .slice(0, 6)
    .map((x) => x.s);

  if (scored.length === 0) {
    mount.innerHTML = '<p class="similar__empty">No similar shows in current set.</p>';
    return;
  }

  mount.innerHTML = scored.map((s) => `
    <button type="button" class="similar-card" data-similar-id="${s.id}">
      <img loading="lazy" src="${escapeHtml(showImage(s, 'medium'))}" alt="${escapeHtml(s.name)}" onerror="this.onerror=null;this.src='./img/noimg.jpg';">
      <div class="similar-card__name">${escapeHtml(s.name)}</div>
    </button>
  `).join('');
  mount.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-similar-id]');
    if (!btn) return;
    const id = Number(btn.dataset.similarId);
    const next = similarPool.find((x) => x.id === id);
    if (next) open(next);
  }, { once: true });
}

async function onBodyClick(e) {
  const show = currentShow;
  if (!show) return;
  const actBtn = e.target.closest('[data-action]');
  if (actBtn) {
    const action = actBtn.dataset.action;
    if (action === 'watchlist') {
      const added = toggleWatchlist(show);
      toast.show(added ? `Added "${show.name}" to your list` : `Removed from your list`,
        { icon: added ? 'fa-solid fa-heart' : 'fa-solid fa-heart-crack', tone: added ? 'success' : 'info' });
    } else if (action === 'trailer') {
      const mount = bodyEl.querySelector('[data-trailer-mount]');
      if (!mount) return;
      if (!mount.hidden) { mount.hidden = true; mount.innerHTML = ''; return; }
      const q = encodeURIComponent(`${show.name || ''} official trailer`);
      mount.innerHTML = `
        <div class="trailer-cta">
          <i class="fa-brands fa-youtube" aria-hidden="true"></i>
          <div>
            <div class="trailer-cta__title">Watch the trailer</div>
            <div class="trailer-cta__sub">Opens a YouTube search for "${escapeHtml(show.name || '')} official trailer".</div>
          </div>
          <a class="btn btn--primary btn--sm" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">
            <i class="fa-solid fa-up-right-from-square"></i> Open
          </a>
        </div>`;
      mount.hidden = false;
    } else if (action === 'share') {
      const url = `${location.origin}${location.pathname}#/show/${show.id}`;
      const shareData = { title: show.name, text: `Check out ${show.name} on MovieMatrix`, url };
      if (navigator.share) {
        try { await navigator.share(shareData); } catch {}
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.show('Link copied to clipboard', { icon: 'fa-solid fa-link' });
      }
    }
    return;
  }
  const rateBtn = e.target.closest('[data-rate]');
  if (rateBtn) {
    const v = Number(rateBtn.dataset.rate);
    setRating(show.id, v);
    const current = getRating(show.id);
    const rateRoot = bodyEl.querySelector('.rate');
    if (rateRoot) rateRoot.outerHTML = ratingStars(current);
    toast.show(current ? `Rated ${current}/10` : 'Rating cleared', { icon: 'fa-solid fa-star' });
  }
}

export function setSimilarPool(shows) {
  similarPool = shows || [];
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
  bodyEl.addEventListener('click', onBodyClick);
}

export function open(show, triggerEl) {
  if (!modalRoot) return;
  lastFocus = triggerEl || document.activeElement;
  currentShow = show;
  pushRecent(show);

  titleEl.textContent = show.name || 'Untitled';
  bodyEl.innerHTML = bodyHTML(show);

  if (show.id) {
    loadCast(show.id);
    loadSeasons(show.id);
  }
  renderSimilar(show);

  modalRoot.hidden = false;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  trapHandler = onKey;

  unsub?.();
  unsub = subscribe(() => {
    if (modalRoot.hidden || !currentShow) return;
    const btn = bodyEl.querySelector('[data-action="watchlist"]');
    if (btn) {
      const inList = isInWatchlist(currentShow.id);
      btn.setAttribute('aria-pressed', String(inList));
      btn.innerHTML = `<i class="fa-${inList ? 'solid' : 'regular'} fa-heart"></i><span>${inList ? 'In your list' : 'Add to list'}</span>`;
    }
  });

  const firstFocus = focusables()[0] || closeBtn;
  firstFocus.focus();
}

export function close() {
  if (!modalRoot || modalRoot.hidden) return;
  modalRoot.hidden = true;
  document.body.style.overflow = '';
  if (trapHandler) document.removeEventListener('keydown', trapHandler);
  trapHandler = null;
  unsub?.();
  unsub = null;
  currentShow = null;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}
