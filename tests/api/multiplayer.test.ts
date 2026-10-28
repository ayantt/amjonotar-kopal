import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type FakeRoom = {
  code: string;
  status: "waiting" | "active" | "finished";
  hostPlayerId: string;
  seats: Array<Record<string, unknown>>;
  state: Record<string, unknown> | null;
  version: number;
  lastActionId?: string | null;
  lastActionAt?: string | null;
  createdAt: string;
  expiresAt: string;
};

const db = vi.hoisted(() => ({ room: null as FakeRoom | null, limits: new Map<string, number>(), events: [] as string[] }));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(" ? ").replace(/\s+/g, " ").trim();
    if (query.startsWith("CREATE TABLE") || query.startsWith("ALTER TABLE")) return [];
    if (query.startsWith("INSERT INTO analytics_events")) { db.events.push(String(values[0])); return []; }
    if (query.startsWith("INSERT INTO rate_limits")) {
      const key = `${values[0]}|${values[1]}`;
      const count = (db.limits.get(key) ?? 0) + 1;
      db.limits.set(key, count);
      return [{ count }];
    }
    if (query.startsWith("INSERT INTO multiplayer_rooms")) {
      const room: FakeRoom = {
        code: String(values[0]),
        status: "waiting",
        hostPlayerId: String(values[1]),
        seats: JSON.parse(String(values[2])),
        state: null,
        version: 1,
        lastActionId: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      };
      if (db.room?.code === room.code) throw new Error("duplicate room code");
      db.room = room;
      return [{ ...room, hostPlayerId: room.hostPlayerId, createdAt: room.createdAt, expiresAt: room.expiresAt }];
    }
    if (query.startsWith("SELECT code, status, host_player_id")) {
      if (!db.room || new Date(db.room.expiresAt).getTime() <= Date.now() || db.room.code !== values[0]) return [];
      return [{ ...db.room }];
    }
    if (query.startsWith("UPDATE multiplayer_rooms SET status")) {
      const room = db.room;
      const expectedVersion = Number(values[5]);
      if (!room || room.code !== values[4] || room.version !== expectedVersion || new Date(room.expiresAt).getTime() <= Date.now()) return [];
      room.status = String(values[0]) as FakeRoom["status"];
      room.seats = JSON.parse(String(values[1]));
      room.state = values[2] ? JSON.parse(String(values[2])) : null;
      if (values[3] != null) room.lastActionId = String(values[3]);
      room.version += 1;
      room.lastActionAt = new Date().toISOString();
      return [{ version: room.version }];
    }
    if (query.startsWith("UPDATE multiplayer_rooms SET seats")) {
      if (!db.room || db.room.code !== values[1]) return [];
      const playerId = String(values[0]);
      db.room.seats = db.room.seats.map((seat) => seat.playerId === playerId ? { ...seat, lastSeenAt: new Date().toISOString() } : seat);
      return [{ code: db.room.code }];
    }
    throw new Error("Unimplemented fake SQL query: " + query);
  },
}));

import handler from "../../api/multiplayer";

type CapturedResponse = { statusCode: number; body: Record<string, unknown> };
function makeResponse(): VercelResponse & CapturedResponse {
  const response = {
    statusCode: 200,
    body: {},
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: Record<string, unknown>) { this.body = body; return this; },
  };
  return response as unknown as VercelResponse & CapturedResponse;
}
async function call(path: string, method = "GET", body: Record<string, unknown> = {}, token?: string, extraHeaders: Record<string, string> = {}) {
  const req = {
    method,
    query: { path },
    body,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
  } as unknown as VercelRequest;
  const res = makeResponse();
  await handler(req, res);
  return res;
}
async function createAndStartRoom() {
  const created = await call("rooms", "POST", { name: "Host" });
  const host = created.body;
  const room = host.room as { code: string; version: number };
  const hostToken = String(host.token);
  const joined = await call(`rooms/${room.code}/join`, "POST", { name: "Guest", version: room.version });
  const guestToken = String(joined.body.token);
  const afterJoin = joined.body.room as { version: number };
  const started = await call(`rooms/${room.code}/start`, "POST", { version: afterJoin.version }, hostToken);
  return {
    code: room.code,
    hostToken,
    guestToken,
    room: started.body.room as { version: number; state: { currentPlayerIndex: number; players: Array<{ id: string }> } },
  };
}

