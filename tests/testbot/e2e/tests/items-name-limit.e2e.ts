// EWA-10 AC1 / AC2 on the Items page: a name over 60 characters is refused, one of 60 is listed.
import { test, checkRequestPayload, expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Page } from "@playwright/test";
import { appUrl, uniqueName } from "../support/items";

const pageTimeout = 15000;

function credentials() {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  return { email, password };
}

async function signIn(page: Page) {
  const { email, password } = credentials();
  await page.goto(`${appUrl}/login`);
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
}

/** Types `name` and clicks Add item; returns the POST /api/items response. */
async function addItem(page: Page, name: string) {
  await page.getByTestId("item-name-input").fill(name);
  const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
  await page.getByTestId("add-item-submit").click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response;
}

const listed = (page: Page, name: string) =>
  page.getByTestId("items-list").getByTestId("item").filter({ hasText: new RegExp(`^${name}$`) });

test.describe("item name limit (Items page)", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(pageTimeout);
  });

  // EWA-10 AC1
  test("submitting a 61-character name shows the 60-character limit and adds nothing", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    await signIn(page);
    const name = uniqueName(61);
    await addItem(page, name);
    await expect(page.getByTestId("item-error")).toBeVisible();
    await expect(page.getByTestId("item-error")).toHaveText(/\b60\b/);
    await expect(page.getByTestId("item-name-input")).toHaveValue(name);
    await expect(listed(page, name)).toHaveCount(0);
    await page.reload();
    await expect(listed(page, name)).toHaveCount(0);
  });

  // EWA-10 AC2
  test("adding a 60-character name shows it in the list", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    await signIn(page);
    const name = uniqueName(60, "y");
    const response = await addItem(page, name);
    expect(response.status()).toBe(201);
    await expect(listed(page, name)).toHaveCount(1);
    await expect(page.getByTestId("item-error")).toBeHidden();
    await expect(page.getByTestId("item-name-input")).toHaveValue("");
    await page.reload();
    await expect(listed(page, name)).toHaveCount(1);
  });

  // User journey: too-long name first, then one at the limit.
  test("add an item: a too-long name is refused, a 60-character name is added and stays after reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const n61 = uniqueName(61);
    const n60 = uniqueName(60, "y");

    await test.step("1. sign in from /login and land on /items", async () => {
      await signIn(page);
    });

    await test.step("2. a 61-character name is refused with the 60-character limit", async () => {
      await addItem(page, n61);
      await expect.soft(page.getByTestId("item-error")).toBeVisible();
      await expect.soft(page.getByTestId("item-error")).toHaveText(/\b60\b/);
      await expect.soft(listed(page, n61)).toHaveCount(0);
    });

    await test.step("3. a 60-character name is added to the list", async () => {
      const response = await addItem(page, n60);
      expect.soft(response.status()).toBe(201);
      await expect.soft(listed(page, n60)).toHaveCount(1);
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      await expect.soft(page.getByTestId("item-name-input")).toHaveValue("");
    });

    await test.step("4. after reload the 60-character name is listed and the 61-character one is not", async () => {
      await page.reload();
      await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${credentials().email}`);
      await expect.soft(listed(page, n60)).toHaveCount(1);
      await expect.soft(listed(page, n61)).toHaveCount(0);
    });
  });
});
