// POST /api/items item-name length limit (EWA-10 AC1, AC2).
// Every name is made unique to the run; the app has no delete route, so created items stay.
import { test, expect, getBaseUrl } from '@skyramp/skyramp';
import type { APIRequestContext } from '@playwright/test';

const baseUrl = getBaseUrl("SKYRAMP_TEST_BASE_URL", "http://localhost:3000");
const LIMIT = 60;

function headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.SKYRAMP_TEST_TOKEN) h["Authorization"] = `Bearer ${process.env.SKYRAMP_TEST_TOKEN}`;
    return h;
}

/** A name unique to this run, padded with `fill` to exactly `length` characters. */
function uniqueName(label: string, length: number, fill = "a"): string {
    const prefix = `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-`;
    return prefix.padEnd(length, fill).slice(0, length);
}

async function postItem(request: APIRequestContext, name: string) {
    return request.post(`${baseUrl}/api/items`, { headers: headers(), data: { name } });
}

async function listItems(request: APIRequestContext): Promise<Array<{ id: number; name: string; created_at: string }>> {
    const res = await request.get(`${baseUrl}/api/items`, { headers: headers() });
    expect(res.status()).toBe(200);
    return res.json();
}

async function expectRefusedAndNotStored(request: APIRequestContext, name: string) {
    const res = await postItem(request, name);
    expect(res.status(), `POST of a ${name.length}-character name`).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body).not.toHaveProperty("id");
    const items = await listItems(request);
    expect(items.filter((i) => i.name === name)).toHaveLength(0);
}

test.describe("POST /api/items name length limit", () => {
    test("61-character name is refused with 400 and not stored", async ({ request }) => {
        const name = uniqueName("n61", LIMIT + 1);
        expect(name).toHaveLength(61);
        await expectRefusedAndNotStored(request, name);
    });

    test("70- and 80-character names are refused with 400 and not stored", async ({ request }) => {
        const n70 = uniqueName("n70", 70);
        const n80 = uniqueName("n80", 80);
        expect(n70).toHaveLength(70);
        expect(n80).toHaveLength(80);
        await test.step("70 characters", () => expectRefusedAndNotStored(request, n70));
        await test.step("80 characters", () => expectRefusedAndNotStored(request, n80));
    });

    test("too-long name refusal message states the 60-character limit", async ({ request }) => {
        const res = await postItem(request, uniqueName("msg", LIMIT + 1));
        expect(res.status()).toBe(400);
        const { error } = await res.json();
        expect(typeof error).toBe("string");
        expect(error).toContain("60");
        expect(error).not.toContain("80");
    });

    test("1000-character name is refused with 400 and not stored", async ({ request }) => {
        const name = uniqueName("n1000", 1000);
        expect(name).toHaveLength(1000);
        await expectRefusedAndNotStored(request, name);
    });

    test("60-character name is created with 201 and listed once", async ({ request }) => {
        const name = uniqueName("n60", LIMIT);
        expect(name).toHaveLength(60);
        const res = await postItem(request, name);
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(typeof body.id).toBe("number");
        expect(body.name).toBe(name);
        expect(typeof body.created_at).toBe("string");
        expect(Number.isNaN(Date.parse(body.created_at))).toBe(false);
        const listed = (await listItems(request)).filter((i) => i.name === name);
        expect(listed).toHaveLength(1);
        expect(listed[0].id).toBe(body.id);
    });

    test("short names are created with 201 and listed", async ({ request }) => {
        const typical = uniqueName("Desk lamp", 20, " ").trim();
        for (const name of ["x", typical]) {
            await test.step(`name "${name}"`, async () => {
                const res = await postItem(request, name);
                expect(res.status()).toBe(201);
                const body = await res.json();
                expect(body.name).toBe(name);
                const items = await listItems(request);
                expect(items.find((i) => i.id === body.id)?.name).toBe(name);
            });
        }
    });

    test("60-character name with surrounding spaces is stored trimmed", async ({ request }) => {
        const name = uniqueName("trim60", LIMIT);
        expect(name).toHaveLength(60);
        const res = await postItem(request, `  ${name}  `);
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(body.name).toBe(name);
        const listed = (await listItems(request)).filter((i) => i.id === body.id);
        expect(listed).toHaveLength(1);
        expect(listed[0].name).toBe(name);
    });
});