describe("multiplayer API hardening", () => {
  beforeEach(() => {
    db.room = null;
    db.limits.clear();
    db.events.length = 0;
    process.env.DATABASE_URL = "postgres://test.invalid/fake";
  });

  it("requires a valid seat token and rejects actions from the wrong seat", async () => {
    const game = await createAndStartRoom();
    const unauthenticated = await call(`rooms/${game.code}/actions`, "POST", {
      version: game.room.version, requestId: "123e4567-e89b-42d3-a456-426614174000", action: { type: "roll" },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const currentPlayerId = game.room.state.players[game.room.state.currentPlayerIndex].id;
    const nonCurrentToken = currentPlayerId === db.room?.seats[0].playerId ? game.guestToken : game.hostToken;
    const outOfTurn = await call(`rooms/${game.code}/actions`, "POST", {
      version: game.room.version, requestId: "123e4567-e89b-42d3-a456-426614174001", action: { type: "roll" },
    }, nonCurrentToken);
    expect(outOfTurn.statusCode).toBe(403);
  });

  it("rejects malformed actions and returns the latest snapshot for stale versions", async () => {
    const game = await createAndStartRoom();
    const invalid = await call(`rooms/${game.code}/actions`, "POST", {
      version: game.room.version, requestId: "123e4567-e89b-42d3-a456-426614174002", action: { type: "not-real" },
    }, game.hostToken);
    expect(invalid.statusCode).toBe(400);

    const applied = await call(`rooms/${game.code}/actions`, "POST", {
      version: game.room.version, requestId: "123e4567-e89b-42d3-a456-426614174003", action: { type: "roll" },
    }, game.hostToken);
    expect(applied.statusCode).toBe(200);

    const stale = await call(`rooms/${game.code}/actions`, "POST", {
      version: game.room.version, requestId: "123e4567-e89b-42d3-a456-426614174004", action: { type: "roll" },
    }, game.hostToken);
    expect(stale.statusCode).toBe(409);
    expect((stale.body.room as { version: number }).version).toBe(game.room.version + 1);
  });

  it("acknowledges duplicate request IDs without applying the action twice", async () => {
    const game = await createAndStartRoom();
    const requestId = "123e4567-e89b-42d3-a456-426614174005";
    const body = { version: game.room.version, requestId, action: { type: "roll" } };
    const first = await call(`rooms/${game.code}/actions`, "POST", body, game.hostToken);
    const second = await call(`rooms/${game.code}/actions`, "POST", body, game.hostToken);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect((second.body.room as { version: number }).version).toBe(game.room.version + 1);
  });

  it("uses the conditional version update to ensure only one concurrent action commits", async () => {
    const game = await createAndStartRoom();
    const makeBody = (requestId: string) => ({
      version: game.room.version, requestId, action: { type: "roll" },
    });
    const results = await Promise.all([
      call(`rooms/${game.code}/actions`, "POST", makeBody("123e4567-e89b-42d3-a456-426614174006"), game.hostToken),
      call(`rooms/${game.code}/actions`, "POST", makeBody("123e4567-e89b-42d3-a456-426614174007"), game.hostToken),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect(db.room?.version).toBe(game.room.version + 1);
  });
});

describe("absent players", () => {
  type RoomJson = { status: string; version: number; lastActionAt: string; seats: Array<{ playerId: string; missedTurns: number }>; state: { currentPlayerIndex: number; phase: string; winner: string | null; players: Array<{ id: string; bankrupt: boolean }>; events: Array<{ message: string }> } };
  const T0 = Date.parse("2026-10-27T10:00:00Z");
  beforeEach(() => {
    db.room = null;
    process.env.DATABASE_URL = "postgres://test.invalid/fake";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => { vi.useRealTimers(); });
  const poll = async (code: string) => (await call(`rooms/${code}`, "GET")).body.room as unknown as RoomJson;

  it("does not touch a game while the current player is present and within the time limit", async () => {
    const game = await createAndStartRoom();
    vi.setSystemTime(T0 + 60_000);
    // Both players' browsers are open and sending heartbeats.
    expect((await call(`rooms/${game.code}/heartbeat`, "POST", {}, game.hostToken)).statusCode).toBe(204);
    expect((await call(`rooms/${game.code}/heartbeat`, "POST", {}, game.guestToken)).statusCode).toBe(204);
    const room = await poll(game.code);
    expect(room.version).toBe(game.room.version);
    expect(room.state.events.some((e) => /is away/.test(e.message))).toBe(false);
  });

  it("plays an idle player's turn from a poll, passes play on and counts the miss", async () => {
    const game = await createAndStartRoom();
    vi.setSystemTime(T0 + 200_000);
    const room = await poll(game.code);
    expect(room.version).toBe(game.room.version + 1);
    expect(room.state.currentPlayerIndex).not.toBe(game.room.state.currentPlayerIndex);
    expect(room.state.events.some((e) => /is away, so the computer is playing their turn/.test(e.message))).toBe(true);
    const absent = game.room.state.players[game.room.state.currentPlayerIndex].id;
    expect(room.seats.find((s) => s.playerId === absent)?.missedTurns).toBe(1);
    expect(new Date(room.lastActionAt).getTime()).toBe(T0 + 200_000);
  });

  it("starts a disconnected player's turn clock only after the grace period", async () => {
    const game = await createAndStartRoom();
    vi.setSystemTime(T0 + 19_000);
    expect((await poll(game.code)).version).toBe(game.room.version);
    vi.setSystemTime(T0 + 45_000);
    expect((await poll(game.code)).version).toBe(game.room.version + 1);
  });

  it("forfeits a seat after three missed turns and finishes a two-player game for the other player", async () => {
    const game = await createAndStartRoom();
    let now = T0;
    let room = await poll(game.code);
    for (let step = 0; step < 12 && room.status === "active"; step += 1) {
      now += 200_000;
      vi.setSystemTime(now);
      room = await poll(game.code);
    }
    expect(room.status).toBe("finished");
    expect(room.state.phase).toBe("game-over");
    expect(room.state.players.filter((p) => !p.bankrupt)).toHaveLength(1);
    expect(room.state.players.some((p) => p.id === room.state.winner)).toBe(true);
    expect(room.state.events.some((e) => /was away for too many turns and forfeited/.test(e.message))).toBe(true);
  });

  it("keeps the seat while the player keeps acting, resetting the missed-turn count", async () => {
    const game = await createAndStartRoom();
    vi.setSystemTime(T0 + 200_000);
    let room = await poll(game.code);
    const afterMiss = room.state.players[room.state.currentPlayerIndex].id;
    const tokens = new Map([[db.room?.seats[0].playerId as string, game.hostToken], [db.room?.seats[1].playerId as string, game.guestToken]]);
    const roll = await call(`rooms/${game.code}/actions`, "POST", { version: room.version, requestId: "123e4567-e89b-42d3-a456-426614174111", action: { type: "roll" } }, tokens.get(afterMiss));
    expect(roll.statusCode).toBe(200);
    room = roll.body.room as unknown as RoomJson;
    expect(room.seats.every((s) => s.missedTurns <= 1)).toBe(true);
  });

  it("lets a player leave a running game; the seat forfeits and the last player wins", async () => {
    const game = await createAndStartRoom();
    const leave = await call(`rooms/${game.code}/forfeit`, "POST", {}, game.guestToken);
    expect(leave.statusCode).toBe(200);
    const room = leave.body.room as unknown as RoomJson;
    expect(room.status).toBe("finished");
    expect(room.state.winner).toBe(db.room?.seats[0].playerId);
    expect((await call(`rooms/${game.code}/forfeit`, "POST", {}, game.guestToken)).statusCode).toBe(409);
  });

  it("requires a valid seat to forfeit and an active game", async () => {
    const game = await createAndStartRoom();
    expect((await call(`rooms/${game.code}/forfeit`, "POST", {})).statusCode).toBe(401);
    expect((await call(`rooms/${game.code}/forfeit`, "POST", {}, "wrong-token")).statusCode).toBe(401);
    const waiting = await call("rooms", "POST", { name: "Solo" });
    const code = (waiting.body.room as { code: string }).code;
    expect((await call(`rooms/${code}/forfeit`, "POST", {}, String(waiting.body.token))).statusCode).toBe(409);
  });
});

describe("multiplayer rate limiting", () => {
  beforeEach(() => {
    db.room = null;
    db.limits.clear();
    db.events.length = 0;
    process.env.DATABASE_URL = "postgres://test.invalid/fake";
  });

  it("blocks the sixth room created per minute from one address, with Retry-After", async () => {
    const headers = { "x-real-ip": "203.0.113.7" };
    for (let i = 0; i < 5; i++) expect((await call("rooms", "POST", { name: "Spam" }, undefined, headers)).statusCode).toBe(201);
    const blocked = await call("rooms", "POST", { name: "Spam" }, undefined, headers);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.body.retryAfterSeconds)).toBeGreaterThan(0);
    expect(blocked.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });

  it("limits each address separately and does not limit polling", async () => {
    for (let i = 0; i < 5; i++) await call("rooms", "POST", { name: "A" }, undefined, { "x-real-ip": "203.0.113.7" });
    expect((await call("rooms", "POST", { name: "B" }, undefined, { "x-real-ip": "198.51.100.9" })).statusCode).toBe(201);
    const code = String((db.room as FakeRoom).code);
    for (let i = 0; i < 40; i++) expect((await call(`rooms/${code}`, "GET", {}, undefined, { "x-real-ip": "203.0.113.7" })).statusCode).toBe(200);
  });

  it("falls back to the first x-forwarded-for entry", async () => {
    const headers = { "x-forwarded-for": "192.0.2.1, 10.0.0.1" };
    for (let i = 0; i < 5; i++) await call("rooms", "POST", { name: "A" }, undefined, headers);
    expect((await call("rooms", "POST", { name: "A" }, undefined, { "x-forwarded-for": "192.0.2.1, 10.9.9.9" })).statusCode).toBe(429);
  });

  it("caps polling floods per address but leaves normal polling alone", async () => {
    await call("rooms", "POST", { name: "Host" });
    const code = String((db.room as FakeRoom).code);
    const headers = { "x-real-ip": "203.0.113.50" };
    for (let i = 0; i < 600; i++) expect((await call(`rooms/${code}`, "GET", {}, undefined, headers)).statusCode).toBe(200);
    const blocked = await call(`rooms/${code}`, "GET", {}, undefined, headers);
    expect(blocked.statusCode).toBe(429);
    expect((await call(`rooms/${code}`, "GET", {}, undefined, { "x-real-ip": "203.0.113.51" })).statusCode).toBe(200);
  });

  it("caps heartbeat floods per address", async () => {
    const created = await call("rooms", "POST", { name: "Host" });
    const code = String((created.body.room as { code: string }).code);
    const headers = { "x-real-ip": "203.0.113.60" };
    for (let i = 0; i < 120; i++) expect((await call(`rooms/${code}/heartbeat`, "POST", {}, String(created.body.token), headers)).statusCode).toBe(204);
    expect((await call(`rooms/${code}/heartbeat`, "POST", {}, String(created.body.token), headers)).statusCode).toBe(429);
  });

  it("counts each created room once, without storing anything about it", async () => {
    await call("rooms", "POST", { name: "Host" });
    await call("rooms", "POST", { name: "Host" });
    expect(db.events).toEqual(["room-created", "room-created"]);
  });
});
