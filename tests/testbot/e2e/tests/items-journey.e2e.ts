// Journey: open the empty Items page from Home and add the first items (Pasted text AC1, AC2; requirements.csv AC1).
import { test, expect, emptyItems, ItemsPage } from "../support/items-page";

test.beforeEach(() => {
  emptyItems();
});

test("open the empty Items page from Home, add the first items and reload", async ({ page }) => {
  const items = new ItemsPage(page);

  await test.step("1. open Items from the Home nav link", async () => {
    await items.openFromHome();
  });

  await test.step("2. empty list shows the Items heading and No items yet", async () => {
    await expect.soft(items.heading).toBeVisible();
    await expect.soft(items.emptyState).toBeVisible();
    await expect.soft(items.emptyState).toHaveText("No items yet");
    await expect.soft(items.items).toHaveCount(0);
  });

  await test.step("3. a whitespace-only name is refused", async () => {
    const res = await items.add("   ");
    expect.soft(res.status()).toBe(400);
    await expect.soft(items.error).toHaveText("name is required");
    await expect.soft(items.emptyState).toBeVisible();
    await expect.soft(items.items).toHaveCount(0);
  });

  await test.step("4. adding First widget hides No items yet", async () => {
    await items.addAccepted("First widget");
    await expect.soft(items.emptyState).toBeHidden();
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.items).toHaveText(["First widget"]);
    await expect.soft(items.nameInput).toHaveValue("");
  });

  await test.step("5. adding Second widget lists it after First widget", async () => {
    await items.addAccepted("Second widget");
    await expect.soft(items.items).toHaveText(["First widget", "Second widget"]);
    await expect.soft(items.emptyState).toBeHidden();
  });

  await test.step("6. after a reload the list and heading stay", async () => {
    await items.open();
    await expect(items.heading).toBeVisible();
    await expect(items.emptyState.locator("visible=true")).toHaveCount(0);
    await expect(items.emptyState).toBeHidden();
    await expect(items.error).toBeHidden();
    await expect(items.items).toHaveText(["First widget", "Second widget"]);
    await expect(items.nameInput).toHaveValue("");
  });
});
