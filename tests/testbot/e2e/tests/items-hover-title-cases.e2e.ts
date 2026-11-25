// Items page: each item shows its full name as a hover tooltip (title), and the list renders as before.
// Drafted from Skyramp walks of the Add item form, then fitted to the ItemsPage page object.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem } from "../pages/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Adds `entered` through the form, checks the POST body it sent, and returns the created item. */
async function addThroughForm(items: ItemsPage, entered: string) {
  await items.newItemInput.fill(entered);
  const responsePromise = items.page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
  await items.addItemButton.click();
  const response = await responsePromise;
  checkRequestPayload(response.request().postDataJSON(), { name: entered });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe("Items page hover title", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000);
  });

  test("every item listed on load has a title equal to its full name", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const ts = stamp();
    const nameA = `Hover A ${ts}`;
    const nameB = `Hover B ${ts}`;
    await createItem(request, nameA);
    await createItem(request, nameB);

    await test.step("each li title equals its name from GET /api/items, in order", async () => {
      await items.expectListMatchesApi(request, { checkTitles: true });
    });

    await test.step("the seeded items carry their own names as titles", async () => {
      await expect.soft(items.itemNamed(nameA)).toHaveAttribute("title", nameA);
      await expect.soft(items.itemNamed(nameB)).toHaveAttribute("title", nameB);
    });

    await test.step("hovering an item shows the element titled with its name", async () => {
      await items.itemNamed(nameB).hover();
      await expect(items.byTitle(nameB)).toBeVisible();
      await expect(items.byTitle(nameB)).toHaveText(nameB);
    });
  });

  test("an item added through the form shows its full name as title without a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    await items.goto();
    await expect(items.itemsList).toBeVisible();
    let navigations = 0;
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations++; });
    const name = `Added via form ${stamp()}`;
    const before = await items.items.count();

    const created = await addThroughForm(items, `  ${name}  `);
    expect(created.name).toBe(name);

    await expect(items.items).toHaveCount(before + 1);
    await expect(items.itemNamed(name)).toHaveCount(1);
    await expect(items.itemNamed(name)).toHaveAttribute("title", name);
    // Ordered by id: the item just added is the last one listed.
    expect((await items.listed()).at(-1)).toEqual({ text: name, title: name });
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.itemError).toBeHidden();
    expect(navigations).toBe(0);
  });

  test("the title holds the whole name when it is 300 characters long", async ({ page, request }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    const name = `Long name ${stamp()} `.padEnd(300, "x");
    expect(name).toHaveLength(300);
    await createItem(request, name);

    await items.goto();
    const li = items.itemNamed(name);
    await expect(li).toHaveCount(1);
    await expect(li).toHaveAttribute("title", name);
    expect(await li.getAttribute("title")).toHaveLength(300);
    await expect(items.byTitle(name)).toBeVisible();
  });

  test("the title shows markup, entities, quotes and unicode literally, trimmed", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const items = new ItemsPage(page);
    await items.goto();
    await expect(items.itemsList).toBeVisible();
    const name = `<b>Bold</b> & "Quotes" 'x'  ünïcødé ✓ ${stamp()}`;

    const created = await addThroughForm(items, `  ${name}  `);
    expect(created.name).toBe(name);

    const li = items.itemNamed(name);
    await expect(li).toHaveCount(1);
    await expect(li).toHaveAttribute("title", name);
    expect(await li.textContent()).toBe(name);
    expect(await li.evaluate((el) => el.childElementCount)).toBe(0);
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.itemError).toBeHidden();
  });
});
