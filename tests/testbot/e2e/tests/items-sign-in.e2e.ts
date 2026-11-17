// Browser journeys through the sign-in gate on the Items page (recorded with the Skyramp walk helper, then extended).
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Page } from "@playwright/test";

const pageTimeout = 15000;
const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

test.use({ viewport: { width: 1280, height: 900 } });

function credentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  return { email, password };
}

function setUp(page: Page): Page {
  page.setDefaultTimeout(pageTimeout);
  return newSkyrampPlaywrightPage(page);
}

test("signed-out user opening Items is sent to sign in, then adds an item", async ({ page }) => {
  test.setTimeout(60000);
  page = setUp(page);
  const { email, password } = credentials();
  const itemName = `Journey item ${Date.now()}`;

  await test.step("1. home page shows the user is signed out", async () => {
    await page.goto(`${baseUrl}/`);
    await expect.soft(page.getByTestId("user-status")).toHaveText("You are not signed in.");
  });

  await test.step("2. Items nav link lands on the Sign in page", async () => {
    await page.getByTestId("nav-items").click();
    await expect.soft(page).toHaveURL(`${baseUrl}/login`);
    await expect.soft(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect.soft(page.getByRole("heading", { name: "Your items" })).toHaveCount(0);
  });

  await test.step("3. signing in lands on /items", async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect.soft(page).toHaveURL(`${baseUrl}/items`);
  });

  await test.step("4. Items page shows 'Your items' and who is signed in", async () => {
    await expect.soft(page.getByRole("heading", { name: "Your items", exact: true })).toBeVisible();
    await expect.soft(page.getByRole("heading", { name: "Items", exact: true })).toHaveCount(0);
    await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
  });

  await test.step("5. adding an item lists it and clears the input", async () => {
    await page.getByLabel("New item").fill(itemName);
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Add item" }).click();
    const response = await responsePromise;
    checkRequestPayload(response.request().postDataJSON(), { name: itemName });
    expect.soft(response.status()).toBe(201);
    await expect.soft(page.getByTestId("items-list").getByText(itemName, { exact: true })).toBeVisible();
    await expect.soft(page.getByLabel("New item")).toHaveValue("");
  });

  await test.step("6. after reload the user is still on Items and the item is still listed", async () => {
    await page.reload();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect(page.getByRole("heading", { name: "Your items", exact: true })).toBeVisible();
    await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
    await expect(page.getByTestId("items-list").getByText(itemName, { exact: true })).toBeVisible();
  });
});

test("after signing out, opening Items asks the user to sign in again", async ({ page }) => {
  test.setTimeout(60000);
  page = setUp(page);
  const { email, password } = credentials();

  await test.step("1. sign in through the form lands on Your items", async () => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect.soft(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(page.getByRole("heading", { name: "Your items", exact: true })).toBeVisible();
  });

  await test.step("2. Sign out returns to the home page, signed out", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect.soft(page).toHaveURL(`${baseUrl}/`);
    await expect.soft(page.getByTestId("user-status")).toHaveText("You are not signed in.");
  });

  await test.step("3. Items nav link now lands on the Sign in page", async () => {
    await page.getByTestId("nav-items").click();
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your items" })).toHaveCount(0);
  });
});
