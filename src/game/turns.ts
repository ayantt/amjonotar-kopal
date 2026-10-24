import { BOARD as BOARD_FOR_AI } from "./board";
import { buyCooperativeProperty, contributeToCooperative, endTurn, getCurrentPlayer, resolvePropertyAction, rollAndMove, voteForCharter } from "./engine";
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
  if (next.pendingPropertyId) {
    const space = awaitBoardSpace(next.pendingPropertyId);
    if (player.role === "citizen" && space?.price !== undefined && next.cooperativeFund >= space.price && next.charterPendingRound === null) {
      next = buyCooperativeProperty(next, player.id);
    } else {
      const action = chooseAiPropertyAction(next);
      const rationale = action === "lease"
        ? "chose the lower-cost lease to preserve cash and secure control."
        : action === "buy"
          ? "bought the property while keeping a cash reserve."
          : "declined the property to preserve available cash.";
      next = { ...next, nextEventId: next.nextEventId + 1, events: [...next.events, {
        id: next.nextEventId, kind: "ai" as const, message: player.name + " " + rationale,
      }].slice(-100) };
      next = resolvePropertyAction(next, action);
    }
  }
  // Re-read the actor after the roll: the pre-roll snapshot cannot know about a bankruptcy caused by this very move.
  const actor = next.players.find((p) => p.id === player.id);
  if (actor && actor.role === "citizen" && actor.active && !actor.bankrupt && next.phase !== "game-over") {
    if (actor.cash >= 1_200 && next.cooperativeFund < 1_000 && next.charterPendingRound === null) {
      next = contributeToCooperative(next, player.id, Math.min(100, actor.cash - 1_000));
    }
    if (next.phase !== "game-over" && next.cooperativeFund >= 1_000 && next.charterPendingRound === null && !next.charterActivated && !next.charterVotes.includes(player.id)) {
      next = voteForCharter(next, player.id);
    }
  }
  if (next.phase === "game-over") return next;
  return endTurn(next);
}
function awaitBoardSpace(spaceId: string) {
  return BOARD_FOR_AI.find((space) => space.id === spaceId);
}
