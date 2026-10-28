import { BOARD } from "./board.js";
import type { ForfeitReason, MoneyCategory, PropertyDecision } from "./stats.js";
import { emptyStats } from "./stats.js";
import type { GameState, PlayerRole } from "./types.js";

/**
 * Anonymous, finished-game summary. It deliberately contains no player names, ids, IPs or room codes:
 * players are identified only by seat number and role.
 */
/** How a finished game ended: the last opponent went bankrupt, chose to leave, or was away too long. */
export type EndReason = "bankruptcy" | ForfeitReason;
export interface GameSummary {
  schemaVersion: 1;
  mode: "single" | "online";
  playerCount: number;
  rounds: number;
  winnerSeat: number | null;
  winnerRole: PlayerRole | null;
  /** Single-player only: the role the human chose, and whether that seat won. */
  humanRole: PlayerRole | null;
  humanWon: boolean | null;
  players: SeatSummary[];
  landings: Record<string, number>;
  rentBySpace: Record<string, number>;
  cardDraws: Record<string, Partial<Record<PlayerRole, number>>>;
  decisions: Record<PlayerRole, Record<PropertyDecision, number>>;
  builds: Record<PlayerRole, number>;
  /** Mean cash of each role at the start of each round (rounds beyond 120 are dropped to keep summaries small). */
  cashByRound: Array<{ round: number; politician: number | null; citizen: number | null }>;
  /** What removed the last defeated player. Absent in summaries recorded before this existed. */
  endedBy?: EndReason | null;
  /** Online only: turns the computer played for absent players. Absent in older summaries. */
  autoPlayedTurns?: number;
}
export interface SeatSummary {
  seat: number;
  role: PlayerRole;
  controller: "human" | "ai";
  bankrupt: boolean;
  bankruptRound: number | null;
  bankruptCause: MoneyCategory | null;
  /** Set when this seat forfeited instead of going bankrupt. Absent in older summaries. */
  forfeitReason?: ForfeitReason | null;
  finalCash: number;
  propertiesOwned: number;
  /** Cash plus listed price of owned properties (mortgaged ones included). */
  netWorth: number;
  flowIn: Partial<Record<MoneyCategory, number>>;
  flowOut: Partial<Record<MoneyCategory, number>>;
}

const MAX_CASH_ROUNDS = 120;

export function summarizeGame(state: GameState, mode: GameSummary["mode"]): GameSummary {
  const stats = state.stats ?? emptyStats();
  const winnerIndex = state.winner ? state.players.findIndex((player) => player.id === state.winner) : -1;
  const players: SeatSummary[] = state.players.map((player, seat) => {
    const owned = Object.values(state.properties).filter((property) => property.ownerId === player.id);
    const ownedValue = owned.reduce((sum, property) => sum + (BOARD.find((space) => space.id === property.spaceId)?.price ?? 0), 0);
    const bankruptcy = stats.bankruptcies.find((entry) => entry.playerId === player.id);
    const forfeit = (stats.forfeits ?? []).find((entry) => entry.playerId === player.id);
    return {
      seat, role: player.role, controller: player.controller, bankrupt: player.bankrupt,
      bankruptRound: bankruptcy?.round ?? null, bankruptCause: bankruptcy?.cause ?? null, forfeitReason: forfeit?.reason ?? null,
      finalCash: player.cash, propertiesOwned: owned.length, netWorth: player.cash + ownedValue,
      flowIn: { ...(stats.flow[player.id]?.in ?? {}) }, flowOut: { ...(stats.flow[player.id]?.out ?? {}) },
    };
  });
  const roleOf = new Map(state.players.map((player) => [player.id, player.role] as const));
  const cashByRound = stats.cashHistory.filter((entry) => entry.round <= MAX_CASH_ROUNDS).map((entry) => {
    const mean = (role: PlayerRole) => {
      const values = Object.entries(entry.cash).filter(([id]) => roleOf.get(id) === role).map(([, cash]) => cash);
      return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    };
    return { round: entry.round, politician: mean("politician"), citizen: mean("citizen") };
  });
  const lastOut = stats.bankruptcies[stats.bankruptcies.length - 1];
  const lastForfeit = lastOut ? (stats.forfeits ?? []).find((entry) => entry.playerId === lastOut.playerId) : undefined;
  const endedBy: EndReason | null = state.phase !== "game-over" || !lastOut ? null : lastForfeit?.reason ?? "bankruptcy";
  const human = state.players.findIndex((player) => player.controller === "human");
  const singleHuman = mode === "single" && human >= 0;
  return {
    schemaVersion: 1, mode, playerCount: state.players.length, rounds: state.round,
    winnerSeat: winnerIndex >= 0 ? winnerIndex : null, winnerRole: winnerIndex >= 0 ? state.players[winnerIndex].role : null,
    humanRole: singleHuman ? state.players[human].role : null,
    humanWon: singleHuman ? winnerIndex === human : null,
    players, landings: stats.landings, rentBySpace: stats.rentBySpace, cardDraws: stats.cardDraws,
    decisions: stats.decisions, builds: stats.builds, cashByRound,
    endedBy, autoPlayedTurns: stats.autoTurns ?? 0,
  };
}

