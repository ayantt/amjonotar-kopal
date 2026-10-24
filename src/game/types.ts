import type { BoardSpace } from "./board";
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
export interface GameEvent { id: number; message: string; kind: "system" | "movement" | "money" | "ai"; }
export interface GameState {
  schemaVersion: 1; phase: GamePhase; players: Player[]; currentPlayerIndex: number;
  publicFund: number; cooperativeFund: number; properties: Record<string, PropertyState>;
  cooperativePropertyIds: string[]; charterVotes: string[]; charterPendingRound: number | null; charterActivated: boolean;
  cardDrawCounts: { community: number; chance: number }; extraRollAvailable: boolean;
  pendingPropertyId: string | null; events: GameEvent[]; nextEventId: number;
  round: number; winner: string | null;
}
export interface NewGameOptions { humanRole: PlayerRole; }
export type DiceRoller = (count: number, random: () => number) => number[];
export type SpaceResolver = (space: BoardSpace, player: Player, state: GameState) => GameState;
