// Journey: sign in and add items on the Items page, including items with no name.
// The app has no route to delete items, so the items this test adds stay in the database.
import { test, expect, Page } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";

const BASE_URL = process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

// Clicks Add item and returns the JSON body the page sent and the status it was answered with.
async function submitAndCapture(page: Page, wrapped: Page) {
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
  );
  await wrapped.getByRole("button", { name: "Add item" }).click();
  const response = await responsePromise;
  return { body: response.request().postDataJSON(), status: response.status() };
}

test("sign in and add a named item, then items without a name that persist after reload", async ({ page: rawPage }, testInfo) => {
  const page = newSkyrampPlaywrightPage(rawPage, testInfo) as Page;
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  expect(username, "SKYRAMP_UI_USERNAME must be set").toBeTruthy();
  expect(password, "SKYRAMP_UI_PASSWORD must be set").toBeTruthy();

  const items = page.getByTestId("item");
  const nameBox = page.getByLabel("New item");
  const itemError = page.getByTestId("item-error");
  const named = `J1 named ${Date.now()}`;
  let start = 0;

  await test.step("1. sign in on /login and land on /items", async () => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("Email").fill(username as string);
    await page.getByLabel("Password").fill(password as string);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/items$/);
    await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
    await expect(page.getByTestId("items-list")).toBeVisible();
    // Let the initial list load finish before counting.
    await page.waitForLoadState("networkidle");
    start = await items.count();
  });

  await test.step("2. add a named item", async () => {
    await nameBox.fill(named);
    const { body, status } = await submitAndCapture(rawPage, page);
    expect.soft(body).toEqual({ name: named });
    expect.soft(status).toBe(201);
    await expect.soft(items).toHaveCount(start + 1);
    await expect.soft(items.last()).toHaveText(named);
    await expect.soft(nameBox).toHaveValue("");
    await expect.soft(itemError).toBeHidden();
  });

  await test.step("3. add an item with the name box empty", async () => {
    await nameBox.fill("");
    const { body, status } = await submitAndCapture(rawPage, page);
    expect.soft(body).toEqual({ name: "" });
    expect.soft(status).toBe(201);
    await expect.soft(items).toHaveCount(start + 2);
    await expect.soft(items.last()).toHaveText("");
    await expect.soft(itemError).toBeHidden();
    await expect.soft(nameBox).toHaveValue("");
  });

  await test.step("4. add an item with a whitespace-only name", async () => {
    await nameBox.fill("   ");
    const { body, status } = await submitAndCapture(rawPage, page);
    expect.soft(body).toEqual({ name: "   " });
    expect.soft(status).toBe(201);
    await expect.soft(items).toHaveCount(start + 3);
    await expect.soft(items.last()).toHaveText("");
    await expect.soft(itemError).toBeHidden();
    await expect.soft(nameBox).toHaveValue("");
  });

  await test.step("5. reload /items and see the named item followed by two nameless items", async () => {
    await page.reload();
    await page.waitForLoadState("networkidle");
    // Position is what this step checks: the three items just added are the last three, in order.
    await expect(items).toHaveCount(start + 3);
    await expect(items.nth(-3)).toHaveText(named);
    await expect(items.nth(-2)).toHaveText("");
    await expect(items.last()).toHaveText("");
    await expect(itemError).toBeHidden();
  });
});