/* ---------------------------------------------------------------- aggregation */

export interface Rate { wins: number; games: number; rate: number | null; low: number | null; high: number | null }
export interface Distribution { min: number; median: number; mean: number; p90: number; max: number }
export interface AnalyticsReport {
  games: number;
  byMode: Record<GameSummary["mode"], number>;
  politicianWinRate: Rate;
  /** Single-player only: how often the human wins, by the role they chose. */
  humanWinRateByRole: Record<PlayerRole, Rate>;
  rounds: Distribution | null;
  /** Mean per-seat money flow by role and category, averaged over the seats of that role. */
  moneyFlow: Record<PlayerRole, { in: Partial<Record<MoneyCategory, number>>; out: Partial<Record<MoneyCategory, number>> }>;
  bankruptcyCauses: Record<PlayerRole, Partial<Record<MoneyCategory, number>>>;
  /** Share of players of each role that ended bankrupt. */
  bankruptRate: Record<PlayerRole, number | null>;
  spaces: Array<{ spaceId: string; name: string; landingsPerGame: number; rentPerGame: number }>;
  cards: Array<{ cardId: string; drawsPerGame: number }>;
  decisionRates: Record<PlayerRole, Record<PropertyDecision, number | null>>;
  buildsPerGame: Record<PlayerRole, number>;
  meanNetWorth: Record<PlayerRole, number | null>;
  wealthCurve: Array<{ round: number; politician: number | null; citizen: number | null; games: number }>;
  /** How finished games ended. `unknown` covers summaries recorded before end reasons were tracked. */
  endReasons: Record<EndReason | "unknown", number>;
  /** Share of seats that forfeited, and what the forfeits were. */
  forfeits: { seats: number; left: number; absent: number; rate: number | null };
  /** Online only: turns the computer played for absent players, per finished game. */
  autoPlayedTurnsPerGame: number | null;
}

/** 95% Wilson score interval for a win rate; behaves sensibly for small samples and rates near 0 or 1. */
export function winRate(wins: number, games: number): Rate {
  if (games === 0) return { wins, games, rate: null, low: null, high: null };
  const z = 1.96, p = wins / games, denominator = 1 + (z * z) / games;
  const centre = (p + (z * z) / (2 * games)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / denominator;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { wins, games, rate: round(p), low: round(Math.max(0, centre - margin)), high: round(Math.min(1, centre + margin)) };
}
export function distribution(values: number[]): Distribution | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { min: sorted[0], median: at(0.5), mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10, p90: at(0.9), max: sorted[sorted.length - 1] };
}
const ROLES: PlayerRole[] = ["politician", "citizen"];
const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
const share = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;

