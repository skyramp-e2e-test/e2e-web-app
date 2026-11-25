// Items page empty-state message (EWA-8 AC1, AC2) and the Add item button (requirements.csv AC1).
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import type { Page, Route } from "@playwright/test";
import { ItemsPage, baseUrl } from "../items-page";

const pageTimeout = 15000;

/** Answers GET /api/items with an empty list (the shared app has no delete route); other methods reach the server. */
async function stubEmptyList(page: Page, onlyFirst: boolean): Promise<void> {
  let stubbed = 0;
  await page.route("**/api/items", async (route: Route) => {
    if (route.request().method() === "GET" && (!onlyFirst || stubbed === 0)) {
      stubbed += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.continue();
  });
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(pageTimeout);
});

// EWA-8 AC1
test("empty list shows the No items yet message and no rows", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.signIn();
  await stubEmptyList(page, false);
  await items.open();
  await expect(items.emptyMessage).toBeVisible();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(items.rows).toHaveCount(0);
});

// EWA-8 AC2
test("adding an item from the empty state hides the message without a reload", async ({ page }) => {
  const items = new ItemsPage(page);
  const name = `EWA-8 R2a ${Date.now()}`;
  await items.signIn();
  await stubEmptyList(page, true);
  await items.open();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(items.emptyMessage).toBeVisible();
  await items.page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  const response = await items.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  await expect(items.emptyMessage).toBeHidden();
  await expect(items.row(name)).toHaveCount(1);
  await expect(items.row(name)).toBeVisible();
  await expect(items.error).toBeHidden();
  await expect(items.nameInput).toHaveValue("");
  expect(await items.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

// EWA-8 AC2
test("the message is hidden on load when an item exists", async ({ page, request }) => {
  const name = `EWA-8 R2b ${Date.now()}`;
  const created = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(created.status()).toBe(201);

  const items = new ItemsPage(page);
  await items.signIn();
  await items.open();
  await expect(items.row(name)).toBeVisible();
  await expect(items.emptyMessage).toBeHidden();
});

// EWA-8 AC2
test("a refused add of a blank name keeps the message shown", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.signIn();
  await stubEmptyList(page, false);
  await items.open();
  await expect(items.emptyMessage).toHaveText("No items yet");

  const response = await items.add("   ");
  checkRequestPayload(response.request().postDataJSON(), { name: "   " });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "name is required" });

  await expect(items.error).toBeVisible();
  await expect(items.error).toHaveText("name is required");
  await expect(items.emptyMessage).toBeVisible();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(items.rows).toHaveCount(0);
});

// requirements.csv AC1
test("Add item button lists the trimmed name after the earlier rows and keeps it after a reload", async ({ page, request }) => {
  const ts = Date.now();
  const prior = `CSV R1 prior ${ts}`;
  const added = `CSV R1 new ${ts}`;
  const created = await request.post(`${baseUrl}/api/items`, { data: { name: prior } });
  expect(created.status()).toBe(201);

  const items = new ItemsPage(page);
  await items.signIn();
  await items.open();
  await expect(items.row(prior)).toBeVisible();
  const before = await items.rows.allTextContents();

  const response = await items.add(`  ${added}  `);
  checkRequestPayload(response.request().postDataJSON(), { name: `  ${added}  ` });
  expect(response.status()).toBe(201);
  // Other tests may add rows at the same time: check this test's rows and the rows listed before, in id order.
  const ours = (texts: string[]) => texts.filter((t) => before.includes(t) || t === added);
  await expect.poll(async () => ours(await items.rows.allTextContents())).toEqual([...before, added]);
  await expect(items.row(added)).toBeVisible();

  await items.open();
  await expect.poll(async () => ours(await items.rows.allTextContents())).toEqual([...before, added]);
  await expect(items.row(added)).toHaveCount(1);
});
