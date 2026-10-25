import { randomBytes, createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyMultiplayerAction, createMultiplayerGame, type MultiplayerAction } from "../src/game/engine.js";
import type { GameState } from "../src/game/types.js";

type NeonSql = ReturnType<typeof import("@neondatabase/serverless").neon>;
type Seat = { playerId: string; name: string; role: "politician" | "citizen" | null; tokenHash: string; joinedAt: string; lastSeenAt?: string };
type RoomRow = { code: string; status: "waiting" | "active" | "finished"; hostPlayerId: string; seats: Seat[]; state: GameState | null; version: number; lastActionId?: string | null; createdAt: string; expiresAt: string };
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const newCode = () => Array.from(randomBytes(6), (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
const cleanName = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 24) : "";
const publicRoom = (room: RoomRow) => ({
  code: room.code,
  status: room.status,
  version: room.version,
  hostPlayerId: room.hostPlayerId,
  seats: room.seats.map(({ playerId, name, role, joinedAt, lastSeenAt }) => ({ playerId, name, role, joinedAt, lastSeenAt })),
  state: room.state,
  createdAt: room.createdAt,
  expiresAt: room.expiresAt,
});
function send(res: VercelResponse, status: number, payload: unknown) {
  return res.status(status).json(payload);
}
function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return {};
  return req.body as Record<string, unknown>;
}
function seatFrom(req: VercelRequest, room: RoomRow): Seat | undefined {
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return undefined;
  const hash = hashToken(token);
  return room.seats.find((seat) => seat.tokenHash === hash);
}
async function readRoom(sql: NeonSql, code: string): Promise<RoomRow | null> {
  const rows = await sql`SELECT code, status, host_player_id AS "hostPlayerId", seats, state, version, last_action_id AS "lastActionId", created_at AS "createdAt", expires_at AS "expiresAt" FROM multiplayer_rooms WHERE code = ${code} AND expires_at > NOW() LIMIT 1`;
  return (rows[0] as unknown as RoomRow) ?? null;
}
async function saveRoom(sql: NeonSql, room: RoomRow, expectedVersion: number, actionId?: string) {
  const rows = await sql`UPDATE multiplayer_rooms SET status = ${room.status}, seats = ${JSON.stringify(room.seats)}::jsonb, state = ${room.state ? JSON.stringify(room.state) : null}::jsonb, last_action_id = COALESCE(${actionId ?? null}, last_action_id), version = version + 1 WHERE code = ${room.code} AND version = ${expectedVersion} AND expires_at > NOW() RETURNING version`;
  return rows.length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Validate the route before touching the database. This makes unsupported
  // methods return a useful 405 instead of failing while trying to connect.
  const rawPath = typeof req.query.path === "string" ? req.query.path : "";
  const pathname = rawPath.replace(/^\/+|\/+$/g, "");
  const parts = pathname ? pathname.split("/").filter(Boolean) : [];
  const method = req.method ?? "GET";
  const isRoomCollection = parts.length === 1 && parts[0] === "rooms";
  const roomCode = (parts[1] ?? "").toUpperCase();
  const roomAction = parts[2];
  const isRoomRead = parts.length === 2 && /^[A-HJ-NP-Z2-9]{6}$/.test(roomCode) && method === "GET";
  const isRoomMutation = parts.length === 3 && /^[A-HJ-NP-Z2-9]{6}$/.test(roomCode) &&
    ["join", "start", "actions", "leave", "heartbeat"].includes(roomAction ?? "") && method === "POST";

  if (isRoomCollection && method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Use POST /api/multiplayer/rooms to create a room." });
  }
  if (!(isRoomCollection && method === "POST") && !isRoomRead && !isRoomMutation) {
    return send(res, 404, { error: "Unknown multiplayer endpoint or room code." });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return send(res, 503, { error: "Online multiplayer is not configured yet. DATABASE_URL is missing." });

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connectionString);
    await sql`CREATE TABLE IF NOT EXISTS multiplayer_rooms (
      code text PRIMARY KEY,
      status text NOT NULL CHECK (status IN ('waiting', 'active', 'finished')),
      host_player_id text NOT NULL,
      seats jsonb NOT NULL DEFAULT '[]'::jsonb,
      state jsonb,
      version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      expires_at timestamptz NOT NULL,
      last_action_id text
    )`;
    await sql`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS last_action_id text`;

    if (parts.length === 1 && parts[0] === "rooms" && method === "POST") {
      const name = cleanName(bodyOf(req).name);
      if (!name) return send(res, 400, { error: "Enter a display name (up to 24 characters)." });
      const token = newToken();
      const playerId = `seat-${randomBytes(8).toString("hex")}`;
      const seat: Seat = { playerId, name, role: null, tokenHash: hashToken(token), joinedAt: new Date().toISOString() };
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = newCode();
        try {
          const rows = await sql`INSERT INTO multiplayer_rooms (code, status, host_player_id, seats, version, expires_at) VALUES (${code}, 'waiting', ${playerId}, ${JSON.stringify([seat])}::jsonb, 1, NOW() + INTERVAL '12 hours') RETURNING code, status, host_player_id AS "hostPlayerId", seats, state, version, created_at AS "createdAt", expires_at AS "expiresAt"`;
          return send(res, 201, { room: publicRoom(rows[0] as unknown as RoomRow), playerId, token });
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
    }

    const code = roomCode;
    const room = await readRoom(sql, code);
    if (!room) return send(res, 404, { error: "Room not found or expired." });

    if (parts.length === 2 && method === "GET") return send(res, 200, { room: publicRoom(room) });

    if (parts[2] === "join" && method === "POST") {
      if (room.status !== "waiting") return send(res, 409, { error: "This room has already started." });
      const name = cleanName(bodyOf(req).name);
      if (!name) return send(res, 400, { error: "Enter a display name (up to 24 characters)." });
      if (room.seats.length >= 6) return send(res, 409, { error: "This room is full. Maximum six players." });
      const expectedVersion = Number(bodyOf(req).version ?? room.version);
      const playerId = `seat-${randomBytes(8).toString("hex")}`;
      const token = newToken();
      const seat: Seat = { playerId, name, role: null, tokenHash: hashToken(token), joinedAt: new Date().toISOString() };
      const next = { ...room, seats: [...room.seats, seat], version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion)) return send(res, 409, { error: "The room changed. Refresh and try again." });
      return send(res, 201, { room: { ...publicRoom(next), version: expectedVersion + 1 }, playerId, token });
    }

    const seat = seatFrom(req, room);
    if (!seat) return send(res, 401, { error: "A valid seat token is required." });

    if (parts[2] === "heartbeat" && method === "POST") {
      // Presence is deliberately separate from the game version: heartbeat
      // traffic must not create false stale-state conflicts for game actions.
      await sql`UPDATE multiplayer_rooms SET seats = (SELECT jsonb_agg(CASE WHEN entry.seat->>'playerId' = ${seat.playerId} THEN entry.seat || jsonb_build_object('lastSeenAt', NOW()::text) ELSE entry.seat END ORDER BY entry.ordinality) FROM jsonb_array_elements(seats) WITH ORDINALITY AS entry(seat, ordinality)) WHERE code = ${code} AND expires_at > NOW()`;
      return send(res, 204, {});
    }

    if (parts[2] === "start" && method === "POST") {
      if (seat.playerId !== room.hostPlayerId) return send(res, 403, { error: "Only the host can start the game." });
      if (room.status !== "waiting" || room.seats.length < 2 || room.seats.length > 6) return send(res, 409, { error: "At least two players must join before the host can start." });
      const expectedVersion = Number(bodyOf(req).version);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) return send(res, 409, { error: "The room changed. Refresh and try again." });
      const names = room.seats.map((item) => item.name);
      const generatedState = createMultiplayerGame(names);
      // Keep the stable room-seat IDs in the canonical game state so each
      // browser's seat token remains bound to the same player after start.
      const state: GameState = {
        ...generatedState,
        players: generatedState.players.map((player, index) => ({ ...player, id: room.seats[index].playerId })),
      };
      const seats = room.seats.map((item, index) => ({ ...item, role: generatedState.players[index].role }));
      const next = { ...room, seats, status: "active" as const, state, version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion)) return send(res, 409, { error: "The room changed. Refresh and try again." });
      return send(res, 200, { room: { ...publicRoom(next), version: expectedVersion + 1 } });
    }

    if (parts[2] === "actions" && method === "POST") {
      const body = bodyOf(req);
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      // A retry of the last committed action remains acknowledged even if it
      // ended the game and the room has since moved to the finished state.
      if (/^[a-f0-9-]{36}$/i.test(requestId) && room.lastActionId === requestId) {
        return send(res, 200, { room: publicRoom(room), duplicate: true });
      }
      if (room.status !== "active" || !room.state) return send(res, 409, { error: "This room is not in an active game.", room: publicRoom(room) });
      if (!/^[a-f0-9-]{36}$/i.test(requestId)) return send(res, 400, { error: "A valid requestId is required for every action." });
      const expectedVersion = Number(body.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) return send(res, 409, { error: "State is out of date. The latest room state is included.", room: publicRoom(room) });
      if (room.state.players[room.state.currentPlayerIndex]?.id !== seat.playerId) return send(res, 403, { error: "It is not your turn." });
      if (!body.action || typeof body.action !== "object" || Array.isArray(body.action)) return send(res, 400, { error: "A valid game action is required." });
      const action = body.action as Record<string, unknown>;
      const actionTypes = ["roll", "property", "build", "mortgage", "redeem-mortgage", "sell-property", "contribute", "vote-charter", "buy-cooperative-property", "end-turn"];
      if (typeof action.type !== "string" || !actionTypes.includes(action.type)) return send(res, 400, { error: "Unknown multiplayer action type." });
      if (["build", "mortgage", "redeem-mortgage", "sell-property"].includes(action.type) && typeof action.spaceId !== "string") return send(res, 400, { error: "This action requires a valid spaceId." });
      if (action.type === "property" && !["buy", "decline", "lease"].includes(String(action.action))) return send(res, 400, { error: "Unknown property decision." });
      if (action.type === "build" && !["house", "hotel"].includes(String(action.building))) return send(res, 400, { error: "Unknown building type." });
      if (action.type === "contribute" && (!Number.isInteger(action.amount) || Number(action.amount) <= 0)) return send(res, 400, { error: "Contribution amount must be a positive integer." });
      let state: GameState;
      try {
        state = applyMultiplayerAction(room.state, seat.playerId, body.action as MultiplayerAction);
      } catch (error) {
        return send(res, 422, { error: error instanceof Error ? error.message : "That action is not legal." });
      }
      const next = { ...room, status: state.phase === "game-over" ? "finished" as const : "active" as const, state, version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion, requestId)) {
        const latest = await readRoom(sql, code);
        if (latest?.lastActionId === requestId) return send(res, 200, { room: publicRoom(latest), duplicate: true });
        return send(res, 409, { error: "Another action was processed first. The latest room state is included.", room: latest ? publicRoom(latest) : undefined });
      }
      return send(res, 200, { room: { ...publicRoom(next), version: expectedVersion + 1 } });
    }

    if (parts[2] === "leave" && method === "POST") {
      if (room.status !== "waiting") return send(res, 409, { error: "Seats cannot be removed after the game starts." });
      const expectedVersion = Number(bodyOf(req).version ?? room.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) return send(res, 409, { error: "The room changed. Refresh and try again." });
      if (seat.playerId === room.hostPlayerId) {
        const rows = await sql`UPDATE multiplayer_rooms SET expires_at = NOW(), version = version + 1 WHERE code = ${code} AND version = ${expectedVersion} RETURNING code`;
        if (!rows.length) return send(res, 409, { error: "The room changed. Refresh and try again." });
        return send(res, 200, { left: true, roomClosed: true });
      }
      const seats = room.seats.filter((item) => item.playerId !== seat.playerId);
      const next = { ...room, seats, version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion)) return send(res, 409, { error: "The room changed. Refresh and try again." });
      return send(res, 200, { left: true, room: publicRoom(next) });
    }
    return send(res, 404, { error: "Unknown multiplayer endpoint." });
  } catch (error) {
    // Log the full exception server-side, but return only a safe diagnostic
    // category to clients (never connection strings or credentials).
    console.error("Multiplayer API error", error);
    const message = error instanceof Error ? error.message : String(error);
    const code = /DATABASE_URL|connection string|connection refused|ENOTFOUND|ECONN|timeout|fetch failed|authentication/i.test(message)
      ? "DATABASE_CONNECTION_FAILED"
      : /Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND|module/i.test(message)
        ? "RUNTIME_DEPENDENCY_LOAD_FAILED"
        : "MULTIPLAYER_INTERNAL_ERROR";
    return send(res, 500, {
      error: "The multiplayer service could not complete the request.",
      code,
      hint: code === "DATABASE_CONNECTION_FAILED"
        ? "Check DATABASE_URL in Vercel Preview environment variables and verify the Neon database credentials."
        : code === "RUNTIME_DEPENDENCY_LOAD_FAILED"
          ? "A server dependency could not be loaded by the Vercel function."
          : "Check the Vercel runtime logs for the full server-side exception."
    });
  }
}
