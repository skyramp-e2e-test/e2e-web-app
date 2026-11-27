// Items page: EWA-9 AC1, a name added through the form is still listed after the page is reloaded.
// Drafted from a Skyramp walk of the add-and-reload flow, request-body check kept.
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, credentials, uiName, withoutOtherTestItems } from "../support/items";

test.use({ viewport: { width: 1280, height: 900 } });

test("an item added on the Items page is listed once, last, and still is after a reload", async ({ page }) => {
  const items = new ItemsPage(page);
  const name = uiName("Desk Lamp");
  await items.signIn();
  const before = withoutOtherTestItems(await items.loadedNames());

  await items.nameInput.fill(name);
  const posted = items.page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/items");
  expect(await items.submit()).toBe(201);
  checkRequestPayload((await posted).postDataJSON(), { name });
  expect(withoutOtherTestItems(await items.loadedNames(), [name])).toEqual([...before, name]);

  const afterReload = withoutOtherTestItems(await items.reload(), [name]);
  expect(afterReload).toEqual([...before, name]);
  await expect(items.itemNamed(name)).toHaveCount(1);
});

test("signing in, adding an item and reloading keeps the item on the Items page", async ({ page }) => {
  const items = new ItemsPage(page);
  const { email } = credentials();
  const name = uiName("Desk Lamp");
  let before: string[] = [];

  await test.step("1. sign in at /login and land on /items", async () => {
    await page.goto(`${baseUrl}/login`);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await items.signIn({ navigate: false });
    expect.soft(new URL(items.page.url()).pathname).toBe("/items");
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
  });

  await test.step("2. add a named item through the form", async () => {
    before = withoutOtherTestItems(await items.loadedNames());
    await items.nameInput.fill(name);
    const posted = items.page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/items");
    expect.soft(await items.submit()).toBe(201);
    checkRequestPayload((await posted).postDataJSON(), { name });
    await expect.soft(items.nameInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    expect.soft(withoutOtherTestItems(await items.loadedNames(), [name])).toEqual([...before, name]);
  });

  await test.step("3. reload /items: the item is still listed, last and once", async () => {
    const afterReload = withoutOtherTestItems(await items.reload(), [name]);
    await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
    await expect(items.error).toBeHidden();
    expect(afterReload).toEqual([...before, name]);
    expect(afterReload.length).toBe(before.length + 1);
    await expect(items.itemNamed(name)).toHaveCount(1);
  });
});
