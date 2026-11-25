// Journey: sign in, open /items (empty on a fresh app), try a blank name, add an entry, reload.
// Runs against the real app with no stubbed requests. The app cannot delete entries, so where some are already
// stored the page lists them and keeps the items-empty element hidden instead (EWA-8 AC2).
import { checkRequestPayload } from "@skyramp/skyramp";
import { test, expect, LoginPage, uniqueName, baseUrl, uiCredentials } from "../items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("signs in, is refused a blank name, adds an entry that persists after reload", async ({
  page,
  itemsPage,
}) => {
  const { username, password } = uiCredentials();
  const name = uniqueName("Desk Lamp");
  let existing: string[] = [];

  await test.step("1. sign in at /login", async () => {
    const login = new LoginPage(page);
    await login.goto();
    const listed = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await login.signInAs(username, password);
    await expect(page).toHaveURL(/\/items$/);
    existing = ((await (await listed).json()) as { name: string }[]).map((i) => i.name);
    await expect.soft(itemsPage.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. items-empty element matches whether the stored list is empty (EWA-8 AC1, AC2)", async () => {
    if (existing.length === 0) {
      await expect.soft(itemsPage.empty).toBeVisible();
      await expect.soft(itemsPage.empty).toHaveText("No items yet");
    } else {
      await expect.soft(itemsPage.empty).toBeHidden();
    }
    await expect.soft(itemsPage.items).toHaveText(existing);
  });

  await test.step("3. a blank name is refused", async () => {
    const response = await itemsPage.add("   ");
    checkRequestPayload(response.request().postDataJSON(), { name: "   " });
    expect.soft(response.status()).toBe(400);
    await expect.soft(itemsPage.error).toBeVisible();
    await expect.soft(itemsPage.error).toHaveText("name is required");
    if (existing.length === 0) {
      await expect.soft(itemsPage.empty).toBeVisible();
      await expect.soft(itemsPage.empty).toHaveText("No items yet");
    } else {
      await expect.soft(itemsPage.empty).toBeHidden();
    }
    await expect.soft(itemsPage.items).toHaveText(existing);
  });

  await test.step("4. adding an entry shows it and hides items-empty, without a reload", async () => {
    const response = await itemsPage.add(name);
    checkRequestPayload(response.request().postDataJSON(), { name });
    expect.soft(response.status()).toBe(201);
    await expect.soft(itemsPage.item(name)).toHaveText(name);
    await expect.soft(itemsPage.empty).toBeHidden();
    await expect.soft(itemsPage.error).toBeHidden();
    await expect.soft(itemsPage.newItem).toHaveValue("");
  });

  await test.step("5. after a reload the entry is still shown after the earlier ones", async () => {
    await itemsPage.goto();
    await expect(itemsPage.item(name)).toHaveText(name);
    await expect(itemsPage.userStatus).toHaveText(`Signed in as ${username}`);
    const shown = await itemsPage.items.allTextContents();
    const stored = ((await (await page.request.get(`${baseUrl}/api/items`)).json()) as { name: string }[]).map(
      (i) => i.name,
    );
    // Items this run did not add may follow ours when other tests run at the same time.
    expect(shown).toEqual(stored.slice(0, shown.length));
    expect(shown.slice(0, existing.length)).toEqual(existing);
    expect(shown.filter((n) => n === name)).toHaveLength(1);
    await expect(itemsPage.empty).toBeHidden();
    await expect(itemsPage.error).toBeHidden();
    await expect(itemsPage.newItem).toHaveValue("");
  });
});
