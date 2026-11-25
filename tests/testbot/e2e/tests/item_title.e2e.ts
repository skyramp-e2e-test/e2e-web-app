// Items page: each listed item carries its full name as its hover title (li title attribute).
import { test, expect } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import {
  baseUrl,
  createItem,
  listItems,
  readListedItems,
  uniqueSuffix,
  waitForItemsLoad,
  type Item,
} from "../items-api";

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
});

test("a 300+ character name is the full hover title of its item", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Long item ${uniqueSuffix()} ` + "x".repeat(300);
  const created = await createItem(request, name);
  expect(created.name).toBe(name);

  const loaded = waitForItemsLoad(page);
  await page.goto(`${baseUrl}/items`);
  await loaded;

  const item = page.getByTitle(name, { exact: true });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveText(name);
  await item.hover();

  const stored = (await listItems(request)).find((i) => i.id === created.id);
  expect(stored?.name).toBe(name);
  const title = await item.evaluate((el) => (el as HTMLElement).title);
  expect(title).toBe(stored?.name);
  expect(title).toHaveLength(name.length);
  expect(title.endsWith("…")).toBe(false);
});

test("on page load every item's title is its own name, in API order", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const suffix = uniqueSuffix();
  for (const n of ["alpha", "beta", "gamma"]) {
    await createItem(request, `Title check ${n} ${suffix}`);
  }

  const loaded = waitForItemsLoad(page);
  await page.goto(`${baseUrl}/items`);
  const api = (await (await loaded).json()) as Item[];
  const ids = api.map((i) => i.id);
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
  await expect(page.getByTestId("item")).toHaveCount(api.length);

  const listed = await readListedItems(page);
  expect(listed).toHaveLength(api.length);
  for (const [i, li] of listed.entries()) {
    expect.soft(li.hasTitle, `li ${i} has a title`).toBe(true);
    expect.soft(li.text, `li ${i} text`).toBe(api[i].name);
    expect.soft(li.title, `li ${i} title`).toBe(api[i].name);
  }
  for (const n of ["alpha", "beta", "gamma"]) {
    const name = `Title check ${n} ${suffix}`;
    await expect(page.getByTitle(name, { exact: true })).toHaveCount(1);
    await expect(page.getByTitle(name, { exact: true })).toHaveText(name);
  }
});

test("an item added through the form gets its full-name title without a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Form added ${uniqueSuffix()} ` + "y".repeat(120);

  const loaded = waitForItemsLoad(page);
  await page.goto(`${baseUrl}/items`);
  await loaded;

  await page.getByLabel("New item").fill(name);
  const posted = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST",
  );
  const reloaded = waitForItemsLoad(page);
  await page.getByRole("button", { name: "Add item" }).click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);
  const after = (await (await reloaded).json()) as Item[];

  await expect(page.getByLabel("New item")).toHaveValue("");
  await expect(page.getByTestId("item-error")).toBeHidden();
  const item = page.getByTitle(name, { exact: true });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveText(name);
  await expect(page.getByTestId("item")).toHaveCount(after.length);
  const listed = await readListedItems(page);
  for (const [i, li] of listed.entries()) {
    expect.soft(li.title, `li ${i} title equals its text`).toBe(li.text);
    expect.soft(li.text, `li ${i} text`).toBe(after[i].name);
  }

  await page.reload();
  await expect(page.getByTitle(name, { exact: true })).toHaveCount(1);
  await expect(page.getByTitle(name, { exact: true })).toHaveText(name);
});

test("a name with markup, quotes, ampersand and emoji is the literal title", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Q&A <b>"quoted"</b> 'single' ${uniqueSuffix()} — emoji 🎉`;
  const created = await createItem(request, name);
  expect(created.name).toBe(name);

  const loaded = waitForItemsLoad(page);
  await page.goto(`${baseUrl}/items`);
  await loaded;

  const item = page.getByTestId("item").filter({ hasText: name });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveText(name);
  await expect(item).toHaveAttribute("title", name);
  expect(await item.evaluate((el) => (el as HTMLElement).title)).toBe(name);
  // No element (such as a <b>) is created from the name: the li holds only text, and the list only its lis.
  expect(await item.evaluate((el) => el.childElementCount)).toBe(0);
  const listChildren = await page.getByTestId("items-list").evaluate((el) => el.childElementCount);
  await expect(page.getByTestId("item")).toHaveCount(listChildren);
});

test("a padded name's title is the trimmed stored name, same as its text", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const trimmed = `padded ${uniqueSuffix()}`;
  const created = await createItem(request, `   ${trimmed}   `);
  expect(created.name).toBe(trimmed);

  const loaded = waitForItemsLoad(page);
  await page.goto(`${baseUrl}/items`);
  await loaded;

  const item = page.getByTitle(trimmed, { exact: true });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveText(trimmed);
  expect(await item.evaluate((el) => (el as HTMLElement).title)).toBe(trimmed);
  expect(await item.evaluate((el) => el.textContent)).toBe(trimmed);
});
