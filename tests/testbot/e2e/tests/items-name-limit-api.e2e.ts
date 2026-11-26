// POST /api/items name-length rules: EWA-10 AC1, AC2; trimming (R3); missing names (R4).
import { test, expect, getBaseUrl } from '@skyramp/skyramp';
import type { APIRequestContext } from '@playwright/test';
import { uniqueItemName, ITEM_NAME_LIMIT } from '../support/item-names';

const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');

type Item = { id: number; name: string; created_at: string };

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function postItem(request: APIRequestContext, body: unknown) {
  const res = await request.post(`${baseUrl}/api/items`, { data: body as Record<string, unknown> });
  return { status: res.status(), body: await res.json() };
}

const namedCount = (items: Item[], name: string) => items.filter((i) => i.name === name).length;

test.describe('POST /api/items name length', () => {
  test('a 61-character name is refused with 400 and is not stored', async ({ request }) => {
    // EWA-10 AC1 (AC1a); defect F1
    const name = uniqueItemName(ITEM_NAME_LIMIT + 1, 'b');
    expect(name).toHaveLength(61);
    const res = await postItem(request, { name });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(namedCount(await listItems(request), name)).toBe(0);
  });

  test('the refusal message for a 61- and a 100-character name states the 60-character limit', async ({ request }) => {
    // EWA-10 AC1 (AC1b); defect F1
    for (const length of [61, 100]) {
      const res = await postItem(request, { name: uniqueItemName(length, 'm') });
      expect.soft(res.status, `status for a ${length}-character name`).toBe(400);
      expect.soft(String(res.body.error), `message for a ${length}-character name`).toMatch(/\b60\b/);
      expect.soft(String(res.body.error), `message for a ${length}-character name`).not.toMatch(/\b80\b/);
    }
  });

  test('an 80-character name is refused with a message stating 60 and is not stored', async ({ request }) => {
    // EWA-10 AC1; defect F1 (the change allows up to 80)
    const name = uniqueItemName(80, 'e');
    const res = await postItem(request, { name });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/\b60\b/);
    expect(namedCount(await listItems(request), name)).toBe(0);
  });

  test('a 100-character name is refused with 400 and is not stored', async ({ request }) => {
    // EWA-10 AC1 (AC1c)
    const name = uniqueItemName(100, 'h');
    const res = await postItem(request, { name });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(namedCount(await listItems(request), name)).toBe(0);
  });

  test('a name of exactly 60 characters is added and listed', async ({ request }) => {
    // EWA-10 AC2 (AC2a)
    const name = uniqueItemName(ITEM_NAME_LIMIT, 's');
    expect(name).toHaveLength(60);
    const res = await postItem(request, { name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(typeof res.body.id).toBe('number');
    const listed = (await listItems(request)).filter((i) => i.id === res.body.id);
    expect(listed.map(({ id, name: n }) => ({ id, name: n }))).toEqual([{ id: res.body.id, name }]);
  });

  test('a 1-character and a 10-character name are added and listed', async ({ request }) => {
    // EWA-10 AC2 (AC2b)
    const tenChars = `tbnl${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    expect(tenChars).toHaveLength(10);
    for (const name of ['x', tenChars]) {
      const res = await postItem(request, { name });
      expect.soft(res.status, `status for "${name}"`).toBe(201);
      expect.soft(res.body.name).toBe(name);
      const listed = (await listItems(request)).find((i) => i.id === res.body.id);
      expect.soft(listed?.name, `listed name for "${name}"`).toBe(name);
    }
  });

  test('a 60-character name with surrounding spaces is stored trimmed', async ({ request }) => {
    // R3 (R3a)
    const name = uniqueItemName(ITEM_NAME_LIMIT, 'p');
    const res = await postItem(request, { name: `   ${name}   ` });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    const listed = (await listItems(request)).find((i) => i.id === res.body.id);
    expect(listed?.name).toBe(name);
  });

  test('a 61-character name padded with spaces is refused and not stored', async ({ request }) => {
    // R3 (R3b); defect F1
    const name = uniqueItemName(ITEM_NAME_LIMIT + 1, 'q');
    const res = await postItem(request, { name: `  ${name}  ` });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    const items = await listItems(request);
    expect(namedCount(items, name)).toBe(0);
    expect(namedCount(items, `  ${name}  `)).toBe(0);
  });

  test('a missing, empty, blank or non-string name is refused with name is required', async ({ request }) => {
    // R4 (R4a): unchanged behaviour
    const before = await listItems(request);
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 12345 }]) {
      const res = await postItem(request, body);
      expect.soft(res.status, `status for ${JSON.stringify(body)}`).toBe(400);
      expect.soft(res.body, `body for ${JSON.stringify(body)}`).toEqual({ error: 'name is required' });
    }
    const after = await listItems(request);
    for (const name of ['', '   ', '12345']) {
      expect.soft(namedCount(after, name), `items named ${JSON.stringify(name)}`).toBe(namedCount(before, name));
    }
  });
});
