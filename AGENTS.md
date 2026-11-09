# AGENTS.md

Instructions for coding agents working in this repo, including the software
factory's agents (`.claude/agents/`). Read this before changing anything.

## What this is

MovieMatrix: a TV show browser in plain HTML, CSS and JavaScript ES modules. No
framework, no bundler, no build step, no backend. Show data comes from the
public TVMaze API (no key). Trailers come from TMDB and need an optional key in
`js/config.js`. Without it, "Watch trailer" falls back to a YouTube search link.
User data (My list, ratings, watched episodes, recently viewed, theme) lives in `localStorage`.
See `README.md` for the feature list and the hash-based URLs (`#/show/431` etc.).

## Layout

```
index.html            page markup
css/main.css          imports everything below
css/tokens.css        design tokens: colors, spacing, type, radii (light + dark)
css/components/       one stylesheet per UI component
js/app.js             entry point: wires modules, routes, grid state
js/api.js             TVMaze / TMDB requests (cached, 429 retry) and helpers
js/router.js          tiny hash router
js/storage.js         localStorage: watchlist, recent, ratings, watched episodes, theme
js/ui/                one module per UI component
js/util/dom.js        $, $$, escapeHtml, the `html` tagged template, raw()
tests/app.spec.js     Playwright end-to-end tests
tests/fixtures.js     mocked TVMaze/TMDB data and network routing
scripts/serve.js      zero-dependency static file server
```

## Setup (fresh checkout or git worktree)

Requires Node 20.11+.

```sh
npm ci
npx playwright install chromium
```

## Dev server

```sh
node scripts/serve.js <port>      # serves the repo root; default port 8765
```

Open `http://localhost:<port>/`. Stop the server when you are done.

## Validation

```sh
PORT=<port> npm test              # Playwright, chromium, all network mocked
```

- **Always set `PORT`** to the port you were given. The default (8765) is for
  humans; Playwright reuses any server already on that port, so two checkouts
  sharing a port silently test each other's code.
- There is no lint, type-check or build step. `npm test` is the only check.
- Tests must not hit the network: `tests/fixtures.js` aborts every non-localhost
  request and mocks TVMaze and TMDB. New behaviour that needs API data gets new
  fixture data there.
- New user-visible behaviour gets a test in `tests/app.spec.js`, following the
  existing tests' style.

## Conventions

- **No new dependencies**, runtime or dev, unless the task explicitly asks.
- Escape every API value (TVMaze/TMDB names, summaries, URLs) and URL parameter
  before it reaches `innerHTML`: build markup with the `html` tagged template
  from `js/util/dom.js` (escapes every interpolation), or wrap each value in
  `escapeHtml()` in a plain template literal. Prefer `textContent` for plain
  text. Use `raw()` only for markup the app itself generated, never API data.
- TVMaze `summary` fields contain HTML. Render them as
  `escapeHtml(stripTags(summary))`. `stripTags` alone is not safe for
  `innerHTML` (an unclosed tag like `<img src=x onerror=...` survives it).
- Styling: use the tokens in `css/tokens.css` (`--color-*`, spacing, radii)
  instead of hard-coded colours. Each component has its own file in
  `css/components/`, imported from `css/main.css`. Check both light and dark
  themes.
- One module per UI component in `js/ui/`. Reuse existing components (cards,
  carousel, modal, toast, skeleton loaders) before writing new ones.
- Respect `prefers-reduced-motion` (see `css/motion.css`) and keep everything
  keyboard accessible: real buttons and links, visible focus.
- Commit messages: short, one line, sentence case, like the existing history
  ("Improved the Upcoming premieres section").
- Never commit a real TMDB key. `js/config.js` must keep `TMDB_API_KEY = ''`.

## Software factory

`/factory <feature>` runs a feature through spec → build → four parallel
reviews → approve, on its own branch and git worktree
(`../mymovieapp-factory/<job-id>/`). `/factory next` takes the first unchecked
item in `factory/backlog.md`. `/factory approve <job-id>` and
`/factory rework <job-id> <note>` handle jobs that need a human.

- Definition: `.claude/skills/factory/SKILL.md` and `.claude/agents/*.md`.
- Job state: `factory/jobs/<job-id>/` (gitignored).
- Dashboard: `cd factory && python3 -m http.server`, then open
  http://localhost:8000/dashboard.html.
- Each agent gets its own port (5100 + 10 × job number + offset). Use it for both
  the dev server and `PORT=<port> npm test`.
- The factory merges locally and never pushes. A human reviews and pushes.
