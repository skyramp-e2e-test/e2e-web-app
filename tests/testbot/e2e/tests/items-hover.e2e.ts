// Journey: sign in, look over the items list, add an item and hover it to read its full name.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, createItem, listItems, uiUsername, baseUrl } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("sign in, add an item and hover it to see its full name", async ({ page, request }) => {
  test.setTimeout(90000);
  page = newSkyrampPlaywrightPage(page);
  const ts = Date.now();
  const seeds = [`Journey seed A ${ts}`, `Journey seed B ${ts}`];
  const name = `Walk item ${ts}`;
  for (const seed of seeds) await createItem(request, seed);
  const items = new ItemsPage(page);
  let before = 0;
  let earlier: Array<[string, string | null]> = [];

  await test.step("1. sign in at /login", async () => {
    await page.goto(`${baseUrl}/login`);
    await items.email().fill(uiUsername());
    await items.password().fill(process.env.SKYRAMP_UI_PASSWORD ?? "");
    await items.signInButton().click();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(items.userStatus()).toHaveText(`Signed in as ${uiUsername()}`);
  });

  await test.step("2. look over the list and hover each row", async () => {
    const saved = await listItems(request);
    await expect(items.rows()).toHaveCount(saved.length);
    before = saved.length;
    await expect.soft(items.rows()).toHaveCount(saved.length);
    expect.soft(await items.rows().allTextContents()).toEqual(saved.map((i) => i.name));
    earlier = await items.textsAndTitles();
    for (const [text, title] of earlier) expect.soft(title, `title of row "${text}"`).toBe(text);
    for (const seed of seeds) {
      await items.rowByText(seed).hover();
      await expect.soft(items.rowByTitle(seed)).toHaveCount(1);
    }
  });

  await test.step("3. add an item through the form and hover it", async () => {
    await items.newItemInput().fill(`  ${name}  `);
    const responsePromise = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST");
    await items.addItemButton().click();
    const response = await responsePromise;
    checkRequestPayload(response.request().postDataJSON(), { name: `  ${name}  ` });
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
  });

  await test.step("4. reload /items: the rows and titles stay", async () => {
    const loaded = await items.reload();
    expect.soft(loaded.length).toBe(before + 1);
    await expect.soft(items.rows()).toHaveCount(before + 1);
    await expect.soft(items.rowByTitle(name)).toHaveCount(1);
    await expect.soft(items.rowByTitle(name)).toHaveText(name);
    const rows = await items.textsAndTitles();
    expect.soft(rows.slice(0, before)).toEqual(earlier);
    expect.soft(rows[before]).toEqual([name, name]);
    for (const [text, title] of rows) expect.soft(title, `title of row "${text}"`).toBe(text);
    expect.soft(await items.rows().allTextContents()).toEqual(loaded.map((i) => i.name));
    await expect.soft(items.userStatus()).toHaveText(`Signed in as ${uiUsername()}`);
  });
});
