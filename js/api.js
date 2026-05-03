const BASE = 'https://api.tvmaze.com';

let showsCache = null;
export async function fetchShows(page = 1) {
  if (page === 1 && showsCache) return showsCache;
  const res = await fetch(`${BASE}/shows?page=${page}`);
  if (!res.ok) throw new Error(`TVMaze /shows ${res.status}`);
  const data = await res.json();
  if (page === 1) showsCache = data;
  return data;
}

export async function searchShows(query) {
  const res = await fetch(`${BASE}/search/shows?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`TVMaze /search ${res.status}`);
  const data = await res.json();
  return data.map((d) => d.show);
}

export const FALLBACK_IMG = './img/noimg.jpg';

export function showImage(show, kind = 'medium') {
  return show?.image?.[kind] || show?.image?.medium || FALLBACK_IMG;
}
