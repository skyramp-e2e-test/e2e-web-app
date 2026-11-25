// /items: empty-state message (EWA-8 AC1, AC2), item list (Confluence page 1736705 AC1),
// adding an item (requirements.csv AC1), and the page's heading and controls (Pasted text AC1, AC2).
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItemViaApi, listItemsViaApi, runId } from "../support/items-page";

const pageTimeout = 15000;

test.use({ viewport: { width: 1280, height: 900 } });

let items: ItemsPage;

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(pageTimeout);
  page = newSkyrampPlaywrightPage(page);
  items = new ItemsPage(page);
});

test("shows No items yet and lists nothing when the item list loads empty", async () => {
  // EWA-8 AC1, Confluence page 1736705 AC1
  await items.stubFirstListAsEmpty();
  await items.open();
  await expect(items.emptyMessage).toBeVisible();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);
});

test("does not show No items yet when loading the item list fails", async () => {
  // EWA-8 AC1: the message is only for an item list that loaded empty
  await items.stubListResponse(500, { error: "Internal server error" });
  await items.open();
  await expect(items.emptyMessage).toBeHidden();
});

test("adding the first item from the empty state hides the message without a reload", async ({ request }) => {
  // EWA-8 AC2
  const name = `First item ${runId}`;
  await items.stubFirstListAsEmpty();
  await items.open();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(items.emptyMessage).toBeVisible();

  const res = await items.addItem(name);
  checkRequestPayload(res.request().postDataJSON(), { name });
  expect(res.status()).toBe(201);

  await expect(items.emptyMessage).toBeHidden();
  const saved = await listItemsViaApi(request);
  await expect(items.items).toHaveCount(saved.length);
  await expect(items.items.filter({ hasText: name })).toHaveCount(1);
  await expect(items.items).toHaveText(saved.map((item) => item.name));
  expect(saved.map((item) => item.name).slice(-1)).toEqual([name]);
  await expect(items.newItemInput).toHaveValue("");
  await expect(items.error).toBeHidden();

  // The real list (now holding the item) keeps the message hidden after a reload.
  await items.reload();
  await expect(items.emptyMessage).toBeHidden();
  await expect(items.items.filter({ hasText: name })).toHaveCount(1);
});

test("hides the message on load when items were saved before the page opened, and after a reload", async ({ request }) => {
  // EWA-8 AC2
  const name = `Existing item ${runId}`;
  await createItemViaApi(request, name);

  await items.open();
  const saved = await listItemsViaApi(request);
  await expect(items.emptyMessage).toBeHidden();
  await expect(items.items).toHaveCount(saved.length);
  await expect(items.items).toHaveText(saved.map((item) => item.name));
  expect(saved.map((item) => item.name).slice(-1)).toEqual([name]);

  await items.reload();
  await expect(items.emptyMessage).toBeHidden();
  await expect(items.items).toHaveCount(saved.length);
  await expect(items.items).toHaveText(saved.map((item) => item.name));
  expect(saved.map((item) => item.name).slice(-1)).toEqual([name]);
});

test("a refused whitespace-only name from the empty state keeps No items yet shown", async () => {
  // EWA-8 AC2: nothing is listed, so the message stays
  await items.stubFirstListAsEmpty();
  await items.open();

  const res = await items.addItem("   ");
  checkRequestPayload(res.request().postDataJSON(), { name: "   " });
  expect(res.status()).toBe(400);

  await expect(items.error).toBeVisible();
  await expect(items.error).toHaveText("name is required");
  await expect(items.emptyMessage).toBeVisible();
  await expect(items.emptyMessage).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);
});

test("lists every saved item by name, in the order the API returns them, as literal text", async ({ request }) => {
  // Confluence page 1736705 AC1
  const plain = `Name one ${runId}`;
  const markup = `<b>bold ${runId}</b>`;
  await createItemViaApi(request, plain);
  await createItemViaApi(request, markup);

  await items.open();
  const names = (await listItemsViaApi(request)).map((item) => item.name);
  expect(names.slice(-2)).toEqual([plain, markup]);

  await expect(items.items).toHaveText(names);
  await expect(items.items.filter({ hasText: markup })).toHaveCount(1);
  // shown as literal text: a rendered bold element would leave only "bold ..." as the text
  await expect(items.items.filter({ hasText: markup })).toHaveText(markup);
  await expect(items.emptyMessage).toBeHidden();
});

test("adding a padded name lists it trimmed as the last entry, clears the field, and keeps it after a reload", async () => {
  // requirements.csv AC1
  const name = `Spaced name ${runId}`;
  await items.open();
  const beforeNames = await items.items.allTextContents();
  const before = beforeNames.length;

  const res = await items.addItem(`  ${name}  `);
  checkRequestPayload(res.request().postDataJSON(), { name: `  ${name}  ` });
  expect(res.status()).toBe(201);

  await test.step("listed without a reload", async () => {
    await expect(items.items).toHaveCount(before + 1);
    await expect(items.items).toHaveText([...beforeNames, name]);
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.emptyMessage).toBeHidden();
    await expect(items.error).toBeHidden();
  });

  await test.step("still listed after a reload", async () => {
    await items.reload();
    await expect(items.items).toHaveCount(before + 1);
    await expect(items.items).toHaveText([...beforeNames, name]);
    await expect(items.emptyMessage).toBeHidden();
  });
});

test("shows the item name input and its submit button", async () => {
  // Pasted text AC1
  await items.open();
  await expect(items.newItemInput).toBeVisible();
  await expect(items.newItemInput).toBeEditable();
  await expect(items.addItemButton).toBeVisible();
  await expect(items.addItemButton).toHaveText("Add item");
});

test("shows the page title as its only top-level heading", async () => {
  // Pasted text AC2
  await items.open();
  await expect(items.heading).toHaveText("Items");
  await expect(items.heading).toHaveCount(1);
});
