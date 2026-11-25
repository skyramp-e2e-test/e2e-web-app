// Browser tests of the items page (EWA-9 AC1, EWA-9 AC2), recorded with the Skyramp walk helper and extended.
// The app has no route that deletes an item, so the items these tests add stay in the database;
// every name they type starts with "testbot-ui-" so they can be found.
import { test, expect, type Page, type Response } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

const baseUrl = process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

test.use({ viewport: { width: 1280, height: 900 } });

function credentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: these tests sign in through the login page");
  }
  return { email, password };
}

function uniqueName(prefix: string): string {
  return `testbot-ui-${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

class ItemsPage {
  readonly createResponses: Response[] = [];

  constructor(readonly page: Page) {
    page.on("response", (res) => {
      if (res.request().method() === "POST" && new URL(res.url()).pathname === "/api/items") this.createResponses.push(res);
    });
  }

  get userStatus() { return this.page.getByTestId("user-status"); }
  get list() { return this.page.getByTestId("items-list"); }
  get items() { return this.list.getByTestId("item"); }
  get nameInput() { return this.page.getByLabel("New item"); }
  get addButton() { return this.page.getByRole("button", { name: "Add item" }); }
  get error() { return this.page.getByTestId("item-error"); }

  async signIn(email: string, password: string) {
    await this.page.goto(`${baseUrl}/login`);
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    this.landed = this.waitForList();
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await this.page.waitForURL(`${baseUrl}/items`);
    await expect(this.userStatus).toHaveText(`Signed in as ${email}`);
  }

  // The list as loaded from GET /api/items: reload (or open) the page and wait for that load.
  async open(): Promise<string[]> {
    const loaded = this.page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items");
    await this.page.goto(`${baseUrl}/items`);
    const items = (await (await loaded).json()) as { name: string }[];
    await expect(this.items).toHaveCount(items.length);
    return this.items.allTextContents();
  }

  async texts(): Promise<string[]> { return this.items.allTextContents(); }

  private landed?: Promise<string[]>;

  // Resolves with the list texts once the GET /api/items the page makes next has been rendered.
  private async waitForList(): Promise<string[]> {
    const res = await this.page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items");
    const items = (await res.json()) as { name: string }[];
    await expect(this.items).toHaveCount(items.length);
    return this.items.allTextContents();
  }

  // The list the page loaded when sign-in landed on /items.
  async landedList(): Promise<string[]> {
    if (!this.landed) throw new Error("not signed in through the login page");
    return this.landed;
  }

  // Reload the page in place and return the list it loads.
  async reload(): Promise<string[]> {
    const loaded = this.waitForList();
    await this.page.reload();
    return loaded;
  }

  async addNamed(name: string) {
    await this.nameInput.fill(name);
    const created = this.page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items");
    await this.addButton.click();
    const res = await created;
    checkRequestPayload(res.request().postDataJSON(), { name });
    return res;
  }

  async valueMissing(): Promise<boolean> {
    return this.nameInput.evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
  }

  // Refused: the page shows "name is required", or the browser blocked an empty submit before sending it.
  async expectRefused(allowBrowserBlock: boolean) {
    await expect.configure({ soft: true }).poll(async () => {
      if (await this.error.isVisible()) return (await this.error.textContent())?.trim();
      if (allowBrowserBlock && (await this.valueMissing()) && this.createResponses.length === 0) return "name is required";
      return `no message (item-error hidden, valueMissing ${await this.valueMissing()})`;
    }, { message: "a message saying the name is required is shown" }).toBe("name is required");
  }
}

const blanks = (texts: string[]) => texts.filter((t) => t.trim() === "").length;

async function setUp(page: Page): Promise<ItemsPage> {
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const { email, password } = credentials();
  await items.signIn(email, password);
  return items;
}

test.describe("items page", () => {
  test("a name added through the form is still listed after a reload (EWA-9 AC1)", async ({ page }) => {
    const items = await setUp(page);
    const before = await items.open();
    const name = uniqueName("Reload item");

    const res = await items.addNamed(name);
    expect(res.status()).toBe(201);
    await expect(items.items.filter({ hasText: name })).toHaveText([name]);

    const after = await items.open();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.filter((t) => t === name)).toEqual([name]);
    expect(after.indexOf(name)).toBeGreaterThanOrEqual(before.length);
  });

  test("an empty name is refused with a visible message and adds no item (EWA-9 AC2)", async ({ page }) => {
    const items = await setUp(page);
    const before = await items.open();

    await items.nameInput.fill("");
    await items.addButton.click();

    await items.expectRefused(true);
    expect.soft(items.createResponses.filter((r) => r.status() === 201).length, "no item was created").toBe(0);
    await expect.soft(items.items).toHaveText(before);

    const after = await items.open();
    expect(blanks(after)).toBe(blanks(before));
    expect(after.slice(0, before.length)).toEqual(before);
  });

  test("a whitespace-only name is refused with a visible message and adds no item (EWA-9 AC2)", async ({ page }) => {
    const items = await setUp(page);
    const before = await items.open();

    await items.nameInput.fill("   ");
    await items.addButton.click();

    await expect.soft(items.error).toBeVisible();
    await expect.soft(items.error).toHaveText("name is required");
    expect.soft(items.createResponses.filter((r) => r.status() === 201).length, "no item was created").toBe(0);
    await expect.soft(items.items).toHaveText(before);

    const after = await items.open();
    expect(blanks(after)).toBe(blanks(before));
    expect(after.slice(0, before.length)).toEqual(before);
  });

  test("sign in, add an item, reload and still see it", async ({ page }) => {
    const { email } = credentials();
    const name = uniqueName("Journey item");
    let items!: ItemsPage;
    let before: string[] = [];

    await test.step("1. sign in on /login and land on /items", async () => {
      items = await setUp(page);
    });
    await test.step("2. read the items listed on /items", async () => {
      before = await items.landedList();
      await expect(items.list).toBeAttached();
    });
    await test.step("3. add a uniquely named item", async () => {
      const res = await items.addNamed(name);
      expect.soft(res.status()).toBe(201);
      await expect.soft(items.items.filter({ hasText: name })).toHaveText([name]);
      const now = await items.texts();
      expect.soft(now.slice(0, before.length)).toEqual(before);
      expect.soft(now.indexOf(name)).toBeGreaterThanOrEqual(before.length);
      await expect.soft(items.nameInput).toHaveValue("");
      await expect.soft(items.error).toBeHidden();
    });
    await test.step("4. reload /items and see the item still listed", async () => {
      const after = await items.reload();
      expect.soft(after.slice(0, before.length)).toEqual(before);
      expect.soft(after.filter((t) => t === name)).toEqual([name]);
      expect.soft(after.indexOf(name)).toBeGreaterThanOrEqual(before.length);
      expect.soft(blanks(after)).toBe(blanks(before));
      await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
      await expect.soft(items.nameInput).toHaveValue("");
      await expect.soft(items.error).toBeHidden();
    });
  });

  test("try to add an item with no name, see why it is refused, then add a named one", async ({ page }) => {
    const { email } = credentials();
    const name = uniqueName("Named item");
    let items!: ItemsPage;
    let before: string[] = [];

    await test.step("1. sign in on /login and land on /items", async () => {
      items = await setUp(page);
    });
    await test.step("2. submit with the New item field empty", async () => {
      before = await items.landedList();
      await items.nameInput.fill("");
      await items.addButton.click();
      await items.expectRefused(true);
      expect.soft(items.createResponses.filter((r) => r.status() === 201).length, "no item was created").toBe(0);
      await expect.soft(items.items).toHaveText(before);
    });
    await test.step("3. submit three spaces", async () => {
      const created = items.createResponses.length;
      await items.nameInput.fill("   ");
      await items.addButton.click();
      await expect.soft(items.error).toBeVisible();
      await expect.soft(items.error).toHaveText("name is required");
      await expect.poll(() => items.createResponses.length).toBeGreaterThan(created);
      expect.soft(items.createResponses.slice(created).map((r) => r.status()), "whitespace name refused").toEqual([400]);
    });
    await test.step("4. add a named item", async () => {
      const res = await items.addNamed(name);
      expect.soft(res.status()).toBe(201);
      await expect.soft(items.error).toBeHidden();
      await expect.soft(items.nameInput).toHaveValue("");
      await expect.soft(items.items.filter({ hasText: name })).toHaveText([name]);
    });
    await test.step("5. reload /items", async () => {
      const after = await items.reload();
      expect.soft(after.slice(0, before.length)).toEqual(before);
      expect.soft(after.filter((t) => t === name)).toEqual([name]);
      expect.soft(after.length, "exactly one item added").toBe(before.length + 1);
      expect.soft(blanks(after), "no blank item").toBe(blanks(before));
      await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
      await expect.soft(items.error).toBeHidden();
    });
  });
});
