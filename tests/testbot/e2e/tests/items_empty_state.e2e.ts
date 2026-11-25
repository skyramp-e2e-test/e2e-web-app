// Journey: sign in, see the empty Items page, add the first item, and see it stay after a reload.
// EWA-8 AC1, AC2; Confluence page 1736705 AC1; requirements.csv AC1; Pasted text AC1, AC2.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, listItemsViaApi, runId } from "../support/items-page";

test.use({ viewport: { width: 1280, height: 900 } });

test("signs in, sees the empty Items page, adds the first item and sees it after a reload", async ({ page, request }) => {
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);
  const items = new ItemsPage(page);
  const username = process.env.SKYRAMP_UI_USERNAME!;
  const password = process.env.SKYRAMP_UI_PASSWORD!;
  const name = `Walk item A ${runId}`;

  await test.step("1. sign in on /login", async () => {
    // Only the first list the Items page loads is answered empty; the app answers every later request.
    await items.stubFirstListAsEmpty();
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password").fill(password);
    const listed = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/items");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await items.settleAfter(listed);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. see the empty Items page", async () => {
    await expect.soft(page.getByRole("heading", { name: "Items" })).toBeVisible();
    await expect.soft(items.heading).toHaveText("Items");
    await expect.soft(items.newItemInput).toBeVisible();
    await expect.soft(items.addItemButton).toBeVisible();
    await expect.soft(page.getByText("No items yet")).toBeVisible();
    await expect.soft(items.items).toHaveCount(0);
  });

  await test.step("3. add the first item", async () => {
    const res = await items.addItem(name);
    checkRequestPayload(res.request().postDataJSON(), { name });
    const saved = await listItemsViaApi(request);
    await expect.soft(items.items).toHaveCount(saved.length);
    // the new item is listed after every earlier one, in the order the API returns them
    await expect.soft(items.items).toHaveText(saved.map((item) => item.name));
    expect.soft(saved.map((item) => item.name).slice(-1)).toEqual([name]);
    await expect.soft(items.emptyMessage).toBeHidden();
    await expect.soft(items.newItemInput).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
  });

  await test.step("4. reload /items", async () => {
    await items.open();
    const saved = await listItemsViaApi(request);
    await expect(items.heading).toHaveText("Items");
    await expect(items.userStatus).toHaveText(`Signed in as ${username}`);
    await expect(items.newItemInput).toHaveValue("");
    await expect(items.addItemButton).toBeVisible();
    await expect(items.items).toHaveCount(saved.length);
    await expect(items.items.filter({ hasText: name })).toHaveCount(1);
    await expect(items.items).toHaveText(saved.map((item) => item.name));
    expect(saved.map((item) => item.name).slice(-1)).toEqual([name]);
    await expect(items.emptyMessage).toBeHidden();
    await expect(items.error).toBeHidden();
  });
});
