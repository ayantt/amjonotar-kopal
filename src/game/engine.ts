import { BOARD, BOARD_SPACE_COUNT } from "./board.js";
import { GAME_RULES } from "./rules.js";
import { drawCard, type CardEffect } from "./cards.js";
import { countRailroads, createPropertyLedger, getBaseRent, getLegalPropertyActions, isPurchasable, type PropertyAction } from "./properties.js";
import { recordBankruptcy, recordBuild, recordCard, recordCashSnapshot, recordDecision, recordFlow, recordLanding, recordRent, type PayTag } from "./stats.js";
import type { Controller, GameEvent, GameState, NewGameOptions, Player, PlayerRole } from "./types.js";

const defaultRandom = () => Math.random();
function addEvent(state: GameState, message: string, kind: GameEvent["kind"] = "system"): GameState {
  return { ...state, nextEventId: state.nextEventId + 1, events: [...state.events, { id: state.nextEventId, message, kind }].slice(-100) };
}
/** Last-player-standing rule: the game ends when exactly one player is not bankrupt, and that player wins. */
function checkVictory(state: GameState): GameState {
  if (state.phase === "game-over") return state;
  const survivors = state.players.filter((p) => !p.bankrupt);
  if (survivors.length !== 1) return state;
  const winner = survivors[0];
  const who = winner.name === "You" ? "You win" : `${winner.name} wins`;
  return addEvent({ ...state, phase: "game-over", winner: winner.id, pendingPropertyId: null }, `${who} as the last player standing (${winner.role === "politician" ? "Politician" : "Citizen"}): every other player is bankrupt.`);
}
function makePlayer(id: string, name: string, role: PlayerRole, controller: Controller): Player {
  return { id, name, role, controller, cash: role === "politician" ? GAME_RULES.politicianStartingCash : GAME_RULES.citizenStartingCash, position: 0, active: true, lastRoll: [], goPasses: 0, bankrupt: false, skipTurns: 0 };
}
export function contributeToCooperative(state: GameState, playerId: string, amount: number): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (state.phase === "game-over" || !player || player.id !== getCurrentPlayer(state).id || player.role !== "citizen" || !player.active || player.bankrupt) throw new Error("Only the current active Citizen can contribute.");
  if (!Number.isInteger(amount) || amount <= 0 || player.cash < amount) throw new Error("Contribution must be positive and affordable.");
  let next = { ...state, cooperativeFund: state.cooperativeFund + amount,
    players: state.players.map((p) => p.id === playerId ? { ...p, cash: p.cash - amount } : p) };
  next = recordFlow(next, playerId, "out", "contribution", amount);
  next = addEvent(next, `${player.name} contributed ৳${amount} to the Citizens' cooperative fund.`, "money");
  return checkVictory(next);
}
export function buyCooperativeProperty(state: GameState, playerId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  const space = BOARD.find((s) => s.id === state.pendingPropertyId);
  if (state.phase !== "awaiting-end-turn" || !state.pendingPropertyId || !space || !player || player.id !== getCurrentPlayer(state).id || player.role !== "citizen") throw new Error("A Citizen must be at an unclaimed property to propose a cooperative purchase.");
  const cost = space.price ?? 0;
  const property = state.properties[space.id];
  if (!property || property.ownerId || property.leaseholderId || state.cooperativePropertyIds.includes(space.id) || cost <= 0 || state.cooperativeFund < cost) throw new Error("The cooperative fund cannot afford this property.");
  let next: GameState = { ...state, cooperativeFund: state.cooperativeFund - cost, cooperativePropertyIds: [...state.cooperativePropertyIds, space.id], pendingPropertyId: null };
  next = addEvent(next, `Citizens' cooperative bought ${space.name} for ৳${cost}; future rent goes to the shared fund.`, "money");
  return checkVictory(next);
}
function initializeGame(players: Player[], startMessage: string): GameState {
  const initial: GameState = { schemaVersion: 1, phase: "awaiting-roll", players, currentPlayerIndex: 0, publicFund: 0, cooperativeFund: 0, properties: createPropertyLedger(), cooperativePropertyIds: [], pendingPropertyId: null, cardDrawCounts: { community: 0, chance: 0 }, extraRollAvailable: false, events: [], nextEventId: 1, round: 1, winner: null };
  const state = addEvent(recordCashSnapshot(initial), startMessage);
  return addEvent(state, `The board has ${BOARD_SPACE_COUNT} spaces. All players begin at Shurur Line.`);
}
export function createNewGame({ humanRole }: NewGameOptions): GameState {
  const roles: PlayerRole[] = ["politician", "citizen", "citizen", "citizen"];
  const humanIndex = humanRole === "politician" ? 0 : 1;
  const names = ["The Honourable Leader", "Kamal", "Joshim", "Shabana"];
  const players = roles.map((role, index) => makePlayer(`player-${index + 1}`, index === humanIndex ? "You" : (role === "politician" ? "The Honourable Leader" : names[index]), role, index === humanIndex ? "human" : "ai"));
  return initializeGame(players, `Game started. You play as ${humanRole === "politician" ? "Politician" : "Citizen"}; three opponents are computer-controlled.`);
}
/** Creates a shared game in which each seat is controlled by a connected human client. */
export function createMultiplayerGame(playerNames: string[], random: () => number = defaultRandom): GameState {
  if (playerNames.length < 2 || playerNames.length > 6) throw new Error("Online multiplayer requires between two and six players.");
  const sample = random();
  if (!(sample >= 0 && sample < 1)) throw new Error("Random source must return a value in [0, 1).");
  const politicianIndex = Math.floor(sample * playerNames.length);
  const players = playerNames.map((rawName, index) => {
    const name = rawName.trim().slice(0, 24);
    if (!name) throw new Error("Every multiplayer seat needs a display name.");
    return makePlayer(`player-${index + 1}`, name, index === politicianIndex ? "politician" : "citizen", "human");
  });
  return initializeGame(players, `Online multiplayer game started with ${players.length} players. ${players[politicianIndex].name} was randomly selected as Politician; everyone else is a Citizen.`);
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
/** Moves money from a player to another player, the public treasury, or (toCooperative) the cooperative fund. */
function pay(state: GameState, payerId: string, recipientId: string | null, amount: number, reason: string, toCooperative = false, tag: PayTag = { category: "other" }): GameState {
  if (amount <= 0 || state.phase === "game-over") return state;
  const payer = state.players.find((p) => p.id === payerId);
  if (!payer || payer.bankrupt) return state;
  let next = state;
  let remaining = amount;
  // First use cash, then automatically mortgage owned properties using role-specific loan terms.
  const cashPaid = Math.min(payer.cash, remaining);
  if (cashPaid > 0) {
    next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash - cashPaid } : p) };
    remaining -= cashPaid;
  }
  if (remaining > 0) {
    const assets = Object.values(next.properties).filter((property) => property.ownerId === payerId && !property.mortgaged && !property.leaseholderId);
    for (const asset of assets) {
      if (remaining <= 0) break;
      const space = BOARD.find((s) => s.id === asset.spaceId);
      const price = space?.price ?? 0;
      const { processingFee: fee, netAdvance: proceeds } = getMortgageTerms(payer.role, price);
      if (proceeds <= 0) continue;
      next = { ...next, properties: { ...next.properties, [asset.spaceId]: { ...asset, mortgaged: true } },
        players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash + proceeds } : p),
        publicFund: next.publicFund + fee };
      next = addEvent(next, `${payer.name} mortgaged ${space?.name ?? asset.spaceId}: received ৳${proceeds}${fee ? ` after a ৳${fee} processing fee` : ""} to cover ${reason}.`, "money");
      next = recordFlow(next, payerId, "in", "mortgage", proceeds);
      const paidFromMortgage = Math.min(proceeds, remaining);
      next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: p.cash - paidFromMortgage } : p) };
      remaining -= paidFromMortgage;
    }
  }
  const paid = amount - remaining;
  if (recipientId) next = { ...next, players: next.players.map((p) => p.id === recipientId ? { ...p, cash: p.cash + paid } : p) };
  else if (toCooperative) next = { ...next, cooperativeFund: next.cooperativeFund + paid };
  else next = { ...next, publicFund: next.publicFund + paid };
  next = recordFlow(next, payerId, "out", tag.category, paid);
  if (recipientId) next = recordFlow(next, recipientId, "in", tag.category, paid);
  if (tag.spaceId && (tag.category === "rent" || tag.category === "coop-rent" || tag.category === "service-charge")) next = recordRent(next, tag.spaceId, paid);
  next = addEvent(next, `${payer.name} paid ৳${paid} of ৳${amount} for ${reason}.`, "money");
  if (remaining > 0) {
    // Heir of a bankrupt player's property: a solvent Politician inherits from a Citizen; otherwise the solvent
    // creditor does; otherwise the land returns to the unowned market (cleared of buildings).
    const politician = next.players.find((p) => p.role === "politician" && !p.bankrupt && p.id !== payerId);
    const creditor = recipientId ? next.players.find((p) => p.id === recipientId && !p.bankrupt) : undefined;
    const heirId = (payer.role === "citizen" ? (GAME_RULES.citizenBankruptcyToPolitician === 1 ? politician ?? creditor : creditor) : creditor)?.id ?? null;
    next = { ...next, players: next.players.map((p) => p.id === payerId ? { ...p, cash: 0, bankrupt: true, active: false } : p),
      properties: Object.fromEntries(Object.entries(next.properties).map(([id, property]) => property.ownerId === payerId
        ? [id, { ...property, ownerId: heirId, leaseholderId: null, leaseExpiresAtGoPass: null, mortgaged: false, ...(heirId ? {} : { houses: 0, hotel: false }) }]
        : property.leaseholderId === payerId ? [id, { ...property, leaseholderId: null, leaseExpiresAtGoPass: null }] : [id, property])) };
    next = recordBankruptcy(next, payerId, tag.category);
    next = addEvent(next, `${payer.name} could not pay the remaining ৳${remaining} and went bankrupt. Assets were transferred under the current bankruptcy rule.`);
    next = checkVictory(next);
  }
  return next;
}
/** Taxes grow with the round number (RD-126) so a game cannot stall forever once money simply recirculates. */
export function getEscalatedTax(baseAmount: number, round: number): number {
  const every = GAME_RULES.taxEscalationEveryRounds;
  if (every <= 0) return baseAmount;
  const steps = Math.floor((round - 1) / every);
  return baseAmount + Math.floor((baseAmount * GAME_RULES.taxEscalationPercent * steps) / 100);
}
function resolveOwnedSpace(state: GameState, player: Player, spaceId: string): GameState {
  if (state.cooperativePropertyIds.includes(spaceId)) {
    const space = BOARD.find((s) => s.id === spaceId);
    let rent = getBaseRent(spaceId);
    if (space?.type === "railroad") rent = 50 * Math.max(1, state.cooperativePropertyIds.filter((id) => BOARD.find((s) => s.id === id)?.type === "railroad").length);
    if (space?.type === "utility") rent = Math.max(1, player.lastRoll.reduce((sum, n) => sum + n, 0)) * 4;
    if (player.role === "politician") rent = Math.ceil(rent / GAME_RULES.politicianVisitorRentDivisor);
    return pay(state, player.id, null, rent, (space?.name ?? spaceId) + " cooperative rent", true, { category: "coop-rent", spaceId });
  }
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
    const amount = controller.role === "politician" ? diceTotal * GAME_RULES.politicianUtilityMultiplier + GAME_RULES.politicianUtilityFlat : diceTotal * 4;
    return pay(state, player.id, controllerId, amount, `${space.name} service charge`, false, { category: "service-charge", spaceId: space.id });
  }
  let rent = getBaseRent(spaceId);
  if (space.type === "railroad") {
    rent = 50 * Math.max(1, countRailroads(state, controllerId));
    if (player.role === "politician" && controller.role === "citizen") rent = Math.ceil(rent / GAME_RULES.politicianVisitorRentDivisor);
    if (player.role === "citizen" && controller.role === "politician") rent *= GAME_RULES.citizenRailroadFareMultiplier;
  } else {
    if (property.leaseholderId) rent = controller.role === "politician" ? Math.ceil(rent / 2) : rent;
    const houses = property.houses ?? 0;
    const multiplier = property.hotel ? 6 : houses > 0 ? houses + 1 : 1;
    rent *= multiplier;
    if (player.role === "politician" && controller.role === "citizen") rent = Math.ceil(rent / GAME_RULES.politicianVisitorRentDivisor);
  }
  return pay(state, player.id, controllerId, rent, `${space.name} rent`, false, { category: "rent", spaceId: space.id });
}
function applyCardEffect(state: GameState, playerId: string, effect: CardEffect, depth: number): GameState {
  let next = state;
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return next;
  if (effect.kind === "cash") {
    if (effect.recipient === "bank") {
      if (effect.amount >= 0) {
        next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash + effect.amount } : p) };
        next = recordFlow(next, playerId, "in", "card", effect.amount);
        return addEvent(next, `${player.name} received ৳${effect.amount} from ${effect.amount === 0 ? "the card" : "the public system"}.`, "money");
      }
      return pay(next, playerId, null, -effect.amount, "card expense", false, { category: "card" });
    }
    if (effect.recipient === "public") return pay(next, playerId, null, effect.amount, "card payment to public fund", false, { category: "card" });
    if (effect.recipient === "cooperative") {
      if (effect.amount >= 0) return addEvent({ ...next, cooperativeFund: next.cooperativeFund + effect.amount }, `${player.name} received a cooperative distribution of ৳${effect.amount}.`, "money");
      return applyCardEffect(next, playerId, { kind: "contribute", amount: -effect.amount, destination: "cooperative", optional: false }, depth);
    }
    if (effect.recipient === "public-if-available") {
      const amount = Math.min(next.publicFund, effect.amount);
      next = { ...next, publicFund: next.publicFund - amount, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash + amount } : p) };
      next = recordFlow(next, playerId, "in", "card", amount);
      return addEvent(next, `${player.name} collected ৳${amount} from the public fund; any unavailable balance was waived.`, "money");
    }
    if (effect.recipient === "public-payment-if-available") {
      if (next.publicFund < effect.amount) return addEvent(next, `${player.name} had no payment due because the public-fund condition was not met; no liability was carried forward.`);
      return pay(next, playerId, null, effect.amount, "card payment to public fund", false, { category: "card" });
    }
    for (const citizen of next.players.filter((p) => p.role === "citizen" && p.active && p.id !== playerId)) {
      next = pay(next, citizen.id, playerId, effect.amount, "card collection", false, { category: "card" });
    }
    return next;
  }
  if (effect.kind === "contribute") {
    // "Contribute or lose next turn" cards: declining (or being unable) means the turn is lost instead.
    const declined = (message: string): GameState => {
      const logged = addEvent(next, message);
      return effect.otherwiseSkip ? applyCardEffect(logged, playerId, { kind: "skip-turn" }, depth) : logged;
    };
    if (effect.optional && player.controller === "human") return declined(`${player.name} kept their cash; the optional card contribution was skipped.`);
    if (player.cash < effect.amount) return declined(`${player.name} could not afford the optional ৳${effect.amount} contribution; it was skipped.`);
    next = { ...next, players: next.players.map((p) => p.id === playerId ? { ...p, cash: p.cash - effect.amount } : p),
      publicFund: effect.destination === "public" ? next.publicFund + effect.amount : next.publicFund,
      cooperativeFund: effect.destination === "cooperative" ? next.cooperativeFund + effect.amount : next.cooperativeFund };
    next = recordFlow(next, playerId, "out", "contribution", effect.amount);
    return addEvent(next, `${player.name} contributed ৳${effect.amount} to the ${effect.destination === "public" ? "public fund" : "Citizens' cooperative fund"}.`, "money");
  }
  if (effect.kind === "collect-if-citizen-contributes") {
    const other = next.players.find((p) => p.role === "citizen" && p.id !== playerId && p.active && p.cash >= effect.contribution);
    if (!other) return addEvent(next, `${player.name} received no neighbour contribution; no payment was made.`);
    next = { ...next, players: next.players.map((p) => p.id === other.id ? { ...p, cash: p.cash - effect.contribution } : p).map((p) => p.id === playerId ? { ...p, cash: p.cash + effect.amount } : p) };
    next = recordFlow(recordFlow(next, other.id, "out", "card", effect.contribution), playerId, "in", "card", effect.amount);
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
    if (crossed > 0) next = recordFlow(addEvent(next, `${player.name} collected ৳${crossed * reward} for passing Shurur Line.`, "money"), playerId, "in", "go", crossed * reward);
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
  const card = drawCard(deck, index);
  let next: GameState = { ...state, cardDrawCounts: { ...state.cardDrawCounts, [deck]: index + 1 } };
  next = recordCard(next, card.id, player.role);
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
  let next = recordLanding(state, space.id);
  if (isPurchasable(space.id)) {
    const property = next.properties[space.id];
    if (next.cooperativePropertyIds.includes(space.id) || property?.ownerId || property?.leaseholderId) return resolveOwnedSpace(next, player, space.id);
    next = { ...next, pendingPropertyId: space.id };
    return addEvent(next, `${player.name} found ${space.name} unclaimed. Buy, lease, or decline.`);
  }
  if (space.type === "tax") {
    const politician = player.role === "politician";
    const baseAmount = space.id === "luxury-tax" ? (politician ? GAME_RULES.luxuryTaxPolitician : GAME_RULES.luxuryTaxCitizen) : (politician ? GAME_RULES.incomeTaxPolitician : GAME_RULES.incomeTaxCitizen);
    const amount = getEscalatedTax(baseAmount, next.round);
    if (player.role === "politician" && amount === 0) return addEvent(next, `${player.name} invoked a tax exemption at ${space.name}.`);
    return pay(next, player.id, null, amount, space.name, false, { category: "tax", spaceId: space.id });
  }
  if (space.type === "free-parking") {
    const sharePercent = player.role === "politician" ? 100 : GAME_RULES.plazaCitizenSharePercent;
    const amount = Math.floor((next.publicFund * sharePercent) / 100);
    if (amount > 0) {
      next = { ...next, publicFund: next.publicFund - amount, players: next.players.map((p) => p.id === player.id ? { ...p, cash: p.cash + amount } : p) };
      next = recordFlow(next, player.id, "in", "plaza", amount);
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
  next = recordFlow(next, playerId, "in", "go", cashReward);
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
  if (crossedGoCount > 0 && player.role === "citizen") {
    const developed = Object.values(next.properties).filter((property) => property.ownerId === player.id && ((property.houses ?? 0) > 0 || property.hotel));
    for (const property of developed) {
      const space = BOARD.find((item) => item.id === property.spaceId);
      const maintenance = ((property.houses ?? 0) * 50 + (property.hotel ? 200 : 0)) * crossedGoCount;
      if (maintenance > 0) next = pay(next, player.id, null, maintenance, (space?.name ?? property.spaceId) + " building maintenance", false, { category: "maintenance" });
    }
    if (developed.length > 0) next = addEvent(next, player.name + " paid building maintenance for passing Shurur Line.", "money");
  }
  if (next.phase === "game-over" || next.players[index]?.bankrupt) return checkVictory(next);
  next = resolveLanding(next, player.id);
  return checkVictory(next);
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
  next = recordDecision(next, player.role, action);
  if (action !== "decline") next = recordFlow(next, player.id, "out", "property", selected.cost);
  return checkVictory(next);
}
export type BuildingAction = "house" | "hotel";
export function getBuildingCost(role: PlayerRole, action: BuildingAction, houses = 0): number {
  const base = action === "hotel" ? 600 : ([200, 300, 400][houses] ?? 0);
  return role === "politician" ? Math.floor(base / 2) : base;
}
export function getBuildingRentMultiplier(property: { houses?: number; hotel?: boolean }): number {
  return property.hotel ? 6 : (property.houses ?? 0) > 0 ? (property.houses ?? 0) + 1 : 1;
}
export function buildProperty(state: GameState, playerId: string, spaceId: string, action: BuildingAction): GameState {
  if (state.phase === "game-over") throw new Error("The game has ended.");
  const player = state.players.find((item) => item.id === playerId);
  const current = getCurrentPlayer(state);
  const space = BOARD.find((item) => item.id === spaceId);
  const property = state.properties[spaceId];
  if (!player || player.id !== current.id || (state.phase !== "awaiting-roll" && state.phase !== "awaiting-end-turn")) throw new Error("Only the current player may build during their own turn.");
  if (!space || space.type !== "property" || !space.price || !property || property.ownerId !== playerId) throw new Error("You can only build on land you own.");
  if (property.mortgaged || property.leaseholderId || state.cooperativePropertyIds.includes(spaceId)) throw new Error("Mortgaged, leased, or cooperative property cannot be developed.");
  const houses = property.houses ?? 0;
  if (property.hotel) throw new Error("This property already has a hotel.");
  if (action === "house" && houses >= 3) throw new Error("A property can have at most three houses before a hotel.");
  if (action === "hotel" && player.role !== "politician" && houses !== 3) throw new Error("Citizens must build three houses before upgrading to a hotel.");
  if (player.role === "citizen") {
    const group = BOARD.filter((item) => item.type === "property" && item.color === space.color);
    if (!space.color || group.some((item) => state.properties[item.id]?.ownerId !== playerId || state.properties[item.id]?.mortgaged || state.properties[item.id]?.leaseholderId || state.cooperativePropertyIds.includes(item.id))) throw new Error("Citizens must own the full unmortgaged color group to build.");
    const level = (itemId: string) => { const item = state.properties[itemId]; return item?.hotel ? 4 : item?.houses ?? 0; };
    const currentLevel = level(spaceId);
    if (action === "house" && group.some((item) => level(item.id) < currentLevel)) throw new Error("Citizens must build evenly across a color group.");
    if (action === "hotel" && group.some((item) => level(item.id) < currentLevel)) throw new Error("Citizens must build evenly across a color group.");
  }
  const cost = getBuildingCost(player.role, action, houses);
  if (cost <= 0 || player.cash < cost) throw new Error("Not enough cash for this building.");
  const updated = action === "house" ? { ...property, houses: houses + 1, hotel: false } : { ...property, houses: 0, hotel: true };
  const next: GameState = { ...state, players: state.players.map((item) => item.id === playerId ? { ...item, cash: item.cash - cost } : item), properties: { ...state.properties, [spaceId]: updated } };
  return checkVictory(addEvent(recordBuild(recordFlow(next, playerId, "out", "building", cost), player.role), player.name + " built " + (action === "hotel" ? "a hotel" : "a house") + " on " + space.name + " for ৳" + cost + ". Rent multiplier is now " + getBuildingRentMultiplier(updated) + "×.", "money"));
}

export interface LegalBuildAction { spaceId: string; action: BuildingAction; cost: number; rentGain: number; }
/** Every house/hotel the player could legally build right now (validated by buildProperty itself, so UI and AI cannot disagree). */
export function getLegalBuildActions(state: GameState, playerId: string): LegalBuildAction[] {
  if (state.phase === "game-over") return [];
  const legal: LegalBuildAction[] = [];
  for (const property of Object.values(state.properties)) {
    if (property.ownerId !== playerId) continue;
    const player = state.players.find((item) => item.id === playerId);
    if (!player) continue;
    for (const action of ["house", "hotel"] as const) {
      try {
        buildProperty(state, playerId, property.spaceId, action);
      } catch {
        continue;
      }
      const current = getBuildingRentMultiplier(property);
      legal.push({ spaceId: property.spaceId, action, cost: getBuildingCost(player.role, action, property.houses ?? 0), rentGain: (action === "hotel" ? 6 : current + 1) - current });
    }
  }
  return legal;
}

export interface MortgageTerms {
  grossAdvance: number;
  processingFee: number;
  netAdvance: number;
  redemptionAmount: number;
}
export function getMortgageTerms(role: Player["role"], price: number): MortgageTerms {
  const grossAdvance = role === "politician" ? Math.floor((price * GAME_RULES.politicianMortgageAdvancePercent) / 100) : Math.floor(price / 2);
  // Integer arithmetic only: floating-point 1.1 / 0.05 multipliers misround (e.g. 50 * 1.1 = 55.00000000000001).
  const processingFee = role === "politician" ? 0 : Math.floor((grossAdvance * 5) / 100);
  return {
    grossAdvance,
    processingFee,
    netAdvance: grossAdvance - processingFee,
    redemptionAmount: Math.ceil((grossAdvance * (role === "politician" ? 108 : 110)) / 100),
  };
}
export function mortgageProperty(state: GameState, playerId: string, spaceId: string): GameState {
  if (state.phase === "game-over") throw new Error("The game has ended.");
  const player = state.players.find((item) => item.id === playerId);
  const current = getCurrentPlayer(state);
  const space = BOARD.find((item) => item.id === spaceId);
  const property = state.properties[spaceId];
  if (!player || player.id !== current.id || player.controller !== "human" || !isHumanTurn(state)) {
    throw new Error("Only the human player may mortgage property during their own turn.");
  }
  if (!space?.price || !property || property.ownerId !== playerId) throw new Error("You can only mortgage property that you own.");
  if (property.mortgaged) throw new Error("This property is already mortgaged.");
  if (property.leaseholderId || state.cooperativePropertyIds.includes(spaceId)) throw new Error("Leased and cooperative properties cannot be mortgaged.");
  const terms = getMortgageTerms(player.role, space.price);
  let next: GameState = {
    ...state,
    players: state.players.map((item) => item.id === playerId ? { ...item, cash: item.cash + terms.netAdvance } : item),
    publicFund: state.publicFund + terms.processingFee,
    properties: { ...state.properties, [spaceId]: { ...property, mortgaged: true } },
  };
  next = recordFlow(next, playerId, "in", "mortgage", terms.netAdvance);
  next = addEvent(next, `${player.name} mortgaged ${space.name}: gross loan ৳${terms.grossAdvance}, processing fee ৳${terms.processingFee}, net received ৳${terms.netAdvance}. Redemption costs ৳${terms.redemptionAmount}.`, "money");
  return checkVictory(next);
}
export function redeemMortgage(state: GameState, playerId: string, spaceId: string): GameState {
  if (state.phase === "game-over") throw new Error("The game has ended.");
  const player = state.players.find((item) => item.id === playerId);
  const current = getCurrentPlayer(state);
  const space = BOARD.find((item) => item.id === spaceId);
  const property = state.properties[spaceId];
  if (!player || player.id !== current.id || player.controller !== "human" || !isHumanTurn(state)) {
    throw new Error("Only the human player may clear a mortgage during their own turn.");
  }
  if (!space?.price || !property || property.ownerId !== playerId || !property.mortgaged) throw new Error("You can only clear a mortgage on property you own.");
  const amount = getMortgageTerms(player.role, space.price).redemptionAmount;
  if (player.cash < amount) throw new Error(`You need ৳${amount} in available cash to clear this mortgage.`);
  let next: GameState = {
    ...state,
    players: state.players.map((item) => item.id === playerId ? { ...item, cash: item.cash - amount } : item),
    properties: { ...state.properties, [spaceId]: { ...property, mortgaged: false } },
  };
  next = recordFlow(next, playerId, "out", "redeem", amount);
  next = addEvent(next, `${player.name} cleared the mortgage on ${space.name} by paying ৳${amount} (principal plus ${player.role === "politician" ? "8%" : "10%"} interest).`, "money");
  return checkVictory(next);
}
export function sellProperty(state: GameState, sellerId: string, spaceId: string): GameState {
  if (state.phase === "game-over") throw new Error("The game has ended.");
  const seller = state.players.find((player) => player.id === sellerId);
  const current = getCurrentPlayer(state);
  const space = BOARD.find((item) => item.id === spaceId);
  const property = state.properties[spaceId];
  if (!seller || seller.id !== current.id || seller.controller !== "human" || !isHumanTurn(state)) {
    throw new Error("Only the human player may sell during their own turn.");
  }
  if (!space?.price || !property || property.ownerId !== sellerId) throw new Error("You can only sell property that you own.");
  if (property.leaseholderId) throw new Error("A property with an active lease cannot be sold.");
  if (property.mortgaged) throw new Error("A mortgaged property cannot be sold.");
  if (state.cooperativePropertyIds.includes(spaceId)) throw new Error("Cooperative property cannot be sold by an individual player.");
  const price = space.price;
  const politician = state.players.find((player) => player.role === "politician");
  if (seller.role === "citizen") {
    if (!politician || politician.bankrupt || politician.cash < price) {
      throw new Error("The Politician does not have enough cash to buy this property.");
    }
    const tax = Math.floor(price / 10);
    const proceeds = price - tax;
    let next: GameState = {
      ...state,
      players: state.players.map((player) => player.id === politician.id
        ? { ...player, cash: player.cash - price }
        : player.id === sellerId ? { ...player, cash: player.cash + proceeds } : player),
      publicFund: state.publicFund + tax,
      properties: { ...state.properties, [spaceId]: { ...property, ownerId: politician.id, mortgaged: false } },
    };
    next = recordFlow(recordFlow(next, sellerId, "in", "sale", proceeds), politician.id, "out", "sale", price);
    next = addEvent(next, `${seller.name} sold ${space.name} to the Politician for ৳${price}; ৳${tax} (10%) was paid to the public treasury and the seller received ৳${proceeds}.`, "money");
    return checkVictory(next);
  }
  const next: GameState = {
    ...state,
    players: state.players.map((player) => player.id === sellerId ? { ...player, cash: player.cash + price } : player),
    publicFund: state.publicFund - price,
    // Land returned to the market is cleared of buildings so the next buyer does not receive free development.
    properties: { ...state.properties, [spaceId]: { ...property, ownerId: null, mortgaged: false, houses: 0, hotel: false } },
  };
  return checkVictory(addEvent(recordFlow(next, sellerId, "in", "sale", price), `${seller.name} sold ${space.name} back to the government for ৳${price}; no sales tax was charged. The property is now unowned and any buildings were demolished.`, "money"));
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
    next = addEvent(next, `Round ${round}: ${next.players[nextIndex].name}'s turn.`);
    if (round !== state.round) next = recordCashSnapshot(next);
    return checkVictory(next);
  }
  return checkVictory(next);
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

export type MultiplayerAction =
  | { type: "roll" }
  | { type: "property"; action: PropertyAction }
  | { type: "build"; spaceId: string; building: BuildingAction }
  | { type: "mortgage"; spaceId: string }
  | { type: "redeem-mortgage"; spaceId: string }
  | { type: "sell-property"; spaceId: string }
  | { type: "contribute"; amount: number }
  | { type: "buy-cooperative-property" }
  | { type: "end-turn" };

/**
 * Applies one validated multiplayer command through the existing game engine.
 * Callers must authenticate the seat separately; this function enforces turn ownership.
 */
export function applyMultiplayerAction(
  state: GameState,
  playerId: string,
  action: MultiplayerAction,
  random: () => number = defaultRandom,
): GameState {
  if (state.phase === "game-over") throw new Error("The game has ended.");
  const current = getCurrentPlayer(state);
  if (current.id !== playerId) throw new Error("It is not this player's turn.");
  if (current.controller !== "human") throw new Error("This seat is not controlled by a human player.");
  switch (action.type) {
    case "roll":
      return rollAndMove(state, random);
    case "property":
      return resolvePropertyAction(state, action.action);
    case "build":
      return buildProperty(state, playerId, action.spaceId, action.building);
    case "mortgage":
      return mortgageProperty(state, playerId, action.spaceId);
    case "redeem-mortgage":
      return redeemMortgage(state, playerId, action.spaceId);
    case "sell-property":
      return sellProperty(state, playerId, action.spaceId);
    case "contribute":
      return contributeToCooperative(state, playerId, action.amount);
    case "buy-cooperative-property":
      return buyCooperativeProperty(state, playerId);
    case "end-turn":
      return endTurn(state);
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported multiplayer action: ${String(exhaustive)}`);
    }
  }
}
