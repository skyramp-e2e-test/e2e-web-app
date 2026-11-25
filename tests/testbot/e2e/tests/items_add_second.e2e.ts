// Adding items to the Items page list (requirements.csv AC1; EWA-8 AC2).
import { test, expect } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl } from "../pages/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("with items stored, opens Items and adds another item after them", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const stamp = Date.now();
  const stored = `Stored ${stamp}`;
  const second = `Second ${stamp}`;
  let before: string[] = [];

  await test.step("1. open the home page, follow Login and sign in", async () => {
    await page.goto(`${baseUrl}/`);
    await items.navLogin.click();
    await items.signInOnLoginPage();
    before = await items.items.allTextContents();
  });

  await test.step("2. store an item, then reopen Items through the nav link", async () => {
    const response = await items.add(stored);
    checkRequestPayload(response.request().postDataJSON(), { name: stored });
    expect.soft(response.status()).toBe(201);
    await items.openViaNav();
    await items.expectAddedAfter(before, [stored], true);
    await expect.soft(items.visibleEmpty).toHaveCount(0);
  });

  await test.step("3. add a second item", async () => {
    const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    const response = await items.add(second);
    checkRequestPayload(response.request().postDataJSON(), { name: second });
    expect.soft(response.status()).toBe(201);
    await listed;
    await items.expectAddedAfter(before, [stored, second], true);
    await expect.soft(items.visibleEmpty).toHaveCount(0);
  });

  await test.step("4. reopen Items through the nav link and see both kept", async () => {
    await items.openViaNav();
    await expect(items.userStatus).toHaveText(`Signed in as ${process.env.SKYRAMP_UI_USERNAME}`);
    await items.expectAddedAfter(before, [stored, second]);
    await expect(items.visibleEmpty).toHaveCount(0);
    await expect(items.error).toBeHidden();
  });
});

test("does not show No items yet when items are already stored", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const stored = `Stored ${Date.now()}`;
  const seeded = await request.post(`${baseUrl}/api/items`, { data: { name: stored } });
  expect(seeded.status()).toBe(201);

  await items.signInFromHome();
  await items.openViaNav();
  await expect(items.item(stored)).toHaveCount(1);
  await expect(items.visibleEmpty).toHaveCount(0);

  await items.reload();
  await expect(items.item(stored)).toHaveCount(1);
  await expect(items.visibleEmpty).toHaveCount(0);
});

test("lists an item added with Add item at the end of the list and keeps it after a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const name = `Widget ${Date.now()}`;

  await items.signInFromHome();
  const before = await items.items.allTextContents();
  const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  const response = await items.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
  await listed;
  await items.expectAddedAfter(before, [name]);

  await items.reload();
  await items.expectAddedAfter(before, [name]);
});

test("lists a second item after the first and keeps No items yet hidden", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const stamp = Date.now();
  const first = `First ${stamp}`;
  const second = `Second ${stamp}`;

  await items.signInFromHome();
  expect((await items.add(first)).status()).toBe(201);
  await expect(items.item(first)).toHaveCount(1);
  const before = await items.items.allTextContents();

  const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  const response = await items.add(second);
  checkRequestPayload(response.request().postDataJSON(), { name: second });
  expect(response.status()).toBe(201);
  await listed;
  await items.expectAddedAfter(before, [second]);
  await expect(items.visibleEmpty).toHaveCount(0);
});
