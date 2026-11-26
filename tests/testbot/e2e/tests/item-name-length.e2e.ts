// Item name length rules of POST /api/items (EWA-10 AC1, AC2) and the
// missing-name refusal that must stay as it was.
import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE_URL =
  process.env.SKYRAMP_TEST_BASE_URL || process.env.SKYRAMP_TEST_SERVICE_URL_APP || "http://localhost:3000";

type Item = { id: number; name: string; created_at: string };

// A prefix unique to this run, so names this test sends can be found again.
function runPrefix(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}-`;
}

// A name of exactly `length` characters that starts with a run-unique prefix.
function uniqueName(length: number, fill = "A"): string {
  const prefix = runPrefix();
  return (prefix + fill.repeat(length)).slice(0, length);
}

async function postItem(request: APIRequestContext, data: unknown) {
  return request.post(`${BASE_URL}/api/items`, { data });
}

async function listItems(request: APIRequestContext): Promise<Item[]> {
  const response = await request.get(`${BASE_URL}/api/items`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Item[];
}

async function expectTooLongRefused(request: APIRequestContext, name: string) {
  const response = await postItem(request, { name });
  expect(response.status(), `status for a ${name.length}-character name`).toBe(400);
  const body = await response.json();
  expect(typeof body.error).toBe("string");
  expect(body.id).toBeUndefined();
  const stored = (await listItems(request)).filter((item) => item.name === name);
  expect(stored).toEqual([]);
}

async function expectAddedAndListed(request: APIRequestContext, name: string) {
  const response = await postItem(request, { name });
  expect(response.status(), `status for a ${[...name].length}-character name`).toBe(201);
  const created = (await response.json()) as Item;
  expect(typeof created.id).toBe("number");
  expect(created.name).toBe(name);
  expect(typeof created.created_at).toBe("string");
  const listed = (await listItems(request)).find((item) => item.id === created.id);
  expect(listed?.name).toBe(name);
  return created;
}

test.describe("POST /api/items name length", () => {
  // EWA-10 AC1 (AC1a): defect F1, the limit is 80 instead of 60
  test("refuses a 61-character name and stores nothing", async ({ request }) => {
    const name = uniqueName(61);
    expect(name.length).toBe(61);
    await expectTooLongRefused(request, name);
  });

  // EWA-10 AC1 (AC1b): defect F1
  test("refuses 70- and 80-character names and stores neither", async ({ request }) => {
    const name70 = uniqueName(70);
    const name80 = uniqueName(80);
    expect([name70.length, name80.length]).toEqual([70, 80]);
    await expectTooLongRefused(request, name70);
    await expectTooLongRefused(request, name80);
  });

  // EWA-10 AC1 (AC1c)
  test("refuses 81- and 500-character names and stores neither", async ({ request }) => {
    const name81 = uniqueName(81);
    const name500 = uniqueName(500);
    expect([name81.length, name500.length]).toEqual([81, 500]);
    await expectTooLongRefused(request, name81);
    await expectTooLongRefused(request, name500);
  });

  // EWA-10 AC1 (AC1d): defect F2. An 81-character name is refused on either
  // limit, so this reads only the message.
  test("refusal message for a too-long name states the 60-character limit", async ({ request }) => {
    const response = await postItem(request, { name: uniqueName(81) });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("60");
    expect(body.error).not.toContain("80");
  });

  // EWA-10 AC1 (AC1e): length counts after trimming surrounding whitespace
  test("counts the length after trimming surrounding spaces", async ({ request }) => {
    const name60 = uniqueName(60, "B");
    const padded60 = await postItem(request, { name: `  ${name60}  ` });
    expect(padded60.status()).toBe(201);
    const created = (await padded60.json()) as Item;
    expect(created.name).toBe(name60);
    const listed = (await listItems(request)).find((item) => item.id === created.id);
    expect(listed?.name).toBe(name60);

    const name61 = uniqueName(61, "B");
    const padded61 = await postItem(request, { name: `  ${name61}  ` });
    expect(padded61.status()).toBe(400);
    const items = await listItems(request);
    expect(items.filter((item) => item.name === name61 || item.name === `  ${name61}  `)).toEqual([]);
  });

  // EWA-10 AC2 (AC2a, AC2b)
  test("adds a 60-character name and lists it in full", async ({ request }) => {
    const name = uniqueName(60);
    expect(name.length).toBe(60);
    const created = await expectAddedAndListed(request, name);
    const listed = (await listItems(request)).find((item) => item.id === created.id);
    expect(listed?.name.length).toBe(60);
  });

  // EWA-10 AC2 (AC2c)
  test("adds and lists 1- and 59-character names", async ({ request }) => {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const oneChar = letters[Math.floor(Math.random() * letters.length)];
    await expectAddedAndListed(request, oneChar);
    const name59 = uniqueName(59);
    expect(name59.length).toBe(59);
    await expectAddedAndListed(request, name59);
  });

  // EWA-10 AC2 (AC2d): defect F3, length is measured in UTF-16 code units
  test("counts accented letters and emoji as one character each", async ({ request }) => {
    await expectAddedAndListed(request, "é".repeat(60));
    await expectAddedAndListed(request, "\u{1F600}".repeat(41));
    await expectAddedAndListed(request, "\u{1F600}".repeat(60));
  });
});

test.describe("POST /api/items missing name", () => {
  // Stays as it was (R1a)
  test("refuses missing, empty, whitespace-only and non-string names", async ({ request }) => {
    const before = await listItems(request);
    const maxIdBefore = before.reduce((max, item) => Math.max(max, item.id), 0);
    for (const data of [{}, { name: "" }, { name: "   " }, { name: 123 }]) {
      const response = await postItem(request, data);
      expect(response.status(), `status for ${JSON.stringify(data)}`).toBe(400);
      expect(await response.json()).toEqual({ error: "name is required" });
    }
    const added = (await listItems(request)).filter((item) => item.id > maxIdBefore);
    expect(added.filter((item) => ["", "   ", "123"].includes(item.name))).toEqual([]);
  });
});
