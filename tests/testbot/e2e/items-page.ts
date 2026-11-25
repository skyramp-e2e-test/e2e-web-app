// Page object for the Items page (/items) and the sign-in that leads to it, shared by the Items e2e tests.
import { expect, type Page, type Locator, type Response } from "@playwright/test";
import { getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

export const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

export function credentials(): { username: string; password: string } {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { username, password };
}

export class ItemsPage {
  readonly page: Page;
  readonly userStatus: Locator;
  readonly emptyMessage: Locator;
  readonly list: Locator;
  readonly rows: Locator;
  readonly error: Locator;
  readonly nameInput: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    // Wrap the Playwright page with the Skyramp page.
    this.page = newSkyrampPlaywrightPage(page);
    this.userStatus = this.page.getByTestId("user-status");
    this.emptyMessage = this.page.getByTestId("items-empty");
    this.list = this.page.getByTestId("items-list");
    this.rows = this.list.getByTestId("item");
    this.error = this.page.getByTestId("item-error");
    this.nameInput = this.page.getByLabel("New item");
    this.addButton = this.page.getByRole("button", { name: "Add item" });
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  waitForItemsGet(): Promise<Response> {
    return this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  }

  waitForItemsPost(): Promise<Response> {
    return this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
  }

  /** Signs in through /login; the app redirects to /items. */
  async signIn(): Promise<void> {
    const { username, password } = credentials();
    await this.page.goto(`${baseUrl}/login`);
    await this.page.getByLabel("Email").fill(username);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
    await expect(this.userStatus).toHaveText(`Signed in as ${username}`);
  }

  /** Goes to /items and waits for the list request to be answered. */
  async open(): Promise<void> {
    const loaded = this.waitForItemsGet();
    await this.page.goto(`${baseUrl}/items`);
    await loaded;
  }

  /** Fills the New item field and clicks Add item; returns the POST /api/items response. */
  async add(name: string): Promise<Response> {
    await this.nameInput.fill(name);
    const posted = this.waitForItemsPost();
    await this.addButton.click();
    return posted;
  }
}
