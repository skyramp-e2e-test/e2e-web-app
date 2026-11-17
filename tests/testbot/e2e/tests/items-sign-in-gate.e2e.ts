// Backend contract tests for the sign-in gate on the Items page (GET /items) and the pages beside it.
import { test, expect, getBaseUrl } from "@skyramp/skyramp";
import type { APIRequestContext } from "@playwright/test";

const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");

function credentials(): { email: string; password: string } {
  const email = process.env.SKYRAMP_UI_USERNAME;
  const password = process.env.SKYRAMP_UI_PASSWORD;
  if (!email || !password) throw new Error("SKYRAMP_UI_USERNAME and SKYRAMP_UI_PASSWORD must be set");
  return { email, password };
}

/** Signs in through the login form and returns the session cookie pair ("session=..."). */
async function signIn(request: APIRequestContext): Promise<string> {
  const { email, password } = credentials();
  const res = await request.post(`${baseUrl}/login`, { form: { email, password }, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toBe("/items");
  const setCookie = res.headersArray().find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("session="));
  expect(setCookie, "POST /login sets the session cookie").toBeTruthy();
  return setCookie!.value.split(";")[0];
}

async function expectRedirectToLogin(request: APIRequestContext, method: "GET" | "HEAD", path: string, cookie?: string) {
  const headers = cookie !== undefined ? { cookie } : undefined;
  const res = method === "GET"
    ? await request.get(`${baseUrl}${path}`, { maxRedirects: 0, headers })
    : await request.head(`${baseUrl}${path}`, { maxRedirects: 0, headers });
  expect(res.status(), `${method} ${path}`).toBe(303);
  expect(res.headers()["location"], `${method} ${path} Location`).toMatch(/\/login$/);
  if (method === "GET") expect(await res.text()).not.toContain("Your items");
}

test.describe("Items page sign-in gate", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("GET /items without a session cookie redirects to the login page", async ({ request }) => {
    await expectRedirectToLogin(request, "GET", "/items");
    await expectRedirectToLogin(request, "GET", "/items?x=1");
    await expectRedirectToLogin(request, "GET", "/items/");
    await expectRedirectToLogin(request, "HEAD", "/items");

    const followed = await request.get(`${baseUrl}/items`);
    expect(new URL(followed.url()).pathname).toBe("/login");
    expect(followed.status()).toBe(200);
    expect(await followed.text()).toContain("<h1>Sign in</h1>");
  });

  test("GET /items with a session cookie that is not validly signed is treated as signed out", async ({ request }) => {
    const { email } = credentials();
    const enc = encodeURIComponent(email);
    await expectRedirectToLogin(request, "GET", "/items", `session=${enc}`);
    await expectRedirectToLogin(request, "GET", "/items", `session=s%3A${enc}.${"A".repeat(43)}`);
    await expectRedirectToLogin(request, "GET", "/items", "session=");

    const real = await signIn(request);
    expect(real).toContain(enc);
    const swapped = real.replace(enc, encodeURIComponent("evil@example.com"));
    expect(swapped).not.toBe(real);
    await expectRedirectToLogin(request, "GET", "/items", swapped);
  });

  test("GET /items with a valid signed session cookie returns the Items page", async ({ request }) => {
    const cookie = await signIn(request);
    const res = await request.get(`${baseUrl}/items`, { maxRedirects: 0, headers: { cookie } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<h1>Your items</h1>");
    expect(body).not.toContain("<h1>Items</h1>");
    expect(body).toContain('data-testid="add-item-form"');
    expect(body).toContain('data-testid="items-list"');
  });

  test("after signing out, GET /items requires sign-in again", async ({ request }) => {
    const cookie = await signIn(request);
    const logout = await request.post(`${baseUrl}/logout`, { maxRedirects: 0, headers: { cookie } });
    expect(logout.status()).toBe(303);
    expect(logout.headers()["location"]).toBe("/");
    const cleared = logout.headersArray().find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("session="));
    expect(cleared, "POST /logout clears the session cookie").toBeTruthy();
    const jarCookie = cleared!.value.split(";")[0];
    await expectRedirectToLogin(request, "GET", "/items", jarCookie);
  });
});
