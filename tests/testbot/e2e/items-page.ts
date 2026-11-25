// Page objects for the login and Items pages, and the fixture the Items tests share.
import { test as base, expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Locator, Page } from "@playwright/test";

export const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.signIn = page.getByRole("button", { name: "Sign in" });
  }

  async goto() {
    await this.page.goto(`${baseUrl}/login`);
  }

  async signInAs(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }
}

export class ItemsPage {
  readonly userStatus: Locator;
  readonly newItem: Locator;
  readonly addItem: Locator;
  readonly error: Locator;
  readonly empty: Locator;
  readonly list: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByTestId("add-item-submit");
    this.error = page.getByTestId("item-error");
    this.empty = page.getByTestId("items-empty");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByTestId("item");
  }

  item(name: string): Locator {
    return this.items.filter({ hasText: name });
  }

  /** Opens /items and waits for the page's own GET /api/items to be answered. */
  async goto() {
    const loaded = this.page.waitForResponse(
      (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
    );
    await this.page.goto(`${baseUrl}/items`);
    await loaded;
  }

  /** Types a name and clicks Add item; returns the POST /api/items response. */
  async add(name: string) {
    await this.newItem.fill(name);
    const posted = this.page.waitForResponse(
      (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
    );
    await this.addItem.click();
    return posted;
  }
}

export function uiCredentials(): { username: string; password: string } {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { username, password };
}

/** Signs in through the login page, which redirects to /items. */
export async function signIn(page: Page) {
  const { username, password } = uiCredentials();
  const login = new LoginPage(page);
  await login.goto();
  await login.signInAs(username, password);
  await expect(page).toHaveURL(/\/items$/);
}

/** `page` is wrapped with the Skyramp page; `itemsPage` is the Items page object on it. */
export const test = base.extend<{ itemsPage: ItemsPage }>({
  page: async ({ page }, use) => {
    await use(newSkyrampPlaywrightPage(page));
  },
  itemsPage: async ({ page }, use) => {
    await use(new ItemsPage(page));
  },
});

export { expect };
