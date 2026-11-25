// Journey: sign in, add an item with a long name, and hover it to read its full name.
import { test, expect } from "@playwright/test";
import { checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { baseUrl, listItems, readListedItems, uniqueSuffix } from "../items-api";

test.use({ viewport: { width: 1280, height: 900 } });

test("signed-in user adds a long-named item and hovers it to read its full name", async ({ page, request }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);

  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  const name = `Hover check item with a deliberately long name to show in full ${uniqueSuffix()}`;
  const item = page.getByTitle(name, { exact: true });

  await test.step("1. open / and go to the Sign in page", async () => {
    await page.goto(`${baseUrl}/`);
    await page.getByTestId("nav-login").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.soft(page.getByLabel("Email")).toBeVisible();
    await expect.soft(page.getByLabel("Password")).toBeVisible();
  });

  await test.step("2. sign in and land on /items", async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
  });

  await test.step("3. add the long-named item through the form", async () => {
    await page.getByLabel("New item").fill(name);
    const posted = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add item" }).click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect.soft(response.status()).toBe(201);
    await expect.soft(page.getByLabel("New item")).toHaveValue("");
    await expect.soft(page.getByTestId("items-list")).toContainText(name);
    await expect.soft(item).toHaveCount(1);
    await expect.soft(item).toHaveText(name);
  });

  await test.step("4. hover the new item and read its title", async () => {
    await item.hover();
    expect.soft(await item.evaluate((el) => (el as HTMLElement).title)).toBe(name);
    const listed = await readListedItems(page);
    for (const [i, li] of listed.entries()) {
      expect.soft(li.title, `li ${i} title equals its text`).toBe(li.text);
    }
  });

  await test.step("5. reload /items and find the item with the same title", async () => {
    await page.reload();
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(item).toHaveCount(1);
    await expect.soft(item).toHaveText(name);
    await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${email}`);
    await expect.soft(page.getByTestId("item-error")).toBeHidden();

    const api = await listItems(request);
    const listedNow = await readListedItems(page);
    const mine = api.filter((i) => i.name === name);
    expect.soft(mine).toHaveLength(1);
    const pos = api.findIndex((i) => i.name === name);
    const ids = api.map((i) => i.id);
    expect.soft(ids).toEqual([...ids].sort((a, b) => a - b));
    // The page loaded before this GET, so it lists the items up to and including this run's.
    expect.soft(listedNow.length).toBeGreaterThan(pos);
    for (const [i, li] of listedNow.entries()) {
      expect.soft(li.text, `li ${i} text`).toBe(api[i].name);
      expect.soft(li.title, `li ${i} title`).toBe(api[i].name);
    }
    expect.soft(listedNow[pos]?.title).toBe(name);
  });
});
