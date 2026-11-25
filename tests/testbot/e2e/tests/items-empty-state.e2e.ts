// Items page empty-state message (EWA-8 AC1, AC2) and adding items through the form (requirements.csv AC1).
// Drafted with the Skyramp walk helper, then extended to check every part of each expected outcome.
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Page } from "@playwright/test";
import { emptyItemsTable } from "../items-table";

const baseUrl = getBaseUrl("SKYRAMP_TEST_SERVICE_URL_APP", "http://localhost:3000");

// Every test here needs the items table empty, and no API deletes items: run them one at a time,
// and leave the table empty when each ends, passed or failed.
test.describe.configure({ mode: "serial" });

test.beforeEach(() => emptyItemsTable());
test.afterEach(() => emptyItemsTable());

function itemsPage(page: Page) {
  return {
    emptyMessage: page.getByTestId("items-empty"),
    items: page.getByTestId("item"),
    error: page.getByTestId("item-error"),
    nameInput: page.getByLabel("New item"),
    addButton: page.getByRole("button", { name: "Add item" }),
  };
}

async function openItems(page: Page) {
  await page.goto(`${baseUrl}/items`);
  await page.waitForLoadState("networkidle");
}

/** Fills the name, clicks Add item, checks the request it sent, and returns the response. */
async function addItem(page: Page, name: string) {
  const p = itemsPage(page);
  await p.nameInput.fill(name);
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
  );
  await p.addButton.click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response;
}

test("shows No items yet on the Items page when there are no items", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);
  await openItems(page);
  await expect(p.emptyMessage).toBeVisible();
  await expect(p.emptyMessage).toHaveText("No items yet");
  await expect(page.getByTestId("items-list").getByTestId("item")).toHaveCount(0);
});

test("hides the empty-state message when items exist on page load", async ({ page, request }) => {
  const created = await request.post(`${baseUrl}/api/items`, { data: { name: "Preexisting" } });
  expect(created.status()).toBe(201);
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);
  await openItems(page);
  await expect(p.items).toHaveText(["Preexisting"]);
  await expect(p.emptyMessage).toBeHidden();
});

test("keeps the empty-state message when the server refuses a whitespace-only name", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);
  await openItems(page);
  await expect(p.emptyMessage).toBeVisible();
  const response = await addItem(page, "   ");
  expect(response.status()).toBe(400);
  await expect(p.error).toBeVisible();
  await expect(p.error).toHaveText("name is required");
  await expect(p.emptyMessage).toBeVisible();
  await expect(p.emptyMessage).toHaveText("No items yet");
  await expect(p.items).toHaveCount(0);
});

test("hides the empty-state message after adding the first item, without a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);
  await openItems(page);
  await expect(p.emptyMessage).toBeVisible();
  const urlBefore = page.url();
  await page.evaluate(() => { (window as unknown as { __noReload: number }).__noReload = 1; });
  const response = await addItem(page, "First item");
  expect(response.status()).toBe(201);
  await expect(p.items).toHaveText(["First item"]);
  await expect(p.emptyMessage).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1);
  expect(page.url()).toBe(urlBefore);
});

test("adds each name entered with Add item to the end of the list", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);
  await openItems(page);
  expect((await addItem(page, "Alpha")).status()).toBe(201);
  await expect(p.items).toHaveText(["Alpha"]);
  await expect(p.nameInput).toHaveValue("");
  expect((await addItem(page, "  Beta  ")).status()).toBe(201);
  await expect(p.items).toHaveText(["Alpha", "Beta"]);
  await expect(p.nameInput).toHaveValue("");
  await expect(p.error).toBeHidden();
});

test("keeps the empty-state message hidden after reloading a list with an added item", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);
  await openItems(page);
  expect((await addItem(page, "Kept item")).status()).toBe(201);
  await expect(p.items).toHaveText(["Kept item"]);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(p.items).toHaveText(["Kept item"]);
  await expect(p.emptyMessage).toBeHidden();
});

test("journey: open the empty Items page from home and add the first item", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const p = itemsPage(page);

  await test.step("1. open the home page", async () => {
    await page.goto(`${baseUrl}/`);
    await expect.soft(page.getByTestId("home-heading")).toHaveText("E2E Web App");
  });

  await test.step("2. go to Items through the nav and see the empty-state message", async () => {
    await page.getByTestId("nav-items").click();
    await expect.soft(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(p.emptyMessage).toBeVisible();
    await expect.soft(p.emptyMessage).toHaveText("No items yet");
    await expect.soft(p.items).toHaveCount(0);
  });

  await test.step("3. submit a whitespace-only name and see it refused", async () => {
    await addItem(page, "   ");
    await expect.soft(p.error).toBeVisible();
    await expect.soft(p.error).toHaveText("name is required");
    await expect.soft(p.emptyMessage).toBeVisible();
    await expect.soft(p.emptyMessage).toHaveText("No items yet");
    await expect.soft(p.items).toHaveCount(0);
  });

  await test.step("4. add the first item, with no reload", async () => {
    await page.evaluate(() => { (window as unknown as { __noReload: number }).__noReload = 1; });
    await addItem(page, "First item");
    await expect.soft(p.items).toHaveText(["First item"]);
    await expect.soft(p.emptyMessage).toBeHidden();
    await expect.soft(p.error).toBeHidden();
    await expect.soft(p.nameInput).toHaveValue("");
    expect.soft(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1);
  });

  await test.step("5. reload and see the item kept", async () => {
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect.soft(page.getByRole("heading", { level: 1 })).toHaveText("Items");
    await expect.soft(p.items).toHaveText(["First item"]);
    await expect.soft(p.emptyMessage).toBeHidden();
    await expect.soft(p.error).toBeHidden();
    await expect.soft(p.nameInput).toHaveValue("");
  });
});
