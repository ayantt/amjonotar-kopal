import { endTurn, getCurrentPlayer, rollAndMove } from "./engine";
import type { GameState } from "./types";
export type RandomSource = () => number;
/** Runs one AI turn. Each action is bounded; no UI event is required for the AI to advance. */
export function runAiTurn(state: GameState, random: RandomSource = Math.random): GameState {
  const player = getCurrentPlayer(state);
  if (player.controller !== "ai") return state;
  const moved = rollAndMove(state, random);
  return endTurn(moved);
}
