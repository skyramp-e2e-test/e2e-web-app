// User journey: sign in, see there are no items yet, add the first item (EWA-8 AC1, AC2; requirements.csv AC1).
// Runs against the real app with no stubs; it needs an app whose items table is empty (the app has no delete endpoint).
import { test, expect } from "@playwright/test";
import { newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage } from "../pages/items-page";

test("signs in, sees no items yet, and adds the first item", async ({ page }, testInfo) => {
  page = newSkyrampPlaywrightPage(page, testInfo);
  const items = new ItemsPage(page);
  const email = process.env.SKYRAMP_UI_USERNAME as string;
  const name = `First item ${Date.now()}`;

  await test.step("1. sign in at /login and land on /items", async () => {
    const loaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await items.submitLogin();
    await loaded;
  });

  await test.step("2. the empty list shows the empty-state message", async () => {
    await expect.soft(items.emptyMessage()).toBeVisible();
    await expect.soft(items.emptyMessage()).toHaveText("No items yet");
    await expect.soft(items.items()).toHaveCount(0);
  });

  await test.step("3. a whitespace-only name is refused and the empty-state message stays", async () => {
    const res = await items.add("   ");
    expect.soft(res.status()).toBe(400);
    await expect.soft(items.error()).toBeVisible();
    await expect.soft(items.error()).toHaveText("name is required");
    await expect.soft(items.emptyMessage()).toBeVisible();
    await expect.soft(items.emptyMessage()).toHaveText("No items yet");
    await expect.soft(items.items()).toHaveCount(0);
  });

  await test.step("4. adding the first item lists it and hides the empty-state message", async () => {
    const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    const res = await items.add(name);
    expect.soft(res.status()).toBe(201);
    expect.soft(res.request().postDataJSON()).toEqual({ name });
    await listed;
    await expect.soft(items.items()).toHaveCount(1);
    await expect.soft(items.items()).toHaveText([name]);
    await expect.soft(items.emptyMessage()).toBeHidden();
    await expect.soft(items.error()).toBeHidden();
    await expect.soft(items.nameInput()).toHaveValue("");
  });

  await test.step("5. after a reload the item is still listed and the message stays hidden", async () => {
    await items.reload();
    await expect(items.userStatus()).toHaveText(`Signed in as ${email}`);
    await expect(items.items()).toHaveCount(1);
    await expect(items.items()).toHaveText([name]);
    await expect(items.emptyMessage()).toBeHidden();
    await expect(items.error()).toBeHidden();
    await expect(items.nameInput()).toHaveValue("");
  });
});
