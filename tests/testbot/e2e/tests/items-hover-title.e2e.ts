// Journey: sign in, add an item and hover it to see its full name.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, UI_URL, uniqueTag } from "../support/items-page";

test("sign in, add an item and hover it to see its full name", async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);
  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  const items = new ItemsPage(page);
  const name = `Hover journey item ${uniqueTag()} with a long descriptive name`;

  await test.step("1. sign in on /login", async () => {
    await page.goto(`${UI_URL}/login`);
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. add the item through the form", async () => {
    const response = await items.submitName(name);
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect.soft(response.status()).toBe(201);
    await expect(items.row(name)).toHaveCount(1);
    await expect.soft.poll(async () => (await items.snapshot()).at(-1)?.text).toBe(name);
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.itemError).toBeHidden();
  });

  await test.step("3. hover the new row to read its full name", async () => {
    const row = items.row(name);
    await row.hover();
    await expect.soft(row).toHaveAttribute("title", name);
    const rows = await items.snapshot();
    expect.soft(rows.filter((r) => r.title !== r.text)).toEqual([]);
  });

  await test.step("4. reload /items and check the list again", async () => {
    const listed = await items.open();
    const row = items.row(name);
    await row.hover();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
    const rows = await items.snapshot();
    expect.soft(rows).toEqual(listed.map((i) => ({ title: i.name, text: i.name })));
    expect.soft(listed.map((i) => i.id)).toEqual([...listed.map((i) => i.id)].sort((a, b) => a - b));
    await expect.soft(row).toHaveCount(1);
    await expect.soft(row).toHaveAttribute("title", name);
    await expect.soft(row).toHaveText(name);
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.itemError).toBeHidden();
  });
});
