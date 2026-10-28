import { ABSENCE, isTurnOverdue, type PresenceInfo } from "../game/absence.js";
import { forfeitPlayer, getCurrentPlayer } from "../game/engine.js";
import { recordAutoTurn } from "../game/stats.js";
import { playOnBehalf, type RandomSource } from "../game/turns.js";
import type { GameState } from "../game/types.js";

export type TickSeat = PresenceInfo & { playerId: string; missedTurns?: number };
export type TickOutcome = "none" | "played" | "forfeited";

/**
 * If the current player of an online game is away or idle, plays their turn for them, or removes them after repeated
 * misses. Pure: the caller persists the result with its normal optimistic-concurrency save. Returns the inputs
 * unchanged (same references) when nothing is due.
 */
export function advanceAbsentPlayer<S extends TickSeat>(
  input: { state: GameState; seats: S[]; turnStartedAt: string | Date; now: number },
  random: RandomSource = Math.random,
): { state: GameState; seats: S[]; outcome: TickOutcome } {
  const { state, seats, turnStartedAt, now } = input;
  const unchanged = { state, seats, outcome: "none" as TickOutcome };
  if (state.phase === "game-over") return unchanged;
  const current = getCurrentPlayer(state);
  const seat = seats.find((candidate) => candidate.playerId === current.id);
  if (!seat || current.bankrupt || !isTurnOverdue(seat, turnStartedAt, now)) return unchanged;
  const missed = (seat.missedTurns ?? 0) + 1;
  const nextSeats = seats.map((candidate) => candidate.playerId === seat.playerId ? { ...candidate, missedTurns: missed } : candidate);
  if (missed >= ABSENCE.forfeitAfterMisses) return { state: forfeitPlayer(state, seat.playerId, "absent"), seats: nextSeats, outcome: "forfeited" };
  return { state: recordAutoTurn(playOnBehalf(state, random)), seats: nextSeats, outcome: "played" };
}
