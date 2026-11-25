// Browser tests of the Items page: adding items, keeping them across a reload (EWA-9 AC1),
// and refusing an empty name with a clear message (EWA-9 AC2).
// Started from Skyramp walk drafts; the request-body checks of those drafts are kept.
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from '@skyramp/skyramp';
import type { Page, Response } from '@playwright/test';

const pageTimeout = 15000;
const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');
const NAME_REQUIRED = /name is required/i;

test.use({ viewport: { width: 1280, height: 900 } });

const isItemsList = (r: Response) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/items';
const isItemsPost = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/items';

/** The Items page: its add-item form, error line and list. */
class ItemsPage {
  constructor(readonly page: Page) {}
  get userStatus() { return this.page.getByTestId('user-status'); }
  get nameInput() { return this.page.getByLabel('New item'); }
  get addButton() { return this.page.getByRole('button', { name: 'Add item' }); }
  get error() { return this.page.getByTestId('item-error'); }
  get items() { return this.page.getByTestId('items-list').getByTestId('item'); }

  /** Signs in through /login, landing on /items with its list loaded. */
  async signIn() {
    const username = process.env.SKYRAMP_UI_USERNAME;
    const password = process.env.SKYRAMP_UI_PASSWORD;
    if (!username || !password) throw new Error('SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set');
    await this.page.goto(`${baseUrl}/login`);
    await this.page.getByLabel('Email').fill(username);
    await this.page.getByLabel('Password').fill(password);
    const listed = this.page.waitForResponse(isItemsList);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
    await listed;
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
    await expect(this.userStatus).toHaveText(`Signed in as ${username}`);
  }

  /** Reloads /items and waits for its list to load. */
  async reload() {
    const listed = this.page.waitForResponse(isItemsList);
    await this.page.goto(`${baseUrl}/items`);
    await listed;
  }

  /** Reloads the page in place (the browser's reload) and waits for its list to load. */
  async reloadInPlace() {
    const listed = this.page.waitForResponse(isItemsList);
    await this.page.reload();
    await listed;
  }

  /** The names in the list, once its last load has been drawn. */
  async names(): Promise<string[]> {
    return this.items.allTextContents();
  }

  /** Clicks Add item and waits for the POST and, when it is accepted, the list reload that follows. */
  async submit(): Promise<Response> {
    const posted = this.page.waitForResponse(isItemsPost);
    const listed = this.page.waitForResponse(isItemsList);
    await this.addButton.click();
    const post = await posted;
    if (post.ok()) await listed;
    else listed.catch(() => undefined);
    return post;
  }
}

const blanks = (names: string[]) => names.filter((n) => n.trim() === '').length;

async function openItems(page: Page): Promise<ItemsPage> {
  page.setDefaultTimeout(pageTimeout);
  const items = new ItemsPage(newSkyrampPlaywrightPage(page) as Page);
  await items.signIn();
  return items;
}

test('a name added on the Items page is still listed after a reload', async ({ page }) => {
  const items = await openItems(page);
  const name = `Lamp-${Date.now()}`;
  const before = await items.names();

  await items.nameInput.fill(name);
  const post = await items.submit();
  checkRequestPayload(post.request().postDataJSON(), { name });
  expect(post.status()).toBe(201);
  await expect(items.items).toHaveText([...before, name]);

  await items.reload();
  const after = await items.names();
  expect(after).toEqual([...before, name]);
  expect(after.filter((n) => n === name)).toHaveLength(1);
});

test('submitting an empty name shows a name-required error and adds nothing', async ({ page }) => {
  const items = await openItems(page);
  const before = await items.names();

  await expect(items.nameInput).toHaveValue('');
  const post = await items.submit();
  checkRequestPayload(post.request().postDataJSON(), { name: '' });
  await expect.soft(items.error).toBeVisible();
  await expect.soft(items.error).toHaveText(NAME_REQUIRED);
  const shown = await items.names();
  expect.soft(shown).toEqual(before);
  expect.soft(blanks(shown)).toBe(blanks(before));

  await items.reload();
  const after = await items.names();
  expect(after).toEqual(before);
  expect(blanks(after)).toBe(blanks(before));
});

test('submitting a name of only spaces shows a name-required error and adds nothing', async ({ page }) => {
  const items = await openItems(page);
  const before = await items.names();

  await items.nameInput.fill('   ');
  const post = await items.submit();
  checkRequestPayload(post.request().postDataJSON(), { name: '   ' });
  await expect.soft(items.error).toBeVisible();
  await expect.soft(items.error).toHaveText(NAME_REQUIRED);
  const shown = await items.names();
  expect.soft(shown).toEqual(before);
  expect.soft(blanks(shown)).toBe(blanks(before));

  await items.reload();
  const after = await items.names();
  expect(after).toEqual(before);
  expect(blanks(after)).toBe(blanks(before));
});

