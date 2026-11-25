// Items page empty-state message: Pasted text AC1 and AC2.
import { test, expect, emptyItems, ItemsPage } from "../support/items-page";

// Each test starts from an empty items table, so they must not run alongside tests that add items.
test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  emptyItems();
});

test("empty Items page shows the No items yet message under the Items heading", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.openFromHome();
  await expect(items.heading).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Items");
  await expect(items.emptyState).toBeVisible();
  await expect(items.emptyState).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);
});

test("adding the first item hides the No items yet message without a reload", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.open();
  await expect(items.emptyState).toBeVisible();

  await items.addAccepted("First widget");
  await expect(items.emptyState).toBeHidden();
  await expect(items.items).toHaveText(["First widget"]);
  await expect(items.nameInput).toHaveValue("");
  await expect(items.error).toBeHidden();

  await items.open();
  await expect(items.emptyState).toBeHidden();
  await expect(items.items).toHaveText(["First widget"]);
});

test("a whitespace-only name the server refuses leaves the No items yet message shown", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.open();
  await expect(items.emptyState).toBeVisible();

  const res = await items.add("   ");
  expect(res.status()).toBe(400);
  await expect(items.error).toBeVisible();
  await expect(items.error).toHaveText("name is required");
  await expect(items.emptyState).toBeVisible();
  await expect(items.emptyState).toHaveText("No items yet");
  await expect(items.items).toHaveCount(0);
});
