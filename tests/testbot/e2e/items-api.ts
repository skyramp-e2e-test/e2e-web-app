// Items API calls and data shared by the Items page browser tests.
import { expect, type APIRequestContext, type Page, type Response } from "@playwright/test";

export const baseUrl =
  process.env.SKYRAMP_TEST_BASE_URL || process.env.SKYRAMP_TEST_SERVICE_URL_APP || "http://localhost:3000";

export interface Item {
  id: number;
  name: string;
  created_at: string;
}

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A suffix that keeps names this run creates apart from any other run's. */
export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** POST /api/items, asserting the 201 and returning the stored item. */
export async function createItem(request: APIRequestContext, name: string): Promise<Item> {
  const res = await request.post(`${baseUrl}/api/items`, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    data: { name },
  });
  expect(res.status(), `POST /api/items ${JSON.stringify(name)}`).toBe(201);
  return (await res.json()) as Item;
}

/** GET /api/items: every item, ordered by id. */
export async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  return (await res.json()) as Item[];
}

/** Waits for the GET /api/items the Items page sends to render its list. */
export function waitForItemsLoad(page: Page): Promise<Response> {
  return page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET",
  );
}

/** Text, title and whether the title attribute is set, for each li of the list, in order. */
export async function readListedItems(page: Page): Promise<{ text: string; title: string; hasTitle: boolean }[]> {
  return page.getByTestId("item").evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent ?? "",
      title: (el as HTMLElement).title,
      hasTitle: el.hasAttribute("title"),
    })),
  );
}
