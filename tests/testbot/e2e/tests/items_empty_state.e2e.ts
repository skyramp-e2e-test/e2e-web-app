// Empty-state message on the Items page (EWA-8 AC1, EWA-8 AC2; requirements.csv AC1).
import { test, expect } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, serveEmptyItemsTable } from "../pages/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

// Walks the whole flow on a fresh app (empty items table), so it runs first in this file.
test("signs in to an empty Items page, is refused a blank name, then adds the first item", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);

  await test.step("1. open the home page and follow Login", async () => {
    await page.goto(`${baseUrl}/`);
    await items.navLogin.click();
    await expect.soft(items.email).toBeVisible();
    await expect.soft(items.password).toBeVisible();
  });

  await test.step("2. sign in and see the empty Items page", async () => {
    await items.signInOnLoginPage();
    await expect.soft(items.empty).toBeVisible();
    await expect.soft(items.empty).toHaveText("No items yet");
    await expect.soft(items.items).toHaveCount(0);
  });

  await test.step("3. try to add a name of three spaces", async () => {
    const response = await items.add("   ");
    checkRequestPayload(response.request().postDataJSON(), { name: "   " });
    expect.soft(response.status()).toBe(400);
    await expect.soft(items.error).toBeVisible();
    await expect.soft(items.error).toHaveText("name is required");
    await expect.soft(items.empty).toBeVisible();
    await expect.soft(items.empty).toHaveText("No items yet");
    await expect.soft(items.items).toHaveCount(0);
  });

  await test.step("4. add the first item", async () => {
    const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    const response = await items.add("First item");
    checkRequestPayload(response.request().postDataJSON(), { name: "First item" });
    expect.soft(response.status()).toBe(201);
    await listed;
    await expect.soft(items.items).toHaveCount(1);
    await expect.soft(items.items).toHaveText(["First item"]);
    await expect.soft(items.visibleEmpty).toHaveCount(0);
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.newItem).toHaveValue("");
  });

  await test.step("5. reload Items and see the item kept", async () => {
    await items.reload();
    await expect(items.userStatus).toHaveText(`Signed in as ${process.env.SKYRAMP_UI_USERNAME}`);
    await expect(items.items).toHaveText(["First item"]);
    await expect(items.visibleEmpty).toHaveCount(0);
    await expect(items.error).toBeHidden();
    await expect(items.newItem).toHaveValue("");
  });
});

test("shows No items yet and no entries when the items list is empty", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  await serveEmptyItemsTable(page);

  await items.signInFromHome();
  await expect(items.empty).toBeVisible();
  await expect(items.empty).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);
});

test("keeps No items yet shown beside the error when a blank name is refused", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  await serveEmptyItemsTable(page);

  await items.signInFromHome();
  await expect(items.empty).toBeVisible();
  const response = await items.add("   ");
  checkRequestPayload(response.request().postDataJSON(), { name: "   " });
  expect(response.status()).toBe(400);
  await expect(items.error).toBeVisible();
  await expect(items.error).toHaveText("name is required");
  await expect(items.empty).toBeVisible();
  await expect(items.empty).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);

  await items.reload();
  await expect(items.empty).toBeVisible();
  await expect(items.empty).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);
});

test("hides No items yet without a reload once the first item is added", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  await serveEmptyItemsTable(page);
  const name = `First item ${Date.now()}`;

  await items.signInFromHome();
  await expect(items.empty).toBeVisible();
  await expect(items.empty).toHaveText("No items yet");

  const navigations: string[] = [];
  page.on("framenavigated", (frame) => navigations.push(frame.url()));
  const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  const response = await items.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
  await listed;

  await expect(items.items).toHaveText([name]);
  await expect(items.empty).toBeHidden();
  await expect(items.error).toBeHidden();
  await expect(items.newItem).toHaveValue("");
  expect(navigations).toEqual([]);
});
