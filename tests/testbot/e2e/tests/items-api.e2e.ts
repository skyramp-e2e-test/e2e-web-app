// API tests of POST /api/items and GET /api/items: a valid name is stored trimmed and read back (EWA-9 AC1),
// an empty, blank, missing or non-string name is refused and nothing is stored (EWA-9 AC2).
import { test, expect, getBaseUrl, SkyrampClient } from '@skyramp/skyramp';

const baseUrl = getBaseUrl('SKYRAMP_TEST_BASE_URL', 'http://localhost:3000');

type Item = { id: number; name: string; created_at: string };

const client = new SkyrampClient();

async function send(method: string, body?: unknown) {
  const response = await client.sendRequest({
    url: baseUrl,
    path: '/api/items',
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.statusCode, body: response.responseBody ? JSON.parse(response.responseBody) : undefined };
}

async function listItems(): Promise<Item[]> {
  const res = await send('GET');
  expect(res.status).toBe(200);
  return res.body as Item[];
}

/** Posts each body, and checks each is refused with 400 "name is required" and that nothing was stored. */
async function expectAllRefused(bodies: unknown[]) {
  const before = await listItems();
  for (const body of bodies) {
    const res = await send('POST', body);
    expect.soft(res.status, `status for ${JSON.stringify(body)}`).toBe(400);
    expect.soft(res.body, `body for ${JSON.stringify(body)}`).toEqual({ error: 'name is required' });
  }
  const after = await listItems();
  expect.soft(after.length, 'items stored').toBe(before.length);
  expect(after.filter((i) => i.name === '').length, 'items with an empty name').toBe(before.filter((i) => i.name === '').length);
}

test('a valid name is stored trimmed and returned by GET /api/items', async () => {
  const name = `Widget-${Date.now()}`;
  const created = await send('POST', { name: `  ${name}  ` });
  expect(created.status).toBe(201);
  expect(created.body.name).toBe(name);
  expect(typeof created.body.id).toBe('number');

  const listed = (await listItems()).filter((i) => i.id === created.body.id);
  expect(listed).toHaveLength(1);
  expect(listed[0].name).toBe(name);
});

test('an empty name is refused with 400 and nothing is stored', async () => {
  await expectAllRefused([{ name: '' }]);
});

test('a whitespace-only name is refused like an empty one and nothing is stored', async () => {
  await expectAllRefused([{ name: '   ' }, { name: '\t\n' }]);
});

test('a missing, null or non-string name is refused and nothing is stored', async () => {
  await expectAllRefused([{}, { name: null }, { name: 123 }]);
});
