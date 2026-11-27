// Journey: sign in, add items, and see each item's full name on hover, before and after a reload.
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import type { Page } from "@playwright/test";
import { ItemsPage, runId, signInToItems } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

/** Every listed item's title equals its text, and the list's texts are GET /api/items names in id order. */
async function expectListMatchesApi(items: ItemsPage): Promise<void> {
  const shown = await items.items.evaluateAll((lis) => lis.map((li) => ({ text: li.textContent, title: li.getAttribute("title") })));
  for (const { text, title } of shown) expect.soft(title).toBe(text);
  // Read after the page: items other tests add meanwhile only append to the API's list, so the page shows its prefix.
  const apiNames = await items.apiNames();
  expect.soft(shown.map((s) => s.text)).toEqual(apiNames.slice(0, shown.length));
}

test("sign in, add a short and a 250-character item, and see each full name on hover after a reload", async ({ page: rawPage }) => {
  let page: Page = rawPage;
  let items!: ItemsPage;
  const id = runId();
  const shortName = `Hover short ${id}`;
  const longName = `Long ${id} `.padEnd(250, "x");

  await test.step("1. sign in on /login and land on /items", async () => {
    ({ page, items } = await signInToItems(rawPage));
  });

  await test.step("2. add the short item", async () => {
    checkRequestPayload(await items.add(shortName), { name: shortName });
    const li = items.item(shortName);
    await expect.soft(li).toHaveText(shortName);
    await expect.soft(li).toHaveAttribute("title", shortName);
  });

  await test.step("3. add the 250-character item", async () => {
    checkRequestPayload(await items.add(longName), { name: longName });
    await expect.soft(items.item(longName)).toHaveText(longName);
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });

  await test.step("4. hover the long item and read its title", async () => {
    const li = items.item(longName);
    await li.hover();
    await expect.soft(li).toHaveAttribute("title", longName);
    expect.soft((await li.getAttribute("title"))?.length).toBe(250);
  });

  await test.step("5. reload /items: both items keep their titles, in the order added", async () => {
    await page.reload();
    await expect(items.userStatus).toHaveText(`Signed in as ${process.env.SKYRAMP_UI_USERNAME}`);
    await expect(items.item(longName)).toHaveCount(1);
    const texts = await items.items.allTextContents();
    expect(texts.indexOf(shortName)).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf(longName)).toBeGreaterThan(texts.indexOf(shortName));
    for (const name of [shortName, longName]) {
      await expect.soft(items.item(name)).toHaveAttribute("title", name);
      await expect.soft(items.item(name)).toHaveText(name);
    }
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expectListMatchesApi(items);
  });
});