export function aggregateSummaries(summaries: GameSummary[]): AnalyticsReport {
  const games = summaries.length;
  const decided = summaries.filter((summary) => summary.winnerRole !== null);
  const flowTotals: Record<PlayerRole, { in: Partial<Record<MoneyCategory, number>>; out: Partial<Record<MoneyCategory, number>>; seats: number }> = {
    politician: { in: {}, out: {}, seats: 0 }, citizen: { in: {}, out: {}, seats: 0 } };
  const causes: Record<PlayerRole, Partial<Record<MoneyCategory, number>>> = { politician: {}, citizen: {} };
  const bankrupt = { politician: 0, citizen: 0 }, seats = { politician: 0, citizen: 0 };
  const worth: Record<PlayerRole, number[]> = { politician: [], citizen: [] };
  const landings: Record<string, number> = {}, rents: Record<string, number> = {}, cards: Record<string, number> = {};
  const decisionTotals: Record<PlayerRole, Record<PropertyDecision, number>> = { politician: { buy: 0, lease: 0, decline: 0 }, citizen: { buy: 0, lease: 0, decline: 0 } };
  const builds = { politician: 0, citizen: 0 };
  const curve = new Map<number, { politician: number[]; citizen: number[] }>();
  const humanWins: Record<PlayerRole, [number, number]> = { politician: [0, 0], citizen: [0, 0] };
  const endReasons: Record<EndReason | "unknown", number> = { bankruptcy: 0, left: 0, absent: 0, unknown: 0 };
  const forfeits = { left: 0, absent: 0 };
  let seatCount = 0, autoTurns = 0, autoGames = 0;

  for (const summary of summaries) {
    endReasons[summary.endedBy ?? "unknown"] += 1;
    if (summary.mode === "online") { autoGames += 1; autoTurns += summary.autoPlayedTurns ?? 0; }
    for (const seat of summary.players) {
      seatCount += 1;
      if (seat.forfeitReason) forfeits[seat.forfeitReason] += 1;
      const total = flowTotals[seat.role];
      total.seats += 1; seats[seat.role] += 1; worth[seat.role].push(seat.netWorth);
      for (const [category, amount] of Object.entries(seat.flowIn)) total.in[category as MoneyCategory] = (total.in[category as MoneyCategory] ?? 0) + (amount ?? 0);
      for (const [category, amount] of Object.entries(seat.flowOut)) total.out[category as MoneyCategory] = (total.out[category as MoneyCategory] ?? 0) + (amount ?? 0);
      if (seat.bankrupt) {
        bankrupt[seat.role] += 1;
        const cause = seat.bankruptCause ?? "other";
        causes[seat.role][cause] = (causes[seat.role][cause] ?? 0) + 1;
      }
    }
    for (const [id, count] of Object.entries(summary.landings)) landings[id] = (landings[id] ?? 0) + count;
    for (const [id, amount] of Object.entries(summary.rentBySpace)) rents[id] = (rents[id] ?? 0) + amount;
    for (const [id, byRole] of Object.entries(summary.cardDraws)) cards[id] = (cards[id] ?? 0) + (byRole.politician ?? 0) + (byRole.citizen ?? 0);
    for (const role of ROLES) {
      builds[role] += summary.builds[role];
      for (const key of ["buy", "lease", "decline"] as const) decisionTotals[role][key] += summary.decisions[role][key];
    }
    for (const entry of summary.cashByRound) {
      const bucket = curve.get(entry.round) ?? { politician: [], citizen: [] };
      if (entry.politician !== null) bucket.politician.push(entry.politician);
      if (entry.citizen !== null) bucket.citizen.push(entry.citizen);
      curve.set(entry.round, bucket);
    }
    if (summary.humanRole && summary.winnerRole !== null) {
      humanWins[summary.humanRole][1] += 1;
      if (summary.humanWon) humanWins[summary.humanRole][0] += 1;
    }
  }
  const perSeat = (role: PlayerRole, side: "in" | "out") => Object.fromEntries(Object.entries(flowTotals[role][side])
    .map(([category, amount]) => [category, Math.round((amount ?? 0) / Math.max(1, flowTotals[role].seats))])) as Partial<Record<MoneyCategory, number>>;
  const perGame = (value: number) => games ? Math.round((value / games) * 100) / 100 : 0;
  const decisionRate = (role: PlayerRole, key: PropertyDecision) => share(decisionTotals[role][key], decisionTotals[role].buy + decisionTotals[role].lease + decisionTotals[role].decline);

  return {
    games,
    byMode: { single: summaries.filter((s) => s.mode === "single").length, online: summaries.filter((s) => s.mode === "online").length },
    politicianWinRate: winRate(decided.filter((s) => s.winnerRole === "politician").length, decided.length),
    humanWinRateByRole: { politician: winRate(...humanWins.politician), citizen: winRate(...humanWins.citizen) },
    rounds: distribution(summaries.map((s) => s.rounds)),
    moneyFlow: { politician: { in: perSeat("politician", "in"), out: perSeat("politician", "out") }, citizen: { in: perSeat("citizen", "in"), out: perSeat("citizen", "out") } },
    bankruptcyCauses: causes,
    bankruptRate: { politician: share(bankrupt.politician, seats.politician), citizen: share(bankrupt.citizen, seats.citizen) },
    spaces: BOARD.map((space) => ({ spaceId: space.id, name: space.name, landingsPerGame: perGame(landings[space.id] ?? 0), rentPerGame: perGame(rents[space.id] ?? 0) })),
    cards: Object.entries(cards).map(([cardId, count]) => ({ cardId, drawsPerGame: perGame(count) })).sort((a, b) => a.cardId.localeCompare(b.cardId)),
    decisionRates: { politician: { buy: decisionRate("politician", "buy"), lease: decisionRate("politician", "lease"), decline: decisionRate("politician", "decline") },
      citizen: { buy: decisionRate("citizen", "buy"), lease: decisionRate("citizen", "lease"), decline: decisionRate("citizen", "decline") } },
    buildsPerGame: { politician: perGame(builds.politician), citizen: perGame(builds.citizen) },
    meanNetWorth: { politician: mean(worth.politician), citizen: mean(worth.citizen) },
    wealthCurve: [...curve.entries()].sort((a, b) => a[0] - b[0]).map(([round, bucket]) => ({
      round, politician: mean(bucket.politician), citizen: mean(bucket.citizen), games: Math.max(bucket.politician.length, bucket.citizen.length) })),
    endReasons,
    forfeits: { seats: forfeits.left + forfeits.absent, ...forfeits, rate: share(forfeits.left + forfeits.absent, seatCount) },
    autoPlayedTurnsPerGame: autoGames > 0 ? Math.round((autoTurns / autoGames) * 100) / 100 : null,
  };
}
