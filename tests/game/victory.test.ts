import { describe, expect, it } from "vitest";
import { createNewGame, endTurn, movePlayer, rollAndMove, sellProperty, resolvePropertyAction } from "../../src/game/engine";
import { runAiTurn } from "../../src/game/turns";
import type { GameState } from "../../src/game/types";

const patch = (state: GameState, id: string, change: Partial<GameState["players"][number]>): GameState =>
  ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
/** Places `id` on Income Tax's doorstep (position 3 → 4) with the given cash, so the next 1-step move bills them. */
const bill = (state: GameState, id: string, cash: number, index: number): GameState =>
  ({ ...patch(state, id, { position: 3, cash }), currentPlayerIndex: index });

describe("last player standing", () => {
  it("does not end the game when the Politician owns seven properties or reaches ৳8,000 of wealth", () => {
    let state = createNewGame({ humanRole: "politician" });
    const ids = Object.keys(state.properties).slice(0, 8);
    state = {
      ...patch(state, "player-1", { cash: 7_900, position: 38 }),
      properties: Object.fromEntries(Object.entries(state.properties).map(([id, property]) => [id, ids.includes(id) ? { ...property, ownerId: "player-1" } : property])),
    };
    state = movePlayer(state, "player-1", 3);
    expect(state.phase).not.toBe("game-over");
    expect(state.winner).toBeNull();
  });

  it("does not end the game when one Citizen goes bankrupt", () => {
    let state = bill(createNewGame({ humanRole: "politician" }), "player-2", 5, 1);
    state = movePlayer(state, "player-2", 1);
    expect(state.players[1].bankrupt).toBe(true);
    expect(state.phase).not.toBe("game-over");
  });

  it("does not end the game when two Citizens go bankrupt but the Politician and a Citizen remain", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = patch(patch(state, "player-3", { bankrupt: true, active: false, cash: 0 }), "player-4", { bankrupt: true, active: false, cash: 0 });
    state = bill(state, "player-2", 5, 1);
    state = { ...state, players: state.players.map((p) => p.id === "player-2" ? { ...p, bankrupt: false } : p) };
    expect(state.phase).toBe("awaiting-roll");
    state = movePlayer({ ...state, phase: "awaiting-roll" }, "player-2", 1);
    // The Citizen just went bankrupt, leaving only the Politician.
    expect(state.phase).toBe("game-over");
    expect(state.winner).toBe("player-1");
  });

  it("does not end the game when the Politician goes bankrupt while two or more others remain", () => {
    let state = bill(createNewGame({ humanRole: "citizen" }), "player-1", 0, 0);
    state = movePlayer(state, "player-1", 1);
    expect(state.players[0].bankrupt).toBe(true);
    expect(state.phase).not.toBe("game-over");
    expect(state.winner).toBeNull();
  });

  it("lets a Citizen win when the Politician and the other two Citizens are bankrupt", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = patch(patch(state, "player-1", { bankrupt: true, active: false, cash: 0 }), "player-3", { bankrupt: true, active: false, cash: 0 });
    state = bill(state, "player-4", 5, 3);
    state = patch(state, "player-2", { cash: 1_500 });
    state = movePlayer(state, "player-4", 1);
    expect(state.players[3].bankrupt).toBe(true);
    expect(state.phase).toBe("game-over");
    expect(state.winner).toBe("player-2");
    expect(state.events.some((event) => /last player standing/.test(event.message))).toBe(true);
  });

  it("returns a bankrupt Politician's land to the market when the creditor is the public treasury", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, properties: { ...state.properties, lalbagh: { ...state.properties.lalbagh, ownerId: "player-1", houses: 2 } } };
    state = bill(state, "player-1", 0, 0);
    state = { ...state, properties: { ...state.properties, lalbagh: { ...state.properties.lalbagh, mortgaged: true } } };
    state = movePlayer(state, "player-1", 1); // Income Tax ৳50, no unmortgaged assets left to cover it
    expect(state.players[0].bankrupt).toBe(true);
    expect(state.properties.lalbagh.ownerId).toBeNull();
    expect(state.properties.lalbagh.houses ?? 0).toBe(0);
  });

  it("returns a bankrupt Citizen's land to the market when the creditor is the public treasury", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, properties: { ...state.properties, lalbagh: { ...state.properties.lalbagh, ownerId: "player-3", mortgaged: true } } };
    state = movePlayer(bill(state, "player-3", 0, 2), "player-3", 1);
    expect(state.players[2].bankrupt).toBe(true);
    expect(state.properties.lalbagh.ownerId).toBeNull();
  });

  it("passes a bankrupt Citizen's land to the solvent player who was owed the rent", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...state,
      properties: { ...state.properties,
        "old-dhaka": { ...state.properties["old-dhaka"], ownerId: "player-2" },
        lalbagh: { ...state.properties.lalbagh, ownerId: "player-4", mortgaged: true } },
    };
    // player-4 (no cash, only a mortgaged property) steps onto player-2's Purono Dhaka and cannot pay the ৳10 rent.
    state = movePlayer({ ...patch(state, "player-4", { position: 0, cash: 0 }), currentPlayerIndex: 3 }, "player-4", 1);
    expect(state.players[3].bankrupt).toBe(true);
    expect(state.properties.lalbagh.ownerId).toBe("player-2");
  });

  it("skips bankrupt players in turn order and never hands them a turn", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = patch(state, "player-2", { bankrupt: true, active: false, cash: 0 });
    state = rollAndMove(state, () => 0);
    if (state.pendingPropertyId) state = resolvePropertyAction(state, "decline");
    state = endTurn(state);
    expect(state.currentPlayerIndex).toBe(2);
  });

  it("is terminal: no rolls, sales or turn changes after a winner is declared", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = patch(patch(state, "player-1", { bankrupt: true, active: false, cash: 0 }), "player-3", { bankrupt: true, active: false, cash: 0 });
    state = movePlayer(bill(state, "player-4", 5, 3), "player-4", 1);
    expect(state.phase).toBe("game-over");
    const frozen = JSON.stringify(state);
    expect(() => rollAndMove(state, () => 0)).toThrow();
    expect(() => endTurn(state)).toThrow();
    expect(() => sellProperty(state, "player-2", "lalbagh")).toThrow();
    expect(runAiTurn(state, () => 0)).toBe(state);
    expect(JSON.stringify(state)).toBe(frozen);
  });
});
