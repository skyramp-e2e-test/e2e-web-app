// Page objects and helpers the item hover-text tests share.
import { expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Locator, Page, Response } from "@playwright/test";

export const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

export type Item = { id: number; name: string; created_at: string };

/** A name no other run uses; the cleanup script finds what these tests made by the "tbhover-" marker. */
export function uniqueSuffix(): string {
  return `tbhover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function credentials(): { username: string; password: string } {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { username, password };
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

  /** Signs in with the run's UI login and checks the Items page says who is signed in. Returns the email used. */
  async signInAsTestUser(): Promise<string> {
    const { username, password } = credentials();
    await this.email.fill(username);
    await this.password.fill(password);
    await this.signIn.click();
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
    await expect(this.page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
    return username;
  }
}

export class ItemsPage {
  readonly newItem: Locator;
  readonly addItem: Locator;
  readonly error: Locator;
  readonly userStatus: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.userStatus = page.getByTestId("user-status");
    this.items = page.getByTestId("items-list").getByTestId("item");
  }

  /** The li whose whole visible text is exactly `name`. */
  item(name: string): Locator {
    return this.items.filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
  }

  /** Waits for the GET /api/items the page makes as it loads, after `load` runs. */
  async loadedItems(load: () => Promise<unknown>): Promise<Item[]> {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items"
    );
    await load();
    return (await (await response).json()) as Item[];
  }

  /** Fills the Add item form and submits it; returns the POST /api/items response. */
  async add(name: string): Promise<Response> {
    await this.newItem.fill(name);
    const response = this.page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items"
    );
    await this.addItem.click();
    return response;
  }

  /** Marks the current document so a later check can tell the page was not reloaded. */
  async markDocument(): Promise<void> {
    await this.page.evaluate(() => {
      (window as unknown as { __hoverTestMark: string }).__hoverTestMark = "same-document";
    });
  }

  async documentMark(): Promise<string | undefined> {
    return this.page.evaluate(() => (window as unknown as { __hoverTestMark?: string }).__hoverTestMark);
  }
}

/** Wraps the page with Skyramp's page and signs in through /login; returns the Items page the sign-in lands on. */
export async function signedInItemsPage(rawPage: Page): Promise<{ page: Page; items: ItemsPage }> {
  const page = newSkyrampPlaywrightPage(rawPage) as Page;
  const login = new LoginPage(page);
  await login.goto();
  await login.signInAsTestUser();
  return { page, items: new ItemsPage(page) };
}

/** Creates an item through POST /api/items, as the plan's seed step does. */
export async function seedItem(page: Page, name: string): Promise<Item> {
  const res = await page.request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()) as Item;
}

export async function storedItems(page: Page): Promise<Item[]> {
  const res = await page.request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Item[];
}
