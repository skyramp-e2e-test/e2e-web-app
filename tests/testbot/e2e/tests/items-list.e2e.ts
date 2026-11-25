// Items page: empty-state message (EWA-8 AC1, AC2) and adding an item (requirements.csv AC1).
// Drafted from Skyramp walk recordings, then strengthened.
import { test, expect, type Page } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage } from "../pages/items-page";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

/** Makes GET /api/items answer an empty list, so the page sees no items whatever the database holds. */
async function routeEmptyList(page: Page) {
  await page.route("**/api/items", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
      : route.fallback(),
  );
}

test.describe("Items page", () => {
  let items: ItemsPage;

  test.beforeEach(async ({ page }, testInfo) => {
    page = newSkyrampPlaywrightPage(page, testInfo);
    items = new ItemsPage(page);
  });

  test("shows the empty-state message when there are no items", async () => {
    await routeEmptyList(items.page);
    await items.signIn();
    await expect(items.emptyMessage()).toBeVisible();
    await expect(items.emptyMessage()).toHaveText("No items yet");
    await expect(items.items()).toHaveCount(0);
  });

  test("keeps the empty-state message when a whitespace-only name is refused", async () => {
    await routeEmptyList(items.page);
    await items.signIn();
    await expect(items.emptyMessage()).toBeVisible();

    const res = await items.add("   ");
    checkRequestPayload(res.request().postDataJSON(), { name: "   " });
    expect(res.status()).toBe(400);

    await expect(items.error()).toBeVisible();
    await expect(items.error()).toHaveText("name is required");
    await expect(items.emptyMessage()).toBeVisible();
    await expect(items.emptyMessage()).toHaveText("No items yet");
    await expect(items.items()).toHaveCount(0);
  });

  test("hides the empty-state message as soon as the first item is added, without a reload", async () => {
    const name = `First routed ${Date.now()}`;
    let added = false;
    // The list starts empty; once the add went through, the page gets the real list narrowed to this test's item.
    await items.page.route("**/api/items", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      if (!added) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      const real = await route.fetch();
      const rows = (await real.json()) as Array<{ name: string }>;
      return route.fulfill({ response: real, json: rows.filter((r) => r.name === name) });
    });
    await items.signIn();
    await expect(items.emptyMessage()).toBeVisible();
    await expect(items.emptyMessage()).toHaveText("No items yet");

    let navigated = false;
    items.page.on("framenavigated", (f) => { if (f === items.page.mainFrame()) navigated = true; });
    await items.nameInput().fill(name);
    const posted = items.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    const relisted = items.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    added = true;
    await items.addButton().click();
    const res = await posted;
    checkRequestPayload(res.request().postDataJSON(), { name });
    expect(res.status()).toBe(201);
    await relisted;

    await expect(items.items()).toHaveCount(1);
    await expect(items.items()).toHaveText([name]);
    await expect(items.emptyMessage()).toBeHidden();
    expect(navigated).toBe(false);
  });

  test("does not show the empty-state message when items already exist on load", async ({ request }) => {
    const name = `Existing ${Date.now()}`;
    const created = await request.post(`${baseUrl}/api/items`, { data: { name } });
    expect(created.status()).toBe(201);

    await items.signIn();
    await items.reload();
    await expect(items.item(name)).toHaveCount(1);
    await expect(items.item(name)).toHaveText(name);
    await expect(items.emptyMessage()).toBeHidden();
    await expect(items.page.getByText("No items yet")).toBeHidden();
  });

  test("adds a typed name, trimmed, to the end of the list", async ({ request }) => {
    const existing = `Existing before add ${Date.now()}`;
    expect((await request.post(`${baseUrl}/api/items`, { data: { name: existing } })).status()).toBe(201);
    const name = `Padded ${Date.now()}`;

    await items.signIn();
    await items.reload();
    await expect(items.item(existing)).toHaveCount(1);

    const relisted = items.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    const res = await items.add(`  ${name}  `);
    checkRequestPayload(res.request().postDataJSON(), { name: `  ${name}  ` });
    expect(res.status()).toBe(201);
    await relisted;

    // The list is ordered by id, so the item just added comes after the one that was already there.
    await expect(items.items()).toContainText([existing, name]);
    await expect(items.item(name)).toHaveCount(1);
    await expect(items.nameInput()).toHaveValue("");
    await expect(items.error()).toBeHidden();
    await expect(items.emptyMessage()).toBeHidden();

    await items.reload();
    await expect(items.item(name)).toHaveCount(1);
    await expect(items.item(name)).toHaveText(name);
    await expect(items.emptyMessage()).toBeHidden();
  });
});
