// Items page: each entry shows its full name on hover through its title attribute.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, uniqueMarker } from "../support/items-page";

const pageTimeout = 15000;

test.beforeEach(async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(pageTimeout);
});

test("every loaded item carries its own name as hover text, with its visible text unchanged", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const marker = uniqueMarker();
  const alpha = await createItem(request, `Alpha hover item ${marker}`);
  const beta = await createItem(request, `Beta hover item ${marker}`);

  const itemsPage = new ItemsPage(page);
  const loaded = await itemsPage.open();

  // The list mirrors exactly what GET /api/items returned to the page: same count, order, text and title.
  const entries = await itemsPage.items.all();
  expect(entries.length).toBe(loaded.length);
  for (let i = 0; i < loaded.length; i++) {
    await expect(entries[i]).toHaveText(loaded[i].name, { useInnerText: true });
    await expect(entries[i]).toHaveAttribute("title", loaded[i].name);
    await expect(entries[i]).toHaveAttribute("data-testid", "item");
  }

  // Each seeded item: one entry, its own name as title (not the other's), alpha before beta.
  for (const item of [alpha, beta]) {
    const entry = itemsPage.entry(item.name);
    await expect(entry).toHaveCount(1);
    await entry.hover();
    await expect(entry).toHaveAttribute("title", item.name);
  }
  const titles = await itemsPage.items.evaluateAll((els) => els.map((el) => el.getAttribute("title")));
  expect(titles.indexOf(alpha.name)).toBeGreaterThanOrEqual(0);
  expect(titles.indexOf(alpha.name)).toBeLessThan(titles.indexOf(beta.name));
  expect(titles).not.toContain(null);
  expect(titles).not.toContain("");
});

test("hover text is the full long name, not truncated", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const longName =
    "Quarterly infrastructure capacity review for the north-east regional data centre including storage, compute and network expansion plans for 2027";
  expect(longName.length).toBe(144);
  const name = `${longName} ${uniqueMarker()}`;
  await createItem(request, name);

  const itemsPage = new ItemsPage(page);
  await itemsPage.open();
  const entry = itemsPage.entry(name);
  await expect(entry).toHaveCount(1);
  await entry.hover();
  await expect(entry).toHaveAttribute("title", name);
  const title = await entry.getAttribute("title");
  expect(title?.length).toBe(name.length);
  expect(title?.startsWith(longName)).toBe(true);
  expect(title).not.toContain("…");
});

test("an item added through the form shows its trimmed full name on hover, before and after reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Padded hover name ${uniqueMarker()}`;
  const typed = `  ${name}  `;

  const itemsPage = new ItemsPage(page);
  await itemsPage.open();
  await itemsPage.newItemInput.fill(typed);
  const posted = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
  const reloaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
  await itemsPage.addButton.click();
  const response = await posted;
  checkRequestPayload(response.request().postDataJSON(), { name: typed });
  expect(response.status()).toBe(201);
  await reloaded;

  await expect(itemsPage.error).toBeHidden();
  await expect(itemsPage.newItemInput).toHaveValue("");
  const entry = itemsPage.entry(name);
  await expect(entry).toHaveCount(1);
  await entry.hover();
  await expect(entry).toHaveText(name, { useInnerText: true });
  await expect(entry).toHaveAttribute("title", name);

  await itemsPage.reload();
  const afterReload = itemsPage.entry(name);
  await expect(afterReload).toHaveCount(1);
  await afterReload.hover();
  await expect(afterReload).toHaveText(name, { useInnerText: true });
  await expect(afterReload).toHaveAttribute("title", name);
});

test("names with markup and special characters show literally on hover", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `<b>Tom & "Jerry"</b> 'quote' ${uniqueMarker()}`;
  await createItem(request, name);

  const itemsPage = new ItemsPage(page);
  await itemsPage.open();
  const entry = itemsPage.entry(name);
  await expect(entry).toHaveCount(1);
  await entry.hover();
  await expect(entry).toHaveAttribute("title", name);
  expect(await entry.evaluate((el) => el.textContent)).toBe(name);
  // No markup was interpreted: the entry holds only its text, no <b> or other child element.
  await expect.poll(() => entry.evaluate((el) => el.childElementCount)).toBe(0);
});
