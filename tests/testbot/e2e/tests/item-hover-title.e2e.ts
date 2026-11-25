// The Items page shows each item's full name as its hover title (li title attribute),
// while the list keeps rendering each item's name, in id order, one li[data-testid=item] per item.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, createItem, runId } from "../items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("every item on /items has a hover title equal to its stored name, in id order", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const run = runId();
  const lamp = await createItem(request, `Desk Lamp ${run}`);
  const cafe = await createItem(request, `Café ☕ 日本 ${run}`);
  expect(lamp.name).toBe(`Desk Lamp ${run}`);
  expect(cafe.name).toBe(`Café ☕ 日本 ${run}`);

  const items = new ItemsPage(page);
  const apiItems = await items.open();

  for (const name of [lamp.name, cafe.name]) {
    await expect(items.itemTitled(name)).toHaveCount(1);
    await expect(items.itemTitled(name)).toHaveText(name);
    await expect(items.itemTitled(name)).toHaveAttribute("data-testid", "item");
  }
  // Both seeded items come back from the API in id order, and the page lists the same items, same order.
  const ids = apiItems.map((i) => i.id);
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
  expect(apiItems.map((i) => i.name)).toEqual(expect.arrayContaining([lamp.name, cafe.name]));
  await items.expectListMatches(apiItems);
});

test("the hover title keeps the full name: 300 characters, inner spaces, trimmed ends", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const run = runId();
  const long = await createItem(request, "L".repeat(300) + "-" + run);
  const spaced = await createItem(request, "a    b " + run);
  const padded = await createItem(request, "  padded " + run + "  ");
  expect(padded.name).toBe(`padded ${run}`);

  const items = new ItemsPage(page);
  await items.open();

  const longName = "L".repeat(300) + "-" + run;
  await expect(items.itemTitled(longName)).toHaveCount(1);
  const longTitle = await items.itemTitled(longName).getAttribute("title");
  expect(longTitle).toBe(long.name);
  expect(longTitle?.length).toBe(301 + run.length);
  expect(longTitle?.slice(0, 300)).toBe("L".repeat(300));

  const spacedName = "a    b " + run;
  await expect(items.itemTitled(spacedName)).toHaveCount(1);
  expect(await items.itemTitled(spacedName).getAttribute("title")).toBe(spaced.name);
  expect(spaced.name).toBe(spacedName);

  await expect(items.itemTitled(`padded ${run}`)).toHaveCount(1);
  expect(await items.itemTitled(`padded ${run}`).getAttribute("title")).toBe(`padded ${run}`);
});

test("HTML-special and quote characters in a name show literally in the hover title", async ({ page, request }) => {
  page = newSkyrampPlaywrightPage(page);
  const run = runId();
  const name = `<b>Bold</b> & "q" 's ${run}`;
  const created = await createItem(request, name);
  expect(created.name).toBe(name);

  const items = new ItemsPage(page);
  await items.open();

  const li = items.itemTitled(name);
  await expect(li).toHaveCount(1);
  expect(await li.getAttribute("title")).toBe(name);
  await expect(li).toHaveText(name);
  await expect(li).toHaveJSProperty("childElementCount", 0);
});

test("an item added with the Add item form gets its hover title at once and after a reload", async ({ page }) => {
  page = newSkyrampPlaywrightPage(page);
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  const name = `Form item ${runId()}`;

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${baseUrl}/items`);

  const items = new ItemsPage(page);
  await expect(items.userStatus).toHaveText(`Signed in as ${username}`);
  await items.newItemInput.fill(name);
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items");
  const reloaded = items.waitForItemsLoad();
  await items.addItemButton.click();
  const postRes = await posted;
  checkRequestPayload(postRes.request().postDataJSON(), { name });
  expect(postRes.status()).toBe(201);
  const afterAdd = (await (await reloaded).json()) as { name: string }[];
  expect(afterAdd[afterAdd.length - 1].name).toBe(name);

  await expect(items.newItemInput).toHaveValue("");
  await expect(items.itemTitled(name)).toHaveCount(1);
  await expect(items.itemTitled(name)).toHaveText(name);
  await expect.poll(async () => (await items.listed()).slice(-1)[0], "last item in list order").toEqual({ text: name, title: name });

  await items.open();
  await expect(items.itemTitled(name)).toHaveCount(1);
  await expect(items.itemTitled(name)).toHaveText(name);
});
