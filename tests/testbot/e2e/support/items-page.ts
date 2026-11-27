// Page object for /items and the items API the hover tests seed through.
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export type Item = { id: number; name: string; created_at: string };

// Every name a hover test creates carries this marker, so .skyramp/cleanup/delete-hover-items.sh can find it.
export function uniqueMarker(): string {
  return `tbhover-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name }, headers: authHeaders() });
  expect(res.status()).toBe(201);
  const item = (await res.json()) as Item;
  expect(item.name).toBe(name);
  return item;
}

export class ItemsPage {
  readonly list: Locator;
  readonly items: Locator;
  readonly newItemInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;
  readonly userStatus: Locator;

  constructor(readonly page: Page) {
    this.list = page.getByTestId("items-list");
    this.items = page.getByTestId("item");
    this.newItemInput = page.getByLabel("New item");
    this.addButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.userStatus = page.getByTestId("user-status");
  }

  /** Opens /items and returns the items the page itself loaded from GET /api/items. */
  async open(): Promise<Item[]> {
    const loaded = this.page.waitForResponse(
      (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
    );
    await this.page.goto(`${baseUrl}/items`);
    return this.waitForList(loaded);
  }

  /** Reloads /items and returns the items the page loaded. */
  async reload(): Promise<Item[]> {
    const loaded = this.page.waitForResponse(
      (r) => r.url().endsWith("/api/items") && r.request().method() === "GET",
    );
    await this.page.reload();
    return this.waitForList(loaded);
  }

  private async waitForList(loaded: ReturnType<Page["waitForResponse"]>): Promise<Item[]> {
    const items = (await (await loaded).json()) as Item[];
    await expect(this.items).toHaveCount(items.length);
    return items;
  }

  /** The list entry whose visible text is exactly this name. */
  entry(name: string): Locator {
    return this.items.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }
}
