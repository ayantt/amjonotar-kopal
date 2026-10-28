import type { GameState, PlayerRole } from "./types.js";

/** Where a player's money came from or went to. Used only for analytics; it never affects play. */
export type MoneyCategory =
  | "go" | "rent" | "coop-rent" | "service-charge" | "tax" | "card" | "maintenance" | "plaza"
  | "property" | "building" | "contribution" | "mortgage" | "redeem" | "sale" | "other";

export interface PayTag { category: MoneyCategory; spaceId?: string }
export interface PlayerFlow { in: Partial<Record<MoneyCategory, number>>; out: Partial<Record<MoneyCategory, number>> }
export type PropertyDecision = "buy" | "lease" | "decline";
/** Why a seat was removed without going bankrupt: the player chose to leave, or was away for too many turns. */
export type ForfeitReason = "left" | "absent";

/** Structured per-game counters, recorded by the engine as the game is played. Optional so older saved rooms still load. */
export interface GameStats {
  flow: Record<string, PlayerFlow>;
  landings: Record<string, number>;
  rentBySpace: Record<string, number>;
  cardDraws: Record<string, Partial<Record<PlayerRole, number>>>;
  decisions: Record<PlayerRole, Record<PropertyDecision, number>>;
  builds: Record<PlayerRole, number>;
  bankruptcies: Array<{ playerId: string; round: number; cause: MoneyCategory }>;
  /** Cash of every player at the start of each round, for wealth-over-time curves. */
  cashHistory: Array<{ round: number; cash: Record<string, number> }>;
  /** Online only. Optional so games and saves from before this was recorded still load. */
  forfeits?: Array<{ playerId: string; round: number; reason: ForfeitReason }>;
  /** Online only: how many turns the computer played for an absent human. */
  autoTurns?: number;
}

/** Only the first 120 rounds are kept: summaries drop later rounds anyway, and this bounds the size of saved game state. */
const MAX_CASH_HISTORY = 120;
const zeroDecisions = (): Record<PropertyDecision, number> => ({ buy: 0, lease: 0, decline: 0 });

export function emptyStats(): GameStats {
  return {
    flow: {}, landings: {}, rentBySpace: {}, cardDraws: {},
    decisions: { politician: zeroDecisions(), citizen: zeroDecisions() },
    builds: { politician: 0, citizen: 0 },
    bankruptcies: [], cashHistory: [],
  };
}

function update(state: GameState, change: (stats: GameStats) => GameStats): GameState {
  return { ...state, stats: change(state.stats ?? emptyStats()) };
}

/** Records a positive amount of money entering ("in") or leaving ("out") a player's hands. Zero and negative amounts are ignored. */
export function recordFlow(state: GameState, playerId: string, direction: "in" | "out", category: MoneyCategory, amount: number): GameState {
  if (!Number.isInteger(amount) || amount <= 0) return state;
  return update(state, (stats) => {
    const existing = stats.flow[playerId] ?? { in: {}, out: {} };
    const side = { ...existing[direction], [category]: (existing[direction][category] ?? 0) + amount };
    return { ...stats, flow: { ...stats.flow, [playerId]: { ...existing, [direction]: side } } };
  });
}
export function recordLanding(state: GameState, spaceId: string): GameState {
  return update(state, (stats) => ({ ...stats, landings: { ...stats.landings, [spaceId]: (stats.landings[spaceId] ?? 0) + 1 } }));
}
export function recordRent(state: GameState, spaceId: string, amount: number): GameState {
  if (amount <= 0) return state;
  return update(state, (stats) => ({ ...stats, rentBySpace: { ...stats.rentBySpace, [spaceId]: (stats.rentBySpace[spaceId] ?? 0) + amount } }));
}
export function recordCard(state: GameState, cardId: string, role: PlayerRole): GameState {
  return update(state, (stats) => {
    const draws = stats.cardDraws[cardId] ?? {};
    return { ...stats, cardDraws: { ...stats.cardDraws, [cardId]: { ...draws, [role]: (draws[role] ?? 0) + 1 } } };
  });
}
export function recordDecision(state: GameState, role: PlayerRole, decision: PropertyDecision): GameState {
  return update(state, (stats) => ({ ...stats, decisions: { ...stats.decisions, [role]: { ...stats.decisions[role], [decision]: stats.decisions[role][decision] + 1 } } }));
}
export function recordBuild(state: GameState, role: PlayerRole): GameState {
  return update(state, (stats) => ({ ...stats, builds: { ...stats.builds, [role]: stats.builds[role] + 1 } }));
}
export function recordBankruptcy(state: GameState, playerId: string, cause: MoneyCategory): GameState {
  return update(state, (stats) => ({ ...stats, bankruptcies: [...stats.bankruptcies, { playerId, round: state.round, cause }] }));
}
export function recordCashSnapshot(state: GameState): GameState {
  return update(state, (stats) => {
    if (stats.cashHistory.length >= MAX_CASH_HISTORY) return stats;
    const entry = { round: state.round, cash: Object.fromEntries(state.players.map((player) => [player.id, player.cash])) };
    return { ...stats, cashHistory: [...stats.cashHistory, entry] };
  });
}
export function recordForfeit(state: GameState, playerId: string, reason: ForfeitReason): GameState {
  return update(state, (stats) => ({ ...stats, forfeits: [...(stats.forfeits ?? []), { playerId, round: state.round, reason }] }));
}
export function recordAutoTurn(state: GameState): GameState {
  return update(state, (stats) => ({ ...stats, autoTurns: (stats.autoTurns ?? 0) + 1 }));
}
