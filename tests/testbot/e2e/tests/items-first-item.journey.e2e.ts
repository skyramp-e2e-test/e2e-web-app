// Journey: add the first item on an empty Items page, through the UI of the real app.
// Needs an items table with no rows when it starts (a fresh app): the app has no way to delete items.
import { test, expect } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage } from "../pages/items-page";

test("adds the first item on an empty Items page and it stays listed after reload", async ({ page: rawPage, request }) => {
  const page = newSkyrampPlaywrightPage(rawPage);
  const items = new ItemsPage(page);
  const name = `First item ${Date.now()}`;

  await test.step("1. open the home page and follow the Items nav link", async () => {
    await page.goto("/");
    await page.getByTestId("nav-items").click();
    await expect.soft(page).toHaveURL(/\/items$/);
  });

  await test.step("2. the empty Items page shows its heading, form and empty message", async () => {
    // Fresh app: no items stored yet.
    const res = await request.get("/api/items");
    expect.soft(await res.json()).toEqual([]);
    await expect.soft(items.heading).toHaveText("Items");
    await expect.soft(items.newItemInput).toBeVisible();
    await expect.soft(items.addItemButton).toBeVisible();
    await expect.soft(items.emptyMessage).toBeVisible();
    await expect.soft(items.emptyMessage).toHaveText("No items yet");
    await expect.soft(items.entries).toHaveCount(0);
  });

  await test.step("3. add an item with the form; it is listed and the empty message goes away", async () => {
    const urlBefore = page.url();
    await items.newItemInput.fill(name);
    await items.addItemButton.click();
    await expect.soft(items.entries).toHaveCount(1);
    await expect.soft(items.entries).toHaveText([name]);
    await expect.soft(items.emptyMessage).toBeHidden();
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    expect.soft(page.url()).toBe(urlBefore);
  });

  await test.step("4. after a reload the item is still listed and the empty message stays hidden", async () => {
    await page.reload();
    await expect(items.heading).toHaveText("Items");
    await expect(items.entries).toHaveCount(1);
    await expect(items.entries).toHaveText([name]);
    await expect(items.emptyMessage).toBeHidden();
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.error).toBeHidden();
  });
});
