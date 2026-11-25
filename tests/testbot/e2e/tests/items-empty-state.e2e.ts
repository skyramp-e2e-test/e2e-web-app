// Items page empty state (EWA-8) and adding items through the Add item button (requirements.csv AC1).
// Drafted with the Skyramp walk helper, then strengthened.
//
// The app has no API to delete items, so the tests reach the database through the compose `db` service
// (docker compose exec ... psql) to empty the items table where a case starts from no items, and to remove
// the items each test made. Tests in this file run one after another (the config is not fullyParallel).
import { execFileSync } from "child_process";
import * as path from "path";
import type { APIRequestContext, Page, Response } from "@playwright/test";
import { test, expect, checkRequestPayload, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const composeFile = path.join(repoRoot, "docker-compose.yml");

// The running compose project whose config file is this repository's docker-compose.yml; when none is
// found, docker compose picks its own default project.
function composeProject(): string | undefined {
  const listed = JSON.parse(execFileSync("docker", ["compose", "ls", "--format", "json"]).toString()) as Array<{ Name: string; ConfigFiles: string }>;
  return listed.find((p) => p.ConfigFiles.split(",").includes(composeFile))?.Name;
}

function sql(query: string): string {
  const project = composeProject();
  return execFileSync(
    "docker",
    ["compose", "-f", composeFile, ...(project ? ["-p", project] : []), "exec", "-T", "db", "psql", "-U", "app", "-d", "app", "-v", "ON_ERROR_STOP=1", "-tAc", query],
    // Compose interpolates APP_SIGNING_SECRET even for exec; the value is not used by this command.
    { env: { ...process.env, APP_SIGNING_SECRET: process.env.APP_SIGNING_SECRET || "unused-for-exec" } },
  ).toString();
}

const emptyItems = () => sql("TRUNCATE items RESTART IDENTITY");
const deleteItems = (ids: number[]) => {
  const safe = ids.filter((id) => Number.isInteger(id));
  if (safe.length) sql(`DELETE FROM items WHERE id IN (${safe.join(",")})`);
};

async function createItem(request: APIRequestContext, name: string): Promise<{ id: number; name: string }> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name } });
  expect(res.status()).toBe(201);
  return res.json();
}

async function listedNames(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return (await res.json()).map((i: { name: string }) => i.name);
}

const isItemsList = (r: Response) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/items";
const isItemsAdd = (r: Response) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items";

// Opens /items and waits for its list request to be answered.
async function openItems(page: Page) {
  const listed = page.waitForResponse(isItemsList);
  await page.goto(`${baseUrl}/items`);
  await listed;
}

// Fills New item, clicks Add item and returns the POST response, checking the body sent.
async function addItem(page: Page, name: string): Promise<Response> {
  await page.getByLabel("New item").fill(name);
  const added = page.waitForResponse(isItemsAdd);
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await added;
  checkRequestPayload(response.request().postDataJSON(), { name });
  return response;
}

async function signIn(page: Page) {
  const email = process.env.SKYRAMP_UI_USERNAME as string;
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(process.env.SKYRAMP_UI_PASSWORD as string);
  await page.getByRole("button", { name: "Sign in" }).click();
  return email;
}

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let made: number[] = [];

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
  made = [];
});

test.afterEach(() => {
  deleteItems(made);
});

test.describe("Items page empty state", () => {
  test("shows No items yet and no entries when there are no items", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    emptyItems();
    expect(await listedNames(request)).toEqual([]);

    await openItems(page);

    await expect(page.getByTestId("items-empty")).toBeVisible();
    await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
    await expect(page.getByTestId("items-list")).toBeAttached();
    await expect(page.getByTestId("items-list").getByTestId("item")).toHaveCount(0);
  });

  test("does not show No items yet on load when items exist", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `Seeded ${unique()}`;
    made.push((await createItem(request, name)).id);

    await openItems(page);

    await expect(page.getByTestId("items-list").getByTestId("item").filter({ hasText: name })).toHaveText([name]);
    await expect(page.getByTestId("items-empty")).toBeHidden();
    await expect(page.getByText("No items yet")).not.toBeVisible();
  });

  test("adding the first item hides No items yet without a reload", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    emptyItems();
    await openItems(page);
    await expect(page.getByTestId("items-empty")).toBeVisible();
    await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
    await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });

    const response = await addItem(page, "First item");
    expect(response.status()).toBe(201);
    made.push((await response.json()).id);

    await expect(page.getByTestId("items-list").getByTestId("item")).toHaveText(["First item"]);
    await expect(page.getByTestId("items-empty")).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    expect(new URL(page.url()).pathname).toBe("/items");
    expect(await listedNames(request)).toEqual(["First item"]);
  });

  test("a rejected add leaves No items yet shown", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    emptyItems();
    await openItems(page);
    await expect(page.getByTestId("items-empty")).toBeVisible();

    const response = await addItem(page, "   ");
    expect(response.status()).toBe(400);

    await expect(page.getByTestId("item-error")).toBeVisible();
    await expect(page.getByTestId("item-error")).toHaveText("name is required");
    await expect(page.getByTestId("items-list").getByTestId("item")).toHaveCount(0);
    await expect(page.getByTestId("items-empty")).toBeVisible();
    await expect(page.getByTestId("items-empty")).toHaveText("No items yet");
    expect(await listedNames(request)).toEqual([]);
  });
});

