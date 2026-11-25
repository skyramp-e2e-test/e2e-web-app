// API tests for POST /api/items and GET /api/items (EWA-9 AC1, EWA-9 AC2).
// The app has no route that deletes an item, so the items these tests create stay in the database;
// every name they send starts with "testbot-api-" so they can be found.
import { test, expect, type APIRequestContext } from "@playwright/test";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

type Item = { id: number; name: string; created_at: string };

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function uniqueName(prefix: string): string {
  return `testbot-api-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  return (await res.json()) as Item[];
}

async function postItem(request: APIRequestContext, body: unknown) {
  return request.post(`${baseUrl}/api/items`, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    data: JSON.stringify(body),
  });
}

// Items stored with an empty name: none may appear because of a refused request.
function blankIds(items: Item[]): number[] {
  return items.filter((i) => i.name.trim() === "").map((i) => i.id);
}

test.describe("POST /api/items", () => {
  test("creates an item from a valid name and answers 201 with it (EWA-9 AC1)", async ({ request }) => {
    const before = await listItems(request);
    const name = uniqueName("Desk");

    const res = await postItem(request, { name });
    expect(res.status()).toBe(201);
    const created = (await res.json()) as Item;
    expect(typeof created.id).toBe("number");
    expect(created.name).toBe(name);
    expect(typeof created.created_at).toBe("string");
    expect(Number.isNaN(Date.parse(created.created_at))).toBe(false);
    expect(before.map((i) => i.id)).not.toContain(created.id);

    const after = await listItems(request);
    const matches = after.filter((i) => i.name === name);
    expect(matches).toEqual([{ id: created.id, name, created_at: created.created_at }]);
    // The new item comes after every item listed before it (GET orders by id).
    for (const old of before) expect(created.id).toBeGreaterThan(old.id);
  });

  test("stores the name trimmed and returns it from GET /api/items (EWA-9 AC1)", async ({ request }) => {
    const name = uniqueName("Lamp");

    const res = await postItem(request, { name: `  ${name}  ` });
    expect(res.status()).toBe(201);
    const created = (await res.json()) as Item;
    expect(created.name).toBe(name);

    const after = await listItems(request);
    const stored = after.find((i) => i.id === created.id);
    expect(stored).toBeDefined();
    expect(stored!.name).toBe(name);
  });

  test("refuses an empty name with 400 and stores nothing (EWA-9 AC2)", async ({ request }) => {
    const before = await listItems(request);

    const res = await postItem(request, { name: "" });
    const status = res.status();
    const body = await res.json();

    const after = await listItems(request);
    const newBlank = blankIds(after).filter((id) => !before.some((i) => i.id === id));
    expect.soft(newBlank, "no item with an empty name was stored").toEqual([]);
    expect(status).toBe(400);
    expect(body).toEqual({ error: "name is required" });
  });

  test("refuses a whitespace-only name like an empty one and stores nothing (EWA-9 AC2)", async ({ request }) => {
    const before = await listItems(request);

    const spaces = await postItem(request, { name: "   " });
    const spacesStatus = spaces.status();
    const spacesBody = await spaces.json();
    const empty = await postItem(request, { name: "" });
    const emptyStatus = empty.status();
    const emptyBody = await empty.json();

    const after = await listItems(request);
    const newBlank = blankIds(after).filter((id) => !before.some((i) => i.id === id));
    expect.soft(newBlank, "no item with an empty name was stored").toEqual([]);
    expect(spacesStatus).toBe(400);
    expect(spacesBody).toEqual({ error: "name is required" });
    expect(spacesStatus).toBe(emptyStatus);
    expect(spacesBody).toEqual(emptyBody);
  });

  for (const [label, body] of [
    ["a missing name", {}],
    ["a null name", { name: null }],
    ["a numeric name", { name: 123 }],
  ] as const) {
    test(`refuses ${label} with 400 and stores nothing (EWA-9 AC2)`, async ({ request }) => {
      const before = await listItems(request);

      const res = await postItem(request, body);
      const status = res.status();
      const resBody = await res.json();

      const after = await listItems(request);
      const newBlank = blankIds(after).filter((id) => !before.some((i) => i.id === id));
      expect.soft(newBlank, "no item with an empty name was stored").toEqual([]);
      expect(status).toBe(400);
      expect(resBody).toEqual({ error: "name is required" });
    });
  }
});
