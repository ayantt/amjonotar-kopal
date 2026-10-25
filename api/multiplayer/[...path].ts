import { randomBytes, createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { applyMultiplayerAction, createMultiplayerGame } from "../../src/game/engine";
import type { GameState, MultiplayerAction } from "../../src/game/engine";

type Seat = { playerId: string; name: string; role: "politician" | "citizen"; tokenHash: string; joinedAt: string };
type RoomRow = { code: string; status: "waiting" | "active" | "finished"; hostPlayerId: string; seats: Seat[]; state: GameState | null; version: number; createdAt: string; expiresAt: string };
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const newCode = () => Array.from(randomBytes(6), (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
const cleanName = (value: unknown) => typeof value === "string" ? value.trim().replace(/\\s+/g, " ").slice(0, 24) : "";
const publicRoom = (room: RoomRow) => ({
  code: room.code,
  status: room.status,
  version: room.version,
  hostPlayerId: room.hostPlayerId,
  seats: room.seats.map(({ playerId, name, role, joinedAt }) => ({ playerId, name, role, joinedAt })),
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
async function readRoom(sql: ReturnType<typeof neon>, code: string): Promise<RoomRow | null> {
  const rows = await sql`SELECT code, status, host_player_id AS "hostPlayerId", seats, state, version, created_at AS "createdAt", expires_at AS "expiresAt" FROM multiplayer_rooms WHERE code = ${code} AND expires_at > NOW() LIMIT 1`;
  return (rows[0] as unknown as RoomRow) ?? null;
}
async function saveRoom(sql: ReturnType<typeof neon>, room: RoomRow, expectedVersion: number) {
  const rows = await sql`UPDATE multiplayer_rooms SET status = ${room.status}, seats = ${JSON.stringify(room.seats)}::jsonb, state = ${room.state ? JSON.stringify(room.state) : null}::jsonb, version = version + 1 WHERE code = ${room.code} AND version = ${expectedVersion} AND expires_at > NOW() RETURNING version`;
  return rows.length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return send(res, 503, { error: "Online multiplayer is not configured yet. DATABASE_URL is missing." });
  const sql = neon(connectionString);
  try {
    await sql`CREATE TABLE IF NOT EXISTS multiplayer_rooms (
      code text PRIMARY KEY,
      status text NOT NULL CHECK (status IN ('waiting', 'active', 'finished')),
      host_player_id text NOT NULL,
      seats jsonb NOT NULL DEFAULT '[]'::jsonb,
      state jsonb,
      version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      expires_at timestamptz NOT NULL
    )`;
    const pathname = new URL(req.url ?? "/", "https://multiplayer.invalid").pathname.replace(/\\/+$/, "");
    const parts = pathname.split("/").filter(Boolean).slice(2);
    const method = req.method ?? "GET";

    if (parts.length === 1 && parts[0] === "rooms" && method === "POST") {
      const name = cleanName(bodyOf(req).name);
      if (!name) return send(res, 400, { error: "Enter a display name (up to 24 characters)." });
      const token = newToken();
      const playerId = "player-1";
      const seat: Seat = { playerId, name, role: "politician", tokenHash: hashToken(token), joinedAt: new Date().toISOString() };
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

    const code = (parts[1] ?? "").toUpperCase();
    if (parts[0] !== "rooms" || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return send(res, 404, { error: "Unknown multiplayer endpoint or room code." });
    const room = await readRoom(sql, code);
    if (!room) return send(res, 404, { error: "Room not found or expired." });

    if (parts.length === 2 && method === "GET") return send(res, 200, { room: publicRoom(room) });

    if (parts[2] === "join" && method === "POST") {
      if (room.status !== "waiting") return send(res, 409, { error: "This room has already started." });
      const name = cleanName(bodyOf(req).name);
      if (!name) return send(res, 400, { error: "Enter a display name (up to 24 characters)." });
      if (room.seats.length >= 4) return send(res, 409, { error: "This room is full." });
      const expectedVersion = Number(bodyOf(req).version ?? room.version);
      const playerId = `player-${room.seats.length + 1}`;
      const token = newToken();
      const seat: Seat = { playerId, name, role: "citizen", tokenHash: hashToken(token), joinedAt: new Date().toISOString() };
      const next = { ...room, seats: [...room.seats, seat], version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion)) return send(res, 409, { error: "The room changed. Refresh and try again." });
      return send(res, 201, { room: { ...publicRoom(next), version: expectedVersion + 1 }, playerId, token });
    }

    const seat = seatFrom(req, room);
    if (!seat) return send(res, 401, { error: "A valid seat token is required." });

    if (parts[2] === "start" && method === "POST") {
      if (seat.playerId !== room.hostPlayerId) return send(res, 403, { error: "Only the host can start the game." });
      if (room.status !== "waiting" || room.seats.length !== 4) return send(res, 409, { error: "Four players must join before the host can start." });
      const expectedVersion = Number(bodyOf(req).version);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) return send(res, 409, { error: "The room changed. Refresh and try again." });
      const names = room.seats.map((item) => item.name) as [string, string, string, string];
      const state = createMultiplayerGame(names);
      const next = { ...room, status: "active" as const, state, version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion)) return send(res, 409, { error: "The room changed. Refresh and try again." });
      return send(res, 200, { room: { ...publicRoom(next), version: expectedVersion + 1 } });
    }

    if (parts[2] === "actions" && method === "POST") {
      if (room.status !== "active" || !room.state) return send(res, 409, { error: "This room is not in an active game." });
      const body = bodyOf(req);
      const expectedVersion = Number(body.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) return send(res, 409, { error: "State is out of date. Refresh before retrying.", room: publicRoom(room) });
      if (room.state.players[room.state.currentPlayerIndex]?.id !== seat.playerId) return send(res, 403, { error: "It is not your turn." });
      if (!body.action || typeof body.action !== "object" || Array.isArray(body.action)) return send(res, 400, { error: "A valid game action is required." });
      let state: GameState;
      try {
        state = applyMultiplayerAction(room.state, seat.playerId, body.action as MultiplayerAction);
      } catch (error) {
        return send(res, 422, { error: error instanceof Error ? error.message : "That action is not legal." });
      }
      const next = { ...room, status: state.phase === "game-over" ? "finished" as const : "active" as const, state, version: room.version + 1 };
      if (!await saveRoom(sql, next, expectedVersion)) {
        const latest = await readRoom(sql, code);
        return send(res, 409, { error: "Another action was processed first. Refresh the game state.", room: latest ? publicRoom(latest) : undefined });
      }
      return send(res, 200, { room: { ...publicRoom(next), version: expectedVersion + 1 } });
    }

    if (parts[2] === "leave" && method === "POST") {
      if (room.status !== "waiting") return send(res, 409, { error: "Seats cannot be removed after the game starts." });
      const expectedVersion = Number(bodyOf(req).version ?? room.version);
      const seats = room.seats.filter((item) => item.playerId !== seat.playerId);
      if (seat.playerId === room.hostPlayerId && seats.length > 0) return send(res, 409, { error: "The host must close the room or transfer hosting before leaving." });
      const rows = await sql`DELETE FROM multiplayer_rooms WHERE code = ${code} AND version = ${expectedVersion} RETURNING code`;
      if (!rows.length) return send(res, 409, { error: "The room changed. Refresh and try again." });
      return send(res, 200, { left: true });
    }
    return send(res, 404, { error: "Unknown multiplayer endpoint." });
  } catch (error) {
    console.error("Multiplayer API error", error);
    return send(res, 500, { error: "The multiplayer service encountered an unexpected error." });
  }
}
