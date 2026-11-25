// Items page (/items): form, heading, item list and the empty-list message.
// Items these tests add stay in the app: it has no way to delete them.
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage } from "../pages/items-page";

// Tests here compare the page with GET /api/items, so none may add items while another reads the list.
test.describe.configure({ mode: "serial" });

const uniqueName = (label: string): string => `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function createItem(request: APIRequestContext, name: string): Promise<void> {
  const res = await request.post("/api/items", { data: { name } });
  expect(res.status()).toBe(201);
  expect((await res.json()).name).toBe(name);
}

async function openItems(rawPage: Page): Promise<ItemsPage> {
  const items = new ItemsPage(newSkyrampPlaywrightPage(rawPage));
  await items.goto();
  return items;
}

test("shows a New item text field that accepts typed text", async ({ page }) => {
  const items = await openItems(page);
  await expect(items.newItemInput).toBeVisible();
  await expect(items.newItemInput).toBeEditable();
  await items.newItemInput.fill("typed text");
  await expect(items.newItemInput).toHaveValue("typed text");
});

test("shows an enabled Add item button", async ({ page }) => {
  const items = await openItems(page);
  await expect(items.addItemButton).toBeVisible();
  await expect(items.addItemButton).toBeEnabled();
  await expect(items.addItemButton).toHaveText("Add item");
});

test("main heading reads Items", async ({ page }) => {
  const items = await openItems(page);
  await expect(items.heading).toBeVisible();
  await expect(items.heading).toHaveText("Items");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(["Items"]);
});

test("with no items the page shows No items yet and an empty list", async ({ page }) => {
  // Order-independent empty state: the page's GET /api/items answers [] here; POSTs still reach the app.
  await page.route("**/api/items", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, json: [] }) : route.continue(),
  );
  const loaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  const items = await openItems(page);
  await loaded;
  await expect(items.emptyMessage).toBeVisible();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(page.getByText("No items yet")).toBeVisible();
  await expect(items.entries).toHaveCount(0);
});

test("lists every stored item's name, one entry per item in id order", async ({ page, request }) => {
  await createItem(request, uniqueName("Listed item A"));
  await createItem(request, uniqueName("Listed item B"));
  const stored: { name: string }[] = await (await request.get("/api/items")).json();
  expect(stored.length).toBeGreaterThanOrEqual(2);

  const items = await openItems(page);
  await expect(items.entries).toHaveCount(stored.length);
  await expect(items.entries).toHaveText(stored.map((i) => i.name));
  await expect(items.emptyMessage).toBeHidden();
});

test("adding the first item from the empty state hides No items yet without a reload", async ({ page }) => {
  // The page starts empty (its first GET answers []); after the POST its list reload reaches the real app.
  let posted = false;
  await page.route("**/api/items", (route) => {
    if (route.request().method() === "POST") posted = true;
    return route.request().method() === "GET" && !posted ? route.fulfill({ status: 200, json: [] }) : route.continue();
  });
  const name = uniqueName("First item");
  const items = await openItems(page);
  await expect(items.emptyMessage).toBeVisible();
  await expect(items.entries).toHaveCount(0);

  let navigated = false;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigated = true; });
  const urlBefore = page.url();
  await items.newItemInput.fill(name);
  await items.addItemButton.click();

  await expect(items.entry(name)).toHaveText(name);
  await expect(items.emptyMessage).toBeHidden();
  expect(page.url()).toBe(urlBefore);
  expect(navigated).toBe(false);
});

test("when items exist on load No items yet is never shown, also after reload", async ({ page, request }) => {
  const name = uniqueName("Existing item");
  await createItem(request, name);
  const items = await openItems(page);
  await expect(items.entry(name)).toHaveText(name);
  await expect(items.emptyMessage).toBeHidden();
  await expect(page.getByText("No items yet")).toBeHidden();

  await page.reload();
  await expect(items.entry(name)).toHaveText(name);
  await expect(items.emptyMessage).toBeHidden();
  await expect(page.getByText("No items yet")).toBeHidden();
});

test("typing a name and clicking Add item lists that name and keeps it after reload", async ({ page }) => {
  const name = uniqueName("Added item");
  const items = await openItems(page);
  await items.newItemInput.fill(name);
  const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
  await items.addItemButton.click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  await expect(items.entry(name)).toHaveCount(1);
  await expect(items.entry(name)).toHaveText(name);
  await expect(items.newItemInput).toHaveValue("");
  await expect(items.error).toBeHidden();

  await page.reload();
  await expect(items.entry(name)).toHaveCount(1);
  await expect(items.entry(name)).toHaveText(name);
});
