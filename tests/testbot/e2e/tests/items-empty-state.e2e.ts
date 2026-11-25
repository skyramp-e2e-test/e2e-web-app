// Items page empty-state message (EWA-8 AC1, AC2), adding an item (requirements.csv AC1)
// and the item list order, against the real app and database.
// Tests in this file run one after another: some empty the items table first.
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { deleteAllItems, deleteItemsById, TEST_ITEM_PREFIX } from "../support/items-db.cjs";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

type Item = { id: number; name: string; created_at: string };

const uniqueName = (label: string) =>
  `${TEST_ITEM_PREFIX}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let createdIds: number[] = [];

test.beforeEach(() => {
  createdIds = [];
});

test.afterEach(async () => {
  await deleteItemsById(createdIds);
});

async function apiItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  const item: Item = await res.json();
  createdIds.push(item.id);
  return item;
}

/** Opens /items and waits until the page's GET /api/items has been answered. */
async function openItems(page: Page) {
  const loaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
  );
  await page.goto(`${baseUrl}/items`);
  await loaded;
}

/** Clicks Add item and returns the POST /api/items response, its body checked. */
async function submitItem(page: Page, name: string) {
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
  );
  await page.getByLabel("New item").fill(name);
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response;
}

test("journey: open the empty Items page, see the empty message, add the first item", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await deleteAllItems();

  await test.step("1. open / and follow the Items link", async () => {
    await page.goto(`${baseUrl}/`);
    await page.getByTestId("nav-items").click();
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(page.getByRole("heading", { name: "Items" })).toBeVisible();
  });

  await test.step("2. the empty list shows the empty-state message", async () => {
    await expect.soft(page.getByTestId("items-empty")).toBeVisible();
    await expect.soft(page.getByTestId("items-empty")).toHaveText("No items yet");
    await expect.soft(page.getByTestId("item")).toHaveCount(0);
  });

  await test.step("3. add the first item with Add item", async () => {
    const response = await submitItem(page, "First item");
    expect(response.status()).toBe(201);
    createdIds.push((await response.json()).id);
    await expect.soft(page.getByTestId("item")).toHaveCount(1);
    await expect.soft(page.getByTestId("item")).toHaveText(["First item"]);
    await expect.soft(page.getByTestId("items-empty")).toBeHidden();
    await expect.soft(page.getByLabel("New item")).toHaveValue("");
    await expect.soft(page.getByTestId("item-error")).toBeHidden();
  });

  await test.step("4. reload /items: the item stays listed and the message stays hidden", async () => {
    const loaded = page.waitForResponse(
      (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
    );
    await page.reload();
    await loaded;
    await expect.soft(page.getByRole("heading", { name: "Items" })).toBeVisible();
    await expect.soft(page.getByTestId("items-list").getByTestId("item")).toHaveText(["First item"]);
    await expect.soft(page.getByTestId("items-empty")).toBeHidden();
    await expect.soft(page.getByText("No items yet")).toBeHidden();
    await expect.soft(page.getByTestId("item-error")).toBeHidden();
    await expect.soft(page.getByLabel("New item")).toHaveValue("");
    await expect.soft(page.getByTestId("user-status")).toHaveText("You are not signed in.");
  });
});

test("shows No items yet when no items are stored", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  await deleteAllItems();
  await page.goto(`${baseUrl}/`);
  const loaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
  );
  await page.getByTestId("nav-items").click();
  expect(await (await loaded).json()).toEqual([]);
  await expect(page.getByTestId("items-empty")).toBeVisible();
  await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
  await expect(page.getByTestId("items-list").getByTestId("item")).toHaveCount(0);
  expect(await apiItems(request)).toEqual([]);
});

test("a blank name the server refuses keeps the empty message on an empty list", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  await deleteAllItems();
  await openItems(page);
  await expect(page.getByTestId("items-empty")).toBeVisible();

  const response = await submitItem(page, "   ");
  expect(response.status()).toBe(400);
  await expect(page.getByTestId("item-error")).toBeVisible();
  await expect(page.getByTestId("item-error")).toHaveText("name is required");
  await expect(page.getByTestId("items-empty")).toBeVisible();
  await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
  await expect(page.getByTestId("item")).toHaveCount(0);
  expect(await apiItems(request)).toEqual([]);
});

test("adding the first item hides the empty message without a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await deleteAllItems();
  await openItems(page);
  await expect(page.getByTestId("items-empty")).toBeVisible();

  const name = uniqueName("first");
  let navigated = false;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigated = true;
  });
  const response = await submitItem(page, name);
  expect(response.status()).toBe(201);
  createdIds.push((await response.json()).id);

  await expect(page.getByTestId("item").filter({ hasText: name })).toBeVisible();
  await expect(page.getByTestId("items-empty")).toBeHidden();
  expect(navigated).toBe(false);
});

test("opening /items with a stored item does not show the empty message", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = uniqueName("stored");
  await createItem(request, name);

  await openItems(page);
  await expect(page.getByTestId("item").filter({ hasText: name })).toBeVisible();
  await expect(page.getByTestId("items-empty")).toBeHidden();
  await expect(page.getByText("No items yet")).toBeHidden();

  const loaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
  );
  await page.reload();
  await loaded;
  await expect(page.getByTestId("item").filter({ hasText: name })).toBeVisible();
  await expect(page.getByTestId("items-empty")).toBeHidden();
});

test("Add item lists the submitted name last and keeps it after a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await openItems(page);
  const name = uniqueName("added");

  const response = await submitItem(page, `  ${name}  `);
  expect(response.status()).toBe(201);
  createdIds.push((await response.json()).id);

  // The order of the list is what is checked here: the new item comes last.
  await expect(page.getByTestId("items-list").getByTestId("item").filter({ hasText: name })).toHaveText(name);
  await expect
    .poll(async () => (await page.getByTestId("items-list").getByTestId("item").allTextContents()).at(-1))
    .toBe(name);
  await expect(page.getByLabel("New item")).toHaveValue("");

  await page.reload();
  await expect(page.getByTestId("item").filter({ hasText: name })).toHaveCount(1);
  await expect(page.getByTestId("item").filter({ hasText: name })).toHaveText(name);
});

test("lists every item in the order the API returns them", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const nameA = uniqueName("a");
  const nameB = uniqueName("b");
  await createItem(request, nameA);
  await createItem(request, nameB);
  const names = (await apiItems(request)).map((i) => i.name);

  await openItems(page);
  await expect(page.getByTestId("items-list").getByTestId("item")).toHaveText(names);
  const texts = await page.getByTestId("item").allTextContents();
  expect(texts.indexOf(nameA)).toBeLessThan(texts.indexOf(nameB));
  expect(texts.filter((t) => t === nameA)).toHaveLength(1);
  expect(texts.filter((t) => t === nameB)).toHaveLength(1);
  await expect(page.getByTestId("items-empty")).toBeHidden();
});
