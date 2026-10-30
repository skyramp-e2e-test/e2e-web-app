import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("GET / home page HTML", () => {
  test("serves the home page with the title 'E2E Web App'", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    const body = await res.text();
    const titles = [...body.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => m[1].trim());
    expect(titles).toEqual(["E2E Web App"]);
  });

  test("no longer serves the old title 'Home - E2E Web App'", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/`);
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("Home - E2E Web App");
  });
});
