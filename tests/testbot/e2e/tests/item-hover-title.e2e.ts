// Hover titles on the Items page: each listed item's title attribute is its full stored name.
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import { runId, signInToItems } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("a 250-character name shows in full as the item's hover title, as does a short one", async ({ page: rawPage }) => {
  const { items } = await signInToItems(rawPage);
  const id = runId();
  const shortName = `Hover short ${id}`;
  const longName = `Long ${id} `.padEnd(250, "x");
  expect(longName).toHaveLength(250);

  await test.step("add a short and a 250-character item", async () => {
    checkRequestPayload(await items.add(shortName), { name: shortName });
    await expect(items.item(shortName)).toHaveCount(1);
    checkRequestPayload(await items.add(longName), { name: longName });
    await expect(items.item(longName)).toHaveCount(1);
  });

  await test.step("each item's hover title is its full name, as GET /api/items returns it", async () => {
    const apiNames = await items.apiNames();
    for (const name of [shortName, longName]) {
      expect(apiNames.filter((n) => n === name)).toEqual([name]);
      const li = items.item(name);
      await li.hover();
      await expect.soft(li).toHaveAttribute("title", name);
      await expect.soft(li).toHaveText(name);
    }
    expect((await items.item(longName).getAttribute("title"))?.length).toBe(250);
  });
});

test("a name with markup and quote characters shows literally in the hover title", async ({ page: rawPage }) => {
  const { items } = await signInToItems(rawPage);
  const name = `<b>Tom & "Jerry"</b> 'x' ${runId()}`;

  checkRequestPayload(await items.add(name), { name });
  const li = items.item(name);
  await expect(li).toHaveCount(1);
  await li.hover();
  await expect.soft(li).toHaveAttribute("title", name);
  expect.soft(await li.evaluate((el) => el.textContent)).toBe(name);
  await expect.soft(li.locator("*")).toHaveCount(0);
  await expect.soft(items.list.locator("b")).toHaveCount(0);
});

test("an item added through the form gets its trimmed name as hover title before and after a reload", async ({ page: rawPage }) => {
  const { page, items } = await signInToItems(rawPage);
  const name = `Spaced item ${runId()}`;
  const typed = `  ${name}  `;

  await test.step("add the item without reloading", async () => {
    checkRequestPayload(await items.add(typed), { name: typed });
    const li = items.item(name);
    await expect(li).toHaveCount(1);
    await li.hover();
    await expect.soft(li).toHaveAttribute("title", name);
    await expect.soft(li).toHaveText(name);
  });

  await test.step("reload /items", async () => {
    await page.reload();
    const li = items.item(name);
    await expect(li).toHaveCount(1);
    await li.hover();
    await expect(li).toHaveAttribute("title", name);
  });
});
