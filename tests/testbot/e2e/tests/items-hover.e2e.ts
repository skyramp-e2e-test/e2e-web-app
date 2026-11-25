// Items page: every list entry shows the item's full stored name on hover (its title attribute).
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { APIRequestContext, Page } from "@playwright/test";

const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

type ApiItem = { id: number; name: string };
type Entry = { text: string; title: string | null };

test.use({ viewport: { width: 1280, height: 900 } });

function loginCredentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { email, password };
}

async function createItem(request: APIRequestContext, name: string): Promise<ApiItem> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  const item = (await res.json()) as ApiItem;
  expect(item.name).toBe(name);
  return item;
}

async function apiItems(request: APIRequestContext): Promise<ApiItem[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return (await res.json()) as ApiItem[];
}

// Signs in through the login form, which redirects to /items.
async function signIn(page: Page): Promise<void> {
  const { email, password } = loginCredentials();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
}

// Waits for the list to show exactly `count` entries, then returns each entry's (text, title).
async function readEntries(page: Page, count: number): Promise<Entry[]> {
  const entries = page.getByTestId("items-list").getByTestId("item");
  await expect(entries).toHaveCount(count);
  return entries.evaluateAll((lis) => lis.map((li) => ({ text: li.textContent ?? "", title: li.getAttribute("title") })));
}

// Hovers every entry in list order (the items' id order, which the tests compare) and returns each one's title.
async function hoverTitles(page: Page): Promise<(string | null)[]> {
  const titles: (string | null)[] = [];
  for (const entry of await page.getByTestId("items-list").getByTestId("item").all()) {
    await entry.hover();
    titles.push(await entry.getAttribute("title"));
  }
  return titles;
}

// Hovers each entry whose visible text is exactly `name` and returns its title and number of child elements.
async function hoverNamed(page: Page, name: string): Promise<{ title: string | null; childElements: number }[]> {
  const found: { title: string | null; childElements: number }[] = [];
  for (const entry of await page.getByTestId("items-list").getByText(name, { exact: true }).all()) {
    await entry.hover();
    found.push({ title: await entry.getAttribute("title"), childElements: await entry.evaluate((li) => li.children.length) });
  }
  return found;
}

