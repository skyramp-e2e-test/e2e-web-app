// Shared by the Items page browser tests: sign-in, item seeding and the Items page's elements.
import type { APIRequestContext, Page, Response } from "@playwright/test";
import { expect, getBaseUrl } from "@skyramp/skyramp";

export const baseUrl = getBaseUrl("SKYRAMP_TEST_SERVICE_URL_APP", "http://localhost:3000");

export type Item = { id: number; name: string; created_at: string };

function apiHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function credential(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: these tests sign in with that credential from the environment`);
  return value;
}

export const uiUsername = () => credential("SKYRAMP_UI_USERNAME");

/** POST /api/items and return the saved item. The app has no delete endpoint, so items stay. */
export async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name }, headers: apiHeaders() });
  expect(res.status(), `POST /api/items ${JSON.stringify(name).slice(0, 60)}`).toBe(201);
  return (await res.json()) as Item;
}

/** GET /api/items, in the order the API returns them (by id). */
export async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers: apiHeaders() });
  expect(res.status()).toBe(200);
  return (await res.json()) as Item[];
}

export class ItemsPage {
  constructor(readonly page: Page) {}

  readonly email = () => this.page.getByLabel("Email");
  readonly password = () => this.page.getByLabel("Password");
  readonly signInButton = () => this.page.getByRole("button", { name: "Sign in" });
  readonly userStatus = () => this.page.getByTestId("user-status");
  readonly list = () => this.page.getByTestId("items-list");
  readonly rows = () => this.list().getByTestId("item");
  readonly rowByTitle = (name: string) => this.list().getByTitle(name, { exact: true });
  readonly rowByText = (name: string) => this.list().getByText(name, { exact: true });
  readonly newItemInput = () => this.page.getByLabel("New item");
  readonly addItemButton = () => this.page.getByRole("button", { name: "Add item" });
  readonly itemError = () => this.page.getByTestId("item-error");

  /** Sign in through /login and land on /items; returns the items the page loaded, once its list shows them all. */
  async signIn(): Promise<Item[]> {
    await this.page.goto(`${baseUrl}/login`);
    await this.email().fill(uiUsername());
    await this.password().fill(credential("SKYRAMP_UI_PASSWORD"));
    const loaded = this.page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET");
    await this.signInButton().click();
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
    await expect(this.userStatus()).toHaveText(`Signed in as ${uiUsername()}`);
    return this.waitForList(loaded);
  }

  /** Reload /items; returns the items the page loaded, once its list shows them all. */
  async reload(): Promise<Item[]> {
    const loaded = this.page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET");
    await this.page.goto(`${baseUrl}/items`);
    return this.waitForList(loaded);
  }

  private async waitForList(loaded: Promise<Response>): Promise<Item[]> {
    const loadedItems = (await (await loaded).json()) as Item[];
    await expect(this.rows()).toHaveCount(loadedItems.length);
    return loadedItems;
  }

  /** Every row's [visible text, title attribute], in page order. */
  async textsAndTitles(): Promise<Array<[string, string | null]>> {
    return this.rows().evaluateAll((lis) => lis.map((li) => [li.textContent ?? "", li.getAttribute("title")] as [string, string | null]));
  }
}
