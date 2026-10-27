import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { summarizeGame } from "../../src/game/analytics";
import { simulateAiGame } from "../../src/game/simulate";

type Row = { game_id: string; mode: string; player_count: number; human_role: string | null; started_at: string; finished_at: string | null; summary: unknown; last_round?: number | null; last_seen_at?: string | null };
const db = vi.hoisted(() => ({ rows: new Map<string, Row>(), limits: new Map<string, number>() }));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(" ? ").replace(/\s+/g, " ").trim();
    if (query.startsWith("CREATE TABLE") || query.startsWith("ALTER TABLE")) return [];
    if (query.startsWith("INSERT INTO rate_limits")) {
      const key = `${values[0]}|${values[1]}`;
      db.limits.set(key, (db.limits.get(key) ?? 0) + 1);
      return [{ count: db.limits.get(key) }];
    }
    if (query.startsWith("UPDATE analytics_games")) {
      const [round, id] = values as [number, string];
      const row = db.rows.get(id);
      if (row && row.mode === "single" && !row.finished_at) { row.last_round = Math.max(row.last_round ?? 0, round); row.last_seen_at = new Date().toISOString(); }
      return [];
    }
    if (query.startsWith("INSERT INTO analytics_games") && !query.includes("finished_at")) {
      const [id, mode, count, role] = values as [string, string, number, string | null];
      if (!db.rows.has(id)) db.rows.set(id, { game_id: id, mode, player_count: count, human_role: role, started_at: new Date().toISOString(), finished_at: null, summary: null });
      return [];
    }
    if (query.startsWith("INSERT INTO analytics_games")) {
      const [id, mode, count, role, json] = values as [string, string, number, string | null, string];
      const existing = db.rows.get(id);
      if (existing) {
        existing.finished_at ??= new Date().toISOString();
        existing.summary ??= JSON.parse(json);
      } else db.rows.set(id, { game_id: id, mode, player_count: count, human_role: role, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), summary: JSON.parse(json) });
      return [];
    }
    if (query.startsWith("SELECT mode")) return [...db.rows.values()].map((r) => ({ mode: r.mode, startedAt: r.started_at, finishedAt: r.finished_at, lastRound: r.last_round ?? null, lastSeenAt: r.last_seen_at ?? null, humanRole: r.human_role, playerCount: r.player_count, summary: r.summary }));
    throw new Error(`Unexpected query: ${query}`);
  },
}));

import handler from "../../api/analytics";

function makeResponse() {
  const response = { statusCode: 200, body: {} as Record<string, unknown>, setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: Record<string, unknown>) { this.body = body; return this; } };
  return response as unknown as VercelResponse & { statusCode: number; body: Record<string, unknown> };
}
async function call(path: string, method: string, body: Record<string, unknown> = {}, token?: string, ip?: string) {
  const req = { method, query: { path }, body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { "x-real-ip": ip } : {}) } } as unknown as VercelRequest;
  const res = makeResponse();
  await handler(req, res);
  return res;
}
const GAME_ID = "0123456789abcdef0123456789abcdef";
const summary = () => {
  const state = simulateAiGame(11 * 104_729).state;
  return summarizeGame({ ...state, players: state.players.map((player, index) => ({ ...player, controller: index === 1 ? "human" as const : "ai" as const })) }, "single");
};

