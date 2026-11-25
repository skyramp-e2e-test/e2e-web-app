// Journey: sign in, add an item, and hover it to read its full name.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, pagesUrl, uniqueName } from "../pages/items-page";

test("sign in, add an item and hover it to read its full name", async ({ page }) => {
  test.setTimeout(60_000);
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const name = uniqueName("Journey hover item with a fairly long descriptive name that keeps going");

  await test.step("1. sign in on /login", async () => {
    await page.goto(`${pagesUrl}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
  });

  await test.step("2. add the item through the New item form", async () => {
    await items.newItemInput.fill(name);
    const posted = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST",
    );
    await items.addItemButton.click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name });
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.row(name)).toHaveText(name);
    const shown = await items.rowTextsAndTitles();
    expect.soft(shown[shown.length - 1].text).toBe(name);
  });

  await test.step("3. hover the new row and read its title", async () => {
    const row = items.row(name);
    await row.hover();
    await expect.soft(row).toHaveAttribute("title", name);
  });

  await test.step("4. reload /items and hover the row again", async () => {
    const loaded = await items.open();
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
    const row = items.row(name);
    await row.hover();
    await expect.soft(row).toHaveAttribute("title", name);
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect(items.rows).toHaveCount(loaded.length);
    const shown = await items.rowTextsAndTitles();
    expect.soft(shown.map((r) => r.text)).toEqual(loaded.map((i) => i.name));
    expect.soft(shown.map((r) => r.title)).toEqual(shown.map((r) => r.text));
    expect.soft(shown[shown.length - 1].text).toBe(name);
    expect.soft(loaded[loaded.length - 1].name).toBe(name);
  });
});
