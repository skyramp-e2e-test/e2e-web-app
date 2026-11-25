// Items page: each row's title attribute (hover text) holds the item's full name.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, listItems } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("Items page hover title", () => {
  test.setTimeout(60000);

  test("items saved before the page loads show their full name on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const ts = Date.now();
    const seeds = [`Seed A ${ts}`, `Seed B ${ts}`];
    for (const name of seeds) await createItem(request, name);

    const items = new ItemsPage(page);
    await items.signIn();
    for (const name of seeds) await expect(items.rowByText(name)).toHaveCount(1);

    const rows = await items.textsAndTitles();
    for (const [text, title] of rows) expect.soft(title, `title of row "${text}"`).toBe(text);

    const saved = await listItems(request);
    for (const name of seeds) {
      const savedName = saved.find((i) => i.name === name)?.name;
      expect(savedName).toBe(name);
      const row = items.rowByTitle(name);
      await expect.soft(row, `row titled "${name}"`).toHaveCount(1);
      await expect.soft(row).toHaveText(name);
      await expect.soft(row).toHaveAttribute("data-testid", "item");
      await items.rowByText(name).hover();
      await expect.soft(items.rowByText(name)).toHaveAttribute("title", name);
    }
  });

  test("an item added through the form shows its trimmed full name on hover", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `Added ${Date.now()}`;
    const items = new ItemsPage(page);
    const before = (await items.signIn()).length;

    await items.newItemInput().fill(`  ${name}  `);
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await items.addItemButton().click();
    const response = await responsePromise;
    checkRequestPayload(response.request().postDataJSON(), { name: `  ${name}  ` });
    expect(response.status()).toBe(201);
    expect((await response.json()).name).toBe(name);

    await expect(items.rows()).toHaveCount(before + 1);
    expect.soft((await items.rows().allTextContents())[before]).toBe(name);
    const last = items.rowByText(name);
    await expect.soft(last).toHaveText(name);
    await expect.soft(last).toHaveAttribute("title", name);
    await last.hover();
    await expect.soft(items.rowByTitle(name)).toHaveCount(1);
    await expect.soft(items.rowByTitle(name)).toHaveText(name);
    await expect.soft(items.newItemInput()).toHaveValue("");
    await expect.soft(items.itemError()).toBeHidden();

    for (const [text, title] of await items.textsAndTitles()) expect.soft(title, `title of row "${text}"`).toBe(text);
  });

  test("a 500-character name is shown in full on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `Long-${Date.now()}-`.padEnd(500, "x");
    expect(name).toHaveLength(500);
    expect((await createItem(request, name)).name).toBe(name);

    const items = new ItemsPage(page);
    await items.signIn();
    const row = items.rowByText(name);
    await expect(row).toHaveCount(1);
    await row.hover();
    const title = await row.getAttribute("title");
    expect(title).toBe(name);
    expect(title?.length).toBe(500);
  });

  test("a name with markup and quotes is shown literally on hover", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `<b>Bold</b> & "q" ${Date.now()}`;
    expect((await createItem(request, name)).name).toBe(name);

    const items = new ItemsPage(page);
    await items.signIn();
    const row = items.rowByText(name);
    await expect(row).toHaveCount(1);
    await row.hover();
    await expect.soft(row).toHaveAttribute("title", name);
    await expect.soft(items.list().getByText("Bold", { exact: true })).toHaveCount(0);
  });
});