test.describe("Adding items", () => {
  test("Add item lists the new name after the items already listed", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const id = unique();
    const existing = `Existing ${id}`;
    const added = `Added ${id}`;
    made.push((await createItem(page.request, existing)).id);

    await openItems(page);
    const items = page.getByTestId("items-list").getByTestId("item");
    await expect(items.filter({ hasText: existing })).toHaveText([existing]);
    const before = await items.allTextContents();
    expect(before[before.length - 1]).toBe(existing);

    const response = await addItem(page, added);
    expect(response.status()).toBe(201);
    made.push((await response.json()).id);

    await expect(items).toHaveText([...before, added]);
    await expect(page.getByLabel("New item")).toHaveValue("");
    await expect(page.getByTestId("item-error")).toBeHidden();
    await expect(page.getByTestId("items-empty")).toBeHidden();

    await page.reload();
    await expect(items.filter({ hasText: id })).toHaveText([existing, added]);
    await expect(items).toHaveText([...before, added]);
  });
});

test.describe("Items journeys", () => {
  test("sign in, see the empty Items page, add the first item and the message goes away", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    emptyItems();
    const items = page.getByTestId("items-list").getByTestId("item");
    let email = "";

    await test.step("1. sign in on /login", async () => {
      email = await signIn(page);
      await expect(page).toHaveURL(/\/items$/);
    });

    await test.step("2. the Items page loads with no items", async () => {
      await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
      await expect.soft(page.getByTestId("items-empty")).toBeVisible();
      await expect.soft(page.getByTestId("items-empty")).toHaveText("No items yet");
      await expect.soft(items).toHaveCount(0);
    });

    await test.step("3. a whitespace-only name is refused", async () => {
      const response = await addItem(page, "   ");
      expect.soft(response.status()).toBe(400);
      await expect.soft(page.getByTestId("item-error")).toHaveText("name is required");
      await expect.soft(page.getByTestId("items-empty")).toBeVisible();
      await expect.soft(page.getByTestId("items-empty")).toHaveText("No items yet");
      await expect.soft(items).toHaveCount(0);
    });

    await test.step("4. adding First item lists it and hides the message without a reload", async () => {
      await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
      const response = await addItem(page, "First item");
      expect.soft(response.status()).toBe(201);
      if (response.ok()) made.push((await response.json()).id);
      await expect.soft(items).toHaveText(["First item"]);
      await expect.soft(page.getByTestId("items-empty")).toBeHidden();
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
      expect.soft(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    });

    await test.step("5. after a reload the list still holds First item", async () => {
      const listed = page.waitForResponse(isItemsList);
      await page.reload();
      await listed;
      await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
      await expect.soft(items).toHaveText(["First item"]);
      await expect.soft(page.getByTestId("items-empty")).toBeHidden();
      await expect.soft(page.getByText("No items yet")).not.toBeVisible();
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
      expect.soft(await listedNames(request)).toEqual(["First item"]);
    });
  });

  test("add another item to a list that already has items", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const id = unique();
    const first = `First item ${id}`;
    const second = `Second item ${id}`;
    made.push((await createItem(request, first)).id);
    const items = page.getByTestId("items-list").getByTestId("item");
    let before: string[] = [];

    await test.step("1. sign in on /login", async () => {
      await signIn(page);
      await expect(page).toHaveURL(/\/items$/);
    });

    await test.step("2. the existing items are listed in id order", async () => {
      await expect(items.filter({ hasText: first })).toHaveText([first]);
      before = await items.allTextContents();
      expect.soft(before).toEqual(await listedNames(request));
      await expect.soft(page.getByTestId("items-empty")).toBeHidden();
    });

    await test.step("3. Add item puts the new name last", async () => {
      const response = await addItem(page, second);
      expect.soft(response.status()).toBe(201);
      if (response.ok()) made.push((await response.json()).id);
      await expect.soft(items).toHaveText([...before, second]);
      await expect.soft(page.getByTestId("items-empty")).toBeHidden();
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
    });

    await test.step("4. after a reload the same list in the same order", async () => {
      const listed = page.waitForResponse(isItemsList);
      await page.reload();
      await listed;
      await expect.soft(items).toHaveText([...before, second]);
      await expect.soft(page.getByTestId("items-empty")).toBeHidden();
      await expect.soft(page.getByTestId("item-error")).toBeHidden();
      await expect.soft(page.getByLabel("New item")).toHaveValue("");
    });
  });
});
