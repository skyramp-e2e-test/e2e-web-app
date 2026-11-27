// Page objects for the login and Items pages, shared by the Items browser tests.
import { expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Locator, Page } from "@playwright/test";

export const baseUrl = process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

/** The browser login the run or CI supplies; never written into a test. */
export function uiCredentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: these tests sign in through the login page");
  }
  return { email, password };
}

/** A suffix that makes names this test run creates unique, so it finds its own items in a shared list. */
export function runId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

  async goto(): Promise<void> {
    await this.page.goto(`${baseUrl}/login`);
  }

  async signInAs(email: string, password: string): Promise<void> {
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
  readonly list: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.list = page.getByTestId("items-list");
    this.items = page.getByTestId("item");
  }

  async goto(): Promise<void> {
    await this.page.goto(`${baseUrl}/items`);
  }

  /** The list item whose whole text is `name` (as stored, i.e. trimmed). */
  item(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.items.filter({ hasText: new RegExp(`^${escaped}$`) });
  }

  /** Types `name` into New item and clicks Add item; returns the POST /api/items request body. */
  async add(name: string): Promise<unknown> {
    await this.newItem.fill(name);
    const posted = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await this.addItem.click();
    const response = await posted;
    expect(response.status()).toBe(201);
    return response.request().postDataJSON();
  }

  /** Names returned by GET /api/items, in the order the API gives them. */
  async apiNames(): Promise<string[]> {
    const res = await this.page.request.get(`${baseUrl}/api/items`);
    expect(res.status()).toBe(200);
    return ((await res.json()) as { name: string }[]).map((i) => i.name);
  }
}

/** Wraps the page with Skyramp's page, then signs in as the run's UI user and lands on /items. */
export async function signInToItems(rawPage: Page): Promise<{ page: Page; items: ItemsPage; email: string }> {
  const page = newSkyrampPlaywrightPage(rawPage) as Page;
  const { email, password } = uiCredentials();
  const login = new LoginPage(page);
  await login.goto();
  await login.signInAs(email, password);
  await expect(page).toHaveURL(`${baseUrl}/items`);
  const items = new ItemsPage(page);
  await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
  return { page, items, email };
}
