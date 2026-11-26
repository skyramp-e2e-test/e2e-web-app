// Item name length limit on POST /api/items (EWA-10 AC1, EWA-10 AC2), with trimming and the existing
// "name is required" refusal. Written by hand: Skyramp contract generation was refused for want of a licence.
import { test, expect, getBaseUrl } from "@skyramp/skyramp";
import type { APIRequestContext } from "@playwright/test";
import { ITEM_NAME_LIMIT, uniqueItemName } from "../support/item-names";

const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

type Item = { id: number; name: string; created_at: string };

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Item[];
}

async function postItem(request: APIRequestContext, body: unknown) {
  const res = await request.post(`${baseUrl}/api/items`, {
    headers: { "Content-Type": "application/json" },
    data: body,
  });
  return { status: res.status(), body: await res.json() };
}

/** A too-long name is refused with 400, a message stating the 60-character limit, and is not stored. */
async function expectRefusedForLength(request: APIRequestContext, sent: string, stored: string) {
  const res = await postItem(request, { name: sent });
  expect(res.status).toBe(400);
  expect(typeof res.body.error).toBe("string");
  expect(res.body.error).toContain(String(ITEM_NAME_LIMIT));
  const items = await listItems(request);
  expect(items.filter((i) => i.name === stored)).toHaveLength(0);
}

test.describe("POST /api/items name length limit", () => {
  test("refuses a 61-character name with 400 and stores nothing", async ({ request }) => {
    const name = uniqueItemName(61, "r");
    const res = await postItem(request, { name });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    const items = await listItems(request);
    expect(items.filter((i) => i.name === name)).toHaveLength(0);
  });

  test("the refusal of a 61-character name states the 60-character limit", async ({ request }) => {
    const res = await postItem(request, { name: uniqueItemName(61, "m") });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("60");
    expect(res.body.error).not.toContain("80");
  });

  test("the refusal of an 81-character name states 60, not 80", async ({ request }) => {
    const res = await postItem(request, { name: uniqueItemName(81, "n") });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("60");
    expect(res.body.error).not.toContain("80");
  });

  test("refuses a 70-character name and stores nothing", async ({ request }) => {
    const name = uniqueItemName(70, "s");
    await expectRefusedForLength(request, name, name);
  });

  test("refuses an 80-character name and stores nothing", async ({ request }) => {
    const name = uniqueItemName(80, "e");
    await expectRefusedForLength(request, name, name);
  });

  test("refuses 81- and 500-character names and stores neither", async ({ request }) => {
    const n81 = uniqueItemName(81, "f", "b");
    const n500 = uniqueItemName(500, "h", "b");
    await expectRefusedForLength(request, n81, n81);
    await expectRefusedForLength(request, n500, n500);
  });

  test("refuses a name of 61 characters after trimming surrounding spaces", async ({ request }) => {
    const core = uniqueItemName(61, "p");
    await expectRefusedForLength(request, `  ${core}  `, core);
    const items = await listItems(request);
    expect(items.filter((i) => i.name === `  ${core}  `)).toHaveLength(0);
  });

  test("adds a 60-character name and lists it unchanged", async ({ request }) => {
    const name = uniqueItemName(60, "o");
    const res = await postItem(request, { name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.name).toHaveLength(60);
    expect(typeof res.body.id).toBe("number");

    const listed = (await listItems(request)).filter((i) => i.name === name);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(res.body.id);
    expect(listed[0].name).toBe(name);
  });

  test("adds 1- and 59-character names", async ({ request }) => {
    const one = await postItem(request, { name: "z" });
    expect(one.status).toBe(201);
    expect(one.body.name).toBe("z");
    const n59 = uniqueItemName(59, "q");
    const fiftyNine = await postItem(request, { name: n59 });
    expect(fiftyNine.status).toBe(201);
    expect(fiftyNine.body.name).toBe(n59);

    const items = await listItems(request);
    expect(items.find((i) => i.id === one.body.id)?.name).toBe("z");
    expect(items.filter((i) => i.name === n59).map((i) => i.id)).toEqual([fiftyNine.body.id]);
  });

  test("adds a name of 50 emoji characters", async ({ request }) => {
    const name = "\u{1F600}".repeat(50);
    expect([...name]).toHaveLength(50);
    const res = await postItem(request, { name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    const items = await listItems(request);
    expect(items.find((i) => i.id === res.body.id)?.name).toBe(name);
  });

  test("adds a 50-character name of 5 letters and 45 emoji", async ({ request }) => {
    const name = uniqueItemName(5, "", "k").slice(-5) + "\u{1F600}".repeat(45);
    expect([...name]).toHaveLength(50);
    const res = await postItem(request, { name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    const listed = (await listItems(request)).filter((i) => i.name === name);
    expect(listed.map((i) => i.id)).toEqual([res.body.id]);
  });

  test("adds a name with 60 characters after trimming and stores it trimmed", async ({ request }) => {
    const core = uniqueItemName(60, "w");
    const res = await postItem(request, { name: `   ${core}   ` });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(core);
    const listed = (await listItems(request)).filter((i) => i.id === res.body.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe(core);
  });
});

test.describe("POST /api/items still requires a name", () => {
  async function expectNameRequired(request: APIRequestContext, bodies: unknown[], refusedNames: string[]) {
    const before = Math.max(0, ...(await listItems(request)).map((i) => i.id));
    for (const body of bodies) {
      const res = await postItem(request, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toEqual({ error: "name is required" });
    }
    const added = (await listItems(request)).filter((i) => i.id > before && refusedNames.includes(i.name));
    expect(added).toEqual([]);
  }

  test("refuses an empty, a whitespace-only and a missing name", async ({ request }) => {
    await expectNameRequired(request, [{ name: "" }, { name: "   " }, {}], ["", "   "]);
  });
});
