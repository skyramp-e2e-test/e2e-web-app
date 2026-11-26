// Items page add-item form and the item-name limit (EWA-10 AC1, AC2). Recorded with the Skyramp walk helper.
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from '@skyramp/skyramp';
import type { Page } from '@playwright/test';
import { uniqueItemName, ITEM_NAME_LIMIT } from '../support/item-names';

const pageTimeout = 15000;
const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');

test.use({ viewport: { width: 1280, height: 900 } });

function credentials() {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) throw new Error('SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set');
  return { username, password };
}

async function openSignedIn(rawPage: Page): Promise<Page> {
  rawPage.setDefaultTimeout(pageTimeout);
  const page = newSkyrampPlaywrightPage(rawPage);
  const { username, password } = credentials();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Email').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId('user-status')).toHaveText(`Signed in as ${username}`);
  return page;
}

/** Types a name, clicks Add item, checks the request body sent, and returns the POST's status. */
async function addItem(page: Page, name: string): Promise<number> {
  await page.getByTestId('item-name-input').fill(name);
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/items') && r.request().method() === 'POST',
  );
  await page.getByTestId('add-item-submit').click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response.status();
}

const itemsNamed = (page: Page, name: string) =>
  page.getByTestId('items-list').getByTestId('item').filter({ hasText: new RegExp(`^${name}$`) });

test('a 61-character name on the Items page shows the limit message and is not listed', async ({ page: rawPage }) => {
  // EWA-10 AC1 (AC1d); defect F1
  const page = await openSignedIn(rawPage);
  const name = uniqueItemName(ITEM_NAME_LIMIT + 1, 'b');
  await addItem(page, name);
  await expect.soft(page.getByTestId('item-error')).toBeVisible();
  await expect.soft(page.getByTestId('item-error')).toContainText(/\b60\b/);
  await expect.soft(itemsNamed(page, name)).toHaveCount(0);
  const listLoaded = page.waitForResponse(
    (r) => r.url().endsWith('/api/items') && r.request().method() === 'GET',
  );
  await page.reload();
  await listLoaded;
  await expect(itemsNamed(page, name)).toHaveCount(0);
});

test('a 60-character name on the Items page is added and shown without a reload', async ({ page: rawPage }) => {
  // EWA-10 AC2 (AC2c)
  const page = await openSignedIn(rawPage);
  const name = uniqueItemName(ITEM_NAME_LIMIT, 'c');
  expect(await addItem(page, name)).toBe(201);
  await expect(itemsNamed(page, name)).toHaveCount(1);
  await expect(page.getByTestId('item-name-input')).toHaveValue('');
  await expect(page.getByTestId('item-error')).toBeHidden();
  await page.reload();
  await expect(itemsNamed(page, name)).toHaveCount(1);
});

test('add items on the Items page within and past the name limit', async ({ page: rawPage }) => {
  // Journey J1: EWA-10 AC1 (AC1d), AC2 (AC2c)
  let page = rawPage;
  const tooLong = uniqueItemName(ITEM_NAME_LIMIT + 1, 'b');
  const atLimit = uniqueItemName(ITEM_NAME_LIMIT, 'c');

  await test.step('1. sign in and land on the Items page', async () => {
    page = await openSignedIn(rawPage);
  });

  await test.step('2. a 61-character name is refused with the limit message', async () => {
    await addItem(page, tooLong);
    await expect.soft(page.getByTestId('item-error')).toBeVisible();
    await expect.soft(page.getByTestId('item-error')).toContainText(/\b60\b/);
    await expect.soft(itemsNamed(page, tooLong)).toHaveCount(0);
  });

  await test.step('3. a 60-character name is added and shown', async () => {
    expect.soft(await addItem(page, atLimit)).toBe(201);
    await expect.soft(itemsNamed(page, atLimit)).toHaveCount(1);
    await expect.soft(page.getByTestId('item-name-input')).toHaveValue('');
    await expect.soft(page.getByTestId('item-error')).toBeHidden();
  });

  await test.step('outcome: after a reload only the 60-character name is listed', async () => {
    await page.reload();
    await expect(page.getByTestId('user-status')).toHaveText(`Signed in as ${credentials().username}`);
    await expect.soft(itemsNamed(page, atLimit)).toHaveCount(1);
    await expect.soft(itemsNamed(page, tooLong)).toHaveCount(0);
  });
});
