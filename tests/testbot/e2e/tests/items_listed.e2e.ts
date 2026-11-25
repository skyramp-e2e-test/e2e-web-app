// Journey: open the Items page from the home page when items exist, try a blank name, then add an item.
// EWA-8 AC2; Confluence page 1736705 AC1; requirements.csv AC1.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, createItemViaApi, listItemsViaApi, runId } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("opens Items from the home page, is refused a blank name, then adds an item", async ({ page, request }) => {
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const markup = `<b>bold ${runId}</b>`;
  const name = `Walk item B ${runId}`;
  await createItemViaApi(request, `Saved earlier ${runId}`);
  await createItemViaApi(request, markup);
  let earlier: string[] = [];

  await test.step("1. click the Items nav link on /", async () => {
    await page.goto(`${baseUrl}/`);
    const listed = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items");
    await items.navItems.click();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await items.settleAfter(listed);
    await expect.soft(items.heading).toHaveText("Items");
  });

  await test.step("2. look at the list", async () => {
    earlier = (await listItemsViaApi(request)).map((item) => item.name);
    await expect.soft(items.emptyMessage).toBeHidden();
    await expect.soft(items.items).toHaveText(earlier);
    await expect.soft(items.items.filter({ hasText: markup })).toHaveCount(1);
    // shown as literal text: a rendered bold element would leave only "bold ..." as the text
    await expect.soft(items.items.filter({ hasText: markup })).toHaveText(markup);
  });

  await test.step("3. try a blank name", async () => {
    const res = await items.addItem("   ");
    checkRequestPayload(res.request().postDataJSON(), { name: "   " });
    await expect.soft(items.error).toHaveText("name is required");
    await expect.soft(items.items).toHaveCount(earlier.length);
    await expect.soft(items.emptyMessage).toBeHidden();
  });

  await test.step("4. add an item", async () => {
    const res = await items.addItem(name);
    checkRequestPayload(res.request().postDataJSON(), { name });
    await expect(items.items).toHaveText([...earlier, name]);
    await expect(items.items).toHaveCount((await listItemsViaApi(request)).length);
    await expect(items.error).toBeHidden();
    await expect(items.emptyMessage).toBeHidden();
    await expect(items.newItemInput).toHaveValue("");
  });
});
