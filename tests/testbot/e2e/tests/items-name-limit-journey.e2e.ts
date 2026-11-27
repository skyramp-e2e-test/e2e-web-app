// Journey: sign in, then add item names at and past the 60-character limit on the Items page (EWA-10 AC1, AC2).
// Names start with "nlimit-" and a run-unique id; .skyramp/cleanup/delete-name-limit-items.sh removes them.
import { test, expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, LoginPage, uiCredentials } from "../support/items-pages";

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("add items with names at and past the length limit", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  page.setDefaultTimeout(15000);
  const { username, password } = uiCredentials();
  const login = new LoginPage(page);
  const items = new ItemsPage(page);
  const okName = `nlimit-j-${runId}-ok-`.padEnd(60, "b");
  const longName = `nlimit-j-${runId}-long-`.padEnd(61, "c");

  await test.step("1. sign in on /login and land on /items", async () => {
    await login.goto();
    await login.signIn(username, password);
    await expect(page).toHaveURL(/\/items$/);
    await expect(items.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. add a 60-character name", async () => {
    const response = await items.addItem(okName);
    expect.soft(response.status()).toBe(201);
    await expect.soft(items.itemNamed(okName)).toHaveText(okName);
    await expect.soft(items.nameInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });

  await test.step("3. try a 61-character name", async () => {
    await items.addItem(longName);
    await expect.soft(items.error).toBeVisible();
    await expect.soft(items.error).toContainText("60");
    await expect.soft(items.itemNamed(longName)).toHaveCount(0);
  });

  await test.step("4. reload the Items page", async () => {
    await page.reload();
    await expect(items.itemNamed(okName)).toHaveCount(1);
    await expect(items.itemNamed(longName)).toHaveCount(0);
  });
});
