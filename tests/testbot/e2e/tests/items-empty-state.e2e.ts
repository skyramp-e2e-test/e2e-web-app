// Journey: sign in, empty list, add a first and a second item, reload (EWA-8 AC1, AC2; requirements.csv AC1).
// Runs against the real app with no network stubs; step 2 needs an app whose items table is empty.
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, credentials } from "../items-page";

const FIRST = "J1 first item";
const SECOND = "J1 second item";

test("sign-in, empty list, two adds and a reload", async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(15000);
  const items = new ItemsPage(page);
  const { username, password } = credentials();
  const journeyRows = async () => (await items.rows.allTextContents()).filter((t) => t === FIRST || t === SECOND);

  await test.step("1. sign in on /login", async () => {
    await items.page.goto(`${baseUrl}/login`);
    await items.page.getByLabel("Email").fill(username);
    await items.page.getByLabel("Password").fill(password);
    const loaded = items.waitForItemsGet();
    await items.page.getByRole("button", { name: "Sign in" }).click();
    await expect(items.page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${username}`);
    await loaded;
  });

  await test.step("2. empty-state message before any add", async () => {
    await expect.soft(items.emptyMessage).toBeVisible();
    await expect.soft(items.emptyMessage).toHaveText("No items yet");
    await expect.soft(items.rows).toHaveCount(0);
  });

  await test.step("3. add the first item", async () => {
    await items.page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    const response = await items.add(FIRST);
    checkRequestPayload(response.request().postDataJSON(), { name: FIRST });
    expect.soft(response.status()).toBe(201);
    await expect.soft(items.emptyMessage).toBeHidden();
    await expect.soft(items.rows).toHaveText([FIRST]);
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.nameInput).toHaveValue("");
    expect.soft(await items.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  await test.step("4. add the second item", async () => {
    const response = await items.add(SECOND);
    checkRequestPayload(response.request().postDataJSON(), { name: SECOND });
    expect.soft(response.status()).toBe(201);
    await expect.soft(items.rows).toHaveText([FIRST, SECOND]);
    await expect.soft(items.emptyMessage).toBeHidden();
  });

  await test.step("5. reload the Items page", async () => {
    const loaded = items.waitForItemsGet();
    await items.page.reload();
    await loaded;
    await expect.poll(journeyRows).toEqual([FIRST, SECOND]);
    await expect(items.rows).toHaveText([FIRST, SECOND]);
    await expect(items.emptyMessage).toBeHidden();
    await expect(items.userStatus).toHaveText(`Signed in as ${username}`);
    await expect(items.error).toBeHidden();
    await expect(items.nameInput).toHaveValue("");
  });
});
