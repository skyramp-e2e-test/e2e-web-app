// The Items page shows each item's full name as its hover tooltip (title).
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, listItems } from "../support/items-page";

const pageTimeout = 15000;

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(pageTimeout);
});

/** Each seeded entry shows its stored name as text and as its exact title, and no entry's title differs from its text. */
async function expectFullNameTooltips(items: ItemsPage, names: string[]) {
  for (const name of names) {
    await expect.soft(items.byTitle(name), `entry titled ${JSON.stringify(name.slice(0, 40))}`).toHaveText(name);
    await expect.soft(items.byText(name)).toHaveCount(1);
    await expect.soft(items.byText(name)).toHaveAttribute("title", name);
  }
  await expect.poll(() => items.entriesWithoutMatchingTitle(), { message: "entries whose title is not their full name" }).toEqual([]);
}

test("every item listed on load has its full stored name as its hover title, long and trimmed names included", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const ts = Date.now();
  const bodies = [
    `Probe plain ${ts}`,
    `  Probe padded ${ts}  `,
    `Probe long ${"x".repeat(300)} ${ts}`,
    `Probe unicode üï 🚀 ${ts}`,
  ];
  const stored: string[] = [];

  await test.step("seed items through POST /api/items", async () => {
    for (const body of bodies) {
      const item = await createItem(request, body);
      expect(item.name).toBe(body.trim());
      stored.push(item.name);
    }
    const all = await listItems(request);
    for (const name of stored) expect(all.filter((i) => i.name === name).map((i) => i.name)).toEqual([name]);
    expect(stored[2].length).toBeGreaterThan(300);
  });

  const items = new ItemsPage(page);
  await test.step("open /items: each entry's title is its full stored name", async () => {
    await items.goto();
    await expectFullNameTooltips(items, stored);
  });

  await test.step("reload /items: the titles are still the full stored names", async () => {
    await page.reload();
    await expect(items.items).not.toHaveCount(0);
    await expectFullNameTooltips(items, stored);
  });
});

test("an item added through the Add item form gets its trimmed name as hover title without a reload", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `Form probe ${Date.now()}`;
  const items = new ItemsPage(page);
  let newId = 0;

  await test.step("open /items", async () => {
    await items.goto();
    await expect(items.byText(name)).toHaveCount(0);
  });

  await test.step("submit the name padded with two spaces each side", async () => {
    await items.newItem.fill(`  ${name}  `);
    const sent = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await items.addItem.click();
    const response = await sent;
    checkRequestPayload(response.request().postDataJSON(), { name: `  ${name}  ` });
    expect(response.status()).toBe(201);
    newId = (await response.json()).id;
  });

  await test.step("the list re-renders with the new entry titled with the trimmed name", async () => {
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.byTitle(name)).toHaveText(name);
    await expect.soft(items.byText(name)).toHaveCount(1);
    await expect.soft(items.byText(name)).toHaveAttribute("title", name);
    // Creation order: the new entry is last of the entries stored up to it (later ones are other tests' items).
    await expect
      .poll(async () => (await items.entries()).findIndex((e) => e.text === name))
      .toBe((await listItems(request)).filter((i) => i.id <= newId).length - 1);
    await expect.poll(() => items.entriesWithoutMatchingTitle()).toEqual([]);
  });
});

test("a name with HTML-like and quote characters shows verbatim in its hover title and text, not as markup", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const name = `<b>Probe</b> & "quotes" 'apos' ${Date.now()}`;
  await test.step("seed the item through POST /api/items", async () => {
    const item = await createItem(request, name);
    expect(item.name).toBe(name);
  });

  const items = new ItemsPage(page);
  await test.step("open /items: title and text are the literal name, with no <b> element", async () => {
    await items.goto();
    await expect.soft(items.byTitle(name)).toHaveText(name);
    await expect.soft(items.byText(name)).toHaveCount(1);
    await expect.soft(items.byText(name)).toHaveAttribute("title", name);
    await expect.soft(items.byText(name)).toHaveJSProperty("childElementCount", 0);
  });
});
