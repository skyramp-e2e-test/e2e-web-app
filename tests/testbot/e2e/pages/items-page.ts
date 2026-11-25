import { expect, type Page } from "@playwright/test";

/** Page object for /login and /items, shared by the Items page tests. */
export class ItemsPage {
  constructor(readonly page: Page) {}

  readonly userStatus = () => this.page.getByTestId("user-status");
  readonly emptyMessage = () => this.page.getByTestId("items-empty");
  readonly list = () => this.page.getByTestId("items-list");
  readonly items = () => this.list().getByTestId("item");
  readonly item = (name: string) => this.list().getByText(name, { exact: true });
  readonly nameInput = () => this.page.getByLabel("New item");
  readonly addButton = () => this.page.getByRole("button", { name: "Add item" });
  readonly error = () => this.page.getByTestId("item-error");

  /** Signs in through /login with the run's UI login and waits for /items. */
  async signIn() {
    await this.page.goto("/login");
    await this.submitLogin();
  }

  /** On /login, submits the run's UI login and waits for /items. */
  async submitLogin() {
    const email = process.env.SKYRAMP_UI_USERNAME as string;
    const password = process.env.SKYRAMP_UI_PASSWORD as string;
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await expect(this.page).toHaveURL(/\/items$/);
    await expect(this.userStatus()).toHaveText(`Signed in as ${email}`);
  }

  /** Opens /items and waits for its GET /api/items to answer. */
  async open() {
    const loaded = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.page.goto("/items");
    await loaded;
  }

  /** Reloads /items and waits for its GET /api/items to answer. */
  async reload() {
    const loaded = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.page.reload();
    await loaded;
  }

  /** Types a name, clicks Add item and returns the POST /api/items response. */
  async add(name: string) {
    await this.nameInput().fill(name);
    const posted = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await this.addButton().click();
    return posted;
  }
}
