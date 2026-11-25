// Browser tests of the Items page (/items): empty-state text, heading, adding items and the list order.
// Drafted with the Skyramp walk helper, then extended by hand.
import { test, expect, checkRequestPayload, getBaseUrl, newSkyrampPlaywrightPage } from '@skyramp/skyramp';
import type { APIRequestContext, Page } from '@playwright/test';

const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');

// The API has no delete route, so items made here stay; the prefix makes them easy to find.
const PREFIX = 'Testbot items';
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Item = { id: number; name: string; created_at: string };

async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return res.json();
}

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return res.json();
}

// Answers GET /api/items with the stored items whose name holds `tag`, so the page sees only what this test made.
async function showOnlyItemsTagged(page: Page, tag: string) {
  await page.route('**/api/items', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const items: Item[] = await res.json();
    await route.fulfill({ response: res, json: items.filter((i) => i.name.includes(tag)) });
  });
}

async function openItems(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/items') && r.request().method() === 'GET');
  await page.goto(`${baseUrl}/items`);
  await loaded;
}

async function addItemThroughForm(page: Page, name: string) {
  await page.getByLabel('New item').fill(name);
  const posted = page.waitForResponse((r) => r.url().endsWith('/api/items') && r.request().method() === 'POST');
  const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/items') && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'Add item' }).click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
  await reloaded;
}

