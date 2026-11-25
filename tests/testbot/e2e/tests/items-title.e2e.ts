// Items page: each item row carries its full name as its hover text (title), and the list otherwise renders as before.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, uniqueName } from "../pages/items-page";

test.describe("Items page hover text", () => {
  test("every item row shows its full name as its title on page load", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const alpha = await createItem(request, uniqueName("Alpha hover item"));
    const beta = await createItem(request, uniqueName("Beta hover item"));
    const items = new ItemsPage(page);
    const loaded = await items.open();

    for (const item of [alpha, beta]) {
      await test.step(`hover "${item.name}"`, async () => {
        const row = items.row(item.name);
        await row.hover();
        await expect.soft(row).toHaveAttribute("title", item.name);
        await expect.soft(row).toHaveText(item.name);
      });
    }

    await test.step("every row's title equals its own text and the name GET /api/items gave", async () => {
      await expect(items.rows).toHaveCount(loaded.length);
      const shown = await items.rowTextsAndTitles();
      expect(shown.map((r) => r.title)).toEqual(loaded.map((i) => i.name));
      expect(shown.map((r) => r.title)).toEqual(shown.map((r) => r.text));
    });
  });

  test("a 300-character name is carried whole in the title", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const head = `Long-${Date.now()}-`;
    const name = head + "x".repeat(300 - head.length);
    expect(name).toHaveLength(300);
    await createItem(request, name);
    const items = new ItemsPage(page);
    await items.open();

    const row = items.row(name);
    await row.hover();
    await expect(row).toHaveAttribute("title", name);
    expect(await row.getAttribute("title")).toHaveLength(300);
  });

  test("an item added through the form gets its title without a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    await items.open();
    const urlBefore = page.url();
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    const name = uniqueName("Form hover item");
    await test.step("add the item through the form", async () => {
      await items.newItemInput.fill(name);
      const posted = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST",
      );
      const reloaded = items.waitForItemsLoad();
      await items.addItemButton.click();
      const response = await posted;
      checkRequestPayload(response.request().postDataJSON(), { name });
      expect(response.status()).toBe(201);
      const after = await items.itemsFrom(await reloaded);
      expect(after[after.length - 1].name).toBe(name);
      await expect(items.rows).toHaveCount(after.length);
    });

    await test.step("hover the new row", async () => {
      const row = items.row(name);
      await row.hover();
      await expect.soft(row).toHaveAttribute("title", name);
      // The new item is the last row, by id order.
      const shown = await items.rowTextsAndTitles();
      expect.soft(shown[shown.length - 1]).toEqual({ text: name, title: name, testid: "item" });
    });

    expect(page.url()).toBe(urlBefore);
    expect(navigations).toBe(0);
  });

  test("a name with markup and special characters is shown literally", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const name = `<b>Bold & "quoted" 'name'</b> é✓ ${Date.now()}`;
    await createItem(request, name);
    const items = new ItemsPage(page);
    await items.open();

    const row = items.row(name);
    await row.hover();
    await expect.soft(row).toHaveAttribute("title", name);
    expect.soft(await row.textContent()).toBe(name);
    // No child element at all, so no <b> was parsed from the name.
    expect(await row.evaluate((el) => el.childElementCount)).toBe(0);
  });
});
