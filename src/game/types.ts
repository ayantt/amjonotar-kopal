import type { BoardSpace } from "./board.js";
import type { GameStats } from "./stats.js";
export type PlayerRole = "politician" | "citizen";
export type Controller = "human" | "ai";
export interface Player {
  id: string; name: string; role: PlayerRole; controller: Controller;
  cash: number; position: number; active: boolean; lastRoll: number[];
  goPasses: number; bankrupt: boolean; skipTurns: number;
}
export interface PropertyState {
  spaceId: string;
  ownerId: string | null;
  leaseholderId: string | null;
  leaseExpiresAtGoPass: number | null;
  mortgaged: boolean;
  houses?: number;
  hotel?: boolean;
}
export type GamePhase = "role-selection" | "awaiting-roll" | "awaiting-end-turn" | "game-over";
/**
 * `key` is a stable, machine-readable name for what happened (for example `space:income-tax`, `card:cc-3`, `bankrupt`), used by the
 * UI to choose event-specific media. It is optional: older saved games and ordinary log lines have none.
 */
/** `role` is the role of the player the event is about (the one who landed, drew, bought, went bankrupt, won...). Presentation only. */
export interface GameEvent { id: number; message: string; kind: "system" | "movement" | "money" | "ai"; key?: string; role?: PlayerRole; }
export interface GameState {
  schemaVersion: 1; phase: GamePhase; players: Player[]; currentPlayerIndex: number;
  publicFund: number; cooperativeFund: number; properties: Record<string, PropertyState>;
  cooperativePropertyIds: string[];
  cardDrawCounts: { community: number; chance: number }; extraRollAvailable: boolean;
  pendingPropertyId: string | null; events: GameEvent[]; nextEventId: number;
  /** Analytics counters recorded by the engine; absent on games saved before they existed. */ stats?: GameStats;
  round: number; /** Player id of the last player standing; null while the game is running. */ winner: string | null;
}
export interface NewGameOptions { humanRole: PlayerRole; }
export type DiceRoller = (count: number, random: () => number) => number[];
export type SpaceResolver = (space: BoardSpace, player: Player, state: GameState) => GameState;
