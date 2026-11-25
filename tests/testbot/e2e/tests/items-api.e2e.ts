// Contract tests for POST /api/items and GET /api/items (EWA-9 AC1, AC2).
// The app has no route to delete an item, so items these tests create stay in the database.
import { test, expect, type APIRequestContext } from '@playwright/test';

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL ?? 'http://localhost:3000';

type Item = { id: number; name: string; created_at: string };

function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    // The items API does not require a token; send one when the environment provides it.
    if (process.env.SKYRAMP_TEST_TOKEN) h.Authorization = `Bearer ${process.env.SKYRAMP_TEST_TOKEN}`;
    return h;
}

async function listItems(request: APIRequestContext): Promise<Item[]> {
    const res = await request.get(`${baseUrl}/api/items`, { headers: headers() });
    expect(res.status()).toBe(200);
    return (await res.json()) as Item[];
}

async function postRaw(request: APIRequestContext, body: string) {
    return request.post(`${baseUrl}/api/items`, { headers: headers(), data: body });
}

// Each refused request: 400 and a JSON error naming the missing name, as the empty-string request answers.
async function expectNameRequired(request: APIRequestContext, body: string) {
    const res = await postRaw(request, body);
    expect.soft(res.status(), `status for body ${body}`).toBe(400);
    const json = await res.json().catch(() => null);
    expect.soft(json, `response for body ${body}`).toEqual({ error: 'name is required' });
}

test.describe('items API', () => {
    test('created item name is stored trimmed and read back in id order', async ({ request }) => {
        // EWA-9 AC1: a saved name can be read back so a reload shows it.
        const name = `Widget X ${Date.now()}`;
        const res = await postRaw(request, JSON.stringify({ name: `  ${name}  ` }));
        expect(res.status()).toBe(201);
        const created = (await res.json()) as Item;
        expect(created.name).toBe(name);
        expect(Number.isInteger(created.id)).toBe(true);

        const items = await listItems(request);
        const matches = items.filter((i) => i.id === created.id);
        expect(matches).toHaveLength(1);
        expect(matches[0].name).toBe(name);
        expect(items.filter((i) => i.name === name)).toHaveLength(1);
        const ids = items.map((i) => i.id);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    test('empty-string name is refused and nothing is stored', async ({ request }) => {
        // EWA-9 AC2
        const before = (await listItems(request)).map((i) => i.id);
        await expectNameRequired(request, JSON.stringify({ name: '' }));
        const after = (await listItems(request)).map((i) => i.id);
        expect(after).toEqual(before);
    });

    test('whitespace-only name is refused and nothing is stored', async ({ request }) => {
        // EWA-9 AC2
        const before = (await listItems(request)).map((i) => i.id);
        await expectNameRequired(request, JSON.stringify({ name: '   ' }));
        await expectNameRequired(request, JSON.stringify({ name: '\t\n ' }));
        const after = (await listItems(request)).map((i) => i.id);
        expect(after).toEqual(before);
    });

    test('missing, null or non-string name is refused like an empty name', async ({ request }) => {
        // EWA-9 AC2
        const before = (await listItems(request)).map((i) => i.id);
        for (const body of ['{}', '{"name":null}', '{"name":123}', '{"name":["a"]}', '{"name":""}']) {
            await expectNameRequired(request, body);
        }
        const after = (await listItems(request)).map((i) => i.id);
        expect(after).toEqual(before);
    });

    test('no item with a blank name is stored after blank-name requests', async ({ request }) => {
        // EWA-9 AC2
        const blankCount = async () => (await listItems(request)).filter((i) => i.name.trim() === '').length;
        const before = await blankCount();
        const statuses: number[] = [];
        for (const name of ['', '   ']) {
            statuses.push((await postRaw(request, JSON.stringify({ name }))).status());
        }
        expect.soft(statuses).not.toContain(201);
        expect(await blankCount()).toBe(before);
    });
});
