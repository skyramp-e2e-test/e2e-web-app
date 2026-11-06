// Contract tests for POST /api/items and GET /api/items after "Allow saving items without a name".
// The app exposes no DELETE route for items, so rows these tests create cannot be removed through the API.
import { test, expect, APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

type Item = { id: number; name: string; created_at: string };

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${BASE_URL}/api/items`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  return body as Item[];
}

async function postItem(request: APIRequestContext, data: unknown) {
  return request.post(`${BASE_URL}/api/items`, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    data: JSON.stringify(data),
  });
}

function expectTimestamp(value: unknown) {
  expect(typeof value).toBe("string");
  expect(Number.isNaN(Date.parse(value as string))).toBe(false);
}

// Creates an item with the given body and checks it is answered 201 with name "", then read back once as "".
async function expectSavedNameless(request: APIRequestContext, data: unknown) {
  const before = await listItems(request);
  const res = await postItem(request, data);
  expect(res.status()).toBe(201);
  const body = (await res.json()) as Item;
  expect(typeof body.id).toBe("number");
  expect(body.name).toBe("");
  expectTimestamp(body.created_at);

  const after = await listItems(request);
  const matches = after.filter((i) => i.id === body.id);
  expect(matches).toHaveLength(1);
  expect(matches[0].name).toBe("");
  expect(after.length).toBe(before.length + 1);
  return body;
}

test.describe.configure({ mode: "serial" });

test.describe("POST /api/items without a name", () => {
  test("saves an item when name is the empty string", async ({ request }) => {
    await expectSavedNameless(request, { name: "" });
  });

  test("saves a whitespace-only name as an empty name", async ({ request }) => {
    await expectSavedNameless(request, { name: "   " });
  });

  test("saves an item when the name key is missing", async ({ request }) => {
    // Q1 is open (README still says a missing name answers 400): only check that it is not a server error,
    // and that a 201 stores an empty name.
    const res = await postItem(request, {});
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 201) {
      const body = (await res.json()) as Item;
      expect(body.name).toBe("");
      const after = await listItems(request);
      expect(after.filter((i) => i.id === body.id).map((i) => i.name)).toEqual([""]);
    } else {
      expect(res.status()).toBe(400);
    }
  });

  test("saves an item when name is null", async ({ request }) => {
    await expectSavedNameless(request, { name: null });
  });

  test("creates a separate nameless item for each request", async ({ request }) => {
    const before = await listItems(request);
    const r1 = await postItem(request, { name: "" });
    const r2 = await postItem(request, { name: "" });
    expect(r1.status()).toBe(201);
    expect(r2.status()).toBe(201);
    const b1 = (await r1.json()) as Item;
    const b2 = (await r2.json()) as Item;
    expect(b1.id).not.toBe(b2.id);
    const after = await listItems(request);
    expect(after.length).toBe(before.length + 2);
    expect(after.find((i) => i.id === b1.id)?.name).toBe("");
    expect(after.find((i) => i.id === b2.id)?.name).toBe("");
  });
});

test.describe("GET /api/items", () => {
  test("lists items in id order when nameless items are present", async ({ request }) => {
    const created = await postItem(request, { name: "" });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as Item;
    const items = await listItems(request);
    for (let i = 1; i < items.length; i++) expect(items[i].id).toBeGreaterThan(items[i - 1].id);
    for (const item of items) {
      expect(typeof item.id).toBe("number");
      expect(typeof item.name).toBe("string");
    }
    expect(items.find((i) => i.id === id)?.name).toBe("");
  });
});

test.describe("POST /api/items with a non-string name", () => {
  test("does not save a non-string name as an empty name", async ({ request }) => {
    for (const value of [42, true, { a: 1 }]) {
      const before = await listItems(request);
      const res = await postItem(request, { name: value });
      const status = res.status();
      expect.soft(status, `name ${JSON.stringify(value)}: no server error`).toBeLessThan(500);
      const after = await listItems(request);
      if (status === 201) {
        const body = (await res.json()) as Item;
        expect.soft(body.name, `name ${JSON.stringify(value)}: saved name must not be blanked`).not.toBe("");
        expect.soft(after.find((i) => i.id === body.id)?.name, `name ${JSON.stringify(value)}: stored name`).not.toBe("");
      } else {
        expect.soft(status, `name ${JSON.stringify(value)}: rejected`).toBe(400);
        expect.soft(after.length, `name ${JSON.stringify(value)}: item count unchanged`).toBe(before.length);
      }
    }
  });
});
