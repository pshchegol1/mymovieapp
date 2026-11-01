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

const CBS = { name: 'CBS', country: { name: 'United States' } };
export const SHOWS = [
  show(1, 'Alpha Drama', ['Drama'], { externals: { imdb: 'tt0000001', thetvdb: null }, network: CBS, averageRuntime: 60 }),
  show(2, 'Bravo Drama', ['Drama', 'Crime'], { externals: { imdb: null, thetvdb: 222 }, network: CBS, averageRuntime: 45 }),
  show(3, 'Charlie Comedy', ['Comedy'], { network: { name: 'BBC One', country: { name: 'United Kingdom' } }, averageRuntime: 30 }),
  show(4, 'Delta Drama', ['Drama'], {
    image: { medium: BROKEN_IMG, original: BROKEN_IMG },
    webChannel: { name: 'Netflix', country: null }, status: 'Ended',
  }),
];

// What "aired" on any past date: the widget should keep the top three by
// popularity, list Alpha once, and drop the unpopular show and the news.
const pastEp = (s, weight, season, number, name, extra = {}) =>
  ({ season, number, name, show: { ...s, weight, ...extra } });
const PAST_SCHEDULE = [
  pastEp(SHOWS[0], 95, 1, 3, 'Pilot Part 2'),
  pastEp(SHOWS[0], 95, 1, 4, 'Second Airing'),
  pastEp(show(70, 'Obscure Show', ['Drama']), 10, 1, 1, 'Nobody Watched'),
  pastEp(show(71, 'Evening News', ['News']), 99, 2007, 300, 'Episode 300', { type: 'News' }),
  pastEp(SHOWS[1], 99, 3, 7, 'Trick or Treat'),
  pastEp(SHOWS[2], 90, 2, 1, 'Episode 1'),
  pastEp(SHOWS[3], 85, 1, 9, 'Fourth Place'),
];

// Streaming releases by country ('' = global services). The tab should merge
// both, list Delta's season drop once, skip the news feed and rank by popularity.
export const WEB_SCHEDULE = {
  '': [1, 2, 3].map((number) => ({ season: 2, number, name: `Drop ${number}`, _embedded: { show: { ...SHOWS[3], weight: 95 } } })),
  US: [
    { season: 1, number: 4, name: 'Streamed First', _embedded: { show: { ...SHOWS[0], network: null, webChannel: { name: 'Peacock' } } } },
    { season: 2026, number: 50, name: 'Episode 50', _embedded: { show: show(72, 'News Feed', [], { type: 'News', weight: 99 }) } },
  ],
};

export const PERSON = {
  id: 50, name: 'Jamie Example', birthday: '1970-05-15', deathday: null,
  country: { name: 'Canada' }, url: 'https://www.tvmaze.com/people/50/jamie-example',
  image: { medium: 'https://static.tvmaze.com/p50.jpg' },
};

// Next episodes, timed relative to "now" (show 3 has none announced).
const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();
export const NEXT_EPISODES = {
  1: () => ({ season: 2, number: 5, name: 'The Return', airstamp: inHours(3 * 24 + 2) }),
  2: () => ({ season: 1, number: 9, name: 'Episode 9', airstamp: inHours(26) }),
  4: () => ({ season: 3, number: 1, name: 'Aired Already', airstamp: inHours(-5) }),
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
      } else if (p === '/schedule/web') {
        body = WEB_SCHEDULE[url.searchParams.get('country') ?? ''] || [];
      } else if (p === '/schedule') {
        const year = Number((url.searchParams.get('date') || '').slice(0, 4));
        // Upcoming: the same premiere listed every day; the widget should show it once.
        body = year < new Date().getFullYear()
          ? PAST_SCHEDULE
          : [{ season: 4, number: 1, airstamp: inHours(50), show: SHOWS[2] }];
      } else if (/^\/shows\/\d+\/episodes$/.test(p)) {
        body = Array.from({ length: 30 }, (_, i) => ({ id: 5000 + i, season: 1, number: i + 1, runtime: 50 }));
      } else if (p === '/shows/1/images') {
        // The carousel should pass over the poster, the too-square background,
        // the small one and the 8K one for the 1920px one.
        const img = (n, type, width, height, main = false) =>
          ({ type, main, resolutions: { original: { url: `https://static.tvmaze.com/bg${n}.jpg`, width, height } } });
        body = [
          img(1, 'poster', 680, 1000, true), img(2, 'background', 1000, 1000), img(3, 'background', 1920, 1080),
          img(4, 'background', 7680, 4320, true), img(5, 'background', 1280, 720),
        ];
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
        if (url.searchParams.get('embed') === 'nextepisode' && NEXT_EPISODES[body.id]) {
          body = { ...body, _embedded: { nextepisode: NEXT_EPISODES[body.id]() } };
        }
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
