// Items page: a name at the 60-character limit is added and shown (EWA-10 AC2).
// Recorded with the Skyramp walk helper, then strengthened.
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from "@skyramp/skyramp";
import { uniqueItemName } from "../support/item-names";

const pageTimeout = 15000;

const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

test.use({
  viewport: { width: 1280, height: 900 },
});

test("adding a 60-character name on the Items page shows it in the list", async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(pageTimeout);
  page = newSkyrampPlaywrightPage(page);

  const username = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (username === undefined || password === undefined) {
    throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: this test signs in with them");
  }

  const name = uniqueItemName(60, "ui");
  const expectedPayload1 = { name };

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByTestId("user-status")).toContainText(`Signed in as ${username.toLowerCase()}`);

  const input = page.getByTestId("item-name-input");
  await input.fill(name);
  await expect(input).toHaveValue(name);

  const responsePromise0 = page.waitForResponse(
    (r) => r.url().endsWith("/api/items") && r.request().method() === "POST"
  );
  await page.getByTestId("add-item-submit").click();
  const response0 = await responsePromise0;
  checkRequestPayload(response0.request().postDataJSON(), expectedPayload1);
  expect(response0.status()).toBe(201);

  const entry = page.getByTestId("items-list").getByTestId("item").filter({ hasText: name });
  await expect(entry).toHaveCount(1);
  await expect(entry).toHaveText(name);
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("item-error")).toBeHidden();
});
