import { escapeHtml } from '../util/dom.js';

// Rating bins, low to high. Each bin's color is a step of one blue ramp
// (.heat__cell--0 … --4 in modal-sections.css), checked for step contrast in both themes.
const BINS = [
  { min: 0, label: 'Under 7' },
  { min: 7, label: '7–7.9' },
  { min: 8, label: '8–8.4' },
  { min: 8.5, label: '8.5–8.9' },
  { min: 9, label: '9+' },
];
const MIN_RATED = 4;      // fewer rated episodes than this isn't worth a map
// Long-running shows start with their first seasons, behind a "Show all" button.
const COLLAPSE_OVER = 12;
const COLLAPSED_ROWS = 10;

const binOf = (rating) => BINS.findLastIndex((b) => rating >= b.min);
const ratingOf = (ep) => ep.rating?.average ?? null;
const fmt = (n) => Number(n).toFixed(1);
const epLabel = (ep) => `S${ep.season} · E${ep.number}`;

// Regular episodes grouped by season, in order: [{ number, eps }]. Null when a
// map wouldn't help: daily shows (their seasons are years) or too few ratings.
export function seasonsOf(episodes) {
  const regular = (episodes || []).filter((ep) => ep.season && ep.number && (ep.type ?? 'regular') === 'regular');
  if (regular.some((ep) => ep.season >= 1900)) return null;
  if (regular.filter((ep) => ratingOf(ep) != null).length < MIN_RATED) return null;
  const bySeason = new Map();
  for (const ep of regular) {
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season).push(ep);
  }
  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, eps]) => ({ number, eps: eps.sort((a, b) => a.number - b.number) }));
}

function average(eps) {
  const rated = eps.map(ratingOf).filter((r) => r != null);
  return rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
}

function cellHTML(ep, flags) {
  const r = ratingOf(ep);
  const name = ep.name ? ` ${ep.name}` : '';
  const label = `${epLabel(ep)}${name}, ${r != null ? `rated ${fmt(r)}` : 'no rating'}${flags.peak ? ', highest rated' : ''}${flags.low ? ', lowest rated' : ''}`;
  const cls = [
    'heat__cell',
    r != null ? `heat__cell--${binOf(r)}` : 'heat__cell--none',
    flags.peak ? 'is-peak' : '',
    flags.low ? 'is-low' : '',
  ].filter(Boolean).join(' ');
  return `
    <span role="cell">
      <button type="button" class="${cls}" data-heat-ep="${ep.id}" aria-label="${escapeHtml(label)}">
        ${r != null ? fmt(r) : '–'}
      </button>
    </span>`;
}

function chipHTML(kind, icon, title, ep) {
  return `
    <button type="button" class="heat__chip heat__chip--${kind}" data-heat-ep="${ep.id}">
      <i class="fa-solid ${icon}" aria-hidden="true"></i>
      <span><strong>${title}:</strong> ${escapeHtml(epLabel(ep))}${ep.name ? ` · ${escapeHtml(ep.name)}` : ''} · ${fmt(ratingOf(ep))}</span>
    </button>`;
}

