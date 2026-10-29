import { describe, expect, it } from "vitest";
import { BOARD } from "../../src/game/board";
import { createNewGame, forfeitPlayer, movePlayer } from "../../src/game/engine";
import type { GameState } from "../../src/game/types";

const landOn = (spaceId: string, from = 0): GameState => {
  const state = createNewGame({ humanRole: "citizen" });
  const target = BOARD.findIndex((space) => space.id === spaceId);
  const start = from % 40;
  const placed = { ...state, players: state.players.map((p, i) => i === 0 ? { ...p, position: start } : p) };
  return movePlayer(placed, "player-1", (target - start + 40) % 40 || 40);
};
const keys = (state: GameState) => state.events.map((event) => event.key).filter(Boolean);

describe("event keys for event-specific media", () => {
  it("labels the first landing event with the space it happened on", () => {
    for (const id of ["income-tax", "luxury-tax", "go-to-jail", "free-parking"]) {
      expect(keys(landOn(id)), id).toContain(`space:${id}`);
    }
  });
  it("labels the Income Tax event so media can be attached to exactly that space", () => {
    const state = landOn("income-tax");
    const event = state.events.find((entry) => entry.key === "space:income-tax");
    expect(event?.message).toMatch(/tax/i);
  });
  it("labels card draws with the card id (a more specific key than the space)", () => {
    for (const id of ["chance-1", "cc-1"]) expect(keys(landOn(id)).some((key) => String(key).startsWith("card:")), id).toBe(true);
  });
  it("labels passing Go", () => {
    expect(keys(landOn("income-tax", 38))).toContain("pass-go");
  });
  it("labels forfeits and the game ending", () => {
    const state = createNewGame({ humanRole: "citizen" });
    const out = forfeitPlayer(forfeitPlayer(forfeitPlayer(state, "player-2"), "player-3"), "player-4");
    expect(keys(out)).toContain("forfeit");
    expect(keys(out)).toContain("game-over");
  });
  it("never adds a key to ordinary log lines such as dice rolls", () => {
    const state = landOn("income-tax");
    expect(state.events.filter((event) => /rolled/.test(event.message) && event.key)).toEqual([]);
  });
  it("records the role of the player each keyed event is about", () => {
    const citizen = landOn("income-tax");
    expect(citizen.events.find((e) => e.key === "space:income-tax")?.role).toBe(citizen.players[0].role);
    const politician = createNewGame({ humanRole: "politician" });
    const index = politician.players.findIndex((p) => p.role === "politician");
    const moved = movePlayer({ ...politician, players: politician.players.map((p, i) => i === index ? { ...p, position: 0 } : p) }, politician.players[index].id, 4);
    expect(moved.events.find((e) => e.key === "space:income-tax")?.role).toBe("politician");
  });
  it("labels forfeits and the winner with their roles", () => {
    const state = createNewGame({ humanRole: "citizen" });
    const out = forfeitPlayer(forfeitPlayer(forfeitPlayer(state, "player-2"), "player-3"), "player-4");
    expect(out.events.find((e) => e.key === "forfeit")?.role).toBeDefined();
    expect(out.events.find((e) => e.key === "game-over")?.role).toBe(out.players.find((p) => p.id === out.winner)?.role);
  });
});
