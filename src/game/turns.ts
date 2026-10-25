import { BOARD as BOARD_FOR_AI } from "./board";
import { buildProperty, buyCooperativeProperty, contributeToCooperative, endTurn, getLegalBuildActions, getCurrentPlayer, resolvePropertyAction, rollAndMove } from "./engine";
import { getLegalPropertyActions } from "./properties";
import type { GameState } from "./types";
export type RandomSource = () => number;

/** Minimum cash a Citizen AI keeps after buying or leasing. */
const AI_CITIZEN_RESERVE = 300;

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
  // Citizens always keep a cushion above the largest routine charge (taxes, building upkeep, one rent) and prefer
  // ownership when it is affordable. They never spend down to zero: one tax or card would bankrupt them.
  if (buy && player.cash - buy.cost >= Math.max(AI_CITIZEN_RESERVE, Math.floor(price * 0.35))) return "buy";
  if (lease && player.cash - lease.cost >= AI_CITIZEN_RESERVE) return "lease";
  return decline ? "decline" : "buy";
}

/** A bounded AI turn: roll, resolve one legal property decision, then advance. */
export function runAiTurn(state: GameState, random: RandomSource = Math.random): GameState {
  const player = getCurrentPlayer(state);
  if (player.controller !== "ai" || state.phase !== "awaiting-roll") return state;
  let next = rollAndMove(state, random);
  if (next.pendingPropertyId) {
    const space = awaitBoardSpace(next.pendingPropertyId);
    if (player.role === "citizen" && space?.price !== undefined && next.cooperativeFund >= space.price) {
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
    if (actor.cash >= 1_200 && next.cooperativeFund < 1_000) {
      next = contributeToCooperative(next, player.id, Math.min(100, actor.cash - 1_000));
    }
  }
  next = chooseAiBuild(next, player.id);
  if (next.phase === "game-over") return next;
  return endTurn(next);
}
/** Cash an AI keeps untouched when developing land, so building never leaves it one rent away from bankruptcy. */
const AI_BUILD_RESERVE = { politician: 500, citizen: 300 } as const;

/** Bounded AI development: at most one legal build per turn, best rent gain per taka, never dipping below the reserve. */
function chooseAiBuild(state: GameState, playerId: string): GameState {
  const actor = state.players.find((p) => p.id === playerId);
  if (!actor || actor.bankrupt || state.phase !== "awaiting-end-turn") return state;
  const options = getLegalBuildActions(state, playerId)
    .filter((option) => actor.cash - option.cost >= AI_BUILD_RESERVE[actor.role])
    .sort((a, b) => b.rentGain / b.cost - a.rentGain / a.cost || a.cost - b.cost);
  const best = options[0];
  return best ? buildProperty(state, playerId, best.spaceId, best.action) : state;
}
function awaitBoardSpace(spaceId: string) {
  return BOARD_FOR_AI.find((space) => space.id === spaceId);
}
