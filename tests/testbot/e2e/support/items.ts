// Shared helpers for the Items page tests: sign-in, the page's locators and run-unique item names.
import { expect, newSkyrampPlaywrightPage, getBaseUrl } from "@skyramp/skyramp";
import type { Page, APIRequestContext } from "@playwright/test";

export const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

// Names this suite creates end in " tbx<id>" (UI) or " tbapi<id>" (API), so .skyramp/cleanup/items-cleanup.sh finds them.
export const uniqueId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const uiName = (label: string) => `${label} tbx${uniqueId()}`;
export const apiName = (label: string) => `${label} tbapi${uniqueId()}`;
const SUITE_ITEM = / tb(x|api)[0-9a-z]+$/;

export function credentials() {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  return { email, password };
}

export class ItemsPage {
  readonly page: Page;

  constructor(page: Page) {
    // Wrap playwright page with Skyramp page
    this.page = newSkyrampPlaywrightPage(page);
  }

  get userStatus() { return this.page.getByTestId("user-status"); }
  get nameInput() { return this.page.getByLabel("New item"); }
  get addButton() { return this.page.getByRole("button", { name: "Add item" }); }
  get error() { return this.page.getByTestId("item-error"); }
  get items() { return this.page.getByTestId("item"); }
  itemNamed(name: string) { return this.items.filter({ hasText: name }); }

  /** Signs in through the login form; `navigate: false` when the test has already opened /login itself. */
  async signIn({ navigate = true } = {}) {
    const { email, password } = credentials();
    if (navigate) await this.page.goto(`${baseUrl}/login`);
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    const listed = this.listResponse();
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await this.page.waitForURL(`${baseUrl}/items`);
    this.listedCount = (await (await listed).json()).length;
    await expect(this.userStatus).toHaveText(`Signed in as ${email}`);
  }

  private listedCount = -1;

  private listResponse() {
    return this.page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET");
  }

  /** The entries' names in page order, once the page has rendered the list its last GET /api/items returned. */
  async loadedNames(): Promise<string[]> {
    await expect(this.items).toHaveCount(this.listedCount);
    return this.items.allTextContents();
  }

  /** Clicks 'Add item' and, when the POST succeeds, waits for the list it reloads. Gives the POST's status. */
  async submit(): Promise<number> {
    const posted = this.page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST");
    const listed = this.listResponse();
    await this.addButton.click();
    const res = await posted;
    if (res.ok()) this.listedCount = (await (await listed).json()).length;
    return res.status();
  }

  /** Reloads /items and gives the names it then lists. */
  async reload(): Promise<string[]> {
    const listed = this.listResponse();
    await this.page.reload();
    this.listedCount = (await (await listed).json()).length;
    return this.loadedNames();
  }
}

/**
 * Entries the page lists, without those other tests of this suite (which may run at the same time) add, so a check of
 * the list stays on what was there before and on this test's own entries (`own`).
 */
export const withoutOtherTestItems = (names: string[], own: string[] = []) =>
  names.filter((n) => own.includes(n) || !SUITE_ITEM.test(n));

export async function listItems(request: APIRequestContext): Promise<Array<{ id: number; name: string; created_at: string }>> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return res.json();
}