function render(mount, seasons) {
  const all = seasons.flatMap((s) => s.eps);
  const rated = all.filter((ep) => ratingOf(ep) != null);
  // Earliest episode wins a tie.
  const peak = rated.reduce((a, b) => (ratingOf(b) > ratingOf(a) ? b : a));
  const low = rated.reduce((a, b) => (ratingOf(b) < ratingOf(a) ? b : a));
  const avgs = seasons.map((s) => average(s.eps));
  let best = -1;
  avgs.forEach((a, i) => { if (a != null && (best < 0 || a > avgs[best])) best = i; });
  const cols = Math.max(...seasons.map((s) => s.eps.length));

  const header = Array.from({ length: cols }, (_, i) => `<span role="columnheader" class="heat__col">E${i + 1}</span>`).join('');
  const rows = seasons.map((s, i) => {
    const cells = s.eps.map((ep) => cellHTML(ep, { peak: ep === peak, low: ep === low && low !== peak }));
    const pad = '<span role="cell" class="heat__gap"></span>'.repeat(cols - s.eps.length);
    const avg = avgs[i];
    const hidden = seasons.length > COLLAPSE_OVER && i >= COLLAPSED_ROWS;
    return `
      <div class="heat__row" role="row"${hidden ? ' hidden data-heat-extra' : ''}>
        <span role="rowheader" class="heat__season">S${s.number}</span>
        ${cells.join('')}${pad}
        <span role="cell" class="heat__avg${i === best && seasons.length > 1 ? ' is-best' : ''}">${avg != null ? fmt(avg) : '–'}</span>
      </div>`;
  }).join('');

  mount.innerHTML = `
    <div class="heat__chips">
      ${chipHTML('peak', 'fa-arrow-trend-up', 'Peak', peak)}
      ${low !== peak ? chipHTML('low', 'fa-arrow-trend-down', 'Low', low) : ''}
      ${seasons.length > 1 && best >= 0 ? `
        <span class="heat__chip heat__chip--season">
          <i class="fa-solid fa-trophy" aria-hidden="true"></i>
          <span><strong>Best season:</strong> ${seasons[best].number} · avg ${fmt(avgs[best])}</span>
        </span>` : ''}
    </div>
    <div class="heat__scroll">
      <div class="heat__grid" role="table" aria-label="Episode ratings by season" style="--cols: ${cols}">
        <div class="heat__row" role="row">
          <span role="columnheader" class="heat__corner"><span class="sr-only">Season</span></span>
          ${header}
          <span role="columnheader" class="heat__col heat__col--avg">Avg</span>
        </div>
        ${rows}
      </div>
    </div>
    ${seasons.length > COLLAPSE_OVER ? `
      <button type="button" class="btn btn--ghost btn--sm heat__more" data-heat-more aria-expanded="false">
        Show all ${seasons.length} seasons
      </button>` : ''}
    <ul class="heat__legend" aria-label="Legend">
      ${BINS.map((b, i) => `<li><span class="heat__swatch heat__cell--${i}"></span>${b.label}</li>`).join('')}
      <li><span class="heat__swatch heat__cell--none"></span>No rating</li>
      <li><span class="heat__swatch heat__swatch--peak"></span>Peak</li>
      <li><span class="heat__swatch heat__swatch--low"></span>Low</li>
    </ul>
    <div class="heat__tip" role="tooltip" hidden></div>`;

  return new Map(all.map((ep) => [String(ep.id), ep]));
}

function tipHTML(ep) {
  const r = ratingOf(ep);
  const aired = ep.airdate
    ? new Date(`${ep.airdate}T00:00`).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  return `
    <div class="heat__tip-title">${escapeHtml(epLabel(ep))}${ep.name ? ` · ${escapeHtml(ep.name)}` : ''}</div>
    <div class="heat__tip-meta">${r != null ? `<i class="fa-solid fa-star" aria-hidden="true"></i> ${fmt(r)}` : 'No rating yet'}${aired ? ` · ${escapeHtml(aired)}` : ''}</div>`;
}

// Draws the map into `mount`. `onPick(ep)` runs when an episode is chosen.
export function mount(root, seasons, { onPick } = {}) {
  const byId = render(root, seasons);
  const tip = root.querySelector('.heat__tip');

  const showTip = (cell) => {
    const ep = byId.get(cell.dataset.heatEp);
    if (!ep) return;
    tip.innerHTML = tipHTML(ep);
    tip.hidden = false;
    // Centered above the cell, kept inside the map's box.
    const box = root.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const left = Math.min(Math.max(c.left + c.width / 2 - box.left - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
    tip.style.left = `${left}px`;
    tip.style.top = `${c.top - box.top - tip.offsetHeight - 6}px`;
  };
  const hideTip = () => { tip.hidden = true; };

  root.addEventListener('pointerover', (e) => {
    const cell = e.target.closest('.heat__cell');
    if (cell) showTip(cell); else hideTip();
  });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', (e) => {
    const cell = e.target.closest('.heat__cell');
    if (cell) showTip(cell);
  });
  root.addEventListener('focusout', hideTip);
  // Fade the right edge while more episodes are off to the side.
  const scroller = root.querySelector('.heat__scroll');
  const syncFade = () => {
    scroller.classList.toggle('has-more', scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
  };
  scroller.addEventListener('scroll', () => { hideTip(); syncFade(); }, { passive: true });
  new ResizeObserver(syncFade).observe(scroller);

  root.addEventListener('click', (e) => {
    const more = e.target.closest('[data-heat-more]');
    if (more) {
      const expand = more.getAttribute('aria-expanded') !== 'true';
      root.querySelectorAll('[data-heat-extra]').forEach((row) => { row.hidden = !expand; });
      more.setAttribute('aria-expanded', String(expand));
      more.textContent = expand ? 'Show fewer seasons' : `Show all ${seasons.length} seasons`;
      return;
    }
    const btn = e.target.closest('[data-heat-ep]');
    const ep = btn && byId.get(btn.dataset.heatEp);
    if (ep) onPick?.(ep);
  });
}
