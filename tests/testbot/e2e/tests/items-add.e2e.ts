// Adding items on the Items page (requirements.csv AC1) and the page with items in it (Pasted text AC1, AC2).
import { test, expect, createItemViaApi, uniqueSuffix, ItemsPage } from "../support/items-page";

test("Items page with items lists them in order and hides the No items yet message", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  await createItemViaApi(request, `Probe A ${suffix}`);
  await createItemViaApi(request, `Probe B ${suffix}`);

  const items = new ItemsPage(page);
  await items.open();
  await expect(items.heading).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Items");
  await expect(items.emptyState).toBeHidden();
  await expect(items.emptyState).toHaveAttribute("hidden", "");
  const names = await items.items.allTextContents();
  expect(names.slice(-2)).toEqual([`Probe A ${suffix}`, `Probe B ${suffix}`]);
});

test("Add item lists the new name last without a reload and clears the input", async ({ page }) => {
  const name = `Blue mug ${uniqueSuffix()}`;
  const items = new ItemsPage(page);
  await items.open();
  const before = await items.items.allTextContents();

  await items.addAccepted(name);
  await expect(items.items).toHaveText([...before, name]);
  await expect(items.nameInput).toHaveValue("");
  await expect(items.error).toBeHidden();
  await expect(items.emptyState).toBeHidden();

  await items.open();
  await expect(items.items).toHaveText([...before, name]);
  await expect(items.emptyState).toBeHidden();
});

test("Add item lists a name entered with surrounding spaces trimmed", async ({ page }) => {
  const trimmed = `Spaced item ${uniqueSuffix()}`;
  const items = new ItemsPage(page);
  await items.open();
  const before = await items.items.allTextContents();

  await items.addAccepted(`  ${trimmed}  `);
  await expect(items.items).toHaveText([...before, trimmed]);
});
