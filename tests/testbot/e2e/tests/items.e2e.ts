// Browser tests of the Items page (EWA-9 AC1, AC2), started from a Skyramp walk recording.
// The app has no route to delete an item, so items these tests add stay in the database.
import { test, type Page } from '@playwright/test';
import { checkRequestPayload, expect, getBaseUrl, newSkyrampPlaywrightPage } from '@skyramp/skyramp';

const pageTimeout = 15000;
const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');

test.use({ viewport: { width: 1280, height: 900 } });

function credentials() {
    const email = process.env.SKYRAMP_UI_USERNAME;
    const password = process.env.SKYRAMP_UI_PASSWORD;
    if (!email || !password) {
        throw new Error('SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set to sign in');
    }
    return { email, password };
}

class ItemsPage {
    constructor(readonly page: Page) {}
    get userStatus() { return this.page.getByTestId('user-status'); }
    get newItem() { return this.page.getByLabel('New item'); }
    get addItem() { return this.page.getByRole('button', { name: 'Add item' }); }
    get error() { return this.page.getByTestId('item-error'); }
    get items() { return this.page.getByTestId('item'); }

    async signIn() {
        const { email, password } = credentials();
        await this.page.goto(`${baseUrl}/login`);
        await this.page.getByLabel('Email').fill(email);
        await this.page.getByLabel('Password').fill(password);
        await this.page.getByRole('button', { name: 'Sign in' }).click();
        await this.page.waitForURL(`${baseUrl}/items`);
        await expect(this.userStatus).toHaveText(`Signed in as ${email}`);
    }

    // Names the API returns, in its (id) order; the page lists the same.
    async apiNames(): Promise<string[]> {
        const res = await this.page.request.get(`${baseUrl}/api/items`);
        expect(res.status()).toBe(200);
        return ((await res.json()) as { name: string }[]).map((i) => i.name);
    }

    // Waits for the page to list what the API holds, then returns the listed names.
    async listedNames(): Promise<string[]> {
        const names = await this.apiNames();
        await expect(this.items).toHaveText(names.length ? names : []);
        return this.items.allTextContents();
    }

    async reload() {
        const loaded = this.page.waitForResponse((r) => r.url().endsWith('/api/items') && r.request().method() === 'GET');
        await this.page.reload();
        await loaded;
    }
}

async function openItems(page: Page) {
    page.setDefaultTimeout(pageTimeout);
    const items = new ItemsPage(newSkyrampPlaywrightPage(page));
    await items.signIn();
    return items;
}

// Submits the form; returns the POST /api/items request body when one was sent within the wait.
async function submit(items: ItemsPage): Promise<unknown | null> {
    const posted = items.page
        .waitForRequest((r) => r.url().endsWith('/api/items') && r.method() === 'POST', { timeout: 3000 })
        .then((r) => r.postDataJSON())
        .catch(() => null);
    const answered = items.page
        .waitForResponse((r) => r.url().endsWith('/api/items') && r.request().method() === 'POST', { timeout: 3000 })
        .catch(() => null);
    await items.addItem.click();
    const body = await posted;
    await answered;
    return body;
}

// EWA-9 AC2: an empty name shows that the name is required, or the browser's own required-field check blocks it.
async function expectRefusedWithMessage(items: ItemsPage, body: unknown | null) {
    if (body === null) {
        const message = await items.newItem.evaluate((el: HTMLInputElement) => el.validationMessage);
        expect.soft(message).not.toBe('');
    } else {
        await expect.soft(items.error).toBeVisible();
        await expect.soft(items.error).toHaveText(/name is required/i);
    }
}

test.describe('Items page', () => {
    test('added item is still listed after reload', async ({ page }) => {
        test.setTimeout(60000);
        const items = await openItems(page);
        const before = await items.listedNames();
        const name = `Reload item ${Date.now()}`;

        await items.newItem.fill(name);
        const body = await submit(items);
        checkRequestPayload(body, { name });
        await expect(items.items).toHaveText([...before, name]);

        await items.reload();
        const after = await items.listedNames();
        expect(after).toEqual([...before, name]);
        expect(after.filter((n) => n === name)).toHaveLength(1);
        expect(after).toEqual(await items.apiNames());
    });

    test('empty or blank name is refused with a message and nothing is added', async ({ page }) => {
        test.setTimeout(60000);
        const items = await openItems(page);
        const before = await items.listedNames();

        for (const typed of ['', '   ']) {
            await test.step(`submit ${JSON.stringify(typed)}`, async () => {
                await items.newItem.fill(typed);
                const body = await submit(items);
                await expectRefusedWithMessage(items, body);
                await expect.soft(items.items).toHaveText(before.length ? before : []);
            });
        }

        await items.reload();
        const after = await items.apiNames();
        await expect(items.items).toHaveText(after.length ? after : []);
        expect(after).toEqual(before);
        expect(after.filter((n) => n.trim() === '')).toHaveLength(before.filter((n) => n.trim() === '').length);
    });

    test('journey: add an item and still see it after reloading the Items page', async ({ page }) => {
        test.setTimeout(90000);
        page.setDefaultTimeout(pageTimeout);
        const { email } = credentials();
        const items = new ItemsPage(newSkyrampPlaywrightPage(page));
        const name = `Walk item ${Date.now()}`;
        let before: string[] = [];

        await test.step('1. sign in at /login', async () => {
            await items.signIn();
            await expect(page).toHaveURL(`${baseUrl}/items`);
        });

        await test.step('2. add a uniquely named item', async () => {
            before = await items.listedNames();
            await items.newItem.fill(name);
            const body = await submit(items);
            checkRequestPayload(body, { name });
            await expect.soft(items.items).toHaveText([...before, name]);
            await expect.soft(items.newItem).toHaveValue('');
            await expect.soft(items.error).toBeHidden();
        });

        await test.step('3. reload /items', async () => {
            await items.reload();
            await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
            await expect.soft(items.error).toBeHidden();
            await expect(items.items).toHaveText([...before, name]);
            const after = await items.items.allTextContents();
            expect(after).toHaveLength(before.length + 1);
            expect(after.filter((n) => n === name)).toHaveLength(1);
            expect(after[after.length - 1]).toBe(name);
        });
    });

    test('journey: try to add an item with an empty name', async ({ page }) => {
        test.setTimeout(90000);
        page.setDefaultTimeout(pageTimeout);
        const { email } = credentials();
        const items = new ItemsPage(newSkyrampPlaywrightPage(page));
        let before: string[] = [];

        await test.step('1. sign in at /login', async () => {
            await items.signIn();
            await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
        });

        await test.step('2. submit with New item left empty', async () => {
            before = await items.listedNames();
            await expect(items.newItem).toHaveValue('');
            const body = await submit(items);
            await expectRefusedWithMessage(items, body);
            await expect.soft(items.items).toHaveText(before.length ? before : []);
        });

        await test.step('3. submit three spaces', async () => {
            await items.newItem.fill('   ');
            const body = await submit(items);
            await expectRefusedWithMessage(items, body);
            await expect.soft(items.items).toHaveText(before.length ? before : []);
        });

        await test.step('4. reload /items', async () => {
            await items.reload();
            const after = await items.apiNames();
            await expect(items.items).toHaveText(after.length ? after : []);
            expect(after).toEqual(before);
            expect(after.filter((n) => n.trim() === '')).toHaveLength(before.filter((n) => n.trim() === '').length);
        });
    });
});
