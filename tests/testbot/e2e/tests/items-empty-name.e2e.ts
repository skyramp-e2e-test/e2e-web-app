// Items page: EWA-9 AC2, an empty or blank name is refused with a message and adds nothing, also after a reload.
// Drafted from a Skyramp walk of the empty, blank and named submits, request-body checks kept.
import { test, expect, checkRequestPayload } from "@skyramp/skyramp";
import type { Response } from "@playwright/test";
import { ItemsPage, baseUrl, credentials, uiName, withoutOtherTestItems } from "../support/items";

test.use({ viewport: { width: 1280, height: 900 } });

const isItemsCall = (method: string, url: string, want: string) => method === want && new URL(url).pathname === "/api/items";

/**
 * Fills the name, clicks 'Add item' and waits until the page has either refused it (a browser validation message with
 * no request sent, or the error paragraph shown) or has finished what it does after an accepted POST.
 * Gives which message showed ("validation", "error" or "none") and the POST bodies the page sent.
 */
async function submitRefused(items: ItemsPage, value: string) {
  const posts: unknown[] = [];
  const responses: Response[] = [];
  const onRequest = (r: import("@playwright/test").Request) => { if (isItemsCall(r.method(), r.url(), "POST")) posts.push(r.postDataJSON()); };
  const onResponse = (r: Response) => { if (new URL(r.url()).pathname === "/api/items") responses.push(r); };
  items.page.on("request", onRequest);
  items.page.on("response", onResponse);
  await items.nameInput.fill(value);
  await items.addButton.click();
  let shown = "none";
  // Settled: a validation message with no POST, or the POST answered (and, when it was accepted, the list reloaded).
  await expect.poll(async () => {
    const validation = await items.nameInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    if (validation && posts.length === 0) { shown = "validation"; return true; }
    const post = responses.find((r) => r.request().method() === "POST");
    if (!post) return false;
    if (!post.ok()) {
      if (await items.error.isVisible()) { shown = "error"; return true; }
      return false;
    }
    return responses.indexOf(post) < responses.length - 1;
  }).toBe(true);
  items.page.off("request", onRequest);
  items.page.off("response", onResponse);
  return { shown, posts };
}

/** Checks that a refusal showed its message: a browser validation message, or the error paragraph saying the name is required. */
async function expectNameRequiredMessage(items: ItemsPage, shown: string) {
  expect.soft(shown, "a message saying the name is required").not.toBe("none");
  if (shown === "error") await expect.soft(items.error).toHaveText("name is required");
}

test("clicking 'Add item' with the name empty shows a message and adds nothing, also after a reload", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.signIn();
  const before = withoutOtherTestItems(await items.loadedNames());
  const { shown, posts } = await submitRefused(items, "");
  if (posts.length) checkRequestPayload(posts[0], { name: "" });
  await expectNameRequiredMessage(items, shown);
  expect.soft(withoutOtherTestItems(await items.items.allTextContents())).toEqual(before);
  expect(withoutOtherTestItems(await items.reload())).toEqual(before);
});

test("submitting a whitespace-only name shows 'name is required' and adds nothing, also after a reload", async ({ page }) => {
  const items = new ItemsPage(page);
  await items.signIn();
  const before = withoutOtherTestItems(await items.loadedNames());
  const { shown, posts } = await submitRefused(items, "   ");
  if (posts.length) checkRequestPayload(posts[0], { name: "   " });
  await expectNameRequiredMessage(items, shown);
  expect.soft(withoutOtherTestItems(await items.items.allTextContents())).toEqual(before);
  expect(withoutOtherTestItems(await items.reload())).toEqual(before);
});

test("an empty and a blank name are refused, then a real name is added on the Items page", async ({ page }) => {
  const items = new ItemsPage(page);
  const { email } = credentials();
  const name = uiName("Shelf");
  let noted: string[] = [];

  await test.step("1. sign in at /login and land on /items", async () => {
    await page.goto(`${baseUrl}/login`);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await items.signIn({ navigate: false });
    expect.soft(new URL(items.page.url()).pathname).toBe("/items");
    await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
    noted = withoutOtherTestItems(await items.loadedNames());
  });

  await test.step("2. click 'Add item' with the name empty: refused with a message, list unchanged", async () => {
    const { shown } = await submitRefused(items, "");
    await expectNameRequiredMessage(items, shown);
    expect.soft(withoutOtherTestItems(await items.items.allTextContents())).toEqual(noted);
  });

  await test.step("3. submit three spaces: refused with a message, list unchanged", async () => {
    const { shown } = await submitRefused(items, "   ");
    await expectNameRequiredMessage(items, shown);
    expect.soft(withoutOtherTestItems(await items.items.allTextContents())).toEqual(noted);
  });

  let afterReload: string[] = [];
  await test.step("4. reload /items: the list is the noted entries, no blank entry", async () => {
    afterReload = withoutOtherTestItems(await items.reload());
    expect.soft(afterReload).toEqual(noted);
  });

  await test.step("5. add a named item: it is the only new entry", async () => {
    await items.nameInput.fill(name);
    const posted = items.page.waitForRequest((r) => isItemsCall(r.method(), r.url(), "POST"));
    expect(await items.submit()).toBe(201);
    checkRequestPayload((await posted).postDataJSON(), { name });
    await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
    await expect(items.error).toBeHidden();
    await expect(items.nameInput).toHaveValue("");
    const finalList = withoutOtherTestItems(await items.loadedNames(), [name]);
    expect(finalList).toEqual([...noted, name]);
    expect(finalList.length).toBe(noted.length + 1);
    await expect(items.itemNamed(name)).toHaveCount(1);
  });
});
