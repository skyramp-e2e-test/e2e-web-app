// EWA-10 AC1 / AC2: POST /api/items enforces a 60-character limit on item names.
import { test, expect } from "@skyramp/skyramp";
import type { APIRequestContext } from "@playwright/test";
import { appUrl, listItems, uniqueName } from "../support/items";

// The items API does not require sign-in; the run's token is sent when the environment provides one.
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.SKYRAMP_TEST_TOKEN) headers.Authorization = `Bearer ${process.env.SKYRAMP_TEST_TOKEN}`;

async function postItem(request: APIRequestContext, name: string) {
  const res = await request.post(`${appUrl}/api/items`, { headers, data: { name } });
  return { status: res.status(), body: await res.json() };
}

/** Asserts the refusal EWA-10 AC1 states: 400 and an error that names the 60-character limit. */
function expectRefusedWithLimit(res: { status: number; body: { error?: unknown } }) {
  expect(res.status).toBe(400);
  expect(typeof res.body.error).toBe("string");
  expect(res.body.error as string).toMatch(/\b60\b/);
}

test.describe("item name limit (API)", () => {
  // EWA-10 AC1
  test("a 61-character name is refused with 400 stating the 60-character limit and is not stored", async ({ request }) => {
    const name = uniqueName(61);
    expect(name).toHaveLength(61);
    const res = await postItem(request, name);
    expectRefusedWithLimit(res);
    const names = (await listItems(request)).map((i) => i.name);
    expect(names).not.toContain(name);
  });

  // EWA-10 AC1
  test("refused 61- and 80-character names are not stored", async ({ request }) => {
    const n61 = uniqueName(61);
    const n80 = uniqueName(80);
    const r61 = await postItem(request, n61);
    const r80 = await postItem(request, n80);
    const names = (await listItems(request)).map((i) => i.name);
    expect.soft(names, "61-character name must not be stored").not.toContain(n61);
    expect.soft(names, "80-character name must not be stored").not.toContain(n80);
    expect.soft(r61.status).toBe(400);
    expect.soft(r80.status).toBe(400);
  });

  // EWA-10 AC1
  test("a 70-character name is refused stating the 60-character limit and is not stored", async ({ request }) => {
    const name = uniqueName(70);
    const res = await postItem(request, name);
    const names = (await listItems(request)).map((i) => i.name);
    expect.soft(names).not.toContain(name);
    expectRefusedWithLimit(res);
  });

  // EWA-10 AC1
  test("an 80-character name is refused stating the 60-character limit", async ({ request }) => {
    const name = uniqueName(80);
    const res = await postItem(request, name);
    expectRefusedWithLimit(res);
    expect((await listItems(request)).map((i) => i.name)).not.toContain(name);
  });

  // EWA-10 AC1
  test("names of 81 and 500 characters are refused stating the 60-character limit", async ({ request }) => {
    const n81 = uniqueName(81, "b");
    const n500 = uniqueName(500, "c");
    const r81 = await postItem(request, n81);
    const r500 = await postItem(request, n500);
    const names = (await listItems(request)).map((i) => i.name);
    expect.soft(names).not.toContain(n81);
    expect.soft(names).not.toContain(n500);
    await test.step("81 characters", () => expectRefusedWithLimit(r81));
    await test.step("500 characters", () => expectRefusedWithLimit(r500));
  });

  // EWA-10 AC1: length is counted after trimming, so leading spaces do not hide a 61-character name.
  test("a 61-character name with leading spaces is refused stating the 60-character limit", async ({ request }) => {
    const name = uniqueName(61);
    const res = await postItem(request, "  " + name);
    const names = (await listItems(request)).map((i) => i.name);
    expect.soft(names).not.toContain(name);
    expectRefusedWithLimit(res);
  });

  // EWA-10 AC2
  test("a name of exactly 60 characters is added and listed", async ({ request }) => {
    const name = uniqueName(60);
    const res = await postItem(request, name);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.name).toHaveLength(60);
    expect(typeof res.body.id).toBe("number");
    expect(typeof res.body.created_at).toBe("string");
    const stored = (await listItems(request)).find((i) => i.id === res.body.id);
    expect(stored?.name).toBe(name);
  });

  // EWA-10 AC2
  test("names of 1 and 59 characters are added and listed", async ({ request }) => {
    const n59 = uniqueName(59);
    const r1 = await postItem(request, "z");
    const r59 = await postItem(request, n59);
    expect(r1.status).toBe(201);
    expect(r1.body.name).toBe("z");
    expect(r59.status).toBe(201);
    expect(r59.body.name).toBe(n59);
    const items = await listItems(request);
    expect(items.find((i) => i.id === r1.body.id)?.name).toBe("z");
    expect(items.find((i) => i.id === r59.body.id)?.name).toBe(n59);
  });

  // EWA-10 AC2: surrounding spaces are trimmed before the length check and before storing.
  test("a 60-character name surrounded by spaces is added and stored trimmed", async ({ request }) => {
    const name = uniqueName(60);
    const res = await postItem(request, "  " + name + "  ");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    const stored = (await listItems(request)).find((i) => i.id === res.body.id);
    expect(stored?.name).toBe(name);
  });
});
