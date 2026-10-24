import { describe, expect, it } from "vitest";
import { BOARD_SPACE_COUNT } from "../../src/game/board";
import { createNewGame, endTurn, getDiceCount, movePlayer, rollDice, rollAndMove, validateSetup } from "../../src/game/engine";
import { runAiTurn } from "../../src/game/turns";

describe("game setup", () => {
  it("always creates one Politician, three Citizens, one human and three AI seats", () => {
    for (const humanRole of ["politician", "citizen"] as const) {
      const state = createNewGame({ humanRole });
      expect(validateSetup(state)).toBe(true);
      expect(state.players.filter((player) => player.role === "politician")).toHaveLength(1);
      expect(state.players.filter((player) => player.role === "citizen")).toHaveLength(3);
      expect(state.players.filter((player) => player.controller === "human")).toHaveLength(1);
      expect(state.players.filter((player) => player.controller === "ai")).toHaveLength(3);
    }
  });
  it("defines exactly 40 board spaces", () => expect(BOARD_SPACE_COUNT).toBe(40));
});

describe("dice and movement", () => {
  it("rolls two dice for the Politician and one for a Citizen", () => {
    const state = createNewGame({ humanRole: "politician" });
    expect(getDiceCount(state.players[0])).toBe(2);
    expect(getDiceCount(state.players[1])).toBe(1);
  });
  it("uses an injected random source for repeatable dice", () => {
    const samples = [0, 0.999, 0.5];
    expect(rollDice(3, () => samples.shift() ?? 0)).toEqual([1, 6, 4]);
  });
  it("moves forward and wraps around the 40-space board", () => {
    const state = createNewGame({ humanRole: "politician" });
    const nearEnd = { ...state, players: state.players.map((player, i) => i === 0 ? { ...player, position: 38 } : player) };
    const moved = movePlayer(nearEnd, "player-1", 4);
    expect(moved.players[0].position).toBe(2);
  });
  it("pays role-specific GO rewards when passing GO", () => {
    const state = createNewGame({ humanRole: "politician" });
    const nearEnd = { ...state, players: state.players.map((player, i) => i === 0 ? { ...player, position: 38 } : player) };
    const moved = movePlayer(nearEnd, "player-1", 4);
    expect(moved.players[0].cash).toBe(2_400);
  });
  it("pays the GO pass reward and exact-landing bonus when landing exactly on GO", () => {
    const state = createNewGame({ humanRole: "politician" });
    const nearEnd = { ...state, players: state.players.map((player, i) => i === 0 ? { ...player, position: 38 } : player) };
    const moved = movePlayer(nearEnd, "player-1", 2);
    expect(moved.players[0].position).toBe(0);
    expect(moved.players[0].cash).toBe(2_600);
  });
  it("rejects movement by the wrong player or a second roll in one turn", () => {
    const state = createNewGame({ humanRole: "politician" });
    expect(() => movePlayer(state, "player-2", 3)).toThrow(/current player/);
    const moved = rollAndMove(state, () => 0);
    expect(() => rollAndMove(moved, () => 0)).toThrow(/waiting for a roll/);
  });
  it("advances player order and increments the round after the fourth seat", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = rollAndMove(state, () => 0);
    state = endTurn(state);
    expect(state.currentPlayerIndex).toBe(1);
    state = runAiTurn(state, () => 0);
    expect(state.currentPlayerIndex).toBe(2);
    state = runAiTurn(state, () => 0);
    expect(state.currentPlayerIndex).toBe(3);
    state = runAiTurn(state, () => 0);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.round).toBe(2);
  });
});