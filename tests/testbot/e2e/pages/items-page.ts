// Page object for the Items page (/items) and the item API it reads, shared by the item hover tests.
import type { APIRequestContext, Locator, Page, Response } from "@playwright/test";

export const appUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";
export const pagesUrl = process.env.SKYRAMP_TEST_SERVICE_URL_UI || appUrl;

export type Item = { id: number; name: string; created_at: string };

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Creates an item through POST /api/items and returns the saved record. */
export async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${appUrl}/api/items`, { data: { name }, headers: authHeaders() });
  if (res.status() !== 201) throw new Error(`POST /api/items answered ${res.status()}: ${await res.text()}`);
  return (await res.json()) as Item;
}

/** A name no earlier run used, so a test can find the row it made. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export class ItemsPage {
  readonly list: Locator;
  readonly rows: Locator;
  readonly userStatus: Locator;
  readonly newItemInput: Locator;
  readonly addItemButton: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.list = page.getByTestId("items-list");
    this.rows = this.list.getByTestId("item");
    this.userStatus = page.getByTestId("user-status");
    this.newItemInput = page.getByLabel("New item");
    this.addItemButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
  }

  /** Opens /items and returns the items the page itself loaded from GET /api/items. */
  async open(): Promise<Item[]> {
    const loaded = this.waitForItemsLoad();
    await this.page.goto(`${pagesUrl}/items`);
    return this.itemsFrom(await loaded);
  }

  waitForItemsLoad(): Promise<Response> {
    return this.page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET",
    );
  }

  async itemsFrom(response: Response): Promise<Item[]> {
    return (await response.json()) as Item[];
  }

  /** The row whose whole text is exactly this name. */
  row(name: string): Locator {
    return this.rows.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  /** Each listed row's visible text and title, in the order shown. */
  async rowTextsAndTitles(): Promise<{ text: string; title: string | null; testid: string | null }[]> {
    return this.rows.evaluateAll((els) =>
      els.map((el) => ({ text: el.textContent ?? "", title: el.getAttribute("title"), testid: el.getAttribute("data-testid") })),
    );
  }
}
