import { test, expect, type Page } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";

// The seeded account (src/db.js seedTestUser); its credentials come from the run's login variables.
const USERNAME = process.env.SKYRAMP_UI_USERNAME as string;
const PASSWORD = process.env.SKYRAMP_UI_PASSWORD as string;

test.describe.configure({ timeout: 30_000 });

class ItemsPage {
  constructor(readonly page: Page) {}
  heading = () => this.page.getByRole("heading", { level: 1 });
  oldHeading = () => this.page.getByRole("heading", { name: "Items", exact: true });
  newHeading = () => this.page.getByRole("heading", { name: "Items (A)", exact: true });
  userStatus = () => this.page.getByTestId("user-status");
  navItems = () => this.page.getByTestId("nav-items");
  nameInput = () => this.page.getByLabel("New item");
  addButton = () => this.page.getByRole("button", { name: "Add item" });
  itemError = () => this.page.getByTestId("item-error");
  itemsList = () => this.page.getByTestId("items-list");
  item = (name: string) => this.itemsList().getByText(name, { exact: true });

  async addItem(name: string) {
    const request = this.page.waitForRequest(
      (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/items",
    );
    await this.nameInput().fill(name);
    await this.addButton().click();
    const sent = await request;
    expect(sent.postDataJSON()).toEqual({ name });
    return sent;
  }
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
}

test("signed-in user sees the Items (A) heading, adds an item and both stay after a reload", async ({ page: rawPage }, testInfo) => {
  const page = newSkyrampPlaywrightPage(rawPage, testInfo);
  const items = new ItemsPage(page);
  const name = `heading-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await test.step("1. sign in on /login and land on /items", async () => {
    await signIn(page);
  });

  await test.step("2. the Items page shows the new heading and keeps the rest", async () => {
    await expect.soft(items.newHeading()).toBeVisible();
    await expect.soft(items.heading()).toHaveCount(1);
    await expect.soft(items.heading()).toHaveText("Items (A)");
    await expect.soft(items.oldHeading()).toHaveCount(0);
    await expect.soft(items.userStatus()).toHaveText(`Signed in as ${USERNAME}`);
    await expect.soft(items.navItems()).toHaveText("Items");
    await expect.soft(page).toHaveTitle("Items - E2E Web App");
  });

  await test.step("3. add an item: it is listed and the input clears", async () => {
    await items.addItem(name);
    await expect.soft(items.item(name)).toBeVisible();
    await expect.soft(items.nameInput()).toHaveValue("");
    await expect.soft(items.itemError()).toBeHidden();
  });

  await test.step("4. after a reload the heading and the item are still there", async () => {
    await page.reload();
    await expect.soft(items.heading()).toHaveCount(1);
    await expect.soft(items.heading()).toHaveText("Items (A)");
    await expect.soft(items.oldHeading()).toHaveCount(0);
    await expect.soft(items.item(name)).toBeVisible();
  });
});

test("visitor who is not signed in sees the Items (A) heading", async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  try {
    const page = newSkyrampPlaywrightPage(await context.newPage(), testInfo);
    const items = new ItemsPage(page);
    await page.goto("/items");
    await expect.soft(items.heading()).toHaveCount(1);
    await expect.soft(items.heading()).toHaveText("Items (A)");
    await expect.soft(items.oldHeading()).toHaveCount(0);
    await expect.soft(items.userStatus()).toHaveText("You are not signed in.");
  } finally {
    await context.close();
  }
});

test("whitespace-only item name shows name is required and adds nothing", async ({ page: rawPage }, testInfo) => {
  const page = newSkyrampPlaywrightPage(rawPage, testInfo);
  const items = new ItemsPage(page);
  await signIn(page);
  await expect(items.userStatus()).toHaveText(`Signed in as ${USERNAME}`);
  const listed = await items.itemsList().getByRole("listitem").allTextContents();

  const sent = await items.addItem("   ");
  const response = await sent.response();
  expect.soft(response?.status()).toBe(400);
  await expect.soft(items.itemError()).toBeVisible();
  await expect.soft(items.itemError()).toHaveText("name is required");
  await expect.soft(items.heading()).toHaveText("Items (A)");
  await expect.soft(items.itemsList().getByRole("listitem")).toHaveText(listed);
});
