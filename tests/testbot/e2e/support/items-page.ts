// Shared fixture and page object for the Items page (/items) tests.
import { execFileSync } from "child_process";
import path from "path";
import { test as base, expect, type APIRequestContext, type Locator, type Page, type Response } from "@playwright/test";
import { checkRequestPayload, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

export const baseUrl: string = getBaseUrl("SKYRAMP_TEST_SERVICE_URL_APP", "http://localhost:3000");

// Every test's page goes through the Skyramp page wrapper.
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await use(newSkyrampPlaywrightPage(page) as Page);
  },
});
export { expect };

/** Empties the items table; the app has no delete API, so this goes through the database. */
export function emptyItems(): void {
  execFileSync("bash", [path.join(__dirname, "empty-items.sh")], { stdio: "inherit" });
}

/** A suffix that keeps names this run makes apart from earlier runs' names. */
export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function createItemViaApi(request: APIRequestContext, name: string): Promise<{ id: number; name: string }> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return res.json();
}

export class ItemsPage {
  readonly heading: Locator;
  readonly emptyState: Locator;
  readonly list: Locator;
  readonly items: Locator;
  readonly nameInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Items", exact: true });
    this.emptyState = page.getByTestId("items-empty");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByTestId("item");
    this.nameInput = page.getByLabel("New item");
    this.addButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
  }

  private waitForList(): Promise<Response> {
    return this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  }

  /** Opens /items and waits for the list request to answer. */
  async open(): Promise<void> {
    const listed = this.waitForList();
    await this.page.goto(`${baseUrl}/items`);
    await listed;
  }

  /** Opens / and follows the Items nav link, waiting for the list request to answer. */
  async openFromHome(): Promise<void> {
    await this.page.goto(`${baseUrl}/`);
    const listed = this.waitForList();
    await this.page.getByTestId("nav-items").click();
    await listed;
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
  }

  /** Fills the name, clicks Add item, checks the POST body the page sent, and returns the POST response. */
  async add(name: string): Promise<Response> {
    await this.nameInput.fill(name);
    const posted = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await this.addButton.click();
    const res = await posted;
    checkRequestPayload(res.request().postDataJSON(), { name });
    return res;
  }

  /** Adds a name the server accepts and waits for the list to reload. */
  async addAccepted(name: string): Promise<void> {
    const reloaded = this.waitForList();
    const res = await this.add(name);
    expect(res.status()).toBe(201);
    await reloaded;
  }
}
