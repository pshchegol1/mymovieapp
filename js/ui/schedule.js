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

// Daily shows use the year as the season ("S2026E211"), which reads badly.
function episodeLabel(ep) {
  if (!ep.number) return '';
  if (!ep.season || ep.season >= 1900) return `Ep ${ep.number}`;
  return `S${ep.season} · E${ep.number}`;
}

function episodeText(ep) {
  const generic = /^Episode \d+$/i.test(ep.name || '');
  return [episodeLabel(ep), generic ? '' : ep.name].filter(Boolean).join(' · ');
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
        <img class="schedule-card__img" src="${escapeHtml(img)}" alt="" loading="lazy">
        <div class="schedule-card__body">
          ${time ? `<div class="schedule-card__time"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(time)}</div>` : ''}
          <div class="schedule-card__title">${escapeHtml(show.name || '')}</div>
          ${network ? `<div class="schedule-card__net">${escapeHtml(network)}</div>` : ''}
          <div class="schedule-card__ep">${escapeHtml(episodeText(ep))}</div>
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
    const seen = new Set();
    cachedItems = (data || [])
      .filter((ep) => ep.show && ep.show.image)
      .sort((a, b) => (a.airtime || '').localeCompare(b.airtime || ''))
      // Back-to-back episodes of the same show would otherwise appear twice.
      .filter((ep) => !seen.has(ep.show.id) && seen.add(ep.show.id))
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
