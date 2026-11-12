// Browser tests for adding items on the Items page.
// The app has no route to delete an item, so items these tests add stay in the
// database; every name is made unique to the run.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { newSkyrampPlaywrightPage, uniqueSuffix } from "@skyramp/skyramp";

class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.submit = page.getByRole("button", { name: "Sign in" });
  }

  async signIn(email: string, password: string) {
    await this.page.goto("/login");
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}

class ItemsPage {
  readonly userStatus: Locator;
  readonly nameInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;
  readonly list: Locator;
  readonly items: Locator;

  constructor(readonly page: Page) {
    this.userStatus = page.getByTestId("user-status");
    this.nameInput = page.getByLabel("New item");
    this.addButton = page.getByRole("button", { name: "Add item" });
    this.error = page.getByTestId("item-error");
    this.list = page.getByTestId("items-list");
    this.items = this.list.getByRole("listitem");
  }

  item(name: string): Locator {
    return this.items.filter({ hasText: name });
  }

  /** Waits for the list to load from GET /api/items and returns how many entries it shows. */
  async loadedCount(): Promise<number> {
    const loaded = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await this.page.reload();
    await loaded;
    return this.items.count();
  }

  /** Types a name, clicks Add item, and returns the POST /api/items request it sent. */
  async add(name: string) {
    await this.nameInput.fill(name);
    const posted = this.page.waitForRequest((r) => r.url().endsWith("/api/items") && r.method() === "POST");
    const answered = this.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await this.addButton.click();
    const request = await posted;
    await answered;
    return request;
  }
}

function credentials() {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  return { email, password };
}

test.describe("Items page", () => {
  test.beforeEach(async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const { email, password } = credentials();
    await new LoginPage(page).signIn(email, password);
    await expect(page).toHaveURL(/\/items$/);
  });

  test("a whitespace-only name shows the error and adds nothing", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const before = await items.loadedCount();

    const request = await items.add("   ");
    expect(request.postDataJSON()).toEqual({ name: "   " });

    await expect(items.error).toBeVisible();
    await expect(items.error).toHaveText("name is required");
    await expect(items.items).toHaveCount(before);

    expect(await items.loadedCount()).toBe(before);
  });

  test("a name typed with surrounding spaces is listed trimmed", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const name = uniqueSuffix("Spaced UI");

    const request = await items.add(`  ${name}  `);
    expect(request.postDataJSON()).toEqual({ name: `  ${name}  ` });

    const entry = items.item(name);
    await expect(entry).toHaveCount(1);
    expect(await entry.evaluate((li) => li.textContent)).toBe(name);
  });

  test("signed-in user adds items, a blank name is refused and a padded name shows trimmed", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const { email } = credentials();
    const journeyName = uniqueSuffix("Journey item");
    const spacedName = uniqueSuffix("Spaced UI");
    let countAfterValid = 0;
    let blankBefore = 0;

    await test.step("1. signed in, the Items page shows the user", async () => {
      await expect.soft(page).toHaveURL(/\/items$/);
      await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
      await items.loadedCount();
      blankBefore = (await items.items.allTextContents()).filter((t) => t.trim() === "").length;
    });

    await test.step("2. add a valid item", async () => {
      const request = await items.add(journeyName);
      expect.soft(request.postDataJSON()).toEqual({ name: journeyName });
      await expect.soft(items.item(journeyName)).toHaveCount(1);
      await expect.soft(items.nameInput).toHaveValue("");
      await expect.soft(items.error).toBeHidden();
      countAfterValid = await items.items.count();
    });

    await test.step("3. a blank name shows the error and adds no entry", async () => {
      const request = await items.add("   ");
      expect.soft(request.postDataJSON()).toEqual({ name: "   " });
      await expect.soft(items.error).toBeVisible();
      await expect.soft(items.error).toHaveText("name is required");
      await expect.soft(items.items).toHaveCount(countAfterValid);
    });

    await test.step("4. a padded name is listed trimmed", async () => {
      const request = await items.add(`  ${spacedName}  `);
      expect.soft(request.postDataJSON()).toEqual({ name: `  ${spacedName}  ` });
      const entry = items.item(spacedName);
      await expect.soft(entry).toHaveCount(1);
      if ((await entry.count()) === 1) {
        expect.soft(await entry.evaluate((li) => li.textContent)).toBe(spacedName);
      }
    });

    await test.step("5. after reload the valid item persists and no blank entry is listed", async () => {
      await items.loadedCount();
      await expect.soft(items.item(journeyName)).toHaveCount(1);
      const texts = await items.items.allTextContents();
      expect.soft(texts.filter((t) => t.trim() === "")).toHaveLength(blankBefore);
      expect.soft(texts.filter((t) => t.includes(spacedName))).toEqual([spacedName]);
    });
  });
});
