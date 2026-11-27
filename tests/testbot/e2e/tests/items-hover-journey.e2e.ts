// Journey: sign in, add an item with a long name, and hover it to read the full name.
import { test, expect, checkRequestPayload, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { ItemsPage, baseUrl, uniqueMarker, type Item } from "../support/items-page";

test("sign in, add a long-named item and read its full name on hover", async ({ page }) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  page = newSkyrampPlaywrightPage(page);

  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!username || !password) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: this test signs in through the login page");
  }
  const name = `Hover journey ${uniqueMarker()} Quarterly infrastructure capacity review for the north-east regional data centre including storage, compute and network expansion plans for 2027`;
  const itemsPage = new ItemsPage(page);
  let listLoad: Promise<Item[]> = Promise.resolve([]);

  await test.step("1. sign in on /login and land on /items", async () => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect.soft(itemsPage.userStatus).toHaveText(`Signed in as ${username}`);
  });

  await test.step("2. add the long-named item through the form", async () => {
    await itemsPage.newItemInput.fill(name);
    const posted = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    const reloaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
    await itemsPage.addButton.click();
    const response = await posted;
    checkRequestPayload(response.request().postDataJSON(), { name });
    listLoad = reloaded.then(async (r) => (await r.json()) as Item[]);
    await listLoad;
    await expect.soft(itemsPage.error).toBeHidden();
    await expect.soft(itemsPage.newItemInput).toHaveValue("");
    await expect.soft(itemsPage.entry(name)).toHaveCount(1);
  });

  await test.step("3. hover the new item and read its full name", async () => {
    const loaded = await listLoad;
    const entry = itemsPage.entry(name);
    await entry.hover();
    await expect.soft(entry).toHaveText(name, { useInnerText: true });
    await expect.soft(entry).toHaveAttribute("title", name);
    await expect.soft(itemsPage.items).toHaveCount(loaded.length);
    const pairs = await itemsPage.items.evaluateAll((els) =>
      els.map((el) => ({ text: (el as HTMLElement).innerText, title: el.getAttribute("title") })),
    );
    expect.soft(pairs.map((p) => p.title)).toEqual(pairs.map((p) => p.text));
    // The new item is the last entry: the list is in id order.
    expect.soft(pairs[pairs.length - 1]?.title).toBe(name);
  });

  await test.step("4. reload /items: the full name is still the hover text", async () => {
    const loaded = await itemsPage.reload();
    await expect(itemsPage.userStatus).toHaveText(`Signed in as ${username}`);
    await expect(itemsPage.error).toBeHidden();
    await expect(itemsPage.newItemInput).toHaveValue("");
    expect(loaded.map((i) => i.id)).toEqual([...loaded.map((i) => i.id)].sort((a, b) => a - b));
    const entries = await itemsPage.items.all();
    expect(entries.length).toBe(loaded.length);
    for (let i = 0; i < loaded.length; i++) {
      await expect(entries[i]).toHaveText(loaded[i].name, { useInnerText: true });
      await expect(entries[i]).toHaveAttribute("title", loaded[i].name);
    }
    const entry = itemsPage.entry(name);
    await expect(entry).toHaveCount(1);
    await entry.hover();
    await expect(entry).toHaveAttribute("title", name);
  });
});
