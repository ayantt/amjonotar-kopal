import type { BoardSpace } from "./board";
export type PlayerRole = "politician" | "citizen";
export type Controller = "human" | "ai";
export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  controller: Controller;
  cash: number;
  position: number;
  active: boolean;
  lastRoll: number[];
}
export type GamePhase = "role-selection" | "awaiting-roll" | "game-over";
export interface GameEvent {
  id: number;
  message: string;
  kind: "system" | "movement" | "money" | "ai";
}
export interface GameState {
  schemaVersion: 1;
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  publicFund: number;
  cooperativeFund: number;
  events: GameEvent[];
  nextEventId: number;
  round: number;
  winner: string | null;
}
export interface NewGameOptions { humanRole: PlayerRole; random?: () => number; }
export type DiceRoller = (count: number, random: () => number) => number[];
export type SpaceResolver = (space: BoardSpace, player: Player, state: GameState) => GameState;
