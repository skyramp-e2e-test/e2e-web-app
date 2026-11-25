// Items page empty-state message (EWA-8 AC1, AC2) with GET /api/items stubbed in the
// browser, so the checks do not depend on what the database holds.
import { test, expect, type Page } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

async function stubItemsList(page: Page, items: unknown[]) {
  await page.route("**/api/items", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) })
      : route.continue(),
  );
}

async function openItems(page: Page) {
  const loaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
  );
  await page.goto(`${baseUrl}/items`);
  await loaded;
}

test("an empty item list shows No items yet", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await stubItemsList(page, []);
  await openItems(page);
  await expect(page.getByTestId("items-empty")).toBeVisible();
  await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
  await expect(page.getByTestId("item")).toHaveCount(0);
});

test("a listed item hides the empty message", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await stubItemsList(page, [{ id: 1, name: "Alpha", created_at: "2026-01-01T00:00:00Z" }]);
  await openItems(page);
  await expect(page.getByTestId("items-list").getByTestId("item")).toHaveText(["Alpha"]);
  await expect(page.getByTestId("items-empty")).toBeHidden();
});

test("a refused add on an empty list keeps the empty message", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  await stubItemsList(page, []);
  await openItems(page);
  await expect(page.getByTestId("items-empty")).toBeVisible();

  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
  );
  await page.getByLabel("New item").fill("   ");
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name: "   " });
  expect(response.status()).toBe(400);

  await expect(page.getByTestId("item-error")).toBeVisible();
  await expect(page.getByTestId("item-error")).toHaveText("name is required");
  await expect(page.getByTestId("items-empty")).toBeVisible();
  await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
  await expect(page.getByTestId("item")).toHaveCount(0);
});
