import { BOARD } from "./board.js";
import type { GameState, Player, PropertyState } from "./types.js";
export type PropertyAction = "buy" | "lease" | "decline";
export interface LegalPropertyAction { type: PropertyAction; spaceId: string; cost: number; label: string; }
export function isPurchasable(spaceId: string): boolean {
  const space = BOARD.find((item) => item.id === spaceId);
  return Boolean(space && ["property", "railroad", "utility"].includes(space.type) && space.price !== undefined);
}
export function createPropertyLedger(): Record<string, PropertyState> {
  return Object.fromEntries(BOARD.filter((space) => isPurchasable(space.id)).map((space) => [space.id, {
    spaceId: space.id, ownerId: null, leaseholderId: null, leaseExpiresAtGoPass: null, mortgaged: false,
  }]));
}
export function getLegalPropertyActions(state: GameState, player: Player): LegalPropertyAction[] {
  const space = BOARD[player.position] ?? BOARD[0];
  if (!isPurchasable(space.id) || state.pendingPropertyId !== space.id) return [];
  const property = state.properties[space.id];
  if (!property || property.ownerId || property.leaseholderId || !space.price) return [{ type: "decline", spaceId: space.id, cost: 0, label: "Continue" }];
  const actions: LegalPropertyAction[] = [{ type: "decline", spaceId: space.id, cost: 0, label: "Decline" }];
  if (player.cash >= space.price) actions.unshift({ type: "buy", spaceId: space.id, cost: space.price, label: "Buy" });
  const leaseCost = Math.floor(space.price / 2);
  if (player.cash >= leaseCost) actions.unshift({ type: "lease", spaceId: space.id, cost: leaseCost, label: "Lease" });
  return actions;
}
export function getBaseRent(spaceId: string): number {
  const space = BOARD.find((item) => item.id === spaceId);
  if (!space?.price) return 0;
  if (space.type === "railroad") return 50;
  if (space.type === "utility") return 0;
  return Math.max(10, Math.ceil(space.price / 10));
}
export function countRailroads(state: GameState, playerId: string): number {
  return Object.values(state.properties).filter((p) => p.ownerId === playerId || p.leaseholderId === playerId)
    .filter((p) => BOARD.find((s) => s.id === p.spaceId)?.type === "railroad").length;
}
