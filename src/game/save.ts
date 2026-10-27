import { BOARD_SPACE_COUNT } from "./board.js";
import { validateSetup } from "./engine.js";
import { createPropertyLedger } from "./properties.js";
import type { GameState } from "./types.js";

/** Bump when the saved shape changes; older saves are then ignored rather than loaded wrongly. */
export const SAVE_VERSION = 1;

export interface SavedGame {
  version: typeof SAVE_VERSION;
  savedAt: string;
  /** Anonymous analytics id of this game, so resuming continues the same record instead of starting a new one. */
  gameId: string | null;
  game: GameState;
}

const MAX_MONEY = 10_000_000;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const EVENT_KINDS = ["system", "movement", "money", "ai"];

/** Structural check of an untrusted GameState. A saved game that fails any check is discarded instead of crashing the app. */
export function isValidSavedGame(value: unknown): value is GameState {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (value.phase !== "awaiting-roll" && value.phase !== "awaiting-end-turn") return false;
  if (!Array.isArray(value.players) || value.players.length !== 4) return false;
  const ids = new Set<string>();
  for (const player of value.players) {
    if (!isRecord(player) || typeof player.id !== "string" || typeof player.name !== "string" || player.name.length > 40) return false;
    if ((player.role !== "politician" && player.role !== "citizen") || (player.controller !== "human" && player.controller !== "ai")) return false;
    if (!isInt(player.cash, 0, MAX_MONEY) || !isInt(player.position, 0, BOARD_SPACE_COUNT - 1)) return false;
    if (typeof player.bankrupt !== "boolean" || typeof player.active !== "boolean") return false;
    if (!isInt(player.goPasses, 0, 100_000) || !isInt(player.skipTurns, 0, 10)) return false;
    if (!Array.isArray(player.lastRoll) || player.lastRoll.length > 3 || !player.lastRoll.every((die) => isInt(die, 1, 6))) return false;
    ids.add(player.id);
  }
  if (ids.size !== 4) return false;
  const state = value as unknown as GameState;
  if (!validateSetup(state)) return false;
  if (!isInt(value.currentPlayerIndex, 0, 3) || state.players[value.currentPlayerIndex].bankrupt) return false;
  if (!isInt(value.round, 1, 5000) || !isInt(value.publicFund, 0, MAX_MONEY) || !isInt(value.cooperativeFund, 0, MAX_MONEY)) return false;
  if (!isRecord(value.properties)) return false;
  const ledger = createPropertyLedger();
  const keys = Object.keys(ledger);
  if (Object.keys(value.properties).length !== keys.length) return false;
  for (const key of keys) {
    const property = (value.properties as Record<string, unknown>)[key];
    if (!isRecord(property) || property.spaceId !== key) return false;
    if (property.ownerId !== null && (typeof property.ownerId !== "string" || !ids.has(property.ownerId))) return false;
    if (property.leaseholderId !== null && (typeof property.leaseholderId !== "string" || !ids.has(property.leaseholderId))) return false;
    if (property.leaseExpiresAtGoPass !== null && !isInt(property.leaseExpiresAtGoPass, 0, 100_000)) return false;
    if (typeof property.mortgaged !== "boolean") return false;
    if (property.houses !== undefined && !isInt(property.houses, 0, 4)) return false;
    if (property.hotel !== undefined && typeof property.hotel !== "boolean") return false;
  }
  if (!Array.isArray(value.cooperativePropertyIds) || !value.cooperativePropertyIds.every((id) => typeof id === "string" && keys.includes(id))) return false;
  if (value.pendingPropertyId !== null && (typeof value.pendingPropertyId !== "string" || !keys.includes(value.pendingPropertyId))) return false;
  if (!isRecord(value.cardDrawCounts) || !isInt(value.cardDrawCounts.community, 0, 1_000_000) || !isInt(value.cardDrawCounts.chance, 0, 1_000_000)) return false;
  if (typeof value.extraRollAvailable !== "boolean" || value.winner !== null) return false;
  if (!Array.isArray(value.events) || value.events.length > 200 || !isInt(value.nextEventId, 1, 10_000_000)) return false;
  return value.events.every((event) => isRecord(event) && isInt(event.id, 0, 10_000_000) && typeof event.message === "string" && event.message.length < 600 && EVENT_KINDS.includes(String(event.kind)));
}

const STATS_KEYS = ["flow", "landings", "rentBySpace", "cardDraws", "decisions", "builds", "bankruptcies", "cashHistory"] as const;
/** Analytics counters are optional and only informational: keep them when well-formed, otherwise drop them rather than risk breaking reporting. */
function sanitizeStats(game: GameState): GameState {
  const stats: unknown = (game as { stats?: unknown }).stats;
  if (stats === undefined) return game;
  const wellFormed = isRecord(stats) && STATS_KEYS.every((key) => key in stats)
    && isRecord(stats.flow) && isRecord(stats.landings) && isRecord(stats.rentBySpace) && isRecord(stats.cardDraws)
    && isRecord(stats.decisions) && isRecord(stats.builds) && Array.isArray(stats.bankruptcies) && Array.isArray(stats.cashHistory)
    && stats.cashHistory.length <= 200 && stats.bankruptcies.length <= 10;
  if (wellFormed) return game;
  const { stats: _dropped, ...rest } = game;
  return rest as GameState;
}

export function serializeSave(game: GameState, gameId: string | null, now: Date = new Date()): string {
  const save: SavedGame = { version: SAVE_VERSION, savedAt: now.toISOString(), gameId, game };
  return JSON.stringify(save);
}

/** Parses a stored save. Returns null for anything missing, from another version, corrupted, or not a resumable game. */
export function parseSave(raw: string | null): SavedGame | null {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== SAVE_VERSION || typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
    if (value.gameId !== null && (typeof value.gameId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(value.gameId))) return null;
    if (!isValidSavedGame(value.game)) return null;
    return { version: SAVE_VERSION, savedAt: value.savedAt, gameId: value.gameId, game: sanitizeStats(value.game) };
  } catch {
    return null;
  }
}
