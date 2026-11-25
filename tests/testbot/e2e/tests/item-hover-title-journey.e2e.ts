// Journey: sign in, add an item with a long name, and see its full name on hover.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, Item, baseUrl, runId } from "../items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("sign in, add an item with a long name, and see its full name on hover", async ({ page }) => {
  test.setTimeout(60000);
  page = newSkyrampPlaywrightPage(page);
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  const name = "Hover title " + "x".repeat(120) + " <i>&end " + runId();
  const items = new ItemsPage(page);
  let before: Item[] = [];

  await test.step("1. sign in at /login", async () => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password").fill(password);
    const loaded = items.waitForItemsLoad();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect.soft(page).toHaveURL(`${baseUrl}/items`);
    before = (await (await loaded).json()) as Item[];
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. add the item with the Add item form", async () => {
    await items.newItemInput.fill(name);
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/items");
    await items.addItemButton.click();
    const postRes = await posted;
    checkRequestPayload(postRes.request().postDataJSON(), { name });
    expect.soft(postRes.status()).toBe(201);
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.itemError).toBeHidden();
    await expect.soft.poll(async () => (await items.listed()).slice(-1)[0], "last item in list order").toEqual({ text: name, title: name });
    await expect.soft(items.itemTitled(name)).toHaveCount(1);
    await expect.soft(items.itemTitled(name)).toHaveText(name);
    expect.soft(await items.itemTitled(name).getAttribute("title")).toBe(name);
    await expect.soft(items.itemTitled(name)).toHaveJSProperty("childElementCount", 0);
  });

  await test.step("3. reload /items and see the same list with the full name on hover", async () => {
    const apiItems = await items.open();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
    await expect.soft(items.itemError).toBeHidden();
    await expect.soft(items.newItemInput).toHaveValue("");
    expect.soft(apiItems.length).toBe(before.length + 1);
    expect.soft(apiItems[apiItems.length - 1]?.name).toBe(name);
    await expect.soft(items.itemTitled(name)).toHaveCount(1);
    await expect.soft(items.itemTitled(name)).toHaveText(name);
    await expect.soft.poll(async () => (await items.listed()).slice(-1)[0], "last item in list order").toEqual({ text: name, title: name });
    await expect.soft(items.itemTitled(name)).toHaveJSProperty("childElementCount", 0);
    await items.expectListMatches(apiItems);
  });
});
