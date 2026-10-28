import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimits, clientIp, rateKey, resetRateLimitTableCache, type RateRule } from "../../src/server/rateLimit";
import { pruneStaleData } from "../../src/server/cleanup";

const rule: RateRule = { bucket: "t", limit: 3, windowSeconds: 60 };
function fakeSql() {
  const counts = new Map<string, number>();
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(" ? ");
    if (query.includes("CREATE TABLE")) return [];
    const key = `${values[0]}|${values[1]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return [{ count: counts.get(key) }];
  });
  return { sql: sql as unknown as Parameters<typeof checkRateLimits>[0], counts, raw: sql };
}

describe("rate limiter", () => {
  beforeEach(() => resetRateLimitTableCache());

  it("allows up to the limit, then blocks with the seconds left in the window", async () => {
    const { sql } = fakeSql();
    const now = Date.UTC(2026, 0, 1, 0, 0, 20);
    for (let i = 0; i < 3; i++) expect((await checkRateLimits(sql, "1.2.3.4", [rule], { now })).allowed).toBe(true);
    const blocked = await checkRateLimits(sql, "1.2.3.4", [rule], { now });
    expect(blocked).toEqual({ allowed: false, bucket: "t", retryAfterSeconds: 40 });
  });

  it("starts a fresh allowance in the next window and keeps clients apart", async () => {
    const { sql } = fakeSql();
    const now = Date.UTC(2026, 0, 1, 0, 0, 20);
    for (let i = 0; i < 4; i++) await checkRateLimits(sql, "1.2.3.4", [rule], { now });
    expect((await checkRateLimits(sql, "1.2.3.4", [rule], { now: now + 60_000 })).allowed).toBe(true);
    expect((await checkRateLimits(sql, "5.6.7.8", [rule], { now })).allowed).toBe(true);
  });

  it("enforces every rule and reports the one that tripped", async () => {
    const { sql } = fakeSql();
    const rules: RateRule[] = [{ bucket: "minute", limit: 5, windowSeconds: 60 }, { bucket: "hour", limit: 2, windowSeconds: 3600 }];
    await checkRateLimits(sql, "1.1.1.1", rules);
    await checkRateLimits(sql, "1.1.1.1", rules);
    const third = await checkRateLimits(sql, "1.1.1.1", rules);
    expect(third.allowed === false && third.bucket).toBe("hour");
  });

  it("fails open when storage errors, and when no address is known", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = (async () => { throw new Error("db down"); }) as unknown as Parameters<typeof checkRateLimits>[0];
    expect((await checkRateLimits(broken, "1.2.3.4", [rule])).allowed).toBe(true);
    const { sql, raw } = fakeSql();
    expect((await checkRateLimits(sql, null, [rule])).allowed).toBe(true);
    expect(raw).not.toHaveBeenCalled();
  });

  it("never stores the address: keys are salted hashes that differ per bucket", async () => {
    const a = await rateKey("1.2.3.4", "x", "salt");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(await rateKey("1.2.3.4", "y", "salt")).not.toBe(a);
    expect(await rateKey("1.2.3.4", "x", "other")).not.toBe(a);
  });

  it("reads the client address from proxy headers", () => {
    expect(clientIp({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })).toBe("9.9.9.9");
    expect(clientIp({ "x-forwarded-for": " 1.1.1.1 , 2.2.2.2" })).toBe("1.1.1.1");
    expect(clientIp({ "x-forwarded-for": ["3.3.3.3, 4.4.4.4"] })).toBe("3.3.3.3");
    expect(clientIp({})).toBeNull();
  });
});

describe("pruneStaleData", () => {
  it("reports how many rows each step removed", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      return [{ n: q.includes("multiplayer_rooms") ? 3 : q.includes("rate_limits") ? 40 : q.includes("finished_at IS NULL") ? 5 : 7 }];
    }) as unknown as Parameters<typeof pruneStaleData>[0];
    expect(await pruneStaleData(sql)).toEqual({ rooms: 3, rateLimits: 40, abandonedGames: 5, oldGames: 7, oldEvents: 7 });
  });

  it("keeps going when one step fails (for example a table that does not exist yet)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      if (strings.join(" ").includes("rate_limits")) throw new Error('relation "rate_limits" does not exist');
      return [{ n: 2 }];
    }) as unknown as Parameters<typeof pruneStaleData>[0];
    expect(await pruneStaleData(sql)).toEqual({ rooms: 2, rateLimits: 0, abandonedGames: 2, oldGames: 2, oldEvents: 2 });
  });

  it("only deletes data past its retention window", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => { queries.push(strings.join(" ").replace(/\s+/g, " ")); return [{ n: 0 }]; }) as unknown as Parameters<typeof pruneStaleData>[0];
    await pruneStaleData(sql);
    expect(queries.join("\n")).toMatch(/expires_at < NOW\(\) - INTERVAL '1 hour'/);
    expect(queries.join("\n")).toMatch(/finished_at IS NULL AND COALESCE\(last_seen_at, started_at\) < NOW\(\) - INTERVAL '30 days'/);
    expect(queries.every((q) => /WHERE .* < (NOW\(\) - INTERVAL|CURRENT_DATE - 365)/.test(q))).toBe(true);
    expect(queries.join("\n")).toMatch(/DELETE FROM analytics_events WHERE day < CURRENT_DATE - 365/);
  });
});
