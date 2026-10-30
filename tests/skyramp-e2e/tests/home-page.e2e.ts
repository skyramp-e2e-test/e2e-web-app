import { test, expect, Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "test@example.com";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByTestId("email-input").fill(EMAIL);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(`${BASE_URL}/items`);
}

test.describe("home page", () => {
  test("tab title is 'E2E Web App' signed out and signed in", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page).toHaveTitle("E2E Web App");
    await signIn(page);
    await page.getByTestId("nav-home").click();
    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page).toHaveTitle("E2E Web App");
  });

  test("shows the heading and the Home, Login and Items nav links", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page.getByTestId("home-heading")).toHaveText("E2E Web App");
    await expect(page.getByTestId("nav-home")).toHaveAttribute("href", "/");
    await expect(page.getByTestId("nav-login")).toHaveAttribute("href", "/login");
    await expect(page.getByTestId("nav-items")).toHaveAttribute("href", "/items");
  });

  test("signed out, the status line says 'You are not signed in.'", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page.getByTestId("user-status")).toHaveText("You are not signed in.");
  });

  test("signed in, the status line shows the signed-in email", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("nav-home").click();
    await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${EMAIL}`);
  });

  test("open the app, sign in, and return to the home page", async ({ page }) => {
    await test.step("1. open the home page signed out", async () => {
      await page.goto(`${BASE_URL}/`);
      await expect.soft(page).toHaveTitle("E2E Web App");
      await expect.soft(page.getByTestId("home-heading")).toHaveText("E2E Web App");
      await expect.soft(page.getByTestId("user-status")).toHaveText("You are not signed in.");
    });
    await test.step("2. click the Login nav link", async () => {
      await page.getByTestId("nav-login").click();
      await expect(page).toHaveURL(`${BASE_URL}/login`);
      await expect(page.getByTestId("login-form")).toBeVisible();
    });
    await test.step("3. sign in with the login form", async () => {
      await page.getByTestId("email-input").fill(EMAIL);
      await page.getByTestId("password-input").fill(PASSWORD);
      await page.getByTestId("login-submit").click();
      await expect(page).toHaveURL(`${BASE_URL}/items`);
      await expect.soft(page.getByRole("heading", { name: "Items" })).toBeVisible();
    });
    await test.step("4. click the Home nav link", async () => {
      await page.getByTestId("nav-home").click();
      await expect(page).toHaveURL(`${BASE_URL}/`);
      await expect.soft(page).toHaveTitle("E2E Web App");
      await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${EMAIL}`);
    });
    await test.step("5. reload the home page", async () => {
      await page.reload();
      await expect(page).toHaveTitle("E2E Web App");
      await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${EMAIL}`);
    });
  });
});
