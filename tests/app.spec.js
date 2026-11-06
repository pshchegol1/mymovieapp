import { test, expect, SHOWS, EPISODES, BROKEN_IMG, useTmdb } from './fixtures.js';

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

test.describe('upcoming premieres', () => {
  const widget = (page) => page.locator('[data-countdown-items]');
  const featured = (page) => widget(page).locator('.premiere--featured');
  const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();
  // Every day's schedule lists these; the widget should keep the four
  // premieres (not the news show, nor a non-premiere episode), soonest first.
  const premiereSchedule = (page, first = 3) => page.route('https://api.tvmaze.com/schedule?**', (route) => route.fulfill({ json: [
    { season: 3, number: 1, airstamp: inHours(80), show: SHOWS[3] },
    { season: 2, number: 1, airstamp: inHours(30), show: SHOWS[1] },
    { season: 1, number: 1, airstamp: inHours(first), show: SHOWS[0] },
    { season: 4, number: 1, airstamp: inHours(50), show: SHOWS[2] },
    { season: 9, number: 1, airstamp: inHours(1), show: { ...SHOWS[2], id: 80, type: 'News' } },
    { season: 2, number: 6, airstamp: inHours(2), show: { ...SHOWS[2], id: 81 } },
  ] }));

  test('features the soonest with a ticking clock, and lists the rest', async ({ page }) => {
    await premiereSchedule(page);
    await page.goto('/');
    await expect(featured(page).locator('[data-countdown-idx]')).toHaveText(/Series premiere\s*Alpha Drama\s*\w{3}, \w{3} \d+ · .+ · CBS/);
    await expect(featured(page).locator('.premiere__day')).toHaveText(/^(Today|Tonight|Tomorrow)$/);
    await expect(featured(page).locator('.premiere__unit')).toHaveText(['days', 'hrs', 'min', 'sec']);
    const digits = featured(page).locator('[data-unit]');
    await expect(digits).toHaveText(['00', /^0[23]$/, /^\d\d$/, /^\d\d$/]);
    await expect(featured(page).getByRole('timer')).toHaveAccessibleName(/^Starts in 0 days, [23] hours and \d+ minutes$/);
    const sec = await digits.last().textContent();
    await expect(digits.last()).not.toHaveText(sec);

    await expect(widget(page).locator('.premiere:not(.premiere--featured) [data-countdown-idx]')).toHaveText([
      /Bravo Drama\s*S2 · .+ · CBS\s*in 1d [56]h/,
      /Charlie Comedy\s*S4 · .+ · BBC One\s*in 2d [12]h/,
      /Delta Drama\s*S3 · .+ · Netflix\s*in 3d [78]h/,
    ]);

    await widget(page).getByRole('button', { name: /^Charlie Comedy, season 4 returns/ }).click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Charlie Comedy');
  });

  test('"Remind me" adds the show to My list and its next episodes', async ({ page }) => {
    await premiereSchedule(page);
    await page.goto('/');
    const remind = featured(page).getByRole('button', { name: 'Remind me: add Alpha Drama to My list' });
    await remind.click();
    const following = featured(page).getByRole('button', { name: /^Following Alpha Drama/ });
    await expect(following).toHaveAttribute('aria-pressed', 'true');
    await expect(following).toHaveText('Following');
    await expect(page.locator('[data-watchlist-count]')).toHaveText('1');
    await expect(page.locator('[data-next-episodes] [data-countdown-idx]')).toHaveText([/Alpha Drama/]);

    // The compact rows' bells work the same way.
    await widget(page).getByRole('button', { name: 'Remind me: add Bravo Drama to My list' }).click();
    await expect(page.locator('[data-watchlist-count]')).toHaveText('2');
    await following.click();
    await expect(remind).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-watchlist-count]')).toHaveText('1');
  });

  test('says "Airing now" once a premiere starts', async ({ page }) => {
    await page.clock.install();
    await premiereSchedule(page, 0.5);
    await page.goto('/');
    await expect(featured(page).getByRole('timer')).toBeVisible();
    await expect(featured(page).locator('.premiere__live')).toBeHidden();
    await page.clock.fastForward('31:00');
    await expect(featured(page).locator('.premiere__live')).toBeVisible();
    await expect(featured(page).getByRole('timer')).toBeHidden();
  });
});

