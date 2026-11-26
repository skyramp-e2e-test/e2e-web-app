// Shared helpers for the item-name tests: run-unique names and reading the item list back.
import type { APIRequestContext } from "@playwright/test";

export const appUrl = process.env.SKYRAMP_TEST_BASE_URL || process.env.SKYRAMP_TEST_SERVICE_URL_APP || "http://localhost:3000";

/** Prefix every name these tests create starts with, so leftover items can be found and removed. */
export const NAME_PREFIX = "nlim";

/** A name unique to this run, padded with `fill` to exactly `length` characters. */
export function uniqueName(length: number, fill = "x"): string {
  const tag = NAME_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return tag.padEnd(length, fill).slice(0, length);
}

export interface Item {
  id: number;
  name: string;
  created_at: string;
}

/** GET /api/items, asserted to answer 200 with a list. */
export async function listItems(request: APIRequestContext): Promise<Item[]> {
  const res = await request.get(`${appUrl}/api/items`);
  if (res.status() !== 200) throw new Error(`GET /api/items answered ${res.status()}`);
  return (await res.json()) as Item[];
}