test('a valid name after a refused empty one hides the error, clears the field and lists the item', async ({ page }) => {
  const items = await openItems(page);
  const name = `Pen-${Date.now()}`;

  // The empty submit is answered with the refusal the server gives for an empty name, so this test checks the
  // recovery on its own; whether the server refuses it is checked by the empty-name tests.
  const refuse = (route: import('@playwright/test').Route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'name is required' }) })
      : route.fallback();
  await page.route('**/api/items', refuse);
  await items.submit();
  await page.unroute('**/api/items', refuse);
  await expect(items.error).toBeVisible();
  await expect(items.error).toHaveText(NAME_REQUIRED);
  const before = await items.names();

  await items.nameInput.fill(name);
  const post = await items.submit();
  checkRequestPayload(post.request().postDataJSON(), { name });
  expect(post.status()).toBe(201);
  await expect(items.error).toBeHidden();
  await expect(items.nameInput).toHaveValue('');
  await expect(items.items).toHaveText([...before, name]);
});

test('journey: add an item and still see it after reloading the page', async ({ page }) => {
  page.setDefaultTimeout(pageTimeout);
  const items = new ItemsPage(newSkyrampPlaywrightPage(page) as Page);
  const name = `Lamp-${Date.now()}`;
  let before: string[] = [];

  await test.step('1. sign in at /login and land on /items', async () => {
    await items.signIn();
    before = await items.names();
  });

  await test.step('2. add a uniquely named item', async () => {
    await items.nameInput.fill(name);
    const post = await items.submit();
    checkRequestPayload(post.request().postDataJSON(), { name });
    await expect.soft(items.nameInput).toHaveValue('');
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.items).toHaveText([...before, name]);
  });

  await test.step('3. reload /items and see the item kept', async () => {
    await items.reloadInPlace();
    await expect(items.userStatus).toHaveText(`Signed in as ${process.env.SKYRAMP_UI_USERNAME}`);
    await expect(items.error).toBeHidden();
    const after = await items.names();
    expect(after).toEqual([...before, name]);
    expect(after).toHaveLength(before.length + 1);
  });
});

test('journey: try to add an item without a name, then add a real one', async ({ page }) => {
  page.setDefaultTimeout(pageTimeout);
  const items = new ItemsPage(newSkyrampPlaywrightPage(page) as Page);
  const name = `Pen-${Date.now()}`;
  let start: string[] = [];

  await test.step('1. sign in at /login and land on /items', async () => {
    await items.signIn();
    start = await items.names();
  });

  await test.step('2. submit with the name empty', async () => {
    await items.submit();
    await expect.soft(items.error).toBeVisible();
    await expect.soft(items.error).toHaveText(NAME_REQUIRED);
    expect.soft(await items.names()).toEqual(start);
  });

  await test.step('3. submit a name of only spaces', async () => {
    await items.nameInput.fill('   ');
    await items.submit();
    await expect.soft(items.error).toBeVisible();
    await expect.soft(items.error).toHaveText(NAME_REQUIRED);
    expect.soft(await items.names()).toEqual(start);
  });

  await test.step('4. reload /items: the list is as it was', async () => {
    await items.reloadInPlace();
    const after = await items.names();
    expect.soft(after).toEqual(start);
    expect.soft(blanks(after)).toBe(blanks(start));
  });

  let beforeAdd: string[] = [];
  await test.step('5. submit empty again, then add a real name', async () => {
    await items.submit();
    await expect.soft(items.error).toBeVisible();
    beforeAdd = await items.names();
    await items.nameInput.fill(name);
    const post = await items.submit();
    checkRequestPayload(post.request().postDataJSON(), { name });
    await expect(items.error).toBeHidden();
    await expect(items.nameInput).toHaveValue('');
    await expect(items.items).toHaveText([...beforeAdd, name]);
  });

  await test.step('outcome: after a reload the list is the start list plus the new item', async () => {
    await items.reloadInPlace();
    await expect(items.error).toBeHidden();
    await expect(items.nameInput).toHaveValue('');
    const after = await items.names();
    expect(after).toEqual([...start, name]);
    expect(blanks(after)).toBe(blanks(start));
  });
});
