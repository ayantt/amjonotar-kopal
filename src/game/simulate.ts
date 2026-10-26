import { createNewGame } from "./engine.js";
import { runAiTurn } from "./turns.js";
import type { GameState } from "./types.js";

/** Small deterministic PRNG (mulberry32) so simulations are repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plays one all-AI four-player game to the end (or the turn cap) and returns the final state and number of turns taken. */
export function simulateAiGame(seed: number, maxTurns = 4_000): { state: GameState; turns: number } {
  const random = seededRandom(seed);
  let state = createNewGame({ humanRole: "politician" });
  state = { ...state, players: state.players.map((player) => ({ ...player, controller: "ai" as const })) };
  let turns = 0;
  while (state.phase !== "game-over" && turns < maxTurns) {
    state = runAiTurn(state, random);
    turns += 1;
  }
  return { state, turns };
}