test.describe('episode ratings heatmap', () => {
  const heat = (page) => page.locator('[data-heat]');
  const cell = (page, label) => heat(page).getByRole('button', { name: label });

  test('maps every episode by season, with the peak, low and best season called out', async ({ page }) => {
    await page.goto('/#/show/1');
    await expect(heat(page).locator('.heat__chip')).toHaveText([
      /Peak: S2 · E4 · The Peak · 9\.6/,
      /Low: S3 · E7 · The Dip · 5\.5/,
      /Best season: 2 · avg 8\.\d/,
    ]);
    await expect(heat(page).locator('.heat__cell')).toHaveCount(30);
    await expect(heat(page).getByRole('rowheader')).toHaveText(['S1', 'S2', 'S3']);
    await expect(cell(page, 'S2 · E4 The Peak, rated 9.6, highest rated')).toHaveClass(/heat__cell--4 is-peak/);
    await expect(cell(page, 'S3 · E7 The Dip, rated 5.5, lowest rated')).toHaveClass(/heat__cell--0 is-low/);
    await expect(cell(page, 'S1 · E2 Unrated, no rating')).toHaveText('–');
    await expect(heat(page).locator('.heat__avg.is-best')).toHaveCount(1);
    await expect(heat(page).getByRole('row').nth(2).locator('.heat__avg')).toHaveClass(/is-best/);

    await cell(page, /^S2 · E4/).hover();
    await expect(heat(page).getByRole('tooltip')).toHaveText(/S2 · E4 · The Peak\s*9\.6 · \w+ \d+, 2020/);
  });

  test('picking an episode opens its season below and scrolls to it', async ({ page }) => {
    await page.goto('/#/show/1');
    await heat(page).getByRole('button', { name: /^Peak:/ }).click();
    const seasonTabs = page.getByRole('tablist', { name: 'Seasons' }).getByRole('tab');
    await expect(seasonTabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    const ep = page.locator('[data-episode-num="4"]');
    await expect(ep).toBeFocused();
    await expect(ep).toContainText('The Peak');
    await expect(ep).toContainText('9.6');
    await expect(ep).toBeInViewport();

    // Within the season already open, too.
    await cell(page, /^S2 · E9/).click();
    await expect(page.locator('[data-episode-num="9"]')).toBeFocused();
  });

  test('is left out for shows without enough ratings', async ({ page }) => {
    await page.route('https://api.tvmaze.com/shows/3/episodes', (route) =>
      route.fulfill({ json: EPISODES.map((ep) => ({ ...ep, rating: { average: null } })) }));
    await page.goto('/#/show/3');
    await expect(page.getByRole('tabpanel')).toContainText('Season 1 opener');
    await expect(page.locator('[data-heat-section]')).toBeHidden();
  });

  test('long-running shows start with their first ten seasons', async ({ page }) => {
    const longRun = Array.from({ length: 15 }, (_, s) =>
      [1, 2].map((number) => ({ ...EPISODES[0], id: s * 10 + number, season: s + 1, number }))).flat();
    await page.route('https://api.tvmaze.com/shows/3/episodes', (route) => route.fulfill({ json: longRun }));
    await page.goto('/#/show/3');
    const seasons = heat(page).getByRole('rowheader');
    await expect(seasons).toHaveCount(10);
    await heat(page).getByRole('button', { name: 'Show all 15 seasons' }).click();
    await expect(seasons).toHaveCount(15);
    await heat(page).getByRole('button', { name: 'Show fewer seasons' }).click();
    await expect(seasons).toHaveCount(10);
  });

  test('fades the edge while more episodes are off to the side', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/#/show/1');
    const scroller = heat(page).locator('.heat__scroll');
    await expect(scroller).toHaveClass(/has-more/);
    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect(scroller).not.toHaveClass(/has-more/);
  });
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
    await expect(widget(page)).toContainText('Your couch schedule is empty');

    // Show 4's episode already aired and show 3 has none, so only 1 and 2 appear:
    // the soonest as the Up next card, the other as a guide row.
    for (const name of ['Alpha Drama', 'Bravo Drama', 'Charlie Comedy', 'Delta Drama']) {
      await heart(page, name).click();
    }
    const rows = widget(page).locator('[data-countdown-idx]');
    await expect(rows).toHaveText([/Up next\s*Bravo Drama\s*S1 · E9/, /Alpha Drama\s*S2 · E5 · The Return/]);
    await expect(widget(page).locator('[data-nx-clock]')).toHaveText(/^1d 0[12]:\d\d:\d\d$/);
    await expect(page.locator('[data-next-summary]')).toHaveText('This week: 2 episodes · 1h 45m of TV');

    await rows.first().click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Bravo Drama');
    await page.keyboard.press('Escape');

    await heart(page, 'Bravo Drama').click();
    await expect(rows).toHaveText([/Alpha Drama/]);
  });

  test('an empty list suggests running shows, and Follow adds one', async ({ page }) => {
    await page.goto('/');
    const follow = widget(page).locator('[data-nx-follow]');
    // Delta Drama has ended, so only the three running shows are suggested.
    await expect(widget(page).locator('.nx-suggest')).toHaveText([/Alpha Drama/, /Bravo Drama/, /Charlie Comedy/]);
    await follow.first().click();
    await expect(page.locator('[data-watchlist-count]')).toHaveText('1');
    await expect(widget(page).locator('[data-countdown-idx]')).toHaveText([/Up next\s*Alpha Drama/]);
  });

  test('groups by day, flags clashes, premieres and live episodes', async ({ page }) => {
    const at = new Date(Date.now() + 2 * 86400000);
    at.setHours(20, 0, 0, 0);
    const slot = at.toISOString();
    const serve = (id, ep) => page.route(`https://api.tvmaze.com/shows/${id}?embed=nextepisode`, async (route) => {
      const res = await route.fetch();
      route.fulfill({ json: { ...(await res.json()), _embedded: { nextepisode: ep } } });
    });
    // Charlie started 10 minutes ago; Alpha and Bravo share a slot in two days.
    await serve(3, { season: 4, number: 2, name: 'Live One', runtime: 30, airstamp: new Date(Date.now() - 600000).toISOString() });
    await serve(1, { season: 3, number: 1, name: 'New Season', airstamp: slot });
    await serve(2, { season: 1, number: 10, name: 'Same Slot', airstamp: slot });

    await page.goto('/');
    for (const name of ['Alpha Drama', 'Bravo Drama', 'Charlie Comedy']) await heart(page, name).click();

    const feature = widget(page).locator('.nx-feature');
    await expect(feature).toHaveClass(/is-live/);
    await expect(feature.locator('[data-nx-kicker]')).toHaveText('Airing now');
    await expect(feature.locator('[data-nx-clock]')).toHaveText('On now');

    await expect(widget(page).locator('.nx-day')).toHaveCount(1);
    await expect(widget(page).locator('.nx-clash')).toHaveText(/Alpha Drama and Bravo Drama air at \d{1,2}:00\s[AP]M\. Time to pick one!/);
    const items = widget(page).locator('.nx-item');
    await expect(items.nth(0).locator('.nx-badge')).toHaveText('Premiere');
    await expect(items.nth(0).locator('.nx-badge')).toHaveAttribute('title', 'Season premiere');
    // The second show in the slot doesn't repeat the time.
    await expect(items.nth(0).locator('.nx-item__time')).toHaveText(/^\d{1,2}:00\s*[AP]M$/);
    await expect(items.nth(1).locator('.nx-item__time')).toHaveText('');
  });

  test('Add to calendar downloads an event for the Up next episode', async ({ page }) => {
    await page.goto('/');
    await heart(page, 'Alpha Drama').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      widget(page).getByRole('button', { name: 'Add Alpha Drama to your calendar' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('alpha-drama.ics');
    const ics = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
    expect(ics).toContain('SUMMARY:Alpha Drama (S2E5)');
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toContain('DESCRIPTION:S2 · E5 · The Return on CBS');
  });

  test('upcoming premieres still count down and open details', async ({ page }) => {
    await page.goto('/');
    const premieres = page.locator('[data-countdown-items]');
    await expect(premieres.locator('[data-countdown-idx]')).toHaveText([/Season 4 returns\s*Charlie Comedy/]);
    await expect(premieres.locator('[data-unit]')).toHaveText(['02', /^0[12]$/, /^\d\d$/, /^\d\d$/]);
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

test.describe('carousel', () => {
  const carousel = (page) => page.locator('[data-carousel]');
  const activeSlide = (page) => carousel(page).locator('.carousel__slide.is-active');
  // Speed autoplay up (a stylesheet !important beats the inline default).
  const fastAutoplay = (page) => page.addStyleTag({ content: '.carousel { --autoplay: 400ms !important; }' });

  test('ranks the slides and loads a wide backdrop where TVMaze has one', async ({ page }) => {
    await page.goto('/');
    await expect(activeSlide(page)).toHaveAttribute('aria-label', 'Alpha Drama');
    await expect(activeSlide(page).locator('.carousel__kicker')).toHaveText('#1 in Trending');
    await expect(activeSlide(page).locator('.carousel__genres li')).toHaveText(['Drama']);
    await expect(activeSlide(page).locator('.carousel__art')).toHaveAttribute('src', 'https://static.tvmaze.com/bg3.jpg');
    // Show 2 has no images, so it keeps the blurred poster.
    await expect(carousel(page).locator('[data-slide-idx="1"] .carousel__art')).toHaveCount(0);
  });

  test('the My list button toggles the watchlist', async ({ page }) => {
    await page.goto('/');
    const watch = activeSlide(page).locator('[data-slide-watch]');
    await watch.click();
    await expect(watch).toHaveAttribute('aria-pressed', 'true');
    await expect(watch).toHaveText('In your list');
    await expect(page.locator('[data-watchlist-count]')).toHaveText('1');
    await expect(modal(page)).toBeHidden();
  });

  test('autoplays, and pauses while hovered', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(0, 0);
    await fastAutoplay(page);
    await expect(activeSlide(page)).toHaveAttribute('aria-label', 'Bravo Drama');
    await expect(carousel(page).locator('[aria-selected="true"]')).toHaveAttribute('aria-label', 'Go to slide 2');

    await carousel(page).hover();
    const label = await activeSlide(page).getAttribute('aria-label');
    await page.waitForTimeout(1000);
    await expect(activeSlide(page)).toHaveAttribute('aria-label', label);
  });

  test('does not autoplay when reduced motion is preferred', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await fastAutoplay(page);
    await expect(activeSlide(page)).toHaveAttribute('aria-label', 'Alpha Drama');
    await expect(carousel(page)).not.toHaveClass(/is-playing/);
    await page.waitForTimeout(1000);
    await expect(activeSlide(page)).toHaveAttribute('aria-label', 'Alpha Drama');
  });

  test('"Surprise me" opens a show', async ({ page }) => {
    await page.goto('/');
    await activeSlide(page).waitFor();
    await carousel(page).getByRole('button', { name: /Surprise me/ }).click();
    await expect(modal(page)).toBeVisible();
    await expect(page.locator('[data-modal-title]')).toHaveText(new RegExp(SHOWS.map((s) => s.name).join('|')));
  });
});

test.describe('schedule', () => {
  const view = (page) => page.locator('[data-schedule]');
  const schedCards = (page) => view(page).locator('[data-sched-idx]');
  const tab = (page, name) => view(page).getByRole('link', { name });

  test('streaming lists each show once, most popular first, without news', async ({ page }) => {
    await page.goto('/#/schedule/streaming');
    await expect(view(page).locator('[data-schedule-title]')).toHaveText('New on streaming');
    await expect(tab(page, 'Streaming')).toHaveAttribute('aria-current', 'page');
    await expect(schedCards(page)).toHaveText([
      /Delta Drama\s*Netflix\s*S2 · 3 episodes/,
      /Alpha Drama\s*Peacock\s*S1 · E4 · Streamed First/,
    ]);
    await expect(view(page).locator('[data-schedule-status]')).toHaveText(/^2 shows · /);

    await schedCards(page).first().click();
    await expect(page.locator('[data-modal-title]')).toHaveText('Delta Drama');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/schedule\/streaming$/);
    await expect(schedCards(page)).toHaveCount(2);
  });

  test('tabs switch between TV and streaming', async ({ page }) => {
    await page.goto('/#/schedule');
    await expect(view(page).locator('[data-schedule-title]')).toHaveText('On tonight');
    await expect(schedCards(page)).toHaveText([/Charlie Comedy\s*BBC One\s*S4 · E1/]);

    await tab(page, 'Streaming').click();
    await expect(page).toHaveURL(/#\/schedule\/streaming$/);
    await expect(schedCards(page)).toHaveCount(2);

    await page.goBack();
    await expect(tab(page, 'On TV')).toHaveAttribute('aria-current', 'page');
    await expect(schedCards(page)).toHaveText([/Charlie Comedy/]);
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
  const quiz = (page) => widget(page).locator('.quiz');
  const action = (page) => widget(page).locator('[data-trivia-more]');
  const streak = (page) => widget(page).locator('[data-quiz-streak]');
  const kindOf = (page) => quiz(page).getAttribute('data-quiz');

  // Delta Drama's poster is broken in the fixtures, and a poster zoom of it
  // skips itself; serve it here so questions only change when a test says so.
  test.beforeEach(({ page }) => page.route(BROKEN_IMG, (route) => route.fulfill({ path: 'img/noimg.jpg' })));

  async function nextQuestion(page) {
    const n = Number(await quiz(page).getAttribute('data-quiz-n'));
    await action(page).click();
    await expect(quiz(page)).toHaveAttribute('data-quiz-n', String(n + 1));
    await expect(action(page)).toBeEnabled();
  }

  // The right answer, worked out from the fixtures. Character questions can't be
  // (every fixture show has the same cast), so those are skipped first.
  async function correctAnswer(page) {
    while ((await kindOf(page)) === 'character') await nextQuestion(page);
    const kind = await kindOf(page);
    if (kind === 'year') return '2020';
    if (kind === 'poster') {
      const src = await widget(page).locator('.quiz__poster').getAttribute('src');
      return SHOWS.find((s) => s.image.medium === src).name;
    }
    if (kind === 'network') {
      const name = await widget(page).locator('.quiz__q strong').textContent();
      const show = SHOWS.find((s) => s.name === name);
      return (show.network || show.webChannel).name;
    }
    throw new Error(`unexpected question kind ${kind}`);
  }
  const option = (page, label) => widget(page).locator('[data-quiz-opt]').filter({ has: page.getByText(label, { exact: true }) });

  test('asks every kind the home page shows support, once per round', async ({ page }) => {
    await page.goto('/');
    await expect(quiz(page)).toBeVisible();
    // All fixture shows premiered in 2020 with the same rating, so "Which came
    // first?" and "Higher rated?" can't be asked; the other four come up once each.
    const kinds = [await kindOf(page)];
    for (let i = 0; i < 3; i++) {
      await nextQuestion(page);
      kinds.push(await kindOf(page));
    }
    expect(kinds.sort()).toEqual(['character', 'network', 'poster', 'year']);
    await expect(widget(page).locator('[data-quiz-opt]')).toHaveCount(3);
    await expect(action(page)).toHaveText('Skip');
  });

  test('a right answer builds the streak, a wrong one resets it, and the best is kept', async ({ page }) => {
    await page.goto('/');
    await expect(quiz(page)).toBeVisible();

    for (const n of [1, 2]) {
      const right = await correctAnswer(page);
      await option(page, right).click();
      await expect(option(page, right)).toHaveClass(/is-correct/);
      await expect(widget(page).locator('.quiz__verdict')).toHaveText('Correct!');
      await expect(streak(page)).toHaveText(String(n));
      await expect(action(page)).toHaveText('Next question');
      await expect(action(page)).toBeFocused();
      await nextQuestion(page);
    }

    const right = await correctAnswer(page);
    const wrong = widget(page).locator('[data-quiz-opt]').filter({ hasNotText: right }).first();
    await wrong.click();
    await expect(wrong).toHaveClass(/is-wrong/);
    await expect(option(page, right)).toHaveClass(/is-correct/);
    await expect(widget(page).locator('.quiz__verdict')).toHaveText('Not quite.');
    await expect(streak(page)).toHaveText('0');
    // Every option is locked once answered.
    await expect(widget(page).locator('[data-quiz-opt]:enabled')).toHaveCount(0);
    await expect(widget(page).locator('[data-quiz-stats]')).toHaveText('Best streak 2 · 2 of 3 right');

    await page.reload();
    await expect(widget(page).locator('[data-quiz-stats]')).toHaveText('Best streak 2 · 2 of 3 right');
  });

  test('cheers at three in a row', async ({ page }) => {
    await page.goto('/');
    await expect(quiz(page)).toBeVisible();
    for (let n = 1; n <= 3; n++) {
      await option(page, await correctAnswer(page)).click();
      if (n < 3) await nextQuestion(page);
    }
    await expect(page.locator('.toast')).toContainText('3 in a row. Hat trick!');
  });

  test('the poster zoom reveals the whole poster once answered', async ({ page }) => {
    await page.goto('/');
    await expect(quiz(page)).toBeVisible();
    while ((await kindOf(page)) !== 'poster') await nextQuestion(page);
    const art = widget(page).locator('[data-quiz-art]');
    await expect(art).not.toHaveClass(/is-revealed/);
    await widget(page).locator('[data-quiz-opt]').first().click();
    await expect(art).toHaveClass(/is-revealed/);
  });

  test('a poster zoom whose image fails to load skips to another question', async ({ page }) => {
    // With every poster broken, no poster zoom should stay on screen.
    await page.route('https://static.tvmaze.com/**', (route) => route.fulfill({ status: 404 }));
    await page.goto('/');
    await expect(quiz(page)).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await expect(async () => expect(await kindOf(page)).not.toBe('poster')).toPass();
      await action(page).click();
      await expect(action(page)).toBeEnabled();
    }
  });

  test('show names in the reveal open their details', async ({ page }) => {
    await page.goto('/');
    await expect(quiz(page)).toBeVisible();
    // Names only become links after answering, so they can't give the answer away.
    await expect(widget(page).locator('[data-trivia-show]')).toHaveCount(0);
    await widget(page).locator('[data-quiz-opt]').first().click();
    const link = widget(page).locator('[data-quiz-reveal] [data-trivia-show]').first();
    const name = await link.textContent();
    await link.click();
    await expect(page.locator('[data-modal-title]')).toHaveText(name);
  });
});

test.describe('genre filter', () => {
  const GENRES = ['Drama', 'Comedy', 'Action', 'Crime', 'Thriller', 'Science-Fiction', 'Romance', 'Horror',
    'Mystery', 'Fantasy', 'Family', 'Adventure', 'Supernatural', 'History', 'Music', 'War', 'Western',
    'Anime', 'Medical', 'Legal'];
  // 40 shows; genre k is in 40 − 2k of them (Drama 40 … Legal 2), so the order is predictable.
  const manyGenres = (page) => page.route('https://api.tvmaze.com/shows?page=1', (route) => route.fulfill({
    json: Array.from({ length: 40 }, (_, i) => ({
      ...SHOWS[0], id: 200 + i, name: `Show ${i}`,
      genres: GENRES.filter((_, k) => i < 40 - 2 * k),
    })),
  }));
  const bar = (page) => page.locator('[data-genre-filter]');
  const visiblePills = (page) => bar(page).locator('.genre-pill:visible');
  const more = (page) => bar(page).locator('[data-genre-more]');
  const rows = (page) => bar(page).evaluate((el) =>
    new Set([...el.children].filter((c) => !c.hidden).map((c) => c.offsetTop)).size);

  test('shows two rows of the most common genres, with the rest behind "+N more"', async ({ page }) => {
    await manyGenres(page);
    await page.goto('/');
    await expect(more(page)).toBeVisible();
    expect(await rows(page)).toBe(2);
    await expect(visiblePills(page).first()).toHaveText(/^\s*All/);
    await expect(visiblePills(page).nth(1)).toHaveText(/^\s*Drama/);

    const total = await bar(page).locator('.genre-pill').count();
    const shown = await visiblePills(page).count();
    await expect(more(page)).toHaveText(`+${total - shown} more`);
    await expect(more(page)).toHaveAttribute('aria-expanded', 'false');

    await more(page).click();
    await expect(visiblePills(page)).toHaveCount(total);
    await expect(more(page)).toHaveText('Show fewer');
    await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(more(page)).toHaveAccessibleName('Show fewer');

    await more(page).click();
    await expect(visiblePills(page)).toHaveCount(shown);
  });

  test('a genre picked from the expanded list stays visible when collapsed', async ({ page }) => {
    await manyGenres(page);
    await page.goto('/');
    await more(page).click();
    const legal = bar(page).locator('.genre-pill', { hasText: 'Legal' });
    await legal.click();
    await expect(legal).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-result-count]')).toHaveText('2 shows');

    await more(page).click();
    await expect(legal).toBeVisible();
    expect(await rows(page)).toBe(2);
  });

  test('stays at two rows on a phone, and after being hidden on load', async ({ page }) => {
    await manyGenres(page);
    await page.setViewportSize({ width: 400, height: 800 });
    // Start on another view, so the bar is hidden while it's first built.
    await page.goto('/#/watchlist');
    await page.locator('[data-nav="home"]').click();
    await expect(more(page)).toBeVisible();
    expect(await rows(page)).toBe(2);
  });

  test('has no "more" button when every genre fits', async ({ page }) => {
    await page.goto('/');
    await expect(visiblePills(page)).toHaveText([/^\s*All/, /^\s*Drama/, /^\s*Comedy/, /^\s*Crime/]);
    await expect(more(page)).toBeHidden();
  });
});

test.describe('back to top button', () => {
  const button = (page) => page.locator('[data-to-top]');
  const ringOffset = (page) => page.locator('[data-to-top-ring]').evaluate((el) => Number(el.style.strokeDashoffset));

  test('appears after scrolling down, tracks progress, and returns to the top', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/');
    await expect(cards(page)).toHaveCount(SHOWS.length);
    await expect(button(page)).toBeHidden();

    await page.mouse.wheel(0, 900);
    await expect(button(page)).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/has-to-top/);
    const partway = await ringOffset(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => ringOffset(page)).toBeLessThan(partway);
    await expect.poll(() => ringOffset(page)).toBeCloseTo(0, 1);

    await button(page).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(button(page)).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/has-to-top/);
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
