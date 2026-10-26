import { BOARD } from "./board.js";
import type { GameSummary, SeatSummary } from "./analytics.js";
import type { MoneyCategory, PropertyDecision } from "./stats.js";
import type { PlayerRole } from "./types.js";

const CATEGORIES: readonly MoneyCategory[] = ["go", "rent", "coop-rent", "service-charge", "tax", "card", "maintenance", "plaza", "property", "building", "contribution", "mortgage", "redeem", "sale", "other"];
const ROLES: readonly PlayerRole[] = ["politician", "citizen"];
const DECISIONS: readonly PropertyDecision[] = ["buy", "lease", "decline"];
const SPACE_IDS = new Set(BOARD.map((space) => space.id));
const MAX_AMOUNT = 10_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const int = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
const role = (value: unknown): PlayerRole | null => ROLES.find((item) => item === value) ?? null;

function categoryMap(value: unknown): Partial<Record<MoneyCategory, number>> | null {
  if (!isRecord(value)) return null;
  const result: Partial<Record<MoneyCategory, number>> = {};
  for (const [key, amount] of Object.entries(value)) {
    const category = CATEGORIES.find((item) => item === key);
    const parsed = int(amount, 0, MAX_AMOUNT);
    if (!category || parsed === null) return null;
    result[category] = parsed;
  }
  return result;
}
function countMap(value: unknown, allowed: (key: string) => boolean): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const parsed = int(count, 0, MAX_AMOUNT);
    if (!allowed(key) || parsed === null) return null;
    result[key] = parsed;
  }
  return result;
}
function seat(value: unknown, index: number): SeatSummary | null {
  if (!isRecord(value)) return null;
  const seatRole = role(value.role);
  const flowIn = categoryMap(value.flowIn), flowOut = categoryMap(value.flowOut);
  const finalCash = int(value.finalCash, 0, MAX_AMOUNT), netWorth = int(value.netWorth, 0, MAX_AMOUNT * 10), owned = int(value.propertiesOwned, 0, 40);
  const bankruptRound = value.bankruptRound === null ? null : int(value.bankruptRound, 0, 5000);
  const cause = value.bankruptCause === null ? null : CATEGORIES.find((item) => item === value.bankruptCause) ?? null;
  if (!seatRole || !flowIn || !flowOut || finalCash === null || netWorth === null || owned === null || typeof value.bankrupt !== "boolean") return null;
  if (value.bankruptRound !== null && bankruptRound === null) return null;
  if (value.controller !== "human" && value.controller !== "ai") return null;
  if (int(value.seat, 0, 5) !== index) return null;
  return { seat: index, role: seatRole, controller: value.controller, bankrupt: value.bankrupt, bankruptRound, bankruptCause: cause, finalCash, propertiesOwned: owned, netWorth, flowIn, flowOut };
}

/**
 * Validates an untrusted summary and rebuilds it from known fields only, so unexpected keys, names or oversized payloads
 * can never be stored. Returns null when anything is malformed.
 */
export function parseGameSummary(value: unknown): GameSummary | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (value.mode !== "single" && value.mode !== "online") return null;
  const playerCount = int(value.playerCount, 2, 6), rounds = int(value.rounds, 0, 5000);
  if (playerCount === null || rounds === null || !Array.isArray(value.players) || value.players.length !== playerCount) return null;
  if (value.mode === "single" && playerCount !== 4) return null;
  const players = value.players.map(seat);
  if (players.some((item) => item === null)) return null;
  const seats = players as SeatSummary[];
  if (seats.filter((item) => item.role === "politician").length !== 1) return null;
  if (value.mode === "single" && seats.filter((item) => item.controller === "human").length !== 1) return null;
  const winnerSeat = value.winnerSeat === null ? null : int(value.winnerSeat, 0, playerCount - 1);
  if (value.winnerSeat !== null && winnerSeat === null) return null;
  const landings = countMap(value.landings, (key) => SPACE_IDS.has(key));
  const rentBySpace = countMap(value.rentBySpace, (key) => SPACE_IDS.has(key));
  if (!landings || !rentBySpace || !isRecord(value.cardDraws) || !isRecord(value.decisions) || !isRecord(value.builds) || !Array.isArray(value.cashByRound)) return null;
  const cardDraws: GameSummary["cardDraws"] = {};
  for (const [cardId, byRole] of Object.entries(value.cardDraws)) {
    if (!/^C[CH]-\d{2}$/.test(cardId) || !isRecord(byRole)) return null;
    const parsed: Partial<Record<PlayerRole, number>> = {};
    for (const [key, count] of Object.entries(byRole)) {
      const r = role(key), n = int(count, 0, 100_000);
      if (!r || n === null) return null;
      parsed[r] = n;
    }
    cardDraws[cardId] = parsed;
  }
  const decisions = {} as GameSummary["decisions"], builds = {} as GameSummary["builds"];
  for (const r of ROLES) {
    const source = value.decisions[r];
    if (!isRecord(source)) return null;
    const parsed = {} as Record<PropertyDecision, number>;
    for (const d of DECISIONS) {
      const n = int(source[d], 0, 100_000);
      if (n === null) return null;
      parsed[d] = n;
    }
    decisions[r] = parsed;
    const b = int(value.builds[r], 0, 100_000);
    if (b === null) return null;
    builds[r] = b;
  }
  if (value.cashByRound.length > 120) return null;
  const cashByRound: GameSummary["cashByRound"] = [];
  for (const entry of value.cashByRound) {
    if (!isRecord(entry)) return null;
    const round = int(entry.round, 0, 120);
    const politician = entry.politician === null ? null : int(entry.politician, 0, MAX_AMOUNT);
    const citizen = entry.citizen === null ? null : int(entry.citizen, 0, MAX_AMOUNT);
    if (round === null || (entry.politician !== null && politician === null) || (entry.citizen !== null && citizen === null)) return null;
    cashByRound.push({ round, politician, citizen });
  }
  const humanSeat = seats.findIndex((item) => item.controller === "human");
  const single = value.mode === "single";
  return {
    schemaVersion: 1, mode: value.mode, playerCount, rounds, winnerSeat,
    winnerRole: winnerSeat === null ? null : seats[winnerSeat].role,
    humanRole: single ? seats[humanSeat].role : null,
    humanWon: single ? winnerSeat === humanSeat : null,
    players: seats, landings, rentBySpace, cardDraws, decisions, builds, cashByRound,
  };
}
