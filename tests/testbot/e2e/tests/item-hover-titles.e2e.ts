// Each item on /items shows its full name as a hover tooltip (the li's title attribute).
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, uniqueTag } from "../support/items-page";

test.describe("items list hover titles", () => {
  test.beforeEach(({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test("an item listed on load carries its full stored name as its title", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const name = `Plain ${uniqueTag()}`;
    const created = await createItem(request, name);
    expect(created.name).toBe(name);

    const listed = await items.open();
    const stored = listed.find((i) => i.id === created.id);
    expect(stored?.name).toBe(name);

    const row = items.row(name);
    await expect(row).toHaveCount(1);
    await row.hover();
    await expect(row).toHaveAttribute("title", name);
    await expect(row).toHaveText(name);
  });

  test("every row's title is its own item's name, in id order", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const tag = uniqueTag();
    const names = [`Row A ${tag}`, `Row B ${tag}`, `Row C ${tag}`];
    for (const name of names) await createItem(request, name);

    // The list the page itself fetched, so other tests adding items at the same time cannot skew the comparison.
    const listed = await items.open();
    const rows = await items.snapshot();
    expect(rows.length).toBe(listed.length);
    expect(rows).toEqual(listed.map((i) => ({ title: i.name, text: i.name })));
    expect(listed.map((i) => i.id)).toEqual([...listed.map((i) => i.id)].sort((a, b) => a - b));

    for (const name of names) {
      await expect(items.row(name)).toHaveAttribute("title", name);
      await expect(items.row(name)).toHaveText(name);
    }
  });

  test("a 600-character name is shown in full in the title", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const prefix = `Long ${uniqueTag()}`;
    const name = `${prefix} ${"x".repeat(600)}`;
    const created = await createItem(request, name);
    expect(created.name).toBe(name);

    await items.open();
    const row = items.row(prefix);
    await expect(row).toHaveCount(1);
    await row.hover();
    await expect(row).toHaveAttribute("title", name);
    expect((await row.getAttribute("title"))?.length).toBe(name.length);
  });

  test("a name with markup and special characters appears literally in the title", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const tag = uniqueTag();
    const name = `<b>bold</b> & "q" 'a' ${tag} 漢字 😀`;
    const created = await createItem(request, name);
    expect(created.name).toBe(name);

    await items.open();
    const row = items.row(tag);
    await expect(row).toHaveCount(1);
    await row.hover();
    expect(await row.getAttribute("title")).toBe(name);
    expect(await row.textContent()).toBe(name);
    expect(await row.evaluate((el) => el.childElementCount)).toBe(0);
  });

  test("a name sent with surrounding spaces shows the trimmed stored name in the title", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const trimmed = `padded ${uniqueTag()}`;
    const created = await createItem(request, `   ${trimmed}   `);
    expect(created.name).toBe(trimmed);

    await items.open();
    const row = items.row(trimmed);
    await expect(row).toHaveCount(1);
    expect(await row.getAttribute("title")).toBe(trimmed);
    expect(await row.textContent()).toBe(trimmed);
  });

  test("an item added through the form gets its title without a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const name = `Form ${uniqueTag()}`;
    await items.open();

    const response = await items.submitName(name);
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect(response.status()).toBe(201);

    const row = items.row(name);
    await expect(row).toHaveCount(1);
    await expect.poll(async () => (await items.snapshot()).at(-1)?.text).toBe(name);
    await row.hover();
    await expect(row).toHaveAttribute("title", name);
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.itemError).toBeHidden();
  });

  test("an item added through the form keeps its title after a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const name = `Form reload ${uniqueTag()}`;
    await items.open();
    const response = await items.submitName(name);
    expect(response.status()).toBe(201);
    await expect(items.row(name)).toHaveCount(1);

    await items.open();
    const row = items.row(name);
    await expect(row).toHaveCount(1);
    await row.hover();
    await expect(row).toHaveAttribute("title", name);
  });
});
