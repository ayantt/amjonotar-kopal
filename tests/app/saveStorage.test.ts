import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNewGame } from "../../src/game/engine";
import { clearSavedGame, loadSavedGame, writeSavedGame } from "../../src/app/saveStorage";

const GAME_ID = "0123456789abcdef0123456789abcdef";
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  return data;
}

describe("save storage", () => {
  let data: Map<string, string>;
  beforeEach(() => { data = stubStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns nothing when no game is saved", () => {
    expect(loadSavedGame()).toBeNull();
  });

  it("saves and restores an unfinished game with its analytics id", () => {
    const game = createNewGame({ humanRole: "politician" });
    writeSavedGame(game, GAME_ID);
    const restored = loadSavedGame();
    expect(restored?.game).toEqual(game);
    expect(restored?.gameId).toBe(GAME_ID);
  });

  it("clears the save when a game finishes", () => {
    const game = createNewGame({ humanRole: "citizen" });
    writeSavedGame(game, GAME_ID);
    writeSavedGame({ ...game, phase: "game-over", winner: "player-1" }, GAME_ID);
    expect(data.size).toBe(0);
    expect(loadSavedGame()).toBeNull();
  });

  it("removes a corrupt save so it is not retried forever", () => {
    data.set("amjonotar-kopal-save-v1", "{broken");
    expect(loadSavedGame()).toBeNull();
    expect(data.size).toBe(0);
  });

  it("clears on request", () => {
    writeSavedGame(createNewGame({ humanRole: "citizen" }), null);
    clearSavedGame();
    expect(loadSavedGame()).toBeNull();
  });

  it("never throws when storage is blocked or full", () => {
    const boom = () => { throw new Error("blocked"); };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => writeSavedGame(createNewGame({ humanRole: "citizen" }), null)).not.toThrow();
    expect(loadSavedGame()).toBeNull();
    expect(() => clearSavedGame()).not.toThrow();
  });
});
