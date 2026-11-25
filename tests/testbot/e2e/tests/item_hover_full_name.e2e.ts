// Items page: each list item carries a hover title equal to its full name (EWA-6).
// Drafted from Skyramp walks of the add-item flows, then strengthened.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { APIRequestContext, Page } from "@playwright/test";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

function credentials(): { username: string; password: string } {
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  }
  return { username, password };
}

function apiHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function signIn(page: Page): Promise<string> {
  const { username, password } = credentials();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
  return username;
}

/** Wait until the list has loaded as many items as GET /api/items returns, and return those items. */
async function waitForListLoaded(page: Page, request: APIRequestContext): Promise<{ id: number; name: string }[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers: apiHeaders() });
  expect(res.status()).toBe(200);
  const items = (await res.json()) as { id: number; name: string }[];
  await expect(page.getByTestId("item")).toHaveCount(items.length);
  return items;
}

/** Fill 'New item', click 'Add item' and return the POST /api/items request body and response status. */
async function addItem(page: Page, name: string): Promise<{ body: unknown; status: number }> {
  await page.getByLabel("New item").fill(name);
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await responsePromise;
  return { body: response.request().postDataJSON(), status: response.status() };
}

/** Every list item's title equals its own visible text. */
async function titlesAndTexts(page: Page): Promise<{ title: string | null; text: string | null }[]> {
  return page.getByTestId("item").evaluateAll((els) =>
    els.map((el) => ({ title: el.getAttribute("title"), text: el.textContent }))
  );
}

function withTitleEqualToText(rows: { title: string | null; text: string | null }[]) {
  return rows.map((r) => ({ title: r.text, text: r.text }));
}

