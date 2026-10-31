import { test, expect, SHOWS, useTmdb } from './fixtures.js';

const cards = (page) => page.locator('[data-shows-grid] [data-show-card]');
const modal = (page) => page.locator('[data-modal]');

test('browse grid lists shows', async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(SHOWS.length);
  await expect(page.locator('[data-result-count]')).toHaveText(`${SHOWS.length} shows`);
});

test.describe('west of UTC', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('a Jan 1 premiere shows and filters as that year', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page).first().locator('.show-card__premiered')).toHaveText('2020');
    await page.locator('[data-year-select]').selectOption('2020');
    await expect(cards(page)).toHaveCount(SHOWS.length);
  });
});

test('search updates the URL and filters results', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-search-input]').fill('drama');
  await page.locator('[data-search-input]').press('Enter');
  await expect(page).toHaveURL(/#\/search\?q=drama$/);
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('[data-search-term]')).toHaveText('drama');

  await page.locator('[data-search-clear]').click();
  await expect(cards(page)).toHaveCount(SHOWS.length);
});

test('a show URL opens its details, and Back closes them', async ({ page }) => {
  await page.goto('/');
  await cards(page).first().waitFor();
  await page.goto('/#/show/3');
  await expect(modal(page)).toBeVisible();
  await expect(page.locator('[data-modal-title]')).toHaveText('Charlie Comedy');

  await page.goBack();
  await expect(modal(page)).toBeHidden();
});

