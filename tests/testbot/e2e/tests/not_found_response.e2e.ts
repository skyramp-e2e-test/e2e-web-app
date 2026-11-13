// Contract tests for the catch-all 404 handler (src/app.js) and the routes registered before it.
import { test, expect } from "@playwright/test";
import { SkyrampClient } from "@skyramp/skyramp";

const BASE_URL =
  process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
const NOT_FOUND_BODY = { error: "Not found (B)" };

const client = new SkyrampClient();

type Sent = { statusCode: number; responseBody: string; responseHeaders: Record<string, string | string[]> };

async function send(method: string, path: string, options: { body?: string; headers?: Record<string, string> } = {}): Promise<Sent> {
  const response = (await client.sendRequest({ url: BASE_URL, path, method, ...options })) as unknown as Sent;
  return response;
}

function header(response: Sent, name: string): string {
  const entry = Object.entries(response.responseHeaders || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1]) : "";
}

function expectNotFound(response: Sent) {
  expect(response.statusCode).toBe(404);
  expect(header(response, "content-type")).toContain("application/json");
  expect(JSON.parse(response.responseBody)).toEqual(NOT_FOUND_BODY);
}

/** The session cookie (name=value) from signing in as the user the app seeds (src/db.js TEST_USER). */
async function sessionCookie(): Promise<string> {
  const response = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: "test@example.com", password: "password123" }).toString(),
    redirect: "manual",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/items");
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  expect(cookie).toMatch(/^session=/);
  return cookie;
}

test.describe("catch-all 404 response", () => {
  test("GET to an unknown path answers 404 with the Not found (B) message", async () => {
    for (const path of ["/does-not-exist", "/api/does-not-exist"]) {
      await test.step(`GET ${path}`, async () => {
        const response = await send("GET", path);
        expectNotFound(response);
        expect(JSON.parse(response.responseBody).error).not.toBe("Not found");
      });
    }
  });

  test("other unmatched methods and paths answer the same 404", async () => {
    const requests: Array<[string, string, string | undefined]> = [
      ["POST", "/api/nope", JSON.stringify({ name: "x" })],
      ["PUT", "/api/nope", JSON.stringify({ name: "x" })],
      ["DELETE", "/api/nope", undefined],
      ["DELETE", "/api/items", undefined],
      ["PUT", "/items", undefined],
      ["GET", "/static/missing.css", undefined],
    ];
    for (const [method, path, body] of requests) {
      await test.step(`${method} ${path}`, async () => {
        const headers = body ? { "Content-Type": "application/json" } : undefined;
        expectNotFound(await send(method, path, { body, headers }));
      });
    }
  });

  test("a signed-in caller gets the same 404 for an unknown path", async () => {
    const cookie = await sessionCookie();
    await test.step("the session is accepted", async () => {
      const me = await send("GET", "/api/me", { headers: { Cookie: cookie } });
      expect(me.statusCode).toBe(200);
    });
    await test.step("GET /api/nope with the session cookie", async () => {
      expectNotFound(await send("GET", "/api/nope", { headers: { Cookie: cookie } }));
    });
  });
});

test.describe("routes registered before the catch-all", () => {
  test("known routes answer as before, never with the 404 message", async () => {
    for (const path of ["/health", "/healthz"]) {
      await test.step(`GET ${path}`, async () => {
        const response = await send("GET", path);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.responseBody)).toEqual({ status: "ok" });
      });
    }
    for (const path of ["/", "/login", "/items"]) {
      await test.step(`GET ${path}`, async () => {
        const response = await send("GET", path);
        expect(response.statusCode).toBe(200);
        expect(header(response, "content-type")).toContain("text/html");
        expect(response.responseBody).not.toContain("Not found (B)");
      });
    }
    await test.step("GET /static/styles.css", async () => {
      const response = await send("GET", "/static/styles.css");
      expect(response.statusCode).toBe(200);
      expect(header(response, "content-type")).toContain("text/css");
    });
    await test.step("GET /api/items", async () => {
      const response = await send("GET", "/api/items");
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(JSON.parse(response.responseBody))).toBe(true);
    });
    await test.step("POST /api/items with a name", async () => {
      const name = `known-routes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await send("POST", "/api/items", { body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" } });
      expect(response.statusCode).toBe(201);
      const created = JSON.parse(response.responseBody);
      expect(created.name).toBe(name);
      expect(typeof created.id).toBe("number");
      const list = JSON.parse((await send("GET", "/api/items")).responseBody) as Array<{ id: number; name: string }>;
      expect(list.find((item) => item.id === created.id)?.name).toBe(name);
    });
    await test.step("POST /api/items without a name", async () => {
      const response = await send("POST", "/api/items", { body: "{}", headers: { "Content-Type": "application/json" } });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.responseBody)).toEqual({ error: "name is required" });
    });
    await test.step("GET /api/me without a cookie", async () => {
      const response = await send("GET", "/api/me");
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.responseBody)).toEqual({ error: "Not signed in" });
    });
    await test.step("GET /api/me with the session cookie", async () => {
      const cookie = await sessionCookie();
      const response = await send("GET", "/api/me", { headers: { Cookie: cookie } });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.responseBody)).toEqual({ email: "test@example.com" });
    });
  });
});
