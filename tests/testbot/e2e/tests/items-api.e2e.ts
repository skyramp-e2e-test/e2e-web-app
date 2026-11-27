// POST /api/items and GET /api/items: EWA-9 AC1 (a saved name is read back), EWA-9 AC2 (empty names refused)
// and creating an item with a valid name.
// Written by hand: the Skyramp contract generator refused for want of a licence (see the run's report).
import { test, expect } from "@skyramp/skyramp";
import type { APIRequestContext } from "@playwright/test";
import { baseUrl, apiName, listItems } from "../support/items";

const NAME_REQUIRED = { error: "name is required" };

/** Sends a body that must be refused, then checks the 400, its message and that no item was stored. */
async function expectRefused(request: APIRequestContext, body: unknown) {
  const before = await listItems(request);
  const lastId = before.reduce((max, i) => Math.max(max, i.id), 0);
  const res = await request.post(`${baseUrl}/api/items`, {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(body),
  });
  const created = res.status() === 201 ? await res.json() : null;
  // EWA-9 AC2: the answer is a refusal with a message naming the name as required.
  expect.soft(res.status()).toBe(400);
  expect.soft(await res.json()).toEqual(NAME_REQUIRED);
  // Nothing stored: no entry with an empty name has been added since the request.
  const after = await listItems(request);
  expect(after.filter((i) => i.id > lastId && i.name === "")).toEqual([]);
  if (created) expect(after.map((i) => i.id)).not.toContain(created.id);
}

test.describe("POST /api/items", () => {
  test("refuses an empty name with 400 'name is required' and stores nothing", async ({ request }) => {
    await expectRefused(request, { name: "" });
  });

  test("refuses a whitespace-only name with 400 'name is required' and stores nothing", async ({ request }) => {
    await expectRefused(request, { name: "   " });
  });

  test("refuses a tab-and-newline name with 400 'name is required' and stores nothing", async ({ request }) => {
    await expectRefused(request, { name: "\t\n" });
  });

  for (const [label, body] of [
    ["a missing name", {}],
    ["a null name", { name: null }],
    ["a numeric name", { name: 123 }],
    ["an array name", { name: ["a"] }],
  ] as const) {
    test(`refuses ${label} with 400 'name is required' and stores nothing`, async ({ request }) => {
      await expectRefused(request, body);
    });
  }

  test("stores a padded name trimmed and GET /api/items returns it unchanged", async ({ request }) => {
    const name = apiName("Reload Lamp");
    const res = await request.post(`${baseUrl}/api/items`, { data: { name: `  ${name}  ` } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe(name);
    const stored = (await listItems(request)).filter((i) => i.id === body.id);
    expect(stored).toEqual([{ id: body.id, name, created_at: body.created_at }]);
  });
});
