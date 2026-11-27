// Page object for /items and the item API calls the hover-title tests share.
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const UI_URL = process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";
export const API_URL = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

// Every item these tests create carries this marker, so a cleanup can find them (the app has no delete endpoint).
export const ITEM_MARKER = "tbhover";

let counter = 0;
export function uniqueTag(): string {
  counter += 1;
  return `${ITEM_MARKER}-${Date.now()}-${process.pid}-${counter}`;
}

export type ApiItem = { id: number; name: string; created_at: string };
export type RowSnapshot = { title: string | null; text: string | null };

export async function createItem(request: APIRequestContext, name: string): Promise<ApiItem> {
  const res = await request.post(`${API_URL}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()) as ApiItem;
}

export class ItemsPage {
  readonly rows: Locator;
  readonly newItemInput: Locator;
  readonly addItemButton: Locator;
  readonly itemError: Locator;
  readonly userStatus: Locator;

  constructor(readonly page: Page) {
    this.rows = page.getByTestId("item");
    this.newItemInput = page.getByLabel("New item");
    this.addItemButton = page.getByRole("button", { name: "Add item" });
    this.itemError = page.getByTestId("item-error");
    this.userStatus = page.getByTestId("user-status");
  }

  private itemsListed() {
    return this.page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET"
    );
  }

  /** Opens /items and returns the items the page itself fetched, once the list shows one row per item. */
  async open(): Promise<ApiItem[]> {
    const listed = this.itemsListed();
    await this.page.goto(`${UI_URL}/items`);
    const items = (await (await listed).json()) as ApiItem[];
    await expect(this.rows).toHaveCount(items.length);
    return items;
  }

  row(text: string): Locator {
    return this.rows.filter({ hasText: text });
  }

  async snapshot(): Promise<RowSnapshot[]> {
    return this.rows.evaluateAll((els) => els.map((el) => ({ title: el.getAttribute("title"), text: el.textContent })));
  }

  /** Submits the Add item form; resolves with the POST /api/items response and the list the page fetched after it. */
  async submitName(name: string) {
    await this.newItemInput.fill(name);
    const posted = this.page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST"
    );
    await this.addItemButton.click();
    return posted;
  }
}