test.describe("Items page hover title", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test("journey: sign in, add an item with a long name, and see its full name on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const NAME = `Quarterly planning notes for the north-east regional warehouse team, revision 7 (final) & "approved" #${Date.now()}`;
    let before: { id: number; name: string }[] = [];
    let username = "";

    await test.step("1. /login: sign in and land on /items", async () => {
      username = await signIn(page);
      before = await waitForListLoaded(page, request);
    });

    await test.step("2. /items: add the long-named item", async () => {
      const { body, status } = await addItem(page, NAME);
      checkRequestPayload(body, { name: NAME });
      expect.soft(status).toBe(201);
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
      await expect.soft(page.getByTitle(NAME, { exact: true })).toHaveCount(1);
      await expect.soft(page.getByTitle(NAME, { exact: true })).toHaveText(NAME);
      await expect.soft(page.getByTestId("item")).toHaveCount(before.length + 1);
      await expect.soft.poll(async () => (await titlesAndTexts(page)).at(-1)).toEqual({ title: NAME, text: NAME });
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
    });

    await test.step("3. /items: reload and see the title still there", async () => {
      await page.reload();
      await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
      const after = await waitForListLoaded(page, request);
      expect.soft(after.length).toBe(before.length + 1);
      await expect.soft(page.getByTitle(NAME, { exact: true })).toHaveCount(1);
      await expect.soft(page.getByTitle(NAME, { exact: true })).toHaveText(NAME);
      await expect.soft.poll(async () => (await titlesAndTexts(page)).at(-1)).toEqual({ title: NAME, text: NAME });
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      const rows = await titlesAndTexts(page);
      expect.soft(rows).toEqual(withTitleEqualToText(rows));
      expect.soft(rows.map((r) => r.text)).toEqual(after.map((i) => i.name));
    });
  });

  test("journey: add an item with padded spaces, then a blank one", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const trimmed = `padded name ${Date.now()}`;
    const padded = `   ${trimmed}   `;
    let countAfterAdd = 0;

    await test.step("1. /login: sign in and land on /items", async () => {
      await signIn(page);
      await waitForListLoaded(page, request);
    });

    await test.step("2. /items: add the padded name", async () => {
      const { body } = await addItem(page, padded);
      checkRequestPayload(body, { name: padded });
      await expect.soft(page.getByTitle(trimmed, { exact: true })).toHaveCount(1);
      await expect.soft(page.getByTitle(trimmed, { exact: true })).toHaveText(trimmed);
      await expect.soft(page.getByTitle(padded, { exact: true })).toHaveCount(0);
      countAfterAdd = (await waitForListLoaded(page, request)).length;
    });

    await test.step("3. /items: submit a blank name", async () => {
      const { body, status } = await addItem(page, "   ");
      checkRequestPayload(body, { name: "   " });
      expect.soft(status).toBe(400);
      await expect.soft(page.getByTestId("item-error")).toBeVisible();
      await expect.soft(page.getByTestId("item-error")).toHaveText("name is required");
      await expect.soft(page.getByTestId("item")).toHaveCount(countAfterAdd);
      await expect.soft.poll(async () => (await titlesAndTexts(page)).at(-1)).toEqual({ title: trimmed, text: trimmed });
    });
  });

  test("an item added through the form gets a hover title equal to its full long name without a reload", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const NAME = `Quarterly planning notes for the north-east regional warehouse team, revision 7 (final) & "approved" #${Date.now()}`;
    expect(NAME.length).toBeGreaterThan(100);
    await signIn(page);
    await waitForListLoaded(page, request);

    const { body } = await addItem(page, NAME);
    checkRequestPayload(body, { name: NAME });
    await expect(page.getByLabel("New item")).toHaveValue("");
    await expect(page.getByTitle(NAME, { exact: true })).toHaveCount(1);
    await expect(page.getByTitle(NAME, { exact: true })).toHaveText(NAME);
    await expect(page.getByTitle(NAME, { exact: true })).toHaveAttribute("data-testid", "item");
  });

  test("items stored before the page opens get a hover title equal to their stored name, special characters included", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const runId = Date.now();
    const special = `Tom & "Jerry" <b>bold</b> café ${runId}`;
    const long = `${"L".repeat(300)}${runId}`;
    for (const name of [special, long]) {
      const res = await request.post(`${baseUrl}/api/items`, { data: { name }, headers: apiHeaders() });
      expect(res.status()).toBe(201);
      expect((await res.json()).name).toBe(name);
    }

    await signIn(page);
    const stored = await waitForListLoaded(page, request);

    for (const name of [special, long]) {
      await expect(page.getByTitle(name, { exact: true })).toHaveCount(1);
      await expect(page.getByTitle(name, { exact: true })).toHaveText(name);
    }
    await expect(page.getByTitle(special, { exact: true })).toHaveJSProperty("childElementCount", 0);
    const rows = await titlesAndTexts(page);
    expect(rows.map((r) => r.title)).toEqual(stored.map((i) => i.name));
    expect(rows.map((r) => r.text)).toEqual(stored.map((i) => i.name));
  });

  test("the hover title shows a padded name as saved, trimmed, the same as its text", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const trimmed = `padded name ${Date.now()}`;
    await signIn(page);
    await waitForListLoaded(page, request);

    const { body } = await addItem(page, `   ${trimmed}   `);
    checkRequestPayload(body, { name: `   ${trimmed}   ` });
    await expect(page.getByTitle(trimmed, { exact: true })).toHaveCount(1);
    await expect(page.getByTitle(trimmed, { exact: true })).toHaveText(trimmed);
    await expect(page.getByTitle(`   ${trimmed}   `, { exact: true })).toHaveCount(0);
  });

  test("the hover title persists after reloading the Items page", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const NAME = `Reload check & "title" ${Date.now()} ${"x".repeat(100)}`;
    await signIn(page);
    await waitForListLoaded(page, request);
    const { body } = await addItem(page, NAME);
    checkRequestPayload(body, { name: NAME });
    await expect(page.getByTitle(NAME, { exact: true })).toHaveCount(1);

    await page.goto(`${baseUrl}/items`);
    const stored = await waitForListLoaded(page, request);
    await expect(page.getByTitle(NAME, { exact: true })).toHaveCount(1);
    await expect(page.getByTitle(NAME, { exact: true })).toHaveText(NAME);
    const rows = await titlesAndTexts(page);
    expect(rows.map((r) => r.title)).toEqual(stored.map((i) => i.name));
  });

  test("a blank name is refused with 'name is required' and the list stays in id order, unchanged", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const latest = `latest item ${Date.now()}`;
    const created = await request.post(`${baseUrl}/api/items`, { data: { name: latest }, headers: apiHeaders() });
    expect(created.status()).toBe(201);

    await signIn(page);
    const stored = await waitForListLoaded(page, request);
    const ids = stored.map((i) => i.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const beforeRows = await titlesAndTexts(page);
    expect(beforeRows.map((r) => r.text)).toEqual(stored.map((i) => i.name));
    expect(beforeRows.at(-1)).toEqual({ title: latest, text: latest });

    const { body, status } = await addItem(page, "   ");
    checkRequestPayload(body, { name: "   " });
    expect(status).toBe(400);
    await expect(page.getByTestId("item-error")).toBeVisible();
    await expect(page.getByTestId("item-error")).toHaveText("name is required");
    await expect(page.getByTestId("item")).toHaveCount(stored.length);
    expect(await titlesAndTexts(page)).toEqual(beforeRows);
    expect((await titlesAndTexts(page)).at(-1)).toEqual({ title: latest, text: latest });
  });
});
