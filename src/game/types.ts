/** Shared framework-independent domain types. */
export type PlayerRole = "politician" | "citizen";
export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  cash: number;
  position: number;
  active: boolean;
}
export type GamePhase = "setup" | "awaiting-roll" | "resolving" | "awaiting-action" | "debt-resolution" | "game-over";
export interface GameState {
  schemaVersion: 1;
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  publicFund: number;
  cooperativeFund: number;
}