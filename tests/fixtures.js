import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const IMG = readFileSync(new URL('../img/noimg.jpg', import.meta.url));
export const BROKEN_IMG = 'https://static.tvmaze.com/broken.jpg';

function show(id, name, genres, extra = {}) {
  return {
    id, name, genres,
    premiered: '2020-01-01',
    rating: { average: 8 },
    weight: 90,
    status: 'Running',
    summary: `<p>${name} summary.</p>`,
    image: { medium: `https://static.tvmaze.com/${id}.jpg`, original: `https://static.tvmaze.com/${id}.jpg` },
    ...extra,
  };
}

export const SHOWS = [
  show(1, 'Alpha Drama', ['Drama'], { externals: { imdb: 'tt0000001', thetvdb: null } }),
  show(2, 'Bravo Drama', ['Drama', 'Crime'], { externals: { imdb: null, thetvdb: 222 } }),
  show(3, 'Charlie Comedy', ['Comedy']),
  show(4, 'Delta Drama', ['Drama'], { image: { medium: BROKEN_IMG, original: BROKEN_IMG } }),
];

export const PERSON = {
  id: 50, name: 'Jamie Example', birthday: '1970-05-15', deathday: null,
  country: { name: 'Canada' }, url: 'https://www.tvmaze.com/people/50/jamie-example',
  image: { medium: 'https://static.tvmaze.com/p50.jpg' },
};

// Serve TVMaze from fixtures and block other third-party requests, so tests
// are fast and don't depend on the network or live data.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
    await page.route('https://static.tvmaze.com/**', (route) =>
      route.request().url() === BROKEN_IMG
        ? route.fulfill({ status: 404 })
        : route.fulfill({ contentType: 'image/jpeg', body: IMG }));
    await page.route('https://api.tvmaze.com/**', (route) => {
      const url = new URL(route.request().url());
      const p = url.pathname;
      let body = [];
      if (p === '/shows') body = SHOWS;
      else if (p === '/search/shows') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        body = SHOWS.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ score: 1, show: s }));
      } else if (/^\/shows\/\d+\/cast$/.test(p)) {
        body = [{ person: PERSON, character: { name: 'Detective Ray' } }];
      } else if (p === `/people/${PERSON.id}`) {
        body = PERSON;
      } else if (p === `/people/${PERSON.id}/castcredits`) {
        // Two roles in show 1, which the page should list only once.
        body = [SHOWS[0], SHOWS[0], SHOWS[2]].map((s) => ({ self: false, voice: false, _embedded: { show: s } }));
      } else if (/^\/people\/\d+/.test(p)) {
        return route.fulfill({ status: 404, json: {} });
      } else if (/^\/shows\/\d+\/seasons$/.test(p)) {
        body = [{ id: 11, number: 1 }, { id: 12, number: 2 }, { id: 13, number: 3 }];
      } else if (/^\/seasons\/\d+\/episodes$/.test(p)) {
        const n = Number(p.split('/')[2]) - 10;
        body = [{ id: n * 100, number: 1, name: `Season ${n} opener` }];
      } else if (/^\/shows\/\d+$/.test(p)) {
        body = SHOWS.find((s) => s.id === Number(p.split('/')[2]));
        if (!body) return route.fulfill({ status: 404, json: {} });
      }
      return route.fulfill({ json: body });
    });
    await use(page);
  },
});

// Swap in a TMDB key and serve TMDB from fixtures. Records each request URL.
//   show 1 → matched by IMDb id → has trailers
//   show 2 → matched by TVDB id → only a featurette (no trailer)
//   others → no match
export async function useTmdb(page) {
  const requests = [];
  await page.route('**/js/config.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: "export const TMDB_API_KEY = 'test-key';" }));
  await page.route('https://api.themoviedb.org/**', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const p = url.pathname.replace('/3', '');
    if (p === '/find/tt0000001') return route.fulfill({ json: { tv_results: [{ id: 901 }] } });
    if (p === '/find/222') return route.fulfill({ json: { tv_results: [{ id: 902 }] } });
    if (p.startsWith('/find/')) return route.fulfill({ json: { tv_results: [] } });
    if (p === '/search/tv') return route.fulfill({ json: { results: [] } });
    if (p === '/tv/901/videos') {
      return route.fulfill({ json: { results: [
        { site: 'YouTube', type: 'Teaser', official: true, key: 'teaser1' },
        { site: 'YouTube', type: 'Trailer', official: false, key: 'fan1' },
        { site: 'Vimeo', type: 'Trailer', official: true, key: 'vimeo1' },
        { site: 'YouTube', type: 'Trailer', official: true, key: 'official1' },
      ] } });
    }
    if (p === '/tv/902/videos') {
      return route.fulfill({ json: { results: [{ site: 'YouTube', type: 'Featurette', official: true, key: 'feat1' }] } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return requests;
}

export { expect };
