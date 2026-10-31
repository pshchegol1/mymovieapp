// Daily shows use the year as the season ("S2026E211"), which reads badly.
export function episodeLabel(ep) {
  if (!ep.number) return '';
  if (!ep.season || ep.season >= 1900) return `Ep ${ep.number}`;
  return `S${ep.season} · E${ep.number}`;
}

// "S2 · E5 · Title", leaving out placeholder titles like "Episode 5".
export function episodeText(ep) {
  const generic = /^Episode \d+$/i.test(ep.name || '');
  return [episodeLabel(ep), generic ? '' : ep.name].filter(Boolean).join(' · ');
}

const relFmt = new Intl.RelativeTimeFormat([], { numeric: 'auto' });

// "in 3 days", "tomorrow", "in 5 hours"... for a future timestamp (ms).
export function relativeTime(ms) {
  const diff = ms - Date.now();
  const hours = diff / 3600000;
  if (Math.abs(hours) < 1) return relFmt.format(Math.round(diff / 60000), 'minute');
  if (Math.abs(hours) < 24) return relFmt.format(Math.round(hours), 'hour');
  return relFmt.format(Math.round(hours / 24), 'day');
}
