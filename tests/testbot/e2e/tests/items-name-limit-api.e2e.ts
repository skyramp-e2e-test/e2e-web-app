// POST /api/items and GET /api/items: the item-name length limit (EWA-10 AC1, AC2).
// Every name a test sends starts with "nlimit-" and a run-unique id, so the tests find their own items in the
// shared list; the app has no delete route, so .skyramp/cleanup/delete-name-limit-items.sh removes them.
import { test, expect, type APIRequestContext } from "@playwright/test";

const baseUrl = process.env.SKYRAMP_TEST_BASE_URL || process.env.SKYRAMP_TEST_SERVICE_URL_APP || "http://localhost:3000";
const token = process.env.SKYRAMP_TEST_TOKEN;
const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
/** A run-unique name of exactly `length` characters, starting with "nlimit-". */
function uniqueName(length: number): string {
  const prefix = `nlimit-${runId}-${(seq++).toString(36)}-`;
  return prefix.padEnd(length, "n").slice(0, Math.max(length, prefix.length));
}

type Item = { id: number; name: string; created_at: string };

async function postItem(request: APIRequestContext, name: string) {
  const res = await request.post(`${baseUrl}/api/items`, { headers, data: { name } });
  return { status: res.status(), body: await res.json() };
}

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers });
  expect(res.status()).toBe(200);
  return res.json();
}

test.describe("item name length limit", () => {
  test("POST of a 61-character name answers 400 with a JSON error", async ({ request }) => {
    const name = uniqueName(61);
    expect(name).toHaveLength(61);
    const { status, body } = await postItem(request, name);
    expect(status).toBe(400);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("POST of 81- and 500-character names answers 400 with a JSON error", async ({ request }) => {
    for (const length of [81, 500]) {
      const name = uniqueName(length);
      expect(name).toHaveLength(length);
      const { status, body } = await postItem(request, name);
      expect.soft(status, `${length}-character name`).toBe(400);
      expect.soft(typeof body.error, `${length}-character name`).toBe("string");
    }
  });

  test("error message for 61- and 81-character names mentions 60, not 80", async ({ request }) => {
    for (const length of [61, 81]) {
      const { status, body } = await postItem(request, uniqueName(length));
      expect.soft(status, `${length}-character name`).toBe(400);
      expect.soft(String(body.error), `${length}-character name`).toContain("60");
      expect.soft(String(body.error), `${length}-character name`).not.toContain("80");
    }
  });

  test("61- and 81-character names are absent from GET /api/items after their POST", async ({ request }) => {
    const refused = [uniqueName(61), uniqueName(81)];
    for (const name of refused) {
      const { status } = await postItem(request, name);
      expect.soft(status, `${name.length}-character name`).toBe(400);
    }
    const items = await listItems(request);
    for (const name of refused) {
      // Matched by its unique prefix, so a stored copy is found even if the app shortened it.
      const prefix = `${name.split("-").slice(0, 3).join("-")}-`;
      expect(items.filter((i) => i.name.startsWith(prefix)), `${name.length}-character name`).toEqual([]);
    }
  });

  test("POST of a 61-character name answers 400 and GET /api/items lacks it", async ({ request }) => {
    const name = uniqueName(61);
    const { status, body } = await postItem(request, name);
    expect(status).toBe(400);
    expect(typeof body.error).toBe("string");
    const items = await listItems(request);
    expect(items.filter((i) => i.name === name)).toEqual([]);
  });

  test("POST of an 81-character name answers 400 with an error mentioning 60, not 80", async ({ request }) => {
    const { status, body } = await postItem(request, uniqueName(81));
    expect(status).toBe(400);
    expect(String(body.error)).toContain("60");
    expect(String(body.error)).not.toContain("80");
  });

  test("POST of a 60-character name answers 201 and GET /api/items returns it untruncated", async ({ request }) => {
    const name = uniqueName(60);
    expect(name).toHaveLength(60);
    const { status, body } = await postItem(request, name);
    expect(status).toBe(201);
    expect(typeof body.id).toBe("number");
    expect(body.name).toBe(name);

    const listed = (await listItems(request)).filter((i) => i.id === body.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe(name);
    expect(listed[0].name).toHaveLength(60);
  });

  test("POST of 1- and 20-character names answers 201 with each name", async ({ request }) => {
    const typical = `nlimit-${runId}-`.padEnd(20, "t").slice(0, 20);
    expect(typical).toHaveLength(20);
    for (const name of ["x", typical]) {
      const { status, body } = await postItem(request, name);
      expect.soft(status, `${name.length}-character name`).toBe(201);
      expect.soft(body.name, `${name.length}-character name`).toBe(name);
    }
  });

  test("POST of a space-padded 60-character name answers 201 with the trimmed name", async ({ request }) => {
    const name = uniqueName(60);
    const { status, body } = await postItem(request, `  ${name}  `);
    expect(status).toBe(201);
    expect(body.name).toBe(name);
    const listed = (await listItems(request)).filter((i) => i.id === body.id);
    expect(listed.map((i) => i.name)).toEqual([name]);
  });
});
