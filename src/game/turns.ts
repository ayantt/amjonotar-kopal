import { BOARD as BOARD_FOR_AI } from "./board";
import { announce, buildProperty, buyCooperativeProperty, contributeToCooperative, endTurn, getLegalBuildActions, getCurrentPlayer, resolvePropertyAction, rollAndMove } from "./engine";
import { getLegalPropertyActions } from "./properties";
import type { GameState, PlayerRole } from "./types";
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
  return completeTurn(rollAndMove(state, random), player.id, player.role);
}

/** Everything after the roll: one property decision, cooperative contribution, one build, then end the turn. */
function completeTurn(afterRoll: GameState, playerId: string, role: PlayerRole): GameState {
  let next = afterRoll;
  const player = next.players.find((p) => p.id === playerId);
  if (next.pendingPropertyId && player) {
    const space = awaitBoardSpace(next.pendingPropertyId);
    if (role === "citizen" && space?.price !== undefined && next.cooperativeFund >= space.price) {
      next = buyCooperativeProperty(next, playerId);
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
  const actor = next.players.find((p) => p.id === playerId);
  if (actor && actor.role === "citizen" && actor.active && !actor.bankrupt && next.phase !== "game-over") {
    if (actor.cash >= 1_200 && next.cooperativeFund < 1_000) {
      next = contributeToCooperative(next, playerId, Math.min(100, actor.cash - 1_000));
    }
  }
  next = chooseAiBuild(next, playerId);
  if (next.phase === "game-over") return next;
  return endTurn(next);
}

/**
 * Plays the current player's turn for them with the standard AI strategy, used when an online player is away. It follows
 * exactly the same rules and legal actions as any other turn; the seat stays human-controlled afterwards. Handles a turn
 * that was abandoned part-way (already rolled, property decision pending) and extra rolls.
 */
export function playOnBehalf(state: GameState, random: RandomSource = Math.random): GameState {
  if (state.phase === "game-over") return state;
  const absent = getCurrentPlayer(state);
  const original = absent.controller;
  const setController = (s: GameState, controller: typeof original): GameState => ({ ...s, players: s.players.map((p) => p.id === absent.id ? { ...p, controller } : p) });
  let next = announce(setController(state, "ai"), `${absent.name} is away, so the computer is playing their turn.`);
  for (let step = 0; step < 4 && next.phase !== "game-over"; step += 1) {
    if (getCurrentPlayer(next).id !== absent.id) break;
    next = next.phase === "awaiting-roll" ? runAiTurn(next, random) : completeTurn(next, absent.id, absent.role);
  }
  return setController(next, original);
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
