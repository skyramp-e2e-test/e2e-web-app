// Page object for /items and /login, and the API calls the item tests seed through.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@skyramp/skyramp";

export const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

export interface StoredItem {
  id: number;
  name: string;
}

/** POST /api/items, as the page's form does; returns the stored item (201). */
export async function createItem(request: APIRequestContext, name: string): Promise<StoredItem> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()) as StoredItem;
}

/** GET /api/items: every item, in creation order. */
export async function listItems(request: APIRequestContext): Promise<StoredItem[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return (await res.json()) as StoredItem[];
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
}

export class ItemsPage {
  readonly userStatus: Locator;
  readonly newItem: Locator;
  readonly addItem: Locator;
  readonly error: Locator;
  readonly list: Locator;
  readonly items: Locator;
  readonly navItems: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByTestId("item");
    this.navItems = page.getByTestId("nav-items");
  }

  async goto() {
    await this.page.goto(`${baseUrl}/items`);
    await expect(this.items).not.toHaveCount(0);
  }

  /** The entry whose hover tooltip is exactly this name. */
  byTitle(name: string): Locator {
    return this.list.getByTitle(name, { exact: true });
  }

  /** The entries whose text is exactly this name. */
  byText(name: string): Locator {
    return this.items.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  /** The entries whose title differs from their text (none, when every entry shows its full name on hover). */
  async entriesWithoutMatchingTitle(): Promise<{ text: string; title: string | null }[]> {
    return this.items.evaluateAll((els) =>
      els
        .map((el) => ({ text: el.textContent ?? "", title: el.getAttribute("title") }))
        .filter((e) => e.title !== e.text),
    );
  }

  /** Text and title of each entry, in list order. */
  async entries(): Promise<{ text: string; title: string | null }[]> {
    return this.items.evaluateAll((els) => els.map((el) => ({ text: el.textContent ?? "", title: el.getAttribute("title") })));
  }
}
