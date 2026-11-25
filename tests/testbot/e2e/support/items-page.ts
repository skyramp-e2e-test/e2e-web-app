// Page object and API helpers for the Items page (/items), shared by the Items page browser tests.
import type { APIRequestContext, Page, Response } from "@playwright/test";
import { expect } from "@skyramp/skyramp";

export const baseUrl =
  process.env.SKYRAMP_TEST_SERVICE_URL_UI || process.env.SKYRAMP_TEST_BASE_URL || "http://localhost:3000";

/** A suffix that keeps names this test run creates apart from earlier runs' items. */
export const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function authHeaders(): Record<string, string> {
  const token = process.env.SKYRAMP_TEST_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ApiItem {
  id: number;
  name: string;
  created_at: string;
}

/** Saves an item through POST /api/items, as items saved before the page is opened are. */
export async function createItemViaApi(request: APIRequestContext, name: string): Promise<ApiItem> {
  const res = await request.post(`${baseUrl}/api/items`, { data: { name }, headers: authHeaders() });
  expect(res.status()).toBe(201);
  const item = (await res.json()) as ApiItem;
  expect(item.name).toBe(name.trim());
  return item;
}

export async function listItemsViaApi(request: APIRequestContext): Promise<ApiItem[]> {
  const res = await request.get(`${baseUrl}/api/items`, { headers: authHeaders() });
  expect(res.status()).toBe(200);
  return (await res.json()) as ApiItem[];
}

const isItemsList = (r: Response) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "GET";
const isItemsPost = (r: Response) => new URL(r.url()).pathname === "/api/items" && r.request().method() === "POST";

export class ItemsPage {
  constructor(readonly page: Page) {}

  get heading() {
    return this.page.getByRole("heading", { level: 1 });
  }
  get userStatus() {
    return this.page.getByTestId("user-status");
  }
  get newItemInput() {
    return this.page.getByLabel("New item");
  }
  get addItemButton() {
    return this.page.getByRole("button", { name: "Add item" });
  }
  get error() {
    return this.page.getByTestId("item-error");
  }
  get emptyMessage() {
    return this.page.getByTestId("items-empty");
  }
  get list() {
    return this.page.getByTestId("items-list");
  }
  get items() {
    return this.page.getByTestId("item");
  }
  get navItems() {
    return this.page.getByTestId("nav-items");
  }

  /** Answers only the page's first GET /api/items with an empty list; later requests reach the app. */
  async stubFirstListAsEmpty() {
    let stubbed = false;
    await this.page.route("**/api/items", async (route) => {
      if (route.request().method() === "GET" && !stubbed) {
        stubbed = true;
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        return;
      }
      await route.fallback();
    });
  }

  /** Answers every GET /api/items with the given status and body; other methods reach the app. */
  async stubListResponse(status: number, body: unknown) {
    await this.page.route("**/api/items", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        return;
      }
      await route.fallback();
    });
  }

  /** Waits for a list request to be answered and for the page's script to have handled the answer. */
  async settleAfter(listResponse: Promise<Response>) {
    const res = await listResponse;
    await res.finished();
    await this.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await this.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  /** Opens /items and waits until the page has loaded its list. */
  async open() {
    const listed = this.page.waitForResponse(isItemsList);
    await this.page.goto(`${baseUrl}/items`);
    await this.settleAfter(listed);
  }

  async reload() {
    const listed = this.page.waitForResponse(isItemsList);
    await this.page.reload();
    await this.settleAfter(listed);
  }

  /** Fills New item and clicks Add item; returns the POST response and waits for the list the page reloads after it. */
  async addItem(name: string): Promise<Response> {
    await this.newItemInput.fill(name);
    const posted = this.page.waitForResponse(isItemsPost);
    const relisted = this.page.waitForResponse(isItemsList);
    relisted.catch(() => undefined);
    await this.addItemButton.click();
    const res = await posted;
    if (res.ok()) {
      await this.settleAfter(relisted);
    } else {
      await res.finished();
    }
    return res;
  }
}
