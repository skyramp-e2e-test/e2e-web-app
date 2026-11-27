// Browser tests of the Items page (EWA-9 AC1, EWA-9 AC2), from a Skyramp walk recording.
// The app has no route to delete an item, so items these tests add stay in the app; each is named uniquely.
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Page } from "@playwright/test";

const pageTimeout = 15000;
const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

test.use({ viewport: { width: 1280, height: 900 } });

function credentials() {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: these tests sign in through the login page");
  }
  return { username, password };
}

async function itemNamesFromApi(page: Page): Promise<string[]> {
  const res = await page.request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { name: string }[]).map((item) => item.name);
}

async function signIn(page: Page) {
  const { username, password } = credentials();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${baseUrl}/items`);
  await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
  return username;
}

const listedNames = (page: Page) => page.getByTestId("item").allTextContents();

// The list shown is ordered by id: what was there before stays first, in the same order.
async function expectListKeeps(page: Page, before: string[]) {
  await expect.poll(async () => (await listedNames(page)).slice(0, before.length)).toEqual(before);
}

async function addItem(page: Page, name: string) {
  await page.getByLabel("New item").fill(name);
  const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response;
}

// Submits the form with `value` in New item.
async function submitName(page: Page, value: string) {
  await page.getByLabel("New item").fill(value);
  await page.getByRole("button", { name: "Add item" }).click();
}

// The name-required message: the server's error shown in item-error, or the browser's required-field prompt on New item.
const nameRequiredMessage = (page: Page) =>
  page.getByTestId("item-error").filter({ hasText: "name is required" }).or(page.locator("#item-name:invalid"));

const blankItems = (page: Page) => page.getByTestId("item").filter({ hasText: /^\s*$/ });

test.describe("Items page", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(pageTimeout);
  });

  test("sign in, add an item and see it still listed after reloading", async ({ page }) => {
    test.setTimeout(60000);
    page = newSkyrampPlaywrightPage(page);
    const name = `EWA-9 item ${Date.now()}`;
    let before: string[] = [];

    await test.step("1. sign in and land on the Items page", async () => {
      before = await itemNamesFromApi(page);
      await signIn(page);
      await expectListKeeps(page, before);
    });

    await test.step("2. add an item through the form", async () => {
      const response = await addItem(page, name);
      expect.soft(response.status()).toBe(201);
      await expect.soft(page.getByTestId("item").filter({ hasText: name })).toHaveText([name]);
      await expectListKeeps(page, before);
      expect.soft((await listedNames(page)).indexOf(name)).toBeGreaterThanOrEqual(before.length);
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
    });

    await test.step("3. reload the page", async () => {
      const { username } = credentials();
      await page.reload();
      await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
      await expect.poll(async () => (await listedNames(page)).filter((n) => n === name)).toEqual([name]);
      await expectListKeeps(page, before);
      expect((await listedNames(page)).indexOf(name)).toBeGreaterThanOrEqual(before.length);
      await expect(page.getByTestId("item-error")).toBeHidden();
    });
  });

  test("sign in and try to add an item with no name", async ({ page }) => {
    test.setTimeout(60000);
    page = newSkyrampPlaywrightPage(page);
    let before: string[] = [];
    let blanksBefore = 0;

    await test.step("1. sign in and land on the Items page", async () => {
      before = await itemNamesFromApi(page);
      blanksBefore = before.filter((n) => n.trim() === "").length;
      await signIn(page);
      await expectListKeeps(page, before);
    });

    await test.step("2. submit the form with New item empty", async () => {
      await submitName(page, "");
      await expect.soft(nameRequiredMessage(page)).toBeVisible();
      await expect.soft(blankItems(page)).toHaveCount(blanksBefore);
    });

    await test.step("3. submit the form with only spaces in New item", async () => {
      await submitName(page, "   ");
      await expect.soft(page.getByTestId("item-error")).toHaveText("name is required");
      await expect.soft(blankItems(page)).toHaveCount(blanksBefore);
    });

    await test.step("4. reload the page", async () => {
      const { username } = credentials();
      await page.reload();
      await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
      await expectListKeeps(page, before);
      await expect.poll(async () => (await listedNames(page)).filter((n) => n.trim() === "").length).toBe(blanksBefore);
    });
  });

  test("an item added through the form is still listed by name after a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `EWA-9 reload ${Date.now()}`;
    const before = await itemNamesFromApi(page);
    await signIn(page);
    await addItem(page, `  ${name}  `);
    await expect.poll(async () => (await listedNames(page)).filter((n) => n === name)).toEqual([name]);

    await page.reload();
    await expect.poll(async () => (await listedNames(page)).filter((n) => n === name)).toEqual([name]);
    await expectListKeeps(page, before);
    expect((await listedNames(page)).indexOf(name)).toBeGreaterThanOrEqual(before.length);
  });

  test("submitting an empty name shows a name-required message and adds no item", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const before = await itemNamesFromApi(page);
    const blanksBefore = before.filter((n) => n.trim() === "").length;
    await signIn(page);

    await submitName(page, "");
    await expect.soft(nameRequiredMessage(page)).toBeVisible();
    await expect.soft(blankItems(page)).toHaveCount(blanksBefore);

    await page.reload();
    await expectListKeeps(page, before);
    await expect.poll(async () => (await listedNames(page)).filter((n) => n.trim() === "").length).toBe(blanksBefore);
  });
});
