// Contract tests for the items API (GET/POST /api/items).
// The app has no route to delete an item, so items these tests create stay in the
// database; every name is made unique to the run so reruns do not collide.
import { test, expect } from "@playwright/test";
import { SkyrampClient, getValue, uniqueSuffix } from "@skyramp/skyramp";

const BASE_URL =
  process.env.SKYRAMP_TEST_BASE_URL || process.env.BASE_URL || "http://localhost:3000";

type Item = { id: number; name: string; created_at: string };

const client = new SkyrampClient();

function headers(): Record<string, string> {
  // The items API needs no sign-in.
  return { "Content-Type": "application/json" };
}

async function listItems(): Promise<Item[]> {
  const response = await client.sendRequest({
    url: BASE_URL,
    path: "/api/items",
    method: "GET",
    headers: headers(),
  });
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.responseBody) as Item[];
}

async function postItem(body: unknown) {
  const response = await client.sendRequest({
    url: BASE_URL,
    path: "/api/items",
    method: "POST",
    body: JSON.stringify(body),
    headers: headers(),
  });
  let json: unknown = null;
  try {
    json = JSON.parse(response.responseBody);
  } catch {
    json = response.responseBody;
  }
  return { status: response.statusCode, body: json as Record<string, unknown> };
}

test.describe("POST /api/items", () => {
  test("a valid name creates exactly one item with that name", async () => {
    const name = uniqueSuffix("First item");
    const before = await listItems();

    const created = await postItem({ name });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(Number),
      name,
      created_at: expect.any(String),
    });
    expect(getValue(created.body, "name")).toBe(name);

    const after = await listItems();
    expect(after).toHaveLength(before.length + 1);
    const matching = after.filter((item) => item.id === created.body.id);
    expect(matching).toEqual([{ id: created.body.id, name, created_at: created.body.created_at }]);
  });

  test("a non-string name is refused with 400 and adds nothing", async () => {
    const before = await listItems();
    const payloads = [{ name: 123 }, { name: null }, { name: ["a"] }, { name: { a: 1 } }, { name: true }];
    for (const payload of payloads) {
      await test.step(`POST ${JSON.stringify(payload)}`, async () => {
        const res = await postItem(payload);
        expect.soft(res.status, JSON.stringify(payload)).toBe(400);
        expect.soft(res.body, JSON.stringify(payload)).toEqual({ error: "name is required" });
      });
    }
    const after = await listItems();
    expect(after).toHaveLength(before.length);
  });

  test("a whitespace-only name is refused with 400 and adds nothing", async () => {
    const before = await listItems();
    for (const name of ["   ", " \t\n "]) {
      await test.step(`POST ${JSON.stringify({ name })}`, async () => {
        const res = await postItem({ name });
        expect.soft(res.status, JSON.stringify(name)).toBe(400);
        expect.soft(res.body, JSON.stringify(name)).toEqual({ error: "name is required" });
      });
    }
    const after = await listItems();
    expect(after).toHaveLength(before.length);
    expect(after.filter((item) => item.name.trim() === "")).toEqual(
      before.filter((item) => item.name.trim() === "")
    );
  });

  test("leading and trailing whitespace is trimmed from a stored name", async () => {
    const trimmed = uniqueSuffix("Padded item");
    const created = await postItem({ name: `  ${trimmed}  ` });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe(trimmed);

    const listed = (await listItems()).find((item) => item.id === created.body.id);
    expect(listed?.name).toBe(trimmed);
    // Inner spaces are kept.
    expect(listed?.name).toContain("Padded item");
  });
});

test.describe("GET /api/items", () => {
  test("lists all items ordered by id, a new item last", async () => {
    const name = uniqueSuffix("Listed item");
    const created = await postItem({ name });
    expect(created.status).toBe(201);

    const items = await listItems();
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(item).toEqual({ id: expect.any(Number), name: expect.any(String), created_at: expect.any(String) });
    }
    const ids = items.map((item) => item.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(items[items.length - 1]).toEqual({
      id: created.body.id,
      name,
      created_at: created.body.created_at,
    });
  });
});
