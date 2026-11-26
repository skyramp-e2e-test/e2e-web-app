// Item name length limit on POST /api/items (EWA-10 AC1, EWA-10 AC2).
// Every name a test sends starts with a run-unique prefix, so tests find their own items by name
// and never depend on what else is in the shared list.
import { test, expect, APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";
const LIMIT = 60;

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// A unique name of exactly `length` characters (padded with a letter after the unique prefix).
function uniqueName(length: number): string {
  const prefix = `ewa10-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}-`;
  return (prefix + "n".repeat(length)).slice(0, length);
}

type Item = { id: number; name: string; created_at: string };

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${BASE_URL}/api/items`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  return (await res.json()) as Item[];
}

async function postItem(request: APIRequestContext, name: string) {
  return request.post(`${BASE_URL}/api/items`, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    data: { name },
  });
}

// Posts a name past the limit; expects a 400 with a JSON error and the name not stored.
async function expectRefusedAndNotStored(request: APIRequestContext, name: string) {
  const res = await postItem(request, name);
  expect(res.status(), `POST of a ${name.length}-character name`).toBe(400);
  const body = await res.json();
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  const items = await listItems(request);
  expect(items.filter((i) => i.name === name.trim())).toHaveLength(0);
}

// Posts a name within the limit; expects 201 with the trimmed name, then the same item in the list.
async function expectAddedAndListed(request: APIRequestContext, sent: string, stored: string) {
  const res = await postItem(request, sent);
  expect(res.status(), `POST of a ${stored.length}-character name`).toBe(201);
  const created = (await res.json()) as Item;
  expect(typeof created.id).toBe("number");
  expect(created.name).toBe(stored);
  expect(created.name).toHaveLength(stored.length);
  expect(typeof created.created_at).toBe("string");
  const items = await listItems(request);
  const listed = items.find((i) => i.id === created.id);
  expect(listed).toBeDefined();
  expect(listed!.name).toBe(stored);
  return created;
}

test.describe("POST /api/items name length limit (EWA-10)", () => {
  // EWA-10 AC1: a name one character past the limit is refused and not stored.
  test("a 61-character name is refused with 400 and not stored", async ({ request }) => {
    const name = uniqueName(LIMIT + 1);
    expect(name).toHaveLength(61);
    await expectRefusedAndNotStored(request, name);
  });

  // EWA-10 AC1: names between the limit and 80 characters are refused too.
  test("70- and 80-character names are refused with 400 and not stored", async ({ request }) => {
    for (const length of [70, 80]) {
      const name = uniqueName(length);
      expect(name).toHaveLength(length);
      await expectRefusedAndNotStored(request, name);
    }
  });

  // EWA-10 AC1: the refusal message states the limit of 60.
  test("the refusal message for an over-long name states the limit of 60", async ({ request }) => {
    const res = await postItem(request, uniqueName(81));
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/\b60\b/);
    expect(body.error).not.toMatch(/\b80\b/);
  });

  // EWA-10 AC1: names far past the limit are refused and nothing is stored.
  test("81- and 500-character names are refused with 400 and not stored", async ({ request }) => {
    for (const length of [81, 500]) {
      const name = uniqueName(length);
      expect(name).toHaveLength(length);
      await expectRefusedAndNotStored(request, name);
    }
  });

  // EWA-10 AC1: whitespace is trimmed before the length check, so a padded 60-character name fits.
  test("a 60-character name padded with spaces is accepted and stored trimmed", async ({ request }) => {
    const name = uniqueName(LIMIT);
    await expectAddedAndListed(request, `   ${name}   `, name);
  });

  // EWA-10 AC1: trimming does not let a 61-character name through.
  test("a 61-character name padded with spaces is refused with 400 and not stored", async ({ request }) => {
    const name = uniqueName(LIMIT + 1);
    await expectRefusedAndNotStored(request, `  ${name}  `);
  });

  // EWA-10 AC2: a name exactly at the limit is added and listed.
  test("a name of exactly 60 characters is added and listed", async ({ request }) => {
    const name = uniqueName(LIMIT);
    expect(name).toHaveLength(60);
    await expectAddedAndListed(request, name, name);
  });

  // EWA-10 AC2: short names are added and listed unchanged.
  test("names of 1 and 59 characters are added and listed", async ({ request }) => {
    await expectAddedAndListed(request, "z", "z");
    const name = uniqueName(LIMIT - 1);
    expect(name).toHaveLength(59);
    await expectAddedAndListed(request, name, name);
  });
});
