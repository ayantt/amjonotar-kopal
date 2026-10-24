import { BOARD, BOARD_SPACE_COUNT } from "./board";
import { GAME_RULES } from "./rules";
import type { Controller, GameEvent, GameState, NewGameOptions, Player, PlayerRole } from "./types";

const defaultRandom = () => Math.random();
function addEvent(state: GameState, message: string, kind: GameEvent["kind"] = "system"): GameState {
  return { ...state, nextEventId: state.nextEventId + 1, events: [...state.events, { id: state.nextEventId, message, kind }].slice(-100) };
}
function makePlayer(id: string, name: string, role: PlayerRole, controller: Controller): Player {
  return { id, name, role, controller, cash: role === "politician" ? GAME_RULES.politicianStartingCash : GAME_RULES.citizenStartingCash, position: 0, active: true, lastRoll: [] };
}
export function createNewGame({ humanRole, random = defaultRandom }: NewGameOptions): GameState {
  const roles: PlayerRole[] = humanRole === "politician"
    ? ["politician", "citizen", "citizen", "citizen"]
    : ["politician", "citizen", "citizen", "citizen"];
  const humanIndex = humanRole === "politician" ? 0 : 1;
  const names = ["The Honourable Leader", "Asha", "Rafi", "Mina"];
  const players = roles.map((role, index) => makePlayer(
    `player-${index + 1}`,
    index === humanIndex ? "You" : (role === "politician" ? "The Honourable Leader" : names[index]),
    role,
    index === humanIndex ? "human" : "ai",
  ));
  // Keep the Politician in seat one; if the human chooses Citizen, that seat is AI-controlled.
  const initial: GameState = { schemaVersion: 1, phase: "awaiting-roll", players, currentPlayerIndex: 0, publicFund: 0, cooperativeFund: 0, events: [], nextEventId: 1, round: 1, winner: null };
  const state = addEvent(initial, `Game started. You play as ${humanRole === "politician" ? "Politician" : "Citizen"}; three opponents are computer-controlled.`);
  return addEvent(state, `The board has ${BOARD_SPACE_COUNT} spaces. All players begin at Shurur Line.`);
}
export function rollDice(count: number, random: () => number = defaultRandom): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Dice count must be a positive integer.");
  return Array.from({ length: count }, () => Math.floor(random() * 6) + 1);
}
export function getDiceCount(player: Player): number {
  return player.role === "politician" ? GAME_RULES.politicianDiceCount : GAME_RULES.citizenDiceCount;
}
export function movePlayer(state: GameState, playerId: string, steps: number): GameState {
  if (state.phase !== "awaiting-roll") throw new Error("The game is not waiting for a roll.");
  if (!Number.isInteger(steps) || steps < 0) throw new Error("Movement must be a non-negative integer.");
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error("Unknown player.");
  if (index !== state.currentPlayerIndex) throw new Error("Only the current player may move.");
  const player = state.players[index];
  const rawPosition = player.position + steps;
  const crossedGo = rawPosition >= BOARD_SPACE_COUNT;
  const exactGo = steps > 0 && rawPosition % BOARD_SPACE_COUNT === 0;
  const newPosition = rawPosition % BOARD_SPACE_COUNT;
  const reward = player.role === "politician" ? GAME_RULES.politicianGoReward : GAME_RULES.citizenGoReward;
  const exactBonus = player.role === "politician" ? GAME_RULES.politicianExactGoBonus : GAME_RULES.citizenExactGoBonus;
  const cashReward = (crossedGo ? reward : 0) + (exactGo ? exactBonus : 0);
  let next: GameState = {
    ...state,
    players: state.players.map((candidate, i) => i === index ? {
      ...candidate, position: newPosition, cash: candidate.cash + cashReward,
    } : candidate),
  };
  next = addEvent(next, `${player.name} moved ${steps} spaces to ${BOARD[newPosition].name}.`, "movement");
  if (crossedGo) next = addEvent(next, `${player.name} collected ৳${reward} for passing Shurur Line.`, "money");
  if (exactGo) next = addEvent(next, `${player.name} landed exactly on Shurur Line and received an extra ৳${exactBonus}.`, "money");
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
export function endTurn(state: GameState): GameState {
  if (state.phase !== "awaiting-roll") throw new Error("Cannot end turn in this phase.");
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const round = nextIndex === 0 ? state.round + 1 : state.round;
  return addEvent({ ...state, currentPlayerIndex: nextIndex, round }, `Round ${round}: ${state.players[nextIndex].name}'s turn.`);
}
export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}
export function isHumanTurn(state: GameState): boolean {
  return state.phase === "awaiting-roll" && getCurrentPlayer(state).controller === "human";
}
export function getSpaceForPlayer(player: Player) { return BOARD[player.position]; }
export function validateSetup(state: GameState): boolean {
  return state.players.length === 4 &&
    state.players.filter((p) => p.role === "politician").length === 1 &&
    state.players.filter((p) => p.role === "citizen").length === 3 &&
    state.players.filter((p) => p.controller === "human").length === 1 &&
    state.players.filter((p) => p.controller === "ai").length === 3;
}