describe("analytics API", () => {
  beforeEach(() => {
    db.rows.clear();
    db.limits.clear();
    process.env.DATABASE_URL = "postgres://test.invalid/fake";
    process.env.ANALYTICS_ADMIN_TOKEN = "correct-token";
  });

  it("records a single-player start and finish, and the finish is idempotent", async () => {
    expect((await call("games/start", "POST", { gameId: GAME_ID, mode: "single", humanRole: "citizen" })).statusCode).toBe(204);
    expect((await call("games/finish", "POST", { gameId: GAME_ID, summary: summary() })).statusCode).toBe(204);
    const first = db.rows.get(GAME_ID)?.finished_at;
    expect(first).toBeTruthy();
    expect((await call("games/finish", "POST", { gameId: GAME_ID, summary: summary() })).statusCode).toBe(204);
    expect(db.rows.size).toBe(1);
    expect(db.rows.get(GAME_ID)?.finished_at).toBe(first);
  });

  it("rejects clients that try to report online games or send bad data", async () => {
    expect((await call("games/start", "POST", { gameId: GAME_ID, mode: "online", humanRole: "citizen" })).statusCode).toBe(400);
    expect((await call("games/start", "POST", { gameId: "short", mode: "single", humanRole: "citizen" })).statusCode).toBe(400);
    expect((await call("games/finish", "POST", { gameId: GAME_ID, summary: { ...summary(), mode: "online" } })).statusCode).toBe(400);
    expect((await call("games/finish", "POST", { gameId: GAME_ID, summary: { schemaVersion: 1 } })).statusCode).toBe(400);
    expect((await call("games/finish", "POST", { gameId: GAME_ID, summary: { ...summary(), padding: "x".repeat(30_000) } })).statusCode).toBe(413);
    expect(db.rows.size).toBe(0);
  });

  it("protects the summary endpoint with the admin token", async () => {
    expect((await call("summary", "GET")).statusCode).toBe(401);
    expect((await call("summary", "GET", {}, "wrong-token")).statusCode).toBe(401);
    delete process.env.ANALYTICS_ADMIN_TOKEN;
    expect((await call("summary", "GET", {}, "anything")).statusCode).toBe(503);
  });

  it("returns a funnel and aggregate report to the admin", async () => {
    await call("games/start", "POST", { gameId: GAME_ID, mode: "single", humanRole: "citizen" });
    await call("games/finish", "POST", { gameId: GAME_ID, summary: summary() });
    await call("games/start", "POST", { gameId: "fedcba9876543210fedcba9876543210", mode: "single", humanRole: "politician" });
    const result = await call("summary", "GET", {}, "correct-token");
    expect(result.statusCode).toBe(200);
    const body = result.body as unknown as { funnel: { single: { started: number; finished: number; completionRate: number } }; reports: { all: { games: number } } };
    expect(body.funnel.single).toEqual({ started: 2, finished: 1, completionRate: 0.5 });
    expect(body.reports.all.games).toBe(1);
  });

  it("records progress only for unfinished single-player games and validates the round", async () => {
    await call("games/start", "POST", { gameId: GAME_ID, mode: "single", humanRole: "citizen" });
    expect((await call("games/progress", "POST", { gameId: GAME_ID, round: 15 })).statusCode).toBe(204);
    expect((await call("games/progress", "POST", { gameId: GAME_ID, round: 10 })).statusCode).toBe(204);
    expect(db.rows.get(GAME_ID)?.last_round).toBe(15);
    expect((await call("games/progress", "POST", { gameId: "ffffffffffffffffffffffffffffffff", round: 5 })).statusCode).toBe(204);
    expect(db.rows.size).toBe(1);
    for (const round of [-1, 1.5, 5001, "7", null]) expect((await call("games/progress", "POST", { gameId: GAME_ID, round })).statusCode).toBe(400);
    await call("games/finish", "POST", { gameId: GAME_ID, summary: summary() });
    await call("games/progress", "POST", { gameId: GAME_ID, round: 99 });
    expect(db.rows.get(GAME_ID)?.last_round).toBe(15);
    expect((await call("games/progress", "GET")).statusCode).toBe(405);
  });

  it("includes player activity in the admin summary", async () => {
    await call("games/start", "POST", { gameId: GAME_ID, mode: "single", humanRole: "citizen" });
    await call("games/finish", "POST", { gameId: GAME_ID, summary: summary() });
    const result = await call("summary", "GET", {}, "correct-token");
    const body = result.body as unknown as { activity: { single: { started: number; finished: number; roleChoice: { citizen: number } }; online: { started: number } } };
    expect(body.activity.single).toMatchObject({ started: 1, finished: 1, roleChoice: { citizen: 1 } });
    expect(body.activity.online.started).toBe(0);
  });

  it("uses the right method and reports unknown routes and missing storage", async () => {
    expect((await call("games/start", "GET")).statusCode).toBe(405);
    expect((await call("summary", "POST", {}, "correct-token")).statusCode).toBe(405);
    expect((await call("nope", "GET")).statusCode).toBe(404);
    delete process.env.DATABASE_URL;
    expect((await call("games/start", "POST", { gameId: GAME_ID, mode: "single", humanRole: "citizen" })).statusCode).toBe(503);
  });
});

describe("analytics rate limiting", () => {
  beforeEach(() => {
    db.rows.clear();
    db.limits.clear();
    process.env.DATABASE_URL = "postgres://test.invalid/fake";
    process.env.ANALYTICS_ADMIN_TOKEN = "correct-token";
  });

  it("limits write floods per address", async () => {
    for (let i = 0; i < 120; i++) expect((await call("games/progress", "POST", { gameId: GAME_ID, round: 1 }, undefined, "203.0.113.1")).statusCode).toBe(204);
    const blocked = await call("games/progress", "POST", { gameId: GAME_ID, round: 1 }, undefined, "203.0.113.1");
    expect(blocked.statusCode).toBe(429);
    expect((await call("games/progress", "POST", { gameId: GAME_ID, round: 1 }, undefined, "203.0.113.2")).statusCode).toBe(204);
  });

  it("throttles admin-token guessing but still lets the right token in below the limit", async () => {
    for (let i = 0; i < 20; i++) expect((await call("summary", "GET", {}, "guess" + i, "198.51.100.5")).statusCode).toBe(401);
    expect((await call("summary", "GET", {}, "guess-final", "198.51.100.5")).statusCode).toBe(429);
    expect((await call("summary", "GET", {}, "correct-token", "198.51.100.5")).statusCode).toBe(429);
    expect((await call("summary", "GET", {}, "correct-token", "198.51.100.6")).statusCode).toBe(200);
  });
});
