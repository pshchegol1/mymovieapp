# MovieMatrix

A TV show browser built with plain HTML, CSS and JavaScript modules — no framework, no build step. Show data comes from the free [TVMaze API](https://www.tvmaze.com/api) (no key needed).

## Features

- **Browse** ~240 popular shows by category (Trending, Popular, Top rated, New), genre, year and sort order
- **Search** any show on TVMaze; genre and sort filters also apply to search results
- **Show details** with cast, seasons and episodes, similar shows, your own 1–10 rating, a share link, and an embedded trailer (needs a TMDB key, see below)
- **Person pages** for cast members, with every show they've been in
- **My list** (watchlist), **My ratings** (sort, filter and a breakdown of your scores) and **Recently viewed**, saved in the browser
- **Tonight** — what's airing on US TV today, plus a **Streaming** tab with today's new episodes on Netflix, Prime Video, Apple TV, Peacock and the rest (season drops grouped into one entry)
- **Your next episodes** (for shows in My list) and **Upcoming premieres** countdowns in the sidebar, plus **On this day in TV** and **TV trivia** worked out from TVMaze data
- Light/dark theme, keyboard accessible, respects "reduce motion"

## Running locally

The app uses ES modules, so it must be served over HTTP (opening `index.html` directly from disk won't work). From the project folder, either:

```sh
npm run serve            # http://localhost:8765, no dependencies needed
# or
python3 -m http.server 8000
```

then open the printed address.

### Trailers (optional)

TVMaze has no video data, so trailers are looked up on [TMDB](https://www.themoviedb.org). Get a free API key at https://www.themoviedb.org/settings/api and paste the v3 "API Key" into [js/config.js](js/config.js). Without a key, "Watch trailer" offers a YouTube search link instead.

There's no backend, so the key is visible to anyone using the site. TMDB keys are read-only, but don't use one you need to keep private.

## Tests

End-to-end tests use [Playwright](https://playwright.dev) with the TVMaze API mocked, so they don't need the network:

```sh
npm install
npx playwright install chromium   # first time only
npm test
```

## URLs

Navigation is hash-based, so every view can be bookmarked or shared and the Back button works:

| URL | Shows |
|---|---|
| `#/` | Browse grid |
| `#/search?q=friends` | Search results |
| `#/show/431` | A show's details (works for any TVMaze show id) |
| `#/watchlist` | My list |
| `#/ratings` | My ratings |
| `#/recent` | Recently viewed |
| `#/schedule` | Tonight |
| `#/schedule/streaming` | New on streaming today |
| `#/person/50` | A cast member's details and shows (works for any TVMaze person id) |

## Project structure

```
index.html            page markup
css/
  main.css            imports everything below
  tokens.css          design tokens (colors, spacing, type)
  components/         one file per UI component
js/
  app.js              entry point: wires modules together, routes, grid state
  api.js              TVMaze requests (cached) and image/date helpers
  router.js           tiny hash router
  storage.js          localStorage: watchlist, recent, ratings, theme
  ui/                 one module per UI component (grid, search, modal, carousel, …)
  util/dom.js         DOM helpers ($, $$, escapeHtml)
```
