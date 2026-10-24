import { endTurn, getCurrentPlayer, resolvePropertyAction, rollAndMove } from "./engine";
import { getLegalPropertyActions } from "./properties";
import type { GameState } from "./types";
export type RandomSource = () => number;

/** Deterministic role-aware property policy. The engine remains the source of legal actions. */
export function chooseAiPropertyAction(state: GameState): "buy" | "lease" | "decline" {
  const player = getCurrentPlayer(state);
  const legal = getLegalPropertyActions(state, player);
  const can = (type: "buy" | "lease" | "decline") => legal.find((action) => action.type === type);
  const buy = can("buy");
  const lease = can("lease");
  const decline = can("decline");
  const price = buy?.cost ?? (lease ? lease.cost * 2 : 0);
  if (player.role === "politician") {
    // A permanent half-price lease is the strongest value; buy only when cash is ample.
    if (lease && player.cash - lease.cost >= 500) return "lease";
    if (buy && player.cash - buy.cost >= 700) return "buy";
    if (lease) return "lease";
    return "decline";
  }
  // Citizens preserve a reserve but prefer ownership when it is affordable.
  if (buy && player.cash - buy.cost >= Math.max(250, Math.floor(price * 0.35))) return "buy";
  if (lease && player.cash - lease.cost >= 200) return "lease";
  if (buy && player.cash >= buy.cost) return "buy";
  return decline ? "decline" : "buy";
}

/** A bounded AI turn: roll, resolve one legal property decision, then advance. */
export function runAiTurn(state: GameState, random: RandomSource = Math.random): GameState {
  const player = getCurrentPlayer(state);
  if (player.controller !== "ai" || state.phase !== "awaiting-roll") return state;
  let next = rollAndMove(state, random);
  if (next.pendingPropertyId) next = resolvePropertyAction(next, chooseAiPropertyAction(next));
  return endTurn(next);
}
