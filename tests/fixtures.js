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
  show(1, 'Alpha Drama', ['Drama']),
  show(2, 'Bravo Drama', ['Drama', 'Crime']),
  show(3, 'Charlie Comedy', ['Comedy']),
  show(4, 'Delta Drama', ['Drama'], { image: { medium: BROKEN_IMG, original: BROKEN_IMG } }),
];

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

export { expect };
