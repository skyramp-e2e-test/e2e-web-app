// Page object for /items and the item API calls its tests seed through.
import type { APIRequestContext, Locator, Page, Response } from "@playwright/test";
import { expect, getBaseUrl } from "@skyramp/skyramp";

export const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

export type Item = { id: number; name: string; created_at: string };

/** A suffix that makes the names a test creates unique to its run. */
export function runId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Creates an item through POST /api/items and returns the stored record. */
export async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status(), `POST /api/items ${JSON.stringify(name)}`).toBe(201);
  return (await res.json()) as Item;
}

export class ItemsPage {
  readonly userStatus: Locator;
  readonly newItemInput: Locator;
  readonly addItemButton: Locator;
  readonly itemError: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.newItemInput = page.getByLabel("New item");
    this.addItemButton = page.getByRole("button", { name: "Add item" });
    this.itemError = page.getByTestId("item-error");
    this.items = page.getByTestId("items-list").getByTestId("item");
  }

  /** The list item whose hover title is exactly this name. */
  itemTitled(name: string): Locator {
    return this.page.getByTitle(name, { exact: true });
  }

  /** Waits for the GET /api/items the page renders from, so the list can be compared with what it got. */
  waitForItemsLoad(): Promise<Response> {
    return this.page.waitForResponse(
      (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items",
    );
  }

  /** Opens /items and returns the items the page's own GET /api/items returned. */
  async open(): Promise<Item[]> {
    const loaded = this.waitForItemsLoad();
    await this.page.goto(`${baseUrl}/items`);
    const res = await loaded;
    expect(res.status()).toBe(200);
    return (await res.json()) as Item[];
  }

  /** Each list item's visible text and title attribute, in page order. */
  async listed(): Promise<{ text: string; title: string | null }[]> {
    return this.items.evaluateAll((lis) =>
      lis.map((li) => ({ text: li.textContent ?? "", title: li.getAttribute("title") })),
    );
  }

  /** Asserts the list shows exactly these items, in this order: text and title both equal each name. */
  async expectListMatches(apiItems: Item[]): Promise<void> {
    await expect(this.items).toHaveCount(apiItems.length);
    const names = apiItems.map((i) => i.name);
    const listed = await this.listed();
    expect(listed.map((l) => l.text), "visible text of each item, in API order").toEqual(names);
    expect(listed.map((l) => l.title), "title of each item, in API order").toEqual(names);
  }
}
