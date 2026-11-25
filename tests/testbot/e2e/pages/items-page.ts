import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const appUrl = process.env.SKYRAMP_TEST_SERVICE_URL_APP || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export type ApiItem = { id: number; name: string; created_at: string };

/** GET /api/items: every item, in id order. */
export async function fetchItems(request: APIRequestContext): Promise<ApiItem[]> {
  const res = await request.get(`${appUrl}/api/items`);
  expect(res.status()).toBe(200);
  return res.json();
}

/** POST /api/items with the given name; returns the created item. */
export async function createItem(request: APIRequestContext, name: string): Promise<ApiItem> {
  const res = await request.post(`${appUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return res.json();
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class ItemsPage {
  readonly userStatus: Locator;
  readonly newItemInput: Locator;
  readonly addItemButton: Locator;
  readonly itemError: Locator;
  readonly itemsList: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.newItemInput = page.getByLabel("New item");
    this.addItemButton = page.getByRole("button", { name: "Add item" });
    this.itemError = page.getByTestId("item-error");
    this.itemsList = page.getByTestId("items-list");
    this.items = page.getByTestId("item");
  }

  async goto() {
    await this.page.goto(`${appUrl}/items`);
  }

  /** The list item whose whole visible text is exactly `name`. */
  itemNamed(name: string): Locator {
    return this.items.filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
  }

  /** The element whose hover tooltip (title) is exactly `name`. */
  byTitle(name: string): Locator {
    return this.page.getByTitle(name, { exact: true });
  }

  /** The text and title attribute of every listed item, in list order. */
  async listed(): Promise<{ text: string; title: string | null }[]> {
    return this.items.evaluateAll((els) => els.map((el) => ({ text: el.textContent ?? "", title: el.getAttribute("title") })));
  }

  /** Checks the list as shown against GET /api/items: same count, and each item's text and title equal its name, in order. */
  async expectListMatchesApi(request: APIRequestContext, { checkTitles }: { checkTitles: boolean }) {
    // Another test may add an item between the page load and the API read: retry with a fresh load.
    await expect(async () => {
      await this.goto();
      const api = await fetchItems(request);
      await expect(this.items).toHaveCount(api.length, { timeout: 3000 });
      const shown = await this.listed();
      expect(shown.map((s) => s.text)).toEqual(api.map((i) => i.name));
      if (checkTitles) expect(shown.map((s) => s.title)).toEqual(api.map((i) => i.name));
    }).toPass({ timeout: 20000 });
  }
}
