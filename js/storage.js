const KEYS = {
  watchlist: 'mm.watchlist',
  recent: 'mm.recent',
  ratings: 'mm.ratings',
  rated: 'mm.rated',
  theme: 'mm.theme',
  trivia: 'mm.trivia',
  watched: 'mm.watched',
  chat: 'mm.chat',
};

const RECENT_MAX = 12;

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const listeners = new Set();
function emit() { for (const fn of listeners) fn(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function showSnapshot(show) {
  return {
    id: show.id,
    name: show.name,
    image: show.image || null,
    genres: show.genres || [],
    rating: show.rating || null,
    premiered: show.premiered || null,
    summary: show.summary || '',
    officialSite: show.officialSite || null,
    url: show.url || null,
    network: show.network?.name || show.webChannel?.name || null,
    runtime: show.runtime || show.averageRuntime || null,
    status: show.status || null,
  };
}

export function getWatchlist() { return readJSON(KEYS.watchlist, []); }
export function isInWatchlist(id) {
  return getWatchlist().some((s) => s.id === id);
}
export function toggleWatchlist(show) {
  const list = getWatchlist();
  const idx = list.findIndex((s) => s.id === show.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeJSON(KEYS.watchlist, list);
    emit();
    return false;
  }
  list.unshift(showSnapshot(show));
  writeJSON(KEYS.watchlist, list);
  emit();
  return true;
}

export function getRecent() { return readJSON(KEYS.recent, []); }
export function pushRecent(show) {
  if (!show || !show.id) return;
  const list = readJSON(KEYS.recent, []).filter((s) => s.id !== show.id);
  list.unshift(showSnapshot(show));
  writeJSON(KEYS.recent, list.slice(0, RECENT_MAX));
  emit();
}
export function clearRecent() { writeJSON(KEYS.recent, []); emit(); }

export function getRatings() { return readJSON(KEYS.ratings, {}); }
export function getRating(id) {
  const all = readJSON(KEYS.ratings, {});
  return all[id] || 0;
}
// Scores live in KEYS.ratings as { id: score }; KEYS.rated keeps a copy of each
// rated show (and when it was rated) so the ratings page can list them.
export function setRating(show, value) {
  const all = readJSON(KEYS.ratings, {});
  const rated = readJSON(KEYS.rated, {});
  if (!value) {
    delete all[show.id];
    delete rated[show.id];
  } else {
    all[show.id] = Math.max(1, Math.min(10, Number(value)));
    rated[show.id] = { show: showSnapshot(show), ratedAt: Date.now() };
  }
  writeJSON(KEYS.ratings, all);
  writeJSON(KEYS.rated, rated);
  emit();
}

// Every rating as { id, value, show, ratedAt }. `show` is null for ratings made
// before copies were kept (see saveRatedShows); their `ratedAt` is null too.
export function getRatedShows() {
  const rated = readJSON(KEYS.rated, {});
  return Object.entries(getRatings()).map(([id, value]) => ({
    id: Number(id),
    value,
    show: rated[id]?.show ?? null,
    ratedAt: rated[id]?.ratedAt ?? null,
  }));
}

// Back-fill copies for older ratings, leaving their (unknown) rating date alone.
export function saveRatedShows(shows) {
  const all = getRatings();
  const rated = readJSON(KEYS.rated, {});
  for (const show of shows) {
    if (all[show.id]) rated[show.id] = { show: showSnapshot(show), ratedAt: rated[show.id]?.ratedAt ?? null };
  }
  writeJSON(KEYS.rated, rated);
  emit();
}

// Watched episodes as { showId: { show, episodes: [episodeId, ...], updatedAt } }.
// A show's entry goes away with its last watched episode.
function getWatched() {
  const all = readJSON(KEYS.watched, {});
  return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
}
export function isEpisodeWatched(showId, episodeId) {
  const episodes = getWatched()[showId]?.episodes;
  return Array.isArray(episodes) && episodes.includes(episodeId);
}
export function toggleEpisodeWatched(show, ep) {
  const all = getWatched();
  const prev = Array.isArray(all[show.id]?.episodes) ? all[show.id].episodes : [];
  const on = !prev.includes(ep.id);
  const episodes = on ? [...prev, ep.id] : prev.filter((id) => id !== ep.id);
  if (episodes.length) all[show.id] = { show: showSnapshot(show), episodes, updatedAt: Date.now() };
  else delete all[show.id];
  writeJSON(KEYS.watched, all);
  emit();
  return on;
}
// Tracked shows as { show, episodes, updatedAt }, most recently updated first.
export function getTrackedShows() {
  return Object.values(getWatched())
    .filter((t) => t?.show?.id && Array.isArray(t.episodes))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// TV trivia quiz: the best streak ever, and totals across sessions.
export function getTriviaStats() {
  return { best: 0, answered: 0, correct: 0, ...readJSON(KEYS.trivia, {}) };
}
export function saveTriviaStats(stats) { writeJSON(KEYS.trivia, stats); }

// Show helper chat: whether the "Need help?" bubble has been dismissed.
export function getChatState() {
  return { promptDismissed: false, ...readJSON(KEYS.chat, {}) };
}
export function saveChatState(state) { writeJSON(KEYS.chat, state); }

export function getTheme() {
  let v = null;
  try { v = localStorage.getItem(KEYS.theme); } catch {}
  return v === 'dark' || v === 'light' ? v : null;
}
export function setTheme(value) {
  try {
    if (value === null) localStorage.removeItem(KEYS.theme);
    else localStorage.setItem(KEYS.theme, value);
  } catch {}
  emit();
}