test('Escape closes the details and restores the URL', async ({ page }) => {
  await page.goto('/');
  await cards(page).filter({ hasText: 'Alpha Drama' }).click();
  await expect(page).toHaveURL(/#\/show\/1$/);
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();
  await expect(page).not.toHaveURL(/#\/show\//);
});

test('watchlist toggle updates the badge and survives a reload', async ({ page }) => {
  await page.goto('/');
  const badge = page.locator('[data-watchlist-count]');
  await expect(badge).toBeHidden();

  await cards(page).filter({ hasText: 'Bravo Drama' }).locator('[data-watch-toggle]').click();
  await expect(badge).toHaveText('1');

  await page.reload();
  await expect(badge).toHaveText('1');
  await page.locator('[data-nav="watchlist"]').click();
  await expect(page.locator('[data-watchlist-grid] [data-show-card]')).toHaveText(/Bravo Drama/);
});

test('"More like this" keeps working after a click between cards', async ({ page }) => {
  await page.goto('/');
  await cards(page).filter({ hasText: 'Alpha Drama' }).click();
  const similar = page.locator('[data-similar]');
  await expect(similar.locator('[data-similar-id]').first()).toBeVisible();

  // A click on the container itself (not a card) must not disable the cards.
  await similar.dispatchEvent('click');
  await similar.locator('[data-similar-id="2"]').click();
  await expect(page.locator('[data-modal-title]')).toHaveText('Bravo Drama');
});

test('season tabs follow the ARIA tabs pattern', async ({ page }) => {
  await page.goto('/#/show/1');
  const tabs = page.getByRole('tablist', { name: 'Seasons' }).getByRole('tab');
  const panel = page.getByRole('tabpanel');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toHaveAccessibleName('Season 1');
  await expect(panel).toContainText('Season 1 opener');

  // Arrows move focus (wrapping) without selecting; Enter selects.
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1');
  await expect(panel).toHaveAccessibleName('Season 2');
  await expect(panel).toContainText('Season 2 opener');

  await tabs.nth(2).click();
  await expect(panel).toContainText('Season 3 opener');
});

test.describe('person pages', () => {
  test('a cast member links to their page, and Back returns to the show', async ({ page }) => {
    await page.goto('/');
    await cards(page).filter({ hasText: 'Bravo Drama' }).click();
    await page.locator('[data-cast] a', { hasText: 'Jamie Example' }).click();

    await expect(page).toHaveURL(/#\/person\/50$/);
    await expect(modal(page)).toBeHidden();
    const view = page.locator('[data-view="person"]');
    await expect(view.getByRole('heading', { name: 'Jamie Example' })).toBeFocused();
    await expect(view).toContainText('Canada');
    await expect(view).toContainText('May 15, 1970');
    await expect(view).toContainText('2 shows');
    // Show 1 appears once despite two credits.
    await expect(view.locator('[data-show-card]')).toHaveText([/Alpha Drama/, /Charlie Comedy/]);

    await page.goBack();
    await expect(modal(page)).toBeVisible();
    await expect(page.locator('[data-modal-title]')).toHaveText('Bravo Drama');
  });

  test('show cards on a person page open details and toggle the watchlist', async ({ page }) => {
    await page.goto('/#/person/50');
    const grid = page.locator('[data-person-grid]');
    const card = grid.locator('[data-show-card]', { hasText: 'Charlie Comedy' });
    await card.locator('[data-watch-toggle]').click();
    await expect(card.locator('[data-watch-toggle]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-watchlist-count]')).toHaveText('1');

    await card.click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Charlie Comedy');
  });

  test('an unknown person shows an error', async ({ page }) => {
    await page.goto('/#/person/999');
    await expect(page.locator('[data-view="person"]')).toContainText('Couldn’t load this person');
  });
});

test.describe('trailers', () => {
  const trailerBtn = (page) => page.locator('[data-action="trailer"]');
  const embed = (page) => page.locator('[data-trailer-mount] iframe');

  test('without a TMDB key, offers a YouTube search', async ({ page }) => {
    await page.goto('/#/show/1');
    await trailerBtn(page).click();
    await expect(trailerBtn(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-trailer-mount] a')).toHaveAttribute('href', /youtube\.com\/results\?search_query=Alpha%20Drama/);
    await expect(embed(page)).toHaveCount(0);
  });

  test('embeds the best official YouTube trailer, and stops it on close', async ({ page }) => {
    const requests = await useTmdb(page);
    await page.goto('/#/show/1');
    await trailerBtn(page).click();
    await expect(embed(page)).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/official1\?/);
    await expect(page.locator('[data-trailer-mount]')).toContainText('not endorsed or certified by TMDB');
    expect(requests.every((u) => u.searchParams.get('api_key') === 'test-key')).toBe(true);

    // Toggling the button hides the trailer and removes the player.
    await trailerBtn(page).click();
    await expect(trailerBtn(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(embed(page)).toHaveCount(0);

    await trailerBtn(page).click();
    await expect(embed(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(modal(page)).toBeHidden();
    await expect(page.locator('[data-modal] iframe')).toHaveCount(0);
  });

  test('falls back to a search link when TMDB has no trailer', async ({ page }) => {
    const requests = await useTmdb(page);
    await page.goto('/#/show/2');
    await trailerBtn(page).click();
    await expect(page.locator('[data-trailer-mount]')).toContainText('No trailer found');
    await expect(page.locator('[data-trailer-mount] a')).toHaveAttribute('href', /search_query=Bravo%20Drama/);
    expect(requests.some((u) => u.pathname.endsWith('/find/222') && u.searchParams.get('external_source') === 'tvdb_id')).toBe(true);

    // No external ids at all: tries a name + year search, then falls back.
    await page.goto('/#/show/3');
    await trailerBtn(page).click();
    await expect(page.locator('[data-trailer-mount]')).toContainText('No trailer found');
    const search = requests.find((u) => u.pathname.endsWith('/search/tv'));
    expect(search.searchParams.get('query')).toBe('Charlie Comedy');
    expect(search.searchParams.get('first_air_date_year')).toBe('2020');
  });

  test('works for watchlist shows, which are saved without external ids', async ({ page }) => {
    await useTmdb(page);
    await page.goto('/');
    await cards(page).filter({ hasText: 'Alpha Drama' }).locator('[data-watch-toggle]').click();
    await page.goto('/#/watchlist');
    await page.locator('[data-watchlist-grid] [data-show-card]').click();
    await trailerBtn(page).click();
    await expect(embed(page)).toHaveAttribute('src', /embed\/official1\?/);
  });
});

test.describe('next-episode countdown', () => {
  const widget = (page) => page.locator('[data-next-episodes]');
  const heart = (page, name) => cards(page).filter({ hasText: name }).locator('[data-watch-toggle]');

  test('lists My list shows by next air date and updates with the list', async ({ page }) => {
    await page.goto('/');
    await expect(widget(page)).toContainText('Add shows to My list');

    // Show 4's episode already aired and show 3 has none, so only 1 and 2 appear.
    for (const name of ['Alpha Drama', 'Bravo Drama', 'Charlie Comedy', 'Delta Drama']) {
      await heart(page, name).click();
    }
    const rows = widget(page).locator('[data-countdown-idx]');
    await expect(rows).toHaveText([/Bravo Drama\s*S1 · E9/, /Alpha Drama\s*S2 · E5/]);
    await expect(widget(page).locator('[data-countdown-time]').first()).toHaveText(/^01d 0[12]h \d\dm \d\ds$/);

    await rows.first().click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Bravo Drama');
    await page.keyboard.press('Escape');

    await heart(page, 'Bravo Drama').click();
    await expect(rows).toHaveText([/Alpha Drama/]);
  });

  test('upcoming premieres still count down and open details', async ({ page }) => {
    await page.goto('/');
    const premieres = page.locator('[data-countdown-items]');
    await expect(premieres.locator('[data-countdown-idx]')).toHaveText([/Charlie Comedy\s*S4 · /]);
    await expect(premieres.locator('[data-countdown-time]')).toHaveText(/^02d 0[12]h \d\dm \d\ds$/);
    await premieres.locator('[data-countdown-idx]').click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Charlie Comedy');
  });

  test('says so when no shows in My list have an upcoming episode', async ({ page }) => {
    await page.goto('/');
    await heart(page, 'Charlie Comedy').click();
    await expect(widget(page)).toContainText('No upcoming episodes announced');
  });

  test('show details include the next episode', async ({ page }) => {
    await page.goto('/#/show/1');
    const row = page.locator('[data-next-ep]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Next episode: S2 · E5 · The Return');
    await expect(row).toContainText('(in 3 days)');

    // Placeholder titles like "Episode 9" are left out.
    await page.goto('/#/show/2');
    await expect(row).toContainText(/Next episode: S1 · E9 · \w{3}, /);
    await expect(row).not.toContainText('Episode 9');

    await page.goto('/#/show/3');
    await expect(page.locator('[data-modal-title]')).toHaveText('Charlie Comedy');
    await expect(row).toBeHidden();
  });

  test('retries TVMaze requests that hit the rate limit', async ({ page }) => {
    let calls = 0;
    await page.route('https://api.tvmaze.com/shows/1?embed=nextepisode', (route) => {
      calls++;
      return calls === 1
        ? route.fulfill({ status: 429, headers: { 'Retry-After': '1' }, json: {} })
        : route.fallback();
    });
    await page.goto('/#/show/1');
    await expect(page.locator('[data-next-ep]')).toContainText('S2 · E5', { timeout: 5000 });
    expect(calls).toBe(2);
  });
});

test.describe('my ratings', () => {
  const view = (page) => page.locator('[data-view="ratings"]');
  const grid = (page) => page.locator('[data-ratings-grid] [data-show-card]');

  async function rate(page, id, score) {
    await page.goto(`/#/show/${id}`);
    await page.locator(`[data-rate="${score}"]`).click();
    await expect(page.locator('.rate__value')).toContainText(`${score}/10`);
  }

  test('is empty until something is rated', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-nav="ratings"]').click();
    await expect(page).toHaveURL(/#\/ratings$/);
    await expect(page.locator('[data-nav="ratings"]')).toHaveClass(/is-active/);
    await expect(view(page)).toContainText('No ratings yet');
    await expect(page.locator('[data-ratings-stats]')).toBeHidden();
  });

  test('lists, summarises, sorts and filters rated shows', async ({ page }) => {
    await rate(page, 1, 9);
    await rate(page, 3, 4);
    await rate(page, 2, 9);
    await page.goto('/#/ratings');

    // Highest score first; ties go to the most recently rated.
    await expect(grid(page)).toHaveText([/Bravo Drama/, /Alpha Drama/, /Charlie Comedy/]);
    const stats = page.locator('[data-ratings-stats]');
    await expect(stats).toContainText('Rated3');
    await expect(stats).toContainText('Your average7.3');
    // TVMaze has all three at 8.0: (+1 − 4 + 1) / 3.
    await expect(stats).toContainText('vs TVMaze−0.7');

    // Histogram bars filter to that score; clicking again clears the filter.
    const bar9 = stats.getByRole('button', { name: 'Score 9: 2 shows. Show only these' });
    await bar9.click();
    await expect(bar9).toHaveAttribute('aria-pressed', 'true');
    await expect(grid(page)).toHaveCount(2);
    await expect(page.locator('[data-ratings-count]')).toHaveText('2 shows');
    await bar9.click();
    await expect(grid(page)).toHaveCount(3);
    await expect(stats.getByRole('button', { name: /^Score 5:/ })).toBeDisabled();

    await page.locator('[data-ratings-filter]').selectOption('low');
    await expect(grid(page)).toHaveText([/Charlie Comedy/]);
    await page.locator('[data-ratings-filter]').selectOption('all');
    await page.locator('[data-ratings-sort]').selectOption('diff');
    await expect(grid(page).first()).toHaveText(/Charlie Comedy/);
    await page.locator('[data-ratings-sort]').selectOption('az');
    await expect(grid(page)).toHaveText([/Alpha Drama/, /Bravo Drama/, /Charlie Comedy/]);

    // The footer profile still reads the same scores.
    await expect(page.locator('[data-footer-profile]')).toContainText('7.3 avg');
  });

  test('clearing a rating removes the show from the page', async ({ page }) => {
    await rate(page, 1, 7);
    await rate(page, 2, 6);
    await page.goto('/#/ratings');
    await grid(page).filter({ hasText: 'Alpha Drama' }).click();
    await page.locator('.rate__clear').click();
    await page.keyboard.press('Escape');
    await expect(grid(page)).toHaveText([/Bravo Drama/]);
  });

  test('ratings saved before this page existed are filled in from TVMaze', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('mm.ratings')) localStorage.setItem('mm.ratings', JSON.stringify({ 1: 8, 3: 10 }));
    });
    await page.goto('/#/ratings');
    await expect(grid(page)).toHaveText([/Charlie Comedy/, /Alpha Drama/]);
    await expect(page.locator('[data-ratings-count]')).toHaveText('2 shows');

    // The copies are saved, so a reload doesn't need TVMaze.
    const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mm.rated'))));
    expect(stored.sort()).toEqual(['1', '3']);
  });
});

test.describe('on this day in TV', () => {
  const widget = (page) => page.locator('[data-on-this-day]');
  const dateLine = (page) => widget(page).locator('.otd__date');

  test('shows the most popular shows that aired on this date in a past year', async ({ page }) => {
    await page.goto('/');
    const now = new Date();
    await expect(dateLine(page)).toHaveText(/^\w{3} \d{1,2}, (\d{4}) · \d+ years? ago$/);
    const [, year] = (await dateLine(page).textContent()).match(/(\d{4})/);
    expect(Number(year)).toBeGreaterThanOrEqual(1995);
    expect(Number(year)).toBeLessThan(now.getFullYear());
    await expect(dateLine(page)).toContainText(`${now.getFullYear() - Number(year)} year`);

    // Top three by popularity, Alpha once, no unpopular shows or news.
    await expect(widget(page).locator('[data-otd-idx]')).toHaveText([
      /Bravo Drama\s*S3 · E7 · Trick or Treat/,
      /Alpha Drama\s*S1 · E3 · Pilot Part 2/,
      /Charlie Comedy\s*S2 · E1\s*$/, // placeholder title "Episode 1" left out
    ]);

    await widget(page).getByRole('button', { name: /^Bravo Drama/ }).click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Bravo Drama');
  });

  test('"Another year" picks a different year', async ({ page }) => {
    await page.goto('/');
    await expect(dateLine(page)).toBeVisible();
    const first = await dateLine(page).textContent();
    await widget(page).getByRole('button', { name: 'Another year' }).click();
    await expect(dateLine(page)).not.toHaveText(first);
  });
});

test.describe('TV trivia', () => {
  const widget = (page) => page.locator('[data-trivia]');
  const fact = (page) => widget(page).locator('.trivia__fact');
  const another = (page) => widget(page).getByRole('button', { name: 'Another fact' });

  // Clicks through facts until `count` distinct ones have been seen.
  async function collect(page, count) {
    const seen = [];
    await expect(another(page)).toBeEnabled();
    seen.push(await fact(page).textContent());
    while (seen.length < count) {
      await another(page).click();
      await expect(fact(page)).not.toHaveText(seen[seen.length - 1]);
      await expect(another(page)).toBeEnabled();
      seen.push(await fact(page).textContent());
    }
    return seen;
  }

  test('cycles through facts worked out from the home page shows', async ({ page }) => {
    await page.goto('/');
    const ago = new Date().getFullYear() - 2020;
    // With an empty list, the "your list" fact is skipped, leaving 8.
    const facts = await collect(page, 8);
    expect(new Set(facts).size).toBe(8);
    expect(facts).toEqual(expect.arrayContaining([
      `The oldest show on the home page, Alpha Drama, premiered in 2020: ${ago} years ago.`,
      'Drama is the most common genre on the home page: 3 of 4 shows (75%).',
      'CBS has more shows on the home page than any other network or streaming service: 2 of them.',
      'Alpha Drama is the highest-rated show on the home page, at 8.0 out of 10 on TVMaze.',
      '25% of the shows on the home page have ended. 3 are still running.',
      'The shows on the home page come from 2 countries. The most, 2, are from United States.',
      'Alpha Drama has the longest episodes on the home page, averaging 60 minutes.',
      expect.stringMatching(/^\w+ \w+ has aired 30 episodes\. Watched back-to-back, that’s 1 day and 1 hour\.$/),
    ]));
  });

  test('includes a fact about your list once it has a couple of shows', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Alpha Drama', 'Delta Drama']) {
      await cards(page).filter({ hasText: name }).locator('[data-watch-toggle]').click();
    }
    const facts = await collect(page, 9);
    expect(facts).toContain('1 of the 2 shows in your list is still running.');
  });

  test('show names in a fact open their details', async ({ page }) => {
    await page.goto('/');
    await expect(another(page)).toBeEnabled();
    // Click until a fact names a show.
    while (!(await fact(page).locator('[data-trivia-show]').count())) {
      const before = await fact(page).textContent();
      await another(page).click();
      await expect(fact(page)).not.toHaveText(before);
    }
    const link = fact(page).locator('[data-trivia-show]');
    const name = await link.textContent();
    await link.click();
    await expect(page.locator('[data-modal-title]')).toHaveText(name);
  });
});

test('broken images fall back to the placeholder', async ({ page }) => {
  await page.goto('/');
  const img = cards(page).filter({ hasText: 'Delta Drama' }).locator('img');
  await expect(img).toHaveAttribute('src', './img/noimg.jpg');
  await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
});

// With app.js blocked, only the inline <head> script can set the theme,
// which proves it's applied before first paint rather than after the app loads.
test.describe('theme is set before the app loads', () => {
  test.beforeEach(({ page }) => page.route('**/js/app.js', (route) => route.abort()));

  test('follows the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  });

  test('a saved choice overrides the system preference', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mm.theme', 'light'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test('theme choice persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');

  await page.locator('[data-theme-toggle]').click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});
