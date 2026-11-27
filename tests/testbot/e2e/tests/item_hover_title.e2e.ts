// Journey: sign in, add an item with a long name, and see its full name when hovering it.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, LoginPage, listItems } from "../support/items-page";

const pageTimeout = 15000;

test.use({ viewport: { width: 1280, height: 900 } });

test("sign in, add an item with a long name, and see its full name when hovering it", async ({ page, request }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(pageTimeout);
  page = newSkyrampPlaywrightPage(page);
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in");
  const name =
    "Quarterly planning notes for the platform team with a deliberately long name " +
    `that keeps going past the width of the list so only a tooltip shows all of it ${Date.now()}`;
  const signedIn = `Signed in as ${email}`;
  const login = new LoginPage(page);
  const items = new ItemsPage(page);
  let newId = 0;

  /** The new entry is last of the entries stored up to it; later ones belong to tests running alongside. */
  const expectListedLast = async () => {
    await expect
      .soft(async () => {
        const stored = await listItems(request);
        const entries = await items.entries();
        expect(entries.map((e) => e.text)).toEqual(stored.map((i) => i.name));
        expect(entries.findIndex((e) => e.text === name)).toBe(stored.filter((i) => i.id <= newId).length - 1);
      })
      .toPass({ timeout: 10000 });
  };

  await test.step("1. sign in on /login", async () => {
    await login.goto();
    await login.email.fill(email);
    await login.password.fill(password);
    await login.signIn.click();
    await expect.soft(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(signedIn);
  });

  await test.step("2. add the item, padded with two spaces each side, through the form", async () => {
    await items.newItem.fill(`  ${name}  `);
    const sent = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await items.addItem.click();
    const response = await sent;
    checkRequestPayload(response.request().postDataJSON(), { name: `  ${name}  ` });
    expect(response.status()).toBe(201);
    newId = (await response.json()).id;
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.byTitle(name)).toHaveText(name);
    await expect.soft(items.byText(name)).toHaveCount(1);
    await expectListedLast();
  });

  await test.step("3. hover the new entry: its tooltip is the full trimmed name", async () => {
    const entry = items.byTitle(name);
    await entry.hover();
    await expect.soft(entry).toHaveAttribute("title", name);
    await expect.soft(items.items.and(page.locator(":hover"))).toHaveAttribute("title", name);
    await expect.poll(() => items.entriesWithoutMatchingTitle()).toEqual([]);
  });

  await test.step("4. reload /items through the Items link: the entry and its tooltip persist", async () => {
    await items.navItems.click();
    await expect(page).toHaveURL(/\/items$/);
    await expect.soft(items.userStatus).toHaveText(signedIn);
    await expect.soft(items.error).toBeHidden();
    await expect.soft(items.newItem).toHaveValue("");
    await expect.soft(items.byTitle(name)).toHaveText(name);
    await expect.soft(items.byText(name)).toHaveCount(1);
    await expect.soft(items.byText(name)).toHaveAttribute("title", name);
    await expectListedLast();
    await expect.poll(() => items.entriesWithoutMatchingTitle()).toEqual([]);
  });
});
