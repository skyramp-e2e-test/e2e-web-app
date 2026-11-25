import { expect, type Locator, type Page } from "@playwright/test";

export const baseUrl =
  process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

/** The login account the run supplies; never written into a test. */
export function credentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { email, password };
}

/** The /items page: list of items, the add form, its error and the empty-state message. */
export class ItemsPage {
  readonly navLogin: Locator;
  readonly navItems: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;
  readonly userStatus: Locator;
  readonly newItem: Locator;
  readonly addItem: Locator;
  readonly error: Locator;
  readonly empty: Locator;
  readonly visibleEmpty: Locator;
  readonly list: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.navLogin = page.getByTestId("nav-login");
    this.navItems = page.getByTestId("nav-items");
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.signIn = page.getByRole("button", { name: "Sign in" });
    this.userStatus = page.getByTestId("user-status");
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.empty = page.getByTestId("items-empty");
    this.visibleEmpty = page.locator("[data-testid=items-empty]:visible");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByTestId("item");
  }

  /** The listed item whose text is exactly `name`. */
  item(name: string): Locator {
    return this.items.filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  /**
   * Checks the list still starts with `before` and then holds each of `added` exactly once, in that order.
   * Items other tests add at the same time may sit between them, never before `before` ends.
   */
  async expectAddedAfter(before: string[], added: string[], soft = false): Promise<void> {
    const check = soft ? expect.soft : expect;
    await check
      .poll(async () => {
        const texts = await this.items.allTextContents();
        const rest = texts.slice(before.length);
        return {
          prefix: texts.slice(0, before.length),
          added: rest.filter((t) => added.includes(t)),
        };
      })
      .toEqual({ prefix: before, added });
  }

  /** Opens the home page, follows Login and signs in; lands on /items with the list loaded. */
  async signInFromHome(): Promise<void> {
    await this.page.goto(`${baseUrl}/`);
    await this.navLogin.click();
    await this.signInOnLoginPage();
  }

  /** On /login, signs in with the run's account; lands on /items with the list loaded. */
  async signInOnLoginPage(): Promise<void> {
    const { email, password } = credentials();
    await expect(this.email).toBeVisible();
    await expect(this.password).toBeVisible();
    await this.email.fill(email);
    await this.password.fill(password);
    const listed = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.signIn.click();
    const loaded: unknown[] = await (await listed).json();
    await expect(this.items).toHaveCount(loaded.length);
    await expect(this.page).toHaveURL(`${baseUrl}/items`);
    await expect(this.userStatus).toHaveText(`Signed in as ${email}`);
  }

  /** Fills New item and clicks Add item; resolves with the POST /api/items response. */
  async add(name: string) {
    await this.newItem.fill(name);
    const posted = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await this.addItem.click();
    return posted;
  }

  /** Reloads /items through the Items nav link, waiting for the list request. */
  async openViaNav(): Promise<void> {
    const listed = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.navItems.click();
    await listed;
  }

  async reload(): Promise<void> {
    const listed = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.page.goto(`${baseUrl}/items`);
    await listed;
  }
}

/**
 * Serves GET /api/items from the test so the page sees an empty items table whatever earlier runs stored;
 * once a POST /api/items is answered 201 by the real app, the list holds just that created item.
 */
export async function serveEmptyItemsTable(page: Page): Promise<void> {
  let created: unknown = null;
  await page.route("**/api/items", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: created ? [created] : [] });
      return;
    }
    const response = await route.fetch();
    if (response.status() === 201) created = await response.json();
    await route.fulfill({ response });
  });
}
