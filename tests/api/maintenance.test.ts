import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const queries = vi.hoisted(() => [] as string[]);
vi.mock("@neondatabase/serverless", () => ({
  neon: () => async (strings: TemplateStringsArray) => { queries.push(strings.join(" ")); return [{ n: 1 }]; },
}));
import handler from "../../api/maintenance";

async function call(authorization?: string) {
  const res = { statusCode: 200, body: {} as Record<string, unknown>, setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; }, json(body: Record<string, unknown>) { this.body = body; return this; } };
  await handler({ method: "GET", headers: authorization ? { authorization } : {} } as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

describe("maintenance endpoint", () => {
  beforeEach(() => {
    queries.length = 0;
    process.env.DATABASE_URL = "postgres://test.invalid/fake";
    process.env.CRON_SECRET = "cron-secret";
  });
  it("refuses to run when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).statusCode).toBe(503);
    expect(queries).toHaveLength(0);
  });
  it("rejects missing or wrong credentials without touching the database", async () => {
    expect((await call()).statusCode).toBe(401);
    expect((await call("Bearer wrong")).statusCode).toBe(401);
    expect(queries).toHaveLength(0);
  });
  it("prunes when the secret matches", async () => {
    const res = await call("Bearer cron-secret");
    expect(res.statusCode).toBe(200);
    expect(res.body.pruned).toEqual({ rooms: 1, rateLimits: 1, abandonedGames: 1, oldGames: 1 });
    expect(queries.length).toBe(4);
  });
});