test.describe('Items page', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(10000);
  });

  test('shows No items yet and an empty list when the API returns no items', async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    await page.route('**/api/items', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, json: [] }) : route.fallback());
    await openItems(page);

    await expect(page.getByTestId('items-empty')).toBeVisible();
    await expect(page.getByTestId('items-empty')).toHaveText('No items yet');
    await expect(page.getByTestId('items-list').getByTestId('item')).toHaveCount(0);
  });

  test('hides the empty-state text when the API returns one item', async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    await page.route('**/api/items', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, json: [{ id: 1, name: 'Only item', created_at: '2026-01-01T00:00:00Z' }] })
        : route.fallback());
    await openItems(page);

    await expect(page.getByTestId('item')).toHaveText(['Only item']);
    await expect(page.getByTestId('items-empty')).toBeHidden();
  });

  test('hides the empty-state text when stored items exist', async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `${PREFIX} empty-state check ${unique()}`;
    await createItem(request, name);
    await openItems(page);

    await expect(page.getByTestId('item').filter({ hasText: name })).toHaveText([name]);
    await expect(page.getByTestId('items-empty')).toBeHidden();
    const apiNames = (await listItems(request)).map((i) => i.name);
    await expect(page.getByTestId('item')).toHaveText(apiNames);
  });

  test('adding the first item hides the empty-state text, also after a reload', async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const tag = unique();
    const name = `${PREFIX} first ${tag}`;
    await showOnlyItemsTagged(page, tag);
    await openItems(page);
    await expect(page.getByTestId('items-empty')).toHaveText('No items yet');
    await expect(page.getByTestId('items-empty')).toBeVisible();
    await expect(page.getByTestId('item')).toHaveCount(0);

    await addItemThroughForm(page, name);
    await expect(page.getByTestId('items-empty')).toBeHidden();
    await expect(page.getByTestId('item')).toHaveText([name]);

    const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/items'));
    await page.reload();
    await reloaded;
    await expect(page.getByTestId('items-empty')).toBeHidden();
    await expect(page.getByTestId('item')).toHaveText([name]);
  });

  test('heading reads Items', async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    await openItems(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Items');
  });

  test('Add item shows the typed name at the end of the list and keeps it after a reload', async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `${PREFIX} Widget ${unique()}`;
    await openItems(page);

    await test.step('add the item without a reload', async () => {
      await addItemThroughForm(page, name);
      // A new item has the highest id, so it ends the stored list, and the page shows that list as stored.
      const apiNames = (await listItems(request)).map((i) => i.name);
      expect(apiNames[apiNames.length - 1]).toBe(name);
      await expect(page.getByTestId('item')).toHaveText(apiNames);
      await expect(page.getByLabel('New item')).toHaveValue('');
      await expect(page.getByTestId('item-error')).toBeHidden();
    });

    await test.step('the item is still listed after a reload', async () => {
      const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/items'));
      await page.reload();
      await reloaded;
      await expect(page.getByTestId('item').filter({ hasText: name })).toHaveText([name]);
      expect((await listItems(request)).filter((i) => i.name === name)).toHaveLength(1);
    });
  });

  test('lists every stored item once, in the order the API returns them', async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const tag = unique();
    const a = await createItem(request, `${PREFIX} A ${tag}`);
    const b = await createItem(request, `${PREFIX} B ${tag}`);
    await openItems(page);

    const apiItems = await listItems(request);
    expect(apiItems.map((i) => i.id)).toEqual([...apiItems.map((i) => i.id)].sort((x, y) => x - y));
    await expect(page.getByTestId('item')).toHaveText(apiItems.map((i) => i.name));
    const shown = await page.getByTestId('item').allTextContents();
    expect(shown.filter((n) => n === a.name)).toHaveLength(1);
    expect(shown.filter((n) => n === b.name)).toHaveLength(1);
    expect(shown.indexOf(a.name)).toBeLessThan(shown.indexOf(b.name));
  });

  test('journey: open the empty Items page from the nav, add two items and see them kept', async ({ page, request }) => {
    test.setTimeout(60000);
    page = newSkyrampPlaywrightPage(page);
    const tag = unique();
    const first = `${PREFIX} First item ${tag}`;
    const second = `${PREFIX} Second item ${tag}`;
    // The journey starts on an empty list: it needs a fresh app whose items table is empty.

    await test.step('1. open Items from the nav', async () => {
      await page.goto(`${baseUrl}/`);
      const loaded = page.waitForResponse((r) => r.url().endsWith('/api/items'));
      await page.getByTestId('nav-items').click();
      await expect(page).toHaveURL(`${baseUrl}/items`);
      await loaded;
    });

    await test.step('2. the empty page shows its heading and the empty-state text', async () => {
      await expect.soft(page.getByRole('heading', { name: 'Items', level: 1 })).toHaveText('Items');
      await expect.soft(page.getByTestId('items-empty')).toHaveText('No items yet');
      await expect.soft(page.getByTestId('items-empty')).toBeVisible();
      await expect.soft(page.getByTestId('item')).toHaveCount(0);
    });

    await test.step('3. add the first item', async () => {
      await addItemThroughForm(page, first);
      await expect.soft(page.getByTestId('item')).toHaveText([first]);
      await expect.soft(page.getByTestId('items-empty')).toBeHidden();
      await expect.soft(page.getByLabel('New item')).toHaveValue('');
      await expect.soft(page.getByTestId('item-error')).toBeHidden();
    });

    await test.step('4. reload keeps the first item', async () => {
      const loaded = page.waitForResponse((r) => r.url().endsWith('/api/items'));
      await page.reload();
      await loaded;
      await expect.soft(page.getByTestId('item')).toHaveText([first]);
      await expect.soft(page.getByTestId('items-empty')).toBeHidden();
    });

    await test.step('5. add the second item', async () => {
      await addItemThroughForm(page, second);
      const mine = page.getByTestId('item').filter({ hasText: tag });
      await expect.soft(mine).toHaveText([first, second]);
      await expect.soft(page.getByTestId('items-empty')).toBeHidden();
    });

    await test.step('outcome after a reload', async () => {
      const loaded = page.waitForResponse((r) => r.url().endsWith('/api/items'));
      await page.reload();
      await loaded;
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Items');
      await expect(page.getByTestId('items-empty')).toBeHidden();
      // The page lists what is stored; on a fresh database that is exactly the two items added here.
      const apiNames = (await listItems(request)).map((i) => i.name);
      await expect(page.getByTestId('item')).toHaveText(apiNames);
      await expect(page.getByTestId('item').filter({ hasText: tag })).toHaveText([first, second]);
      await expect(page.getByLabel('New item')).toHaveValue('');
      await expect(page.getByTestId('item-error')).toBeHidden();
    });
  });
});
