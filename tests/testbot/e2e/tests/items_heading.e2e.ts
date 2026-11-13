// Browser journey: sign in from the home page and read the Items page heading.
import { test, expect } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";

// The user the app seeds at startup (src/db.js TEST_USER).
const EMAIL = "test@example.com";
const PASSWORD = "password123";

test("signed-in user sees the Items (A) heading on the Items page", async ({ page: playwrightPage }, testInfo) => {
  const page = newSkyrampPlaywrightPage(playwrightPage, testInfo);

  await test.step("1. open / and follow the Login link", async () => {
    await page.goto("/");
    await page.getByTestId("nav-login").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  await test.step("2. sign in as the seeded user", async () => {
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/items$/);
  });

  await test.step("3. the Items page shows the Items (A) heading and the signed-in user", async () => {
    const headings = page.getByRole("heading", { level: 1 });
    await expect.soft(headings).toHaveCount(1);
    await expect.soft(headings).toHaveText("Items (A)");
    await expect.soft(page.getByRole("heading", { name: "Items (A)", exact: true })).toBeVisible();
    await expect.soft(page.getByRole("heading", { name: "Items", exact: true })).toHaveCount(0);
    await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${EMAIL}`);
  });

  await test.step("4. after a reload the heading still reads Items (A)", async () => {
    await page.reload();
    const headings = page.getByRole("heading", { level: 1 });
    await expect.soft(headings).toHaveCount(1);
    await expect.soft(headings).toHaveText("Items (A)");
    await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${EMAIL}`);
  });
});
