// Contract tests for POST /api/items and GET /api/items (EWA-9 AC1, EWA-9 AC2).
// Written by hand with Skyramp's client: Skyramp generation could not authenticate in this run.
// The app has no route to delete an item, so items these tests create stay in the app; each is named uniquely.
import { SkyrampClient, checkStatusCode, uniqueSuffix } from "@skyramp/skyramp";
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";
const AUTH_HEADERS: Record<string, string> = process.env.SKYRAMP_TEST_TOKEN
  ? { Authorization: `Bearer ${process.env.SKYRAMP_TEST_TOKEN}` }
  : {};

type Item = { id: number; name: string; created_at: string };

const client = new SkyrampClient();

async function send(method: string, path: string, body?: unknown, contentType = "application/json") {
  const response = await client.sendRequest({
    url: BASE_URL,
    path,
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { ...AUTH_HEADERS, ...(body === undefined ? {} : { "Content-Type": contentType }) },
  });
  const status = Number((response as any).statusCode);
  const raw = (response as any).responseBody ?? "";
  let json: any;
  try {
    json = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    json = raw;
  }
  return { response, status, json };
}

async function listItems(): Promise<Item[]> {
  const { response, json } = await send("GET", "/api/items");
  expect(checkStatusCode(response, "200")).toBe(true);
  expect(Array.isArray(json)).toBe(true);
  return json as Item[];
}

async function expectNameRefused(body: unknown, contentType = "application/json") {
  const { status, json } = await send("POST", "/api/items", body, contentType);
  expect.soft(status, `POST /api/items ${typeof body === "string" ? body : JSON.stringify(body)}`).toBe(400);
  expect.soft(json).toEqual({ error: "name is required" });
}

test.describe("POST /api/items", () => {
  test("a saved name is returned by GET /api/items afterwards", async () => {
    const name = uniqueSuffix("Reload check");
    const created = await send("POST", "/api/items", { name: `  ${name}  ` });
    expect(created.status).toBe(201);
    expect(created.json.name).toBe(name);

    const items = await listItems();
    const found = items.filter((item) => item.id === created.json.id);
    expect(found.map((item) => item.name)).toEqual([name]);
  });

  test("refuses an empty name with 400 and stores nothing", async () => {
    const before = await listItems();
    await expectNameRefused({ name: "" });
    const after = await listItems();
    const maxBefore = Math.max(0, ...before.map((b) => b.id));
    expect(after.filter((item) => item.id > maxBefore && item.name === "")).toEqual([]);
  });

  test("refuses a whitespace-only name with 400 and stores nothing", async () => {
    const before = await listItems();
    await expectNameRefused({ name: "   " });
    const after = await listItems();
    const maxBefore = Math.max(0, ...before.map((b) => b.id));
    expect(after.filter((item) => item.id > maxBefore && item.name === "")).toEqual([]);
  });

  test("refuses a missing or non-string name with 400 and stores nothing", async () => {
    const before = await listItems();
    const maxBefore = Math.max(0, ...before.map((b) => b.id));
    await test.step("no name field", () => expectNameRefused({}));
    await test.step("name null", () => expectNameRefused({ name: null }));
    await test.step("name a number", () => expectNameRefused({ name: 123 }));
    await test.step("name an array", () => expectNameRefused({ name: ["a"] }));
    await test.step("form-encoded empty name", () => expectNameRefused("name=", "application/x-www-form-urlencoded"));
    const after = await listItems();
    expect(after.filter((item) => item.id > maxBefore && item.name === "")).toEqual([]);
  });
});
