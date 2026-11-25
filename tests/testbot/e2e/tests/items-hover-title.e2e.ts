// Journey: sign in, add an item and hover it to read its full name.
// Drafted from a Skyramp walk of the journey, then fitted to the LoginPage and ItemsPage page objects.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, fetchItems } from "../pages/items-page";
import { LoginPage } from "../pages/login-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("sign in, add an item and hover it to read its full name", async ({ page, request }) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  const login = new LoginPage(page);
  const items = new ItemsPage(page);
  const name = `Journey item ${Date.now()} `.padEnd(200, "y");
  let before = 0;

  await test.step("1. sign in on /login and land on /items", async () => {
    await login.goto();
    await login.signInAs(username, password);
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. the list as loaded matches GET /api/items, text and title", async () => {
    const api = await fetchItems(request);
    await expect.soft(items.items).toHaveCount(api.length);
    const shown = await items.listed();
    before = shown.length;
    expect.soft(shown.map((s) => s.text)).toEqual(api.map((i) => i.name));
    expect.soft(shown.map((s) => s.title)).toEqual(api.map((i) => i.name));
  });

  await test.step("3. add a 200-character item through the form", async () => {
    await items.newItemInput.fill(name);
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await items.addItemButton.click();
    const response = await responsePromise;
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect.soft(response.status()).toBe(201);
    await expect.soft(items.items).toHaveCount(before + 1);
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.itemError).toBeHidden();
  });

  await test.step("4. hover the new item and read its full name", async () => {
    await items.byTitle(name).hover();
    await expect.soft(items.byTitle(name)).toBeVisible();
    await expect.soft(items.itemNamed(name)).toHaveAttribute("title", name);
    await expect.soft(items.itemNamed(name)).toHaveText(name);
    // Ordered by id: the hovered item is the last one listed.
    expect.soft((await items.listed()).at(-1)).toEqual({ text: name, title: name });
    await expect.soft(items.byTitle(name)).toHaveText(name);
  });

  await test.step("5. after a reload the item and its title are still there", async () => {
    await items.goto();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
    await expect.soft(items.items).toHaveCount(before + 1);
    await expect.soft(items.itemNamed(name)).toHaveText(name);
    await expect.soft(items.itemNamed(name)).toHaveAttribute("title", name);
    expect.soft((await items.listed()).at(-1)).toEqual({ text: name, title: name });
    await expect.soft(items.byTitle(name)).toBeVisible();
    await expect.soft(items.itemError).toBeHidden();
    await expect.soft(items.newItemInput).toHaveValue("");
    const api = await fetchItems(request);
    const shown = await items.listed();
    expect.soft(shown.map((s) => s.text)).toEqual(api.map((i) => i.name));
    expect.soft(shown.map((s) => s.title)).toEqual(api.map((i) => i.name));
    expect.soft(api[api.length - 1].name).toBe(name);
  });
});
