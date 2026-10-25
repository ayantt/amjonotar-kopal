import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type FakeRoom = {
  code: string;
  status: "waiting" | "active" | "finished";
  hostPlayerId: string;
  seats: Array<Record<string, unknown>>;
  state: Record<string, unknown> | null;
  version: number;
  lastActionId?: string | null;
  createdAt: string;
  expiresAt: string;
};

const db = vi.hoisted(() => ({ room: null as FakeRoom | null }));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(" ? ").replace(/\s+/g, " ").trim();
    if (query.startsWith("CREATE TABLE") || query.startsWith("ALTER TABLE")) return [];
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
async function call(path: string, method = "GET", body: Record<string, unknown> = {}, token?: string) {
  const req = {
    method,
    query: { path },
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
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
