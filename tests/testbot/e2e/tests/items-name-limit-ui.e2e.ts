// Items page item-name length limit (EWA-10 AC1, AC2), from a Skyramp walk of the page.
// Every name is made unique to the run; the app has no delete route, so created items stay.
import { test, checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from '@skyramp/skyramp';
import type { Page } from '@playwright/test';

const pageTimeout = 15000;
const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

test.use({
    viewport: { width: 1280, height: 900 },
});

function credentials() {
    const username = process.env.SKYRAMP_UI_USERNAME;
    const password = process.env.SKYRAMP_UI_PASSWORD;
    if (!username || !password) {
        throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set: these tests sign in to the Items page");
    }
    return { username, password };
}

function uniqueName(label: string, length: number): string {
    const prefix = `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-`;
    return prefix.padEnd(length, "x").slice(0, length);
}

async function signIn(page: Page) {
    const { username, password } = credentials();
    await page.goto(`${baseUrl}/login`);
    await page.getByTestId("email-input").fill(username);
    await page.getByTestId("password-input").fill(password);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/items$/);
    await expect(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
}

/** Types `name` and clicks Add item; returns the POST /api/items response, after checking its request body. */
async function addItem(page: Page, name: string) {
    await page.getByTestId("item-name-input").fill(name);
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "POST");
    await page.getByTestId("add-item-submit").click();
    const response = await responsePromise;
    checkRequestPayload(response.request().postDataJSON(), { name });
    return response;
}

function listedItem(page: Page, name: string) {
    return page.getByTestId("items-list").getByTestId("item").filter({ hasText: new RegExp(`^${name}$`) });
}

test.describe("Items page name length limit", () => {
    test.beforeEach(async ({ page }) => {
        test.setTimeout(60000);
        page.setDefaultTimeout(pageTimeout);
    });

    test("adding a 60-character name lists it", async ({ page }) => {
        page = newSkyrampPlaywrightPage(page);
        await signIn(page);
        const name = uniqueName("ui60", 60);
        expect(name).toHaveLength(60);
        const response = await addItem(page, name);
        expect(response.status()).toBe(201);
        await expect(listedItem(page, name)).toHaveCount(1);
        await expect(listedItem(page, name)).toHaveText(name);
        await expect(page.getByTestId("item-error")).toBeHidden();
        await expect(page.getByTestId("item-name-input")).toHaveValue("");
    });

    test("a 61-character name shows the 60-character limit and is not listed", async ({ page }) => {
        page = newSkyrampPlaywrightPage(page);
        await signIn(page);
        const name = uniqueName("ui61", 61);
        expect(name).toHaveLength(61);
        await addItem(page, name);
        await expect(page.getByTestId("item-error")).toBeVisible();
        await expect(page.getByTestId("item-error")).toContainText("60");
        await expect(page.getByTestId("item-name-input")).toHaveValue(name);
        const listLoaded = page.waitForResponse((r) => r.url().endsWith("/api/items") && r.request().method() === "GET");
        await page.reload();
        const loadedItems = await (await listLoaded).json();
        // The page has rendered the list it loaded once it shows as many items as that response held.
        await expect(page.getByTestId("items-list").getByTestId("item")).toHaveCount(loadedItems.length);
        await expect(listedItem(page, name)).toHaveCount(0);
    });

    test("add items with names at and past the length limit", async ({ page }) => {
        page = newSkyrampPlaywrightPage(page);
        const { username } = credentials();
        const n60 = uniqueName("j60", 60);
        const n61 = uniqueName("j61", 61);

        await test.step("1. sign in from /login and land on /items", async () => {
            await signIn(page);
            await expect.soft(page.getByTestId("user-status")).toHaveText(`Signed in as ${username}`);
        });

        await test.step("2. add a 60-character name: it is listed and the input is cleared", async () => {
            const response = await addItem(page, n60);
            expect.soft(response.status()).toBe(201);
            await expect.soft(listedItem(page, n60)).toHaveCount(1);
            await expect.soft(page.getByTestId("item-name-input")).toHaveValue("");
            await expect.soft(page.getByTestId("item-error")).toBeHidden();
        });

        await test.step("3. add a 61-character name: an error states 60 and it is not listed", async () => {
            await addItem(page, n61);
            await expect.soft(page.getByTestId("item-error")).toBeVisible();
            await expect.soft(page.getByTestId("item-error")).toContainText("60");
            await expect.soft(listedItem(page, n61)).toHaveCount(0);
        });

        await test.step("outcome after reload: 60-character item listed, 61-character one not", async () => {
            await page.reload();
            await expect.soft(listedItem(page, n60)).toHaveCount(1);
            await expect.soft(listedItem(page, n61)).toHaveCount(0);
        });
    });
});
