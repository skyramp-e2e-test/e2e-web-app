// Items page: each item shows its full name as hover text (its title attribute).
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import { ItemsPage, seedItem, signedInItemsPage, storedItems, uniqueSuffix } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("an item already listed when the page opens has its full name as hover text", async ({ page: rawPage }) => {
  const name = `Hover seed ${uniqueSuffix()}`;
  const seeded = await seedItem(rawPage, name);

  const { page, items } = await signedInItemsPage(rawPage);
  const li = items.item(name);
  await expect(li).toHaveCount(1);
  await li.hover();
  await expect(li).toHaveAttribute("title", name);
  await expect(li).toHaveText(name);

  const stored = (await storedItems(page)).find((i) => i.id === seeded.id);
  expect(stored?.name).toBe(name);
  await expect(li).toHaveAttribute("title", stored!.name);
});

test("an item added through the form gets its full name as hover text without a reload", async ({ page: rawPage }) => {
  const name = `Hover new ${uniqueSuffix()}`;
  const { items } = await signedInItemsPage(rawPage);
  await items.markDocument();

  const response = await items.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  await expect(items.newItem).toHaveValue("");
  await expect(items.error).toBeHidden();
  const li = items.item(name);
  await expect(li).toHaveCount(1);
  await li.hover();
  await expect(li).toHaveAttribute("title", name);
  expect(await items.documentMark()).toBe("same-document");
});

test("a 300-character name is given in full in the hover text", async ({ page: rawPage }) => {
  const suffix = `-${uniqueSuffix()}`;
  const name = "Long-" + "x".repeat(300 - 5 - suffix.length) + suffix;
  expect(name).toHaveLength(300);
  const { page, items } = await signedInItemsPage(rawPage);

  const response = await items.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  const li = items.item(name);
  await expect(li).toHaveCount(1);
  await li.hover();
  await expect(li).toHaveAttribute("title", name);
  expect(await li.getAttribute("title")).toHaveLength(300);
  expect((await storedItems(page)).filter((i) => i.name === name)).toHaveLength(1);
});

test("a name with HTML-special characters and quotes is shown literally in the hover text", async ({ page: rawPage }) => {
  const name = `Tom & Jerry's <b>"bold"</b> ${uniqueSuffix()}`;
  const { page, items } = await signedInItemsPage(rawPage);

  const response = await items.add(name);
  checkRequestPayload(response.request().postDataJSON(), { name });
  expect(response.status()).toBe(201);

  const li = items.item(name);
  await expect(li).toHaveCount(1);
  await li.hover();
  await expect(li).toHaveAttribute("title", name);
  expect(await li.evaluate((el) => el.textContent)).toBe(name);
  await expect(li.locator("*")).toHaveCount(0);
  await expect(li.locator("b")).toHaveCount(0);
  expect((await storedItems(page)).filter((i) => i.name === name)).toHaveLength(1);
});

test("a name submitted with surrounding spaces gets the trimmed stored name as hover text", async ({ page: rawPage }) => {
  const trimmed = `Padded ${uniqueSuffix()}`;
  const submitted = `   ${trimmed}   `;
  const { page, items } = await signedInItemsPage(rawPage);

  const response = await items.add(submitted);
  checkRequestPayload(response.request().postDataJSON(), { name: submitted });
  expect(response.status()).toBe(201);

  const li = items.item(trimmed);
  await expect(li).toHaveCount(1);
  await li.hover();
  await expect(li).toHaveAttribute("title", trimmed);
  expect(await li.evaluate((el) => el.textContent)).toBe(trimmed);
  expect((await storedItems(page)).filter((i) => i.name === trimmed)).toHaveLength(1);
});

test("listed items keep their names, test id and id order, with each name as hover text", async ({ page: rawPage }) => {
  const name = `Listed ${uniqueSuffix()}`;
  const seeded = await seedItem(rawPage, name);
  const { page } = await signedInItemsPage(rawPage);
  const items = new ItemsPage(page);

  const loaded = await items.loadedItems(() => page.reload());
  const inIdOrder = [...loaded].sort((a, b) => a.id - b.id);
  expect(loaded.map((i) => i.id)).toEqual(inIdOrder.map((i) => i.id));
  expect(loaded.map((i) => i.id)).toContain(seeded.id);

  const names = inIdOrder.map((i) => i.name);
  await expect(items.items).toHaveCount(names.length);
  await expect(items.items).toHaveText(names, { useInnerText: false });
  expect(await items.items.evaluateAll((els) => els.map((el) => el.getAttribute("title")))).toEqual(names);
  expect(await items.items.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")))).toEqual(
    names.map(() => "item")
  );
  await expect(items.item(name)).toHaveAttribute("title", name);
});
