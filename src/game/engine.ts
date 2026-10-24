import { BOARD, BOARD_SPACE_COUNT } from "./board";
import { GAME_RULES } from "./rules";
import { drawCard, type CardEffect } from "./cards";
import { countRailroads, createPropertyLedger, getBaseRent, getLegalPropertyActions, isPurchasable, type PropertyAction } from "./properties";
import type { Controller, GameEvent, GameState, NewGameOptions, Player, PlayerRole } from "./types";

const defaultRandom = () => Math.random();
function addEvent(state: GameState, message: string, kind: GameEvent["kind"] = "system"): GameState {
  return { ...state, nextEventId: state.nextEventId + 1, events: [...state.events, { id: state.nextEventId, message, kind }].slice(-100) };
}
function makePlayer(id: string, name: string, role: PlayerRole, controller: Controller): Player {
  return { id, name, role, controller, cash: role === "politician" ? GAME_RULES.politicianStartingCash : GAME_RULES.citizenStartingCash, position: 0, active: true, lastRoll: [], goPasses: 0, bankrupt: false, skipTurns: 0 };
}
export function createNewGame({ humanRole }: NewGameOptions): GameState {
  const roles: PlayerRole[] = ["politician", "citizen", "citizen", "citizen"];
  const humanIndex = humanRole === "politician" ? 0 : 1;
  const names = ["The Honourable Leader", "Asha", "Rafi", "Mina"];
  const players = roles.map((role, index) => makePlayer(`player-${index + 1}`, index === humanIndex ? "You" : (role === "politician" ? "The Honourable Leader" : names[index]), role, index === humanIndex ? "human" : "ai"));
  const initial: GameState = { schemaVersion: 1, phase: "awaiting-roll", players, currentPlayerIndex: 0, publicFund: 0, cooperativeFund: 0, properties: createPropertyLedger(), pendingPropertyId: null, cardDrawCounts: { community: 0, chance: 0 }, extraRollAvailable: false, events: [], nextEventId: 1, round: 1, winner: null };
  const state = addEvent(initial, `Game started. You play as ${humanRole === "politician" ? "Politician" : "Citizen"}; three opponents are computer-controlled.`);
  return addEvent(state, `The board has ${BOARD_SPACE_COUNT} spaces. All players begin at Shurur Line.`);
}
export function rollDice(count: number, random: () => number = defaultRandom): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Dice count must be a positive integer.");
  return Array.from({ length: count }, () => {
    const sample = random();
    if (!(sample >= 0 && sample < 1)) throw new Error("Random source must return a value in [0, 1).");
    return Math.floor(sample * 6) + 1;
  });
}
export function getDiceCount(player: Player): number { return player.role === "politician" ? GAME_RULES.politicianDiceCount : GAME_RULES.citizenDiceCount; }
function pay(state: GameState, payerId: string, recipientId: string | null, amount: number, reason: string): GameState {
  if (amount <= 0) return state;
  const payer = state.players.find((p) => p.id === payerId);
  if (!payer || payer.bankrupt) return state;
  let next = state;
  let remaining = amount;
  // First use cash, then automatically mortgage owned properties at half purchase price.
  const cashPaid = Math.min(payer.cash, remaining);
  if (cashPaid > 0) {
    next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash - cashPaid } : p) };
    remaining -= cashPaid;
  }
  if (remaining > 0) {
    const assets = Object.values(next.properties).filter((property) => property.ownerId === payerId && !property.mortgaged);
    for (const asset of assets) {
      if (remaining <= 0) break;
      const space = BOARD.find((s) => s.id === asset.spaceId);
      const proceeds = Math.floor((space?.price ?? 0) / 2);
      if (proceeds <= 0) continue;
      const raised = Math.min(proceeds, remaining);
      next = { ...next, properties: { ...next.properties, [asset.spaceId]: { ...asset, mortgaged: true } },
        players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash + proceeds } : p) };
      next = addEvent(next, `${payer.name} mortgaged ${space?.name ?? asset.spaceId} for ৳${proceeds} to cover ${reason}.`, "money");
      const paidFromMortgage = Math.min(proceeds, remaining);
      next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash - paidFromMortgage } : p) };
      remaining -= paidFromMortgage;
      if (raised < proceeds) {
        const excess = proceeds - paidFromMortgage;
        next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash + excess } : p) };
      }
    }
  }
  const paid = amount - remaining;
  if (recipientId) next = { ...next, players: next.players.map((p) => p.id === recipientId ? { ...p, cash: p.cash + paid } : p) };
  else next = { ...next, publicFund: next.publicFund + paid };
  next = addEvent(next, `${payer.name} paid ৳${paid} of ৳${amount} for ${reason}.`, "money");
  if (remaining > 0) {
    const beneficiary = recipientId ? next.players.find((p) => p.id === recipientId) : undefined;
    const isCitizen = payer.role === "citizen";
    const politicianId = next.players.find((p) => p.role === "politician")?.id ?? null;
    const assetRecipient = isCitizen ? politicianId : recipientId;
    next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: 0, bankrupt: true, active: false } : p),
      properties: Object.fromEntries(Object.entries(next.properties).map(([id, property]) => property.ownerId === payerId
        ? [id, { ...property, ownerId: assetRecipient, leaseholderId: null, leaseExpiresAtGoPass: null, mortgaged: false }]
        : property.leaseholderId === payerId ? [id, { ...property, leaseholderId: null, leaseExpiresAtGoPass: null }] : [id, property])) };
    next = addEvent(next, `${payer.name} could not pay the remaining ৳${remaining} and went bankrupt. Assets were transferred under the current bankruptcy rule.`);
    if (next.players.filter((p) => p.active && p.role === "citizen").length === 0) {
      next = { ...next, phase: "game-over", winner: "politician" };
      next = addEvent(next, "All Citizens are bankrupt. The Politician wins.");
    }
    void beneficiary;
  }
  return next;
}
function resolveOwnedSpace(state: GameState, player: Player, spaceId: string): GameState {
  const property = state.properties[spaceId];
  const space = BOARD.find((s) => s.id === spaceId);
  if (!property || !space || property.mortgaged) return state;
  const controllerId = property.leaseholderId ?? property.ownerId;
  if (!controllerId || controllerId === player.id) return state;
  const controller = state.players.find((p) => p.id === controllerId);
  if (!controller) return state;
  if (space.type === "utility") {
    if (player.role === "politician") {
      if (controller.role === "citizen") return addEvent(state, `${player.name} used political privilege to avoid the utility charge.`);
      return state;
    }
    const diceTotal = Math.max(1, player.lastRoll.reduce((sum, n) => sum + n, 0));
    const amount = controller.role === "politician" ? diceTotal * 10 + 30 : diceTotal * 4;
    return pay(state, player.id, controllerId, amount, `${space.name} service charge`);
  }
  let rent = getBaseRent(spaceId);
  if (space.type === "railroad") {
    rent = 50 * Math.max(1, countRailroads(state, controllerId));
    if (player.role === "politician" && controller.role === "citizen") rent = Math.ceil(rent / 2);
    if (player.role === "citizen" && controller.role === "politician") rent *= 2;
  } else {
    if (property.leaseholderId) rent = controller.role === "politician" ? Math.ceil(rent / 2) : rent;
    if (player.role === "politician" && controller.role === "citizen") rent = Math.ceil(rent / 2);
  }
  return pay(state, player.id, controllerId, rent, `${space.name} rent`);
}
function applyCardEffect(state: GameState, playerId: string, effect: CardEffect, depth: number): GameState {
  let next = state;
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return next;
  if (effect.kind === "cash") {
    if (effect.recipient === "bank") {
      if (effect.amount >= 0) {
        next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash + effect.amount } : p) };
        return addEvent(next, `${player.name} received ৳${effect.amount} from ${effect.amount === 0 ? "the card" : "the public system"}.`, "money");
      }
      return pay(next, playerId, null, -effect.amount, "card expense");
    }
    if (effect.recipient === "public") return pay(next, playerId, null, effect.amount, "card payment to public fund");
    if (effect.recipient === "cooperative") {
      if (effect.amount >= 0) return addEvent({ ...next, cooperativeFund: next.cooperativeFund + effect.amount }, `${player.name} received a cooperative distribution of ৳${effect.amount}.`, "money");
      return applyCardEffect(next, playerId, { kind: "contribute", amount: -effect.amount, destination: "cooperative", optional: false }, depth);
    }
    if (effect.recipient === "public-if-available") {
      const amount = Math.min(next.publicFund, effect.amount);
      next = { ...next, publicFund: next.publicFund - amount, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash + amount } : p) };
      return addEvent(next, `${player.name} collected ৳${amount} from the public fund; any unavailable balance was waived.`, "money");
    }
    if (effect.recipient === "public-payment-if-available") {
      const amount = Math.min(next.publicFund, effect.amount);
      if (amount === 0) return addEvent(next, `${player.name} had no public-fund payment due; no liability was carried forward.`);
      next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash - Math.min(p.cash, amount) } : p), publicFund: next.publicFund + Math.min(player.cash, amount) };
      return addEvent(next, `${player.name} paid ৳${Math.min(player.cash, amount)} into the public fund from an available-balance card.`, "money");
    }
    for (const citizen of next.players.filter((p) => p.role === "citizen" && p.active && p.id !== playerId)) {
      next = pay(next, citizen.id, playerId, effect.amount, "card collection");
    }
    return next;
  }
  if (effect.kind === "contribute") {
    if (effect.optional && player.controller === "human") return addEvent(next, `${player.name} kept their cash; the optional card contribution was skipped.`);
    if (player.cash < effect.amount) return addEvent(next, `${player.name} could not afford the optional ৳${effect.amount} contribution; it was skipped.`);
    next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash - effect.amount } : p),
      publicFund: effect.destination === "public" ? next.publicFund + effect.amount : next.publicFund,
      cooperativeFund: effect.destination === "cooperative" ? next.cooperativeFund + effect.amount : next.cooperativeFund };
    return addEvent(next, `${player.name} contributed ৳${effect.amount} to the ${effect.destination === "public" ? "public fund" : "Citizens' cooperative fund"}.`, "money");
  }
  if (effect.kind === "collect-if-citizen-contributes") {
    const other = next.players.find((p) => p.role === "citizen" && p.id !== playerId && p.active && p.cash >= effect.contribution);
    if (!other) return addEvent(next, `${player.name} received no neighbour contribution; no payment was made.`);
    next = { ...next, players: next.players.map((p) => p.id === other.id ? { ...p, cash: p.cash - effect.contribution } : p).map((p) => p.id === playerId ? { ...p, cash: p.cash + effect.amount } : p) };
    return addEvent(next, `${other.name} contributed ৳${effect.contribution}; ${player.name} received ৳${effect.amount}.`, "money");
  }
  if (effect.kind === "skip-turn") {
    next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, skipTurns: p.skipTurns + 1 } : p) };
    return addEvent(next, `${player.name} must skip their next turn.`);
  }
  if (effect.kind === "extra-roll") {
    next = { ...next, extraRollAvailable: true };
    return addEvent(next, `${player.name} earned one extra roll after this turn.`);
  }
  if (effect.kind === "jail") {
    next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, position: 10, skipTurns: p.skipTurns + 1 } : p) };
    return addEvent(next, `${player.name} was sent to Administrative Hold and will skip their next turn.`);
  }
  if (effect.kind === "move") {
    const oldPosition = player.position;
    const raw = oldPosition + effect.steps;
    const wrapped = raw < 0 ? ((raw % BOARD_SPACE_COUNT) + BOARD_SPACE_COUNT) % BOARD_SPACE_COUNT : raw % BOARD_SPACE_COUNT;
    const crossed = effect.steps > 0 ? Math.floor(raw / BOARD_SPACE_COUNT) : 0;
    const reward = player.role === "politician" ? GAME_RULES.politicianGoReward : GAME_RULES.citizenGoReward;
    next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, position: wrapped, cash: p.cash + crossed * reward, goPasses: p.goPasses + crossed } : p) };
    next = addEvent(next, `${player.name} moved ${effect.steps > 0 ? "forward" : "back"} to ${BOARD[wrapped].name} because of a card.`, "movement");
    if (crossed > 0) next = addEvent(next, `${player.name} collected ৳${crossed * reward} for passing Shurur Line.`, "money");
    if (effect.resolveDestination && depth < 2) next = resolveLanding(next, playerId, depth + 1);
    return next;
  }
  return next;
}
function resolveCard(state: GameState, playerId: string, deck: "community" | "chance", depth: number): GameState {
  if (depth > 3) return addEvent(state, "Card movement limit reached; further chained card draws were stopped.");
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const index = state.cardDrawCounts[deck];
  const card = drawCard(deck, player.role, index);
  let next: GameState = { ...state, cardDrawCounts: { ...state.cardDrawCounts, [deck]: index + 1 } };
  next = addEvent(next, `${player.name} drew ${card.id}: ${card.title}.`);
  for (const effect of card.effects[player.role]) {
    next = applyCardEffect(next, playerId, effect, depth);
    if (next.phase === "game-over" || next.players.find((p) => p.id === playerId)?.bankrupt) break;
  }
  return next;
}
function resolveLanding(state: GameState, playerId: string, depth = 0): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const space = BOARD[player.position];
  let next = state;
  if (isPurchasable(space.id)) {
    const property = next.properties[space.id];
    if (property?.ownerId || property?.leaseholderId) return resolveOwnedSpace(next, player, space.id);
    next = { ...next, pendingPropertyId: space.id };
    return addEvent(next, `${player.name} found ${space.name} unclaimed. Buy, lease, or decline.`);
  }
  if (space.type === "tax") {
    const amount = space.id === "luxury-tax" ? (player.role === "politician" ? 0 : 100) : (player.role === "politician" ? 50 : 100);
    if (player.role === "politician" && amount === 0) return addEvent(next, `${player.name} invoked a tax exemption at ${space.name}.`);
    return pay(next, player.id, null, amount, space.name);
  }
  if (space.type === "free-parking") {
    if (player.role === "politician" && next.publicFund > 0) {
      const amount = next.publicFund;
      next = { ...next, publicFund: 0, players: next.players.map((p) => p.id === player.id ? { ...p, cash: p.cash + amount } : p) };
      return addEvent(next, `${player.name} withdrew ৳${amount} from the public treasury at Public Plaza.`, "money");
    }
    return addEvent(next, `${player.name} stopped at Public Plaza. No payout was available.`);
  }
  if (space.type === "go-to-jail") {
    next = { ...next, players: next.players.map((p) => p.id === player.id ? { ...p, position: 10 } : p) };
    return addEvent(next, `${player.name} was sent to Administrative Hold.`);
  }
  if (space.type === "community" || space.type === "chance") return resolveCard(next, player.id, space.type === "community" ? "community" : "chance", depth);
  if (space.type === "jail") return addEvent(next, `${player.name} is just visiting Administrative Hold.`);
  return next;
}
export function movePlayer(state: GameState, playerId: string, steps: number): GameState {
  if (state.phase !== "awaiting-roll") throw new Error("The game is not waiting for a roll.");
  if (!Number.isInteger(steps) || steps < 0) throw new Error("Movement must be a non-negative integer.");
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error("Unknown player.");
  if (index !== state.currentPlayerIndex) throw new Error("Only the current player may move.");
  const player = state.players[index];
  const rawPosition = player.position + steps;
  const crossedGoCount = Math.floor(rawPosition / BOARD_SPACE_COUNT);
  const exactGo = steps > 0 && rawPosition % BOARD_SPACE_COUNT === 0;
  const newPosition = rawPosition % BOARD_SPACE_COUNT;
  const reward = player.role === "politician" ? GAME_RULES.politicianGoReward : GAME_RULES.citizenGoReward;
  const exactBonus = player.role === "politician" ? GAME_RULES.politicianExactGoBonus : GAME_RULES.citizenExactGoBonus;
  const cashReward = crossedGoCount * reward + (exactGo ? exactBonus : 0);
  let next: GameState = { ...state, phase: "awaiting-end-turn", pendingPropertyId: null,
    players: state.players.map((candidate, i) => i === index ? { ...candidate, position: newPosition, cash: candidate.cash + cashReward, goPasses: candidate.goPasses + crossedGoCount } : candidate) };
  if (crossedGoCount > 0) {
    const updatedPlayer = next.players[index];
    const expired = Object.values(next.properties).filter((property) => property.leaseholderId === player.id && property.leaseExpiresAtGoPass !== null && updatedPlayer.goPasses >= property.leaseExpiresAtGoPass);
    for (const property of expired) {
      next = { ...next, properties: { ...next.properties, [property.spaceId]: { ...property, leaseholderId: null, leaseExpiresAtGoPass: null } } };
      next = addEvent(next, `${player.name}'s lease on ${BOARD.find((space) => space.id === property.spaceId)?.name ?? property.spaceId} expired after passing Shurur Line five times.`);
    }
  }
  next = addEvent(next, `${player.name} moved ${steps} spaces to ${BOARD[newPosition].name}.`, "movement");
  if (crossedGoCount) next = addEvent(next, `${player.name} collected ৳${reward * crossedGoCount} for passing Shurur Line.`, "money");
  if (exactGo) next = addEvent(next, `${player.name} landed exactly on Shurur Line and received an extra ৳${exactBonus}.`, "money");
  next = resolveLanding(next, player.id);
  return next;
}
export function rollAndMove(state: GameState, random: () => number = defaultRandom): GameState {
  if (state.phase !== "awaiting-roll") throw new Error("The game is not waiting for a roll.");
  const player = state.players[state.currentPlayerIndex];
  const dice = rollDice(getDiceCount(player), random);
  const withRoll = { ...state, players: state.players.map((p, i) => i === state.currentPlayerIndex ? { ...p, lastRoll: dice } : p) };
  const total = dice.reduce((sum, die) => sum + die, 0);
  const rolledState = addEvent(withRoll, `${player.name} (${player.role}) rolled ${dice.join(" + ")} = ${total}.`, player.controller === "ai" ? "ai" : "system");
  return movePlayer(rolledState, player.id, total);
}
export function resolvePropertyAction(state: GameState, action: PropertyAction): GameState {
  if (state.phase !== "awaiting-end-turn" || !state.pendingPropertyId) throw new Error("There is no pending property decision.");
  const player = state.players[state.currentPlayerIndex];
  const legal = getLegalPropertyActions(state, player);
  const selected = legal.find((item) => item.type === action);
  if (!selected) throw new Error("That property action is not legal or affordable.");
  let next = state;
  const space = BOARD.find((s) => s.id === selected.spaceId);
  if (!space) throw new Error("Unknown property.");
  if (action === "buy") {
    next = { ...state, players: state.players.map((p) => p.id === player.id ? { ...p, cash: p.cash - selected.cost } : p),
      properties: { ...state.properties, [space.id]: { ...state.properties[space.id], ownerId: player.id } }, pendingPropertyId: null };
    next = addEvent(next, `${player.name} bought ${space.name} for ৳${selected.cost}.`, "money");
  } else if (action === "lease") {
    const duration = player.role === "politician" ? null : player.goPasses + 5;
    next = { ...state, players: state.players.map((p) => p.id === player.id ? { ...p, cash: p.cash - selected.cost } : p),
      properties: { ...state.properties, [space.id]: { ...state.properties[space.id], leaseholderId: player.id, leaseExpiresAtGoPass: duration } }, pendingPropertyId: null };
    next = addEvent(next, player.role === "politician" ? `${player.name} secured a permanent lease on ${space.name} for ৳${selected.cost}.` : `${player.name} leased ${space.name} for ৳${selected.cost}; it expires after five GO passes.`, "money");
  } else {
    next = { ...state, pendingPropertyId: null };
    next = addEvent(next, `${player.name} declined ${space.name}.`);
  }
  return next;
}
export function endTurn(state: GameState): GameState {
  if (state.phase !== "awaiting-end-turn") throw new Error("Roll and resolve movement before ending the turn.");
  if (state.pendingPropertyId) throw new Error("Resolve the property decision before ending the turn.");
  if (state.extraRollAvailable && !getCurrentPlayer(state).bankrupt) {
    const next = { ...state, phase: "awaiting-roll" as const, extraRollAvailable: false };
    return addEvent(next, `${getCurrentPlayer(next).name} takes the extra roll before passing the turn.`);
  }
  let nextIndex = state.currentPlayerIndex;
  let round = state.round;
  let nextPlayers = state.players;
  let next: GameState = { ...state, phase: "awaiting-roll", extraRollAvailable: false };
  for (let attempts = 0; attempts < state.players.length; attempts += 1) {
    nextIndex = (nextIndex + 1) % state.players.length;
    if (nextIndex === 0) round += 1;
    const candidate = nextPlayers[nextIndex];
    if (candidate.bankrupt || !candidate.active) {
      next = { ...next, currentPlayerIndex: nextIndex, round };
      next = addEvent(next, `${candidate.name} is bankrupt and is skipped.`);
      continue;
    }
    if (candidate.skipTurns > 0) {
      nextPlayers = nextPlayers.map((p, i) => i === nextIndex ? { ...p, skipTurns: p.skipTurns - 1 } : p);
      next = { ...next, players: nextPlayers, currentPlayerIndex: nextIndex, round };
      next = addEvent(next, `${candidate.name} misses this turn due to a card.`);
      continue;
    }
    next = { ...next, players: nextPlayers, currentPlayerIndex: nextIndex, round };
    return addEvent(next, `Round ${round}: ${next.players[nextIndex].name}'s turn.`);
  }
  const politician = next.players.find((p) => p.role === "politician");
  const citizensAlive = next.players.some((p) => p.role === "citizen" && p.active && !p.bankrupt);
  if (politician && !citizensAlive) return { ...next, phase: "game-over", winner: "politician" };
  return next;
}
export function getCurrentPlayer(state: GameState): Player { return state.players[state.currentPlayerIndex]; }
export function isHumanTurn(state: GameState): boolean {
  return (state.phase === "awaiting-roll" || state.phase === "awaiting-end-turn") && getCurrentPlayer(state).controller === "human";
}
export function validateSetup(state: GameState): boolean {
  return state.players.length === 4 && state.players.filter((p) => p.role === "politician").length === 1 &&
    state.players.filter((p) => p.role === "citizen").length === 3 && state.players.filter((p) => p.controller === "human").length === 1 &&
    state.players.filter((p) => p.controller === "ai").length === 3;
}
