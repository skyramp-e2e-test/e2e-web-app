// Browser tests of the Items page empty-state message (EWA-8 AC1, EWA-8 AC2)
// and requirements.csv AC1.
import { execFileSync } from "child_process";
import { test, expect, type Page, type Response } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";
// The PostgreSQL container docker-compose.yml starts (project e2ewebapp).
const dbContainer = process.env.E2E_DB_CONTAINER || "e2ewebapp-db-1";
// Every item these tests create ends with this tag, so cleanup finds only them.
const runTag = `tb-es-${Date.now()}`;

// The empty state needs the whole items table empty, so these tests share it one at a time.
test.describe.configure({ mode: "serial" });

function psql(sql: string): string {
  return execFileSync("docker", ["exec", dbContainer, "psql", "-U", "app", "-d", "app", "-At", "-c", sql]).toString();
}

// The app has no delete endpoint: empty the items table through the database.
async function resetItems(page: Page): Promise<void> {
  psql("TRUNCATE items RESTART IDENTITY");
  const res = await page.request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual([]);
}

function waitForAddItem(page: Page): Promise<Response> {
  return page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
}

async function addItem(page: Page, name: string): Promise<Response> {
  await page.getByLabel("New item").fill(name);
  const responsePromise = waitForAddItem(page);
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response;
}

async function openItemsPage(page: Page): Promise<void> {
  const loaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  await page.goto(`${baseUrl}/items`);
  await loaded;
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
});

test.afterAll(() => {
  psql(`DELETE FROM items WHERE name LIKE '% ${runTag}'`);
});

test("shows the empty-state message when there are no items", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await resetItems(page);

  await page.goto(`${baseUrl}/`);
  await page.getByTestId("nav-items").click();
  await expect(page).toHaveURL(`${baseUrl}/items`);

  await expect(page.getByTestId("items-empty")).toBeVisible();
  await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
  await expect(page.getByTestId("item")).toHaveCount(0);
});

test("hides the empty-state message right after the first item is added", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await resetItems(page);
  const name = `First item ${runTag}`;

  await openItemsPage(page);
  await expect(page.getByTestId("items-empty")).toBeVisible();

  let navigated = false;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigated = true;
  });
  const response = await addItem(page, name);
  expect(response.status()).toBe(201);

  await expect(page.getByTestId("item")).toHaveCount(1);
  await expect(page.getByTestId("item")).toHaveText([name]);
  await expect(page.getByTestId("items-empty")).toBeHidden();
  expect(navigated).toBe(false);
});

test("keeps the empty-state message when an add is refused", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await resetItems(page);

  await openItemsPage(page);
  await expect(page.getByTestId("items-empty")).toBeVisible();

  const response = await addItem(page, "   ");
  expect(response.status()).toBe(400);

  await expect(page.getByTestId("item-error")).toBeVisible();
  await expect(page.getByTestId("item-error")).toHaveText("name is required");
  await expect(page.getByTestId("item")).toHaveCount(0);
  await expect(page.getByTestId("items-empty")).toBeVisible();
  await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
});

test("lists a new item right after it is submitted from the form", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const tagged = `Added item ${runTag}`;

  await openItemsPage(page);
  const response = await addItem(page, tagged);
  expect(response.status()).toBe(201);
  expect((await response.json()).name).toBe(tagged);

  await expect(page.getByTestId("item").filter({ hasText: tagged })).toHaveCount(1);
  await expect(page.getByTestId("item").filter({ hasText: tagged })).toHaveText(tagged);
  await expect(page.getByLabel("New item")).toHaveValue("");
  await expect(page.getByTestId("item-error")).toBeHidden();
});

test("does not show the empty-state message after reloading with an item added through the form", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await resetItems(page);
  const name = `First item ${runTag}`;

  await openItemsPage(page);
  expect((await addItem(page, name)).status()).toBe(201);
  await expect(page.getByTestId("item")).toHaveText([name]);

  await openItemsPage(page);
  await expect(page.getByTestId("item")).toHaveCount(1);
  await expect(page.getByTestId("item")).toHaveText([name]);
  await expect(page.getByTestId("items-empty")).toHaveCount(1);
  await expect(page.locator("[data-testid=items-empty]:visible")).toHaveCount(0);
});

test("does not show the empty-state message when the page opens with an existing item", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Seeded item ${runTag}`;
  const created = await page.request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(created.status()).toBe(201);

  await openItemsPage(page);
  await expect(page.getByTestId("item").filter({ hasText: name })).toHaveText(name);
  await expect(page.getByTestId("items-empty")).toBeHidden();
});

test("a visitor sees there are no items yet, then adds the first item", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await resetItems(page);
  const name = `First item ${runTag}`;

  await test.step("1. open the Items page from the home page", async () => {
    await page.goto(`${baseUrl}/`);
    await page.getByTestId("nav-items").click();
    await expect.soft(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(page.getByRole("heading", { name: "Items" })).toBeVisible();
  });

  await test.step("2. see the empty-state message once the list loads", async () => {
    await expect.soft(page.getByTestId("items-empty")).toBeVisible();
    await expect.soft(page.getByTestId("items-empty")).toHaveText("No items yet");
    await expect.soft(page.getByTestId("item")).toHaveCount(0);
  });

  await test.step("3. a whitespace-only name is refused and the message stays", async () => {
    const response = await addItem(page, "   ");
    expect.soft(response.status()).toBe(400);
    await expect.soft(page.getByTestId("item-error")).toHaveText("name is required");
    await expect.soft(page.getByTestId("item")).toHaveCount(0);
    await expect.soft(page.getByTestId("items-empty")).toBeVisible();
    await expect.soft(page.getByTestId("items-empty")).toHaveText("No items yet");
  });

  await test.step("4. add the first item; the message goes without a reload", async () => {
    const response = await addItem(page, name);
    expect.soft(response.status()).toBe(201);
    await expect.soft(page.getByTestId("item")).toHaveCount(1);
    await expect.soft(page.getByTestId("item")).toHaveText([name]);
    await expect.soft(page.locator("[data-testid=items-empty]:visible")).toHaveCount(0);
    await expect.soft(page.locator("[data-testid=item-error]:visible")).toHaveCount(0);
    await expect.soft(page.getByLabel("New item")).toHaveValue("");
  });

  await test.step("5. after a reload the item is still listed and the message stays hidden", async () => {
    await openItemsPage(page);
    await expect(page.getByTestId("item")).toHaveCount(1);
    await expect(page.getByTestId("item")).toHaveText([name]);
    await expect(page.locator("[data-testid=items-empty]:visible")).toHaveCount(0);
    await expect(page.locator("[data-testid=item-error]:visible")).toHaveCount(0);
    await expect(page.getByLabel("New item")).toHaveValue("");
    await expect(page.getByTestId("user-status")).toHaveText("You are not signed in.");
  });
});
