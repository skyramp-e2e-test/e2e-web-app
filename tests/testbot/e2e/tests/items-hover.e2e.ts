// Journey: sign in, add items, and hover items to see their full names.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import type { Page } from "@playwright/test";
import { ItemsPage, LoginPage, seedItem, uniqueSuffix } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("sign in, add an item, and hover items to see their full names", async ({ page: rawPage }) => {
  const run = uniqueSuffix();
  const seedName = `Hover seed ${run}`;
  const longSuffix = `-${run}`;
  const longName = "Long-" + "x".repeat(300 - 5 - longSuffix.length) + longSuffix;
  const specialName = `Tom & Jerry's <b>"bold"</b> ${run}`;
  expect(longName).toHaveLength(300);
  await seedItem(rawPage, seedName);

  const page = newSkyrampPlaywrightPage(rawPage) as Page;
  const login = new LoginPage(page);
  const items = new ItemsPage(page);

  await test.step("1. sign in through /login", async () => {
    await login.goto();
    const email = await login.signInAsTestUser();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
  });

  await test.step("2. hover the seeded item", async () => {
    const li = items.item(seedName);
    await expect.soft(li).toHaveCount(1);
    await li.hover();
    await expect.soft(li).toHaveAttribute("title", seedName);
    await expect.soft(li).toHaveText(seedName);
  });

  await test.step("3. add a 300-character item", async () => {
    await items.markDocument();
    const response = await items.add(longName);
    checkRequestPayload(response.request().postDataJSON(), { name: longName });
    expect.soft(response.status()).toBe(201);
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.item(longName)).toHaveCount(1);
  });

  await test.step("4. hover the new 300-character item", async () => {
    const li = items.item(longName);
    await li.hover();
    await expect.soft(li).toHaveAttribute("title", longName);
    expect.soft(await items.documentMark()).toBe("same-document");
  });

  await test.step("5. add and hover an item with HTML-special characters", async () => {
    const response = await items.add(specialName);
    checkRequestPayload(response.request().postDataJSON(), { name: specialName });
    expect.soft(response.status()).toBe(201);
    const li = items.item(specialName);
    await expect.soft(li).toHaveCount(1);
    await li.hover();
    await expect.soft(li).toHaveAttribute("title", specialName);
    expect.soft(await li.evaluate((el) => el.textContent)).toBe(specialName);
    expect.soft(await li.evaluate((el) => el.childElementCount)).toBe(0);
  });

  await test.step("6. reload and check the whole list", async () => {
    const loaded = await items.loadedItems(() => page.reload());
    const names = [...loaded].sort((a, b) => a.id - b.id).map((i) => i.name);
    await expect.soft(items.items).toHaveText(names, { useInnerText: false });
    expect
      .soft(await items.items.evaluateAll((els) => els.map((el) => el.getAttribute("title"))))
      .toEqual(names);
    const journeyNames = names.filter((n) => n === seedName || n === longName || n === specialName);
    expect.soft(journeyNames).toEqual([seedName, longName, specialName]);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${process.env.SKYRAMP_UI_USERNAME}`);
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.item(seedName)).toHaveAttribute("title", seedName);
    await expect.soft(items.item(longName)).toHaveAttribute("title", longName);
    await expect.soft(items.item(specialName)).toHaveAttribute("title", specialName);
  });
});
