const BASE = 'https://api.tvmaze.com';

const cache = new Map();
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

let showsCache = null;
export async function fetchShows(page = 1) {
  if (page === 1 && showsCache) return showsCache;
  const data = await getJSON(`${BASE}/shows?page=${page}`);
  if (page === 1) showsCache = data;
  return data;
}

export async function searchShows(query) {
  const res = await fetch(`${BASE}/search/shows?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`TVMaze /search ${res.status}`);
  const data = await res.json();
  return data.map((d) => d.show);
}

export async function fetchShow(id) {
  return getJSON(`${BASE}/shows/${id}`);
}

export async function fetchCast(id) {
  return getJSON(`${BASE}/shows/${id}/cast`);
}

export async function fetchSeasons(id) {
  return getJSON(`${BASE}/shows/${id}/seasons`);
}

export async function fetchSeasonEpisodes(seasonId) {
  return getJSON(`${BASE}/seasons/${seasonId}/episodes`);
}

export async function fetchSchedule(country = 'US', date = null) {
  const d = date || new Date().toISOString().slice(0, 10);
  return getJSON(`${BASE}/schedule?country=${encodeURIComponent(country)}&date=${d}`);
}

export const FALLBACK_IMG = './img/noimg.jpg';

export function showImage(show, kind = 'medium') {
  return show?.image?.[kind] || show?.image?.medium || FALLBACK_IMG;
}

export function personImage(person, kind = 'medium') {
  return person?.image?.[kind] || person?.image?.medium || FALLBACK_IMG;
}
