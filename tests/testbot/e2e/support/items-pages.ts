// Page objects for the app's /login and /items pages, shared by the browser tests in this package.
import type { Locator, Page, Response } from "@playwright/test";

export const appBaseUrl = (): string =>
  process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

/** The seeded user's sign-in, read from the run's login variables. */
export function uiCredentials(): { username: string; password: string } {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: the tests sign in as the seeded user");
  }
  return { username, password };
}

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submit: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByTestId("email-input");
    this.passwordInput = page.getByTestId("password-input");
    this.submit = page.getByTestId("login-submit");
  }

  async goto(): Promise<void> {
    await this.page.goto(`${appBaseUrl()}/login`);
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submit.click();
  }
}

export class ItemsPage {
  readonly userStatus: Locator;
  readonly nameInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;
  readonly list: Locator;

  constructor(private readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.nameInput = page.getByTestId("item-name-input");
    this.addButton = page.getByTestId("add-item-submit");
    this.error = page.getByTestId("item-error");
    this.list = page.getByTestId("items-list");
  }

  async goto(): Promise<void> {
    await this.page.goto(`${appBaseUrl()}/items`);
  }

  /** The list entries whose whole text is exactly `name`. */
  itemNamed(name: string): Locator {
    return this.list.getByTestId("item").filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  }

  /** Types `name` and clicks Add item; resolves with the POST /api/items response. */
  async addItem(name: string): Promise<Response> {
    await this.nameInput.fill(name);
    const posted = this.page.waitForResponse(
      (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
    );
    await this.addButton.click();
    return posted;
  }
}