test.describe("Items page hover titles", () => {
  test.beforeEach(({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test("items saved before the page opens show their full name on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    await createItem(request, "Pre-existing alpha");
    await createItem(request, "Pre-existing beta");

    await signIn(page);
    const items = await apiItems(request);
    expect(items.map((i) => i.name)).toEqual(expect.arrayContaining(["Pre-existing alpha", "Pre-existing beta"]));
    const entries = await readEntries(page, items.length);

    const titles = await hoverTitles(page);
    for (let i = 0; i < items.length; i++) {
      expect.soft(titles[i], `entry ${i} title`).toBe(items[i].name);
      expect.soft(entries[i].text, `entry ${i} text`).toBe(items[i].name);
    }
  });

  test("an item added through the form shows its trimmed full name on hover without a reload", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    await signIn(page);
    const before = await apiItems(request);
    const entriesBefore = await readEntries(page, before.length);
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    await page.getByLabel("New item").fill("  Hover new item  ");
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Add item" }).click();
    const response = await responsePromise;
    checkRequestPayload(response.request().postDataJSON(), { name: "  Hover new item  " });
    expect(response.status()).toBe(201);

    const entriesAfter = await readEntries(page, before.length + 1);
    expect(navigations).toEqual([]);
    const last = entriesAfter[entriesAfter.length - 1];
    expect((await hoverTitles(page))[entriesAfter.length - 1]).toBe("Hover new item");
    expect(last.text).toBe("Hover new item");
    const after = await apiItems(request);
    expect(after[after.length - 1].name).toBe("Hover new item");
    expect(entriesAfter.slice(0, -1)).toEqual(entriesBefore);
    for (const e of entriesAfter) expect.soft(e.title).toBe(e.text);
    await expect(page.getByLabel("New item")).toHaveValue("");
    await expect(page.getByTestId("item-error")).toBeHidden();
  });

  test("a 500-character item name is shown whole on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const longName = "Long item name " + "x".repeat(485);
    expect(longName).toHaveLength(500);
    const created = await createItem(request, longName);

    await signIn(page);
    const items = await apiItems(request);
    const index = items.findIndex((i) => i.id === created.id);
    expect(index).toBeGreaterThanOrEqual(0);
    const entries = await readEntries(page, items.length);

    const hovered = await hoverNamed(page, longName);
    expect(hovered).toHaveLength(items.filter((i) => i.name === longName).length);
    for (const { title } of hovered) {
      expect(title).toBe(longName);
      expect(title).toHaveLength(500);
    }
    expect(entries[index].text).toBe(longName);
  });

  test("names with markup, quotes and non-ASCII text show literally on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const names = ["<b>bold</b> & \"quoted\" 's", "Ünïcødé 名前 😀"];
    const created = [];
    for (const name of names) created.push(await createItem(request, name));

    await signIn(page);
    const items = await apiItems(request);
    await readEntries(page, items.length);

    for (const item of created) {
      const index = items.findIndex((i) => i.id === item.id);
      expect(index, `${item.name} listed`).toBeGreaterThanOrEqual(0);
      // Found by exact visible text, so a match also shows the text is the literal name.
      const hovered = await hoverNamed(page, item.name);
      expect.soft(hovered, `entries showing ${item.name}`).toHaveLength(items.filter((i) => i.name === item.name).length);
      for (const { title, childElements } of hovered) {
        expect.soft(title, `title of ${item.name}`).toBe(item.name);
        expect.soft(childElements, `child elements of ${item.name}`).toBe(0);
      }
    }
  });

  test("hover titles stay the same after the Items page is reopened", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    await signIn(page);
    const before = await apiItems(request);
    await readEntries(page, before.length);

    await page.getByLabel("New item").fill("  Hover reload item  ");
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Add item" }).click();
    checkRequestPayload((await responsePromise).request().postDataJSON(), { name: "  Hover reload item  " });
    const beforeReload = await readEntries(page, before.length + 1);

    await page.goto(`${baseUrl}/items`);
    const afterReload = await readEntries(page, before.length + 1);
    expect(afterReload).toEqual(beforeReload);
    expect(afterReload[afterReload.length - 1]).toEqual({ text: "Hover reload item", title: "Hover reload item" });
    const saved = await apiItems(request);
    expect(afterReload.map((e) => e.title)).toEqual(saved.map((i) => i.name));
    for (const e of afterReload) expect.soft(e.title).toBe(e.text);
  });

  test("sign in, add an item and read every entry's full name on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const { email, password } = loginCredentials();
    const newName = "Walk tooltip item " + "y".repeat(120);
    let before: ApiItem[] = [];
    let entriesBefore: Entry[] = [];

    await test.step("1. open home and follow the Login link", async () => {
      await page.goto(`${baseUrl}/`);
      await page.getByTestId("nav-login").click();
      await expect.soft(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });

    await test.step("2. sign in with the login form", async () => {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/items$/);
      await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
    });

    await test.step("3. hover each existing entry", async () => {
      before = await apiItems(request);
      entriesBefore = await readEntries(page, before.length);
      const titles = await hoverTitles(page);
      for (let i = 0; i < before.length; i++) {
        expect.soft(titles[i], `entry ${i} title`).toBe(before[i].name);
        expect.soft(entriesBefore[i].text, `entry ${i} text`).toBe(before[i].name);
      }
    });

    await test.step("4. add a padded 138-character item", async () => {
      expect(newName).toHaveLength(138);
      await page.getByLabel("New item").fill(`  ${newName}  `);
      const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Add item" }).click();
      checkRequestPayload((await responsePromise).request().postDataJSON(), { name: `  ${newName}  ` });
      const entries = await readEntries(page, before.length + 1);
      expect.soft(entries[before.length].text).toBe(newName);
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
    });

    await test.step("5. hover the new entry", async () => {
      const entries = await readEntries(page, before.length + 1);
      expect.soft((await hoverTitles(page))[before.length]).toBe(newName);
      expect.soft(entries.slice(0, -1)).toEqual(entriesBefore);
    });

    await test.step("6. reopen the Items page", async () => {
      await page.reload();
      const saved = await apiItems(request);
      expect.soft(saved).toHaveLength(before.length + 1);
      expect.soft(saved[saved.length - 1].name).toBe(newName);
      const entries = await readEntries(page, before.length + 1);
      expect.soft(entries.map((e) => e.text)).toEqual(saved.map((i) => i.name));
      expect.soft(entries.map((e) => e.title)).toEqual(saved.map((i) => i.name));
      expect.soft(entries[entries.length - 1]).toEqual({ text: newName, title: newName });
      await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
    });
  });
});
