// Items page: the item-name length limit (EWA-10 AC1, AC2). Recorded with the Skyramp walk helper, then
// fitted to the page objects in ../support/items-pages.ts. Names start with "nlimit-" and a run-unique id;
// .skyramp/cleanup/delete-name-limit-items.sh removes them (the app has no delete route).
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, LoginPage, uiCredentials } from "../support/items-pages";

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
  const { username, password } = uiCredentials();
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn(username, password);
  await expect(page).toHaveURL(/\/items$/);
  await expect(new ItemsPage(page).userStatus).toHaveText(`Signed in as ${username}`);
});

test("a 60-character name is added on the Items page and still listed after a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const name = `nlimit-ui-${runId}-ok-`.padEnd(60, "b");
  expect(name).toHaveLength(60);

  const response = await items.addItem(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  await expect(items.itemNamed(name)).toHaveCount(1);
  await expect(items.itemNamed(name)).toHaveText(name);
  await expect(items.nameInput).toHaveValue("");
  await expect(items.error).toBeHidden();

  await page.reload();
  await expect(items.itemNamed(name)).toHaveCount(1);
});

test("a 61-character name is refused on the Items page with a message stating 60", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const name = `nlimit-ui-${runId}-long-`.padEnd(61, "c");
  expect(name).toHaveLength(61);

  const response = await items.addItem(name);
  checkRequestPayload(response.request().postDataJSON(), { name });

  await expect.soft(items.error).toBeVisible();
  await expect.soft(items.error).toContainText("60");
  await expect(items.itemNamed(name)).toHaveCount(0);
});
