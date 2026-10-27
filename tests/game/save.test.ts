import { describe, expect, it } from "vitest";
import { createNewGame, endTurn, rollAndMove } from "../../src/game/engine";
import { isValidSavedGame, parseSave, SAVE_VERSION, serializeSave } from "../../src/game/save";
import { seededRandom } from "../../src/game/simulate";
import { playOnBehalf, runAiTurn } from "../../src/game/turns";
import type { GameState } from "../../src/game/types";

const GAME_ID = "0123456789abcdef0123456789abcdef";
const fresh = () => createNewGame({ humanRole: "citizen" });
/** A mid-game state: the human has rolled, and the AIs have played a few turns. */
function midGame(): GameState {
  const random = seededRandom(42);
  let state = fresh();
  for (let i = 0; i < 25 && state.phase !== "game-over"; i += 1) {
    if (state.players[state.currentPlayerIndex].controller === "ai") state = runAiTurn(state, random);
    else { state = rollAndMove(state, random); if (!state.pendingPropertyId) state = endTurn(state); else break; }
  }
  return state;
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const mutate = (mutator: (game: Record<string, any>) => void) => {
  const game = clone(midGame()) as unknown as Record<string, any>;
  mutator(game);
  return game;
};

describe("saved games", () => {
  it("round-trips a new game and a mid-game state exactly", () => {
    for (const game of [fresh(), midGame()]) {
      const parsed = parseSave(serializeSave(game, GAME_ID, new Date("2026-10-27T10:00:00Z")));
      expect(parsed).not.toBeNull();
      expect(parsed?.game).toEqual(game);
      expect(parsed?.gameId).toBe(GAME_ID);
      expect(parsed?.version).toBe(SAVE_VERSION);
    }
  });

  it("accepts a save without an analytics id", () => {
    expect(parseSave(serializeSave(fresh(), null))?.gameId).toBeNull();
  });

  it("resumes play: a restored game keeps playing legally to the end", () => {
    const restored = parseSave(serializeSave(midGame(), GAME_ID))?.game as GameState;
    const random = seededRandom(7);
    // Finish the half-played turn the save was taken in, then let every seat play on until someone wins.
    let state = restored.phase === "awaiting-end-turn" ? playOnBehalf(restored, random) : restored;
    state = { ...state, players: state.players.map((p) => ({ ...p, controller: "ai" as const })) };
    let turns = 0;
    while (state.phase !== "game-over" && turns < 4000) { state = runAiTurn(state, random); turns += 1; }
    expect(state.phase).toBe("game-over");
  });

  it.each([null, "", "not json", "{}", "[]", "null", "42", '{"version":1}'])("rejects unusable input %j", (raw) => {
    expect(parseSave(raw)).toBeNull();
  });

  it("rejects saves from another version or with a bad timestamp or analytics id", () => {
    const good = JSON.parse(serializeSave(fresh(), GAME_ID)) as Record<string, unknown>;
    expect(parseSave(JSON.stringify({ ...good, version: SAVE_VERSION + 1 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...good, savedAt: "yesterday" }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...good, gameId: "short" }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...good, gameId: "../../etc/passwd/................" }))).toBeNull();
  });

  it("rejects oversized input without parsing it", () => {
    expect(parseSave("x".repeat(2_000_001))).toBeNull();
  });

  it.each([
    ["a finished game", (g: Record<string, any>) => { g.phase = "game-over"; g.winner = "player-1"; }],
    ["an unknown phase", (g) => { g.phase = "role-selection"; }],
    ["three players", (g) => { g.players.pop(); }],
    ["duplicate player ids", (g) => { g.players[1].id = g.players[0].id; }],
    ["two politicians", (g) => { g.players[2].role = "politician"; }],
    ["negative cash", (g) => { g.players[0].cash = -1; }],
    ["fractional cash", (g) => { g.players[0].cash = 10.5; }],
    ["huge cash", (g) => { g.players[0].cash = 1e12; }],
    ["a position off the board", (g) => { g.players[0].position = 40; }],
    ["an invalid dice value", (g) => { g.players[0].lastRoll = [7]; }],
    ["a current player who is bankrupt", (g) => { g.players[g.currentPlayerIndex].bankrupt = true; }],
    ["a current player index out of range", (g) => { g.currentPlayerIndex = 4; }],
    ["a missing property", (g) => { delete g.properties[Object.keys(g.properties)[0]]; }],
    ["an owner who is not a player", (g) => { g.properties[Object.keys(g.properties)[0]].ownerId = "ghost"; }],
    ["too many houses", (g) => { g.properties[Object.keys(g.properties)[0]].houses = 9; }],
    ["an unknown pending property", (g) => { g.pendingPropertyId = "nowhere"; }],
    ["a negative public fund", (g) => { g.publicFund = -5; }],
    ["a non-array event list", (g) => { g.events = "none"; }],
    ["an event with an unknown kind", (g) => { g.events = [{ id: 1, message: "x", kind: "script" }]; }],
    ["an oversized event message", (g) => { g.events = [{ id: 1, message: "x".repeat(700), kind: "system" }]; }],
    ["round zero", (g) => { g.round = 0; }],
  ])("rejects a saved game with %s", (_name, mutator) => {
    const game = mutate(mutator);
    expect(isValidSavedGame(game)).toBe(false);
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: new Date().toISOString(), gameId: null, game }))).toBeNull();
  });

  it("keeps well-formed analytics counters and drops malformed ones instead of rejecting the save", () => {
    const keep = parseSave(serializeSave(midGame(), GAME_ID))?.game;
    expect(keep?.stats).toBeDefined();
    const damaged = mutate((g) => { g.stats = { flow: 7 }; });
    const parsed = parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: new Date().toISOString(), gameId: null, game: damaged }));
    expect(parsed).not.toBeNull();
    expect(parsed?.game.stats).toBeUndefined();
  });

  it("accepts older saves that predate analytics counters", () => {
    const legacy = mutate((g) => { delete g.stats; });
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: new Date().toISOString(), gameId: null, game: legacy }))?.game.stats).toBeUndefined();
  });
});
