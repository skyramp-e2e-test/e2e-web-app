// Items page: the "No items yet" message (EWA-8 AC1, AC2), adding an item (requirements.csv AC1),
// and the list still showing every item GET /api/items returns, in its order.
//
// The app has no way to delete items, so an empty list exists only on a fresh database. The tests that need
// one answer the page's GET /api/items with [] in the browser; every POST still reaches the app.
import type { Page } from "@playwright/test";
import { checkRequestPayload } from "@skyramp/skyramp";
import { test, expect, signIn, uniqueName, baseUrl, uiCredentials } from "../items-page";

test.use({ viewport: { width: 1280, height: 900 } });

async function answerListWithNoItems(page: Page) {
  await page.route("**/api/items", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [] }) : route.continue(),
  );
}

test("shows No items yet when the items list is empty", async ({ page, itemsPage }) => {
  // EWA-8 AC1
  await answerListWithNoItems(page);
  await signIn(page);
  await itemsPage.goto();

  await expect(itemsPage.empty).toBeVisible();
  await expect(itemsPage.empty).toHaveText("No items yet");
  await expect(itemsPage.items).toHaveCount(0);
  await expect(itemsPage.error).toBeHidden();
});

test("keeps No items yet shown when the server refuses a blank name", async ({ page, itemsPage }) => {
  // EWA-8 AC1
  await answerListWithNoItems(page);
  await signIn(page);
  await itemsPage.goto();
  await expect(itemsPage.empty).toBeVisible();

  const response = await itemsPage.add("   ");
  checkRequestPayload(response.request().postDataJSON(), { name: "   " });
  expect(response.status()).toBe(400);

  await expect(itemsPage.error).toBeVisible();
  await expect(itemsPage.error).toHaveText("name is required");
  await expect(itemsPage.empty).toBeVisible();
  await expect(itemsPage.empty).toHaveText("No items yet");
  await expect(itemsPage.items).toHaveCount(0);
});

test("hides No items yet as soon as the first item is added, without a reload", async ({ page, itemsPage }) => {
  // EWA-8 AC1 then AC2: the empty list is answered in the browser until the page has shown it.
  await answerListWithNoItems(page);
  await signIn(page);
  await itemsPage.goto();
  await expect(itemsPage.empty).toBeVisible();
  await expect(itemsPage.empty).toHaveText("No items yet");
  await expect(itemsPage.items).toHaveCount(0);

  await page.unrouteAll();
  const name = uniqueName("Desk Lamp");
  const loadedAfterAdd = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
  );
  const response = await itemsPage.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
  await loadedAfterAdd;

  await expect(itemsPage.item(name)).toHaveText(name);
  await expect(itemsPage.empty).toBeHidden();
  await expect(itemsPage.error).toBeHidden();
});

test("does not show No items yet when opening the page with items stored", async ({ page, itemsPage }) => {
  // EWA-8 AC2
  await signIn(page);
  const name = uniqueName("Existing");
  const created = await page.request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(created.status()).toBe(201);

  await itemsPage.goto();
  await expect(itemsPage.item(name)).toHaveText(name);
  await expect(itemsPage.empty).toBeHidden();

  await page.reload();
  await expect(itemsPage.item(name)).toHaveText(name);
  await expect(itemsPage.empty).toBeHidden();
});

test("lists an item added with the Add item button, and keeps it after a reload", async ({ page, itemsPage }) => {
  // requirements.csv AC1
  await signIn(page);
  await itemsPage.goto();
  await expect(itemsPage.userStatus).toHaveText(`Signed in as ${uiCredentials().username}`);

  const name = uniqueName("Desk Lamp");
  await itemsPage.newItem.fill(name);
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  await expect(itemsPage.item(name)).toHaveCount(1);
  await expect(itemsPage.item(name)).toHaveText(name);
  await expect(itemsPage.newItem).toHaveValue("");

  await itemsPage.goto();
  await expect(itemsPage.item(name)).toHaveCount(1);
  await expect(itemsPage.item(name)).toHaveText(name);
});

test("lists every stored item once, in the order GET /api/items returns them", async ({ page, itemsPage }) => {
  // The items list after the empty-state line was added to loadItems.
  await signIn(page);
  const alpha = uniqueName("Alpha");
  const beta = uniqueName("Beta");
  for (const name of [alpha, beta]) {
    const created = await page.request.post(`${baseUrl}/api/items`, { data: { name } });
    expect(created.status()).toBe(201);
  }

  await itemsPage.goto();
  await expect(itemsPage.item(beta)).toHaveText(beta);
  const shown = await itemsPage.items.allTextContents();
  const stored = ((await (await page.request.get(`${baseUrl}/api/items`)).json()) as { name: string }[]).map(
    (i) => i.name,
  );

  // Other tests may add items after the page loaded; what the page shows is what the API held then, in its order.
  expect(shown).toEqual(stored.slice(0, shown.length));
  expect(shown.filter((n) => n === alpha)).toHaveLength(1);
  expect(shown.filter((n) => n === beta)).toHaveLength(1);
  expect(shown.indexOf(alpha)).toBeLessThan(shown.indexOf(beta));
  await expect(itemsPage.empty).toBeHidden();
});
