import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanPlayerName, loadPlayerName, savePlayerName } from "../../src/app/playerName";

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  return data;
}

describe("player name storage", () => {
  beforeEach(() => { stubStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns an empty name when nothing is saved", () => {
    expect(loadPlayerName()).toBe("");
  });

  it("round-trips a name, cleaned the way the server cleans it", () => {
    savePlayerName("  Tasnif   Ahmed  ");
    expect(loadPlayerName()).toBe("Tasnif Ahmed");
    savePlayerName("x".repeat(40));
    expect(loadPlayerName()).toHaveLength(24);
  });

  it("keeps Bengali names intact", () => {
    savePlayerName("তাসনিফ");
    expect(loadPlayerName()).toBe("তাসনিফ");
  });

  it("clears the saved name when given an empty one", () => {
    savePlayerName("Rafi");
    savePlayerName("   ");
    expect(loadPlayerName()).toBe("");
  });

  it("never throws when storage is unavailable or blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(() => savePlayerName("Rafi")).not.toThrow();
    expect(loadPlayerName()).toBe("");
    vi.unstubAllGlobals();
    expect(loadPlayerName()).toBe("");
  });

  it("cleans names consistently", () => {
    expect(cleanPlayerName("\n a \t b ")).toBe("a b");
  });
});
