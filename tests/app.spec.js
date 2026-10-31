import { test, expect, SHOWS } from './fixtures.js';

const cards = (page) => page.locator('[data-shows-grid] [data-show-card]');
const modal = (page) => page.locator('[data-modal]');

test('browse grid lists shows', async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(SHOWS.length);
  await expect(page.locator('[data-result-count]')).toHaveText(`${SHOWS.length} shows`);
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
