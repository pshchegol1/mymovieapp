import { TMDB_API_KEY } from './config.js';

const BASE = 'https://api.tvmaze.com';
const TMDB = 'https://api.themoviedb.org/3';

const cache = new Map();
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  let res;
  // TVMaze allows ~20 requests per 10s and answers 429 beyond that; wait and retry.
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url);
    if (res.status !== 429 || attempt === MAX_RETRIES) break;
    const retryAfter = Number(res.headers.get('Retry-After'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
  }
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

// The show's next scheduled episode, or null if none is announced.
export async function fetchNextEpisode(id) {
  const show = await getJSON(`${BASE}/shows/${id}?embed=nextepisode`);
  return show._embedded?.nextepisode ?? null;
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

export async function fetchPerson(id) {
  return getJSON(`${BASE}/people/${id}`);
}

// Every show a person has a cast role in, with the show embedded in each credit.
export async function fetchPersonCredits(id) {
  return getJSON(`${BASE}/people/${id}/castcredits?embed=show`);
}

// Trailers come from TMDB, since TVMaze has no video data.
export const hasTrailerSource = () => Boolean(TMDB_API_KEY);

function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
  return getJSON(`${TMDB}${path}?${qs}`);
}

// Match a TVMaze show to TMDB by IMDb id, then TVDB id, then name + first-air year.
async function findTmdbId(show) {
  // Watchlist/recent snapshots don't store externals, so fetch the full show.
  const ext = show.externals || (await fetchShow(show.id)).externals || {};
  for (const [source, id] of [['imdb_id', ext.imdb], ['tvdb_id', ext.thetvdb]]) {
    if (!id) continue;
    const { tv_results: found } = await tmdb(`/find/${encodeURIComponent(id)}`, { external_source: source });
    if (found?.length) return found[0].id;
  }
  const params = { query: show.name || '' };
  if (show.premiered) params.first_air_date_year = show.premiered.slice(0, 4);
  const { results } = await tmdb('/search/tv', params);
  return results?.[0]?.id ?? null;
}

// YouTube video id of the show's best trailer (official trailers first, then
// any trailer, then teasers), or null if there's none.
export async function fetchTrailerKey(show) {
  if (!TMDB_API_KEY) return null;
  const tvId = await findTmdbId(show);
  if (!tvId) return null;
  const { results = [] } = await tmdb(`/tv/${tvId}/videos`, { include_video_language: 'en,null' });
  const rank = (v) => (v.type === 'Trailer' ? 0 : 2) + (v.official ? 0 : 1);
  const best = results
    .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
    .sort((a, b) => rank(a) - rank(b))[0];
  return best?.key ?? null;
}

// YYYY-MM-DD in the user's local time zone, `offsetDays` from today.
// (toISOString() would give the UTC date, which is already tomorrow on US evenings.)
export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchSchedule(country = 'US', date = null) {
  const d = date || localDate();
  return getJSON(`${BASE}/schedule?country=${encodeURIComponent(country)}&date=${d}`);
}

export const FALLBACK_IMG = './img/noimg.jpg';

export function showImage(show, kind = 'medium') {
  return show?.image?.[kind] || show?.image?.medium || FALLBACK_IMG;
}

export function personImage(person, kind = 'medium') {
  return person?.image?.[kind] || person?.image?.medium || FALLBACK_IMG;
}
