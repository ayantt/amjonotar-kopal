import { endTurn, getCurrentPlayer, rollAndMove } from "./engine";
import type { GameState } from "./types";
export type RandomSource = () => number;
/** A single bounded AI turn: one role-appropriate roll and a turn advance. */
export function runAiTurn(state: GameState, random: RandomSource = Math.random): GameState {
  const player = getCurrentPlayer(state);
  if (player.controller !== "ai" || state.phase !== "awaiting-roll") return state;
  const moved = rollAndMove(state, random);
  return endTurn(moved);
}
