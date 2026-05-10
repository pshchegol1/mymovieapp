import { escapeHtml, stripTags } from '../util/dom.js';
import { showImage, fetchSchedule } from '../api.js';
import * as modal from './modal.js';

let listEl, statusEl;

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function render(items) {
  if (!items.length) {
    listEl.innerHTML = '<p class="schedule__empty">Nothing scheduled.</p>';
    return;
  }
  listEl.innerHTML = items.map((ep, i) => {
    const show = ep.show || {};
    const img = showImage(show, 'medium');
    const network = show.network?.name || show.webChannel?.name || '';
    const time = fmtTime(ep.airtime);
    return `
      <article class="schedule-card" data-sched-idx="${i}" tabindex="0" role="button"
               aria-label="${escapeHtml(show.name || '')} at ${escapeHtml(time)}">
        <img class="schedule-card__img" src="${escapeHtml(img)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='./img/noimg.jpg';">
        <div class="schedule-card__body">
          <div class="schedule-card__time">
            ${time ? `<i class="fa-regular fa-clock"></i> ${escapeHtml(time)}` : ''}
            ${network ? `<span class="schedule-card__net">${escapeHtml(network)}</span>` : ''}
          </div>
          <div class="schedule-card__title">${escapeHtml(show.name || '')}</div>
          <div class="schedule-card__ep">
            ${ep.season ? `S${escapeHtml(ep.season)}` : ''}${ep.number ? `E${escapeHtml(ep.number)}` : ''}
            ${ep.name ? ` · ${escapeHtml(ep.name)}` : ''}
          </div>
        </div>
      </article>`;
  }).join('');
}

let cachedItems = [];

export async function init({ list, status }) {
  listEl = list; statusEl = status;
  if (statusEl) statusEl.textContent = 'Loading tonight’s schedule…';
  try {
    const data = await fetchSchedule('US');
    cachedItems = (data || [])
      .filter((ep) => ep.show && ep.show.image)
      .sort((a, b) => (a.airtime || '').localeCompare(b.airtime || ''))
      .slice(0, 16);
    if (statusEl) {
      const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      statusEl.textContent = `${cachedItems.length} airing · ${today}`;
    }
    render(cachedItems);
    listEl.addEventListener('click', onActivate);
    listEl.addEventListener('keydown', onActivate);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = '';
    listEl.innerHTML = '<p class="schedule__empty">Couldn’t load schedule.</p>';
  }
}

function onActivate(e) {
  const card = e.target.closest('[data-sched-idx]');
  if (!card) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  if (e.type === 'keydown') e.preventDefault();
  const idx = Number(card.dataset.schedIdx);
  const item = cachedItems[idx];
  if (item?.show) modal.open(item.show, card);
}
