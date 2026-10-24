import { describe, expect, it } from "vitest";
import { BOARD } from "../../src/game/board";
import { createNewGame, getMortgageTerms, movePlayer, sellProperty } from "../../src/game/engine";
import { runAiTurn } from "../../src/game/turns";
import type { GameState } from "../../src/game/types";

const patchPlayer = (state: GameState, id: string, patch: Partial<GameState["players"][number]>): GameState =>
  ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

/** Small deterministic PRNG so simulations are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("AI turn stability", () => {
  it("does not throw when an AI Citizen goes bankrupt on its own roll while the cooperative fund is funded", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = { ...patchPlayer(state, "player-2", { position: 3, cash: 5 }), currentPlayerIndex: 1, cooperativeFund: 1_000 };
    const next = runAiTurn(state, () => 0);
    expect(next.players[1].bankrupt).toBe(true);
    expect(next.charterVotes).not.toContain("player-2");
  });

  it("finishes 200 seeded all-AI games without exceptions, stalls, negative or fractional cash", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = mulberry32(seed);
      let state = createNewGame({ humanRole: seed % 2 ? "politician" : "citizen" });
      state = { ...state, players: state.players.map((p) => ({ ...p, controller: "ai" as const })) };
      let turns = 0;
      while (state.phase !== "game-over" && turns < 3_000) {
        state = runAiTurn(state, random);
        turns += 1;
        for (const p of state.players) {
          expect(Number.isInteger(p.cash) && p.cash >= 0, `seed ${seed} turn ${turns}: ${p.id} cash ${p.cash}`).toBe(true);
        }
      }
      expect(state.phase, `seed ${seed} did not finish within 3000 turns`).toBe("game-over");
      expect(state.winner).not.toBeNull();
    }
  });
});

describe("card money direction", () => {
  const drawChanceAsPolitician = (index: number) => {
    let state = createNewGame({ humanRole: "politician" });
    state = { ...patchPlayer(state, "player-1", { position: 6 }), cardDrawCounts: { community: 0, chance: index } };
    const before = state.players[0].cash;
    return { before, after: movePlayer(state, "player-1", 1) };
  };

  it("makes the Politician pay ৳25 for Investigation Notice (CH-02)", () => {
    const { before, after } = drawChanceAsPolitician(1);
    expect(after.players[0].cash).toBe(before - 25);
  });

  it("makes the Politician pay ৳25 for Court Date (CH-12)", () => {
    const { before, after } = drawChanceAsPolitician(11);
    expect(after.players[0].cash).toBe(before - 25);
  });

  it("lets a Citizen contribute ৳100 to avoid losing a turn on Community Service (CH-11)", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = { ...patchPlayer(state, "player-2", { position: 6 }), currentPlayerIndex: 1, cardDrawCounts: { community: 0, chance: 10 } };
    const next = movePlayer(state, "player-2", 1);
    expect(next.players[1].cash).toBe(1_400);
    expect(next.publicFund).toBe(100);
    expect(next.players[1].skipTurns).toBe(0);
  });

  it("makes a Citizen lose the next turn on Community Service (CH-11) when unable to contribute", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = { ...patchPlayer(state, "player-2", { position: 6, cash: 60 }), currentPlayerIndex: 1, cardDrawCounts: { community: 0, chance: 10 } };
    const next = movePlayer(state, "player-2", 1);
    expect(next.players[1].cash).toBe(60);
    expect(next.players[1].skipTurns).toBe(1);
  });
});

describe("fund accounting", () => {
  it("keeps auto-mortgage processing fees in the public treasury when paying cooperative rent", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...patchPlayer(state, "player-2", { position: 0, cash: 0 }),
      currentPlayerIndex: 1,
      cooperativePropertyIds: ["old-dhaka"],
      properties: { ...state.properties, lalbagh: { ...state.properties.lalbagh, ownerId: "player-2" } },
    };
    const next = movePlayer(state, "player-2", 1);
    expect(next.cooperativeFund).toBe(10);
    expect(next.publicFund).toBe(1);
  });

  it("stops moving money once a card payment has ended the game", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = patchPlayer(patchPlayer(patchPlayer(state, "player-1", { position: 1 }), "player-2", { cash: 0 }), "player-3", { cash: 0 });
    state = { ...patchPlayer(state, "player-4", { cash: 150 }), cardDrawCounts: { community: 5, chance: 0 } };
    const next = movePlayer(state, "player-1", 1); // CC-06: Politician collects ৳100 from each Citizen
    expect(next.phase).toBe("game-over");
    expect(next.winner).toBe("politician");
    expect(next.players[3].cash).toBe(150);
  });
});

describe("mortgage and sale arithmetic", () => {
  it("uses exact integer rounding for every priced space and both roles", () => {
    for (const space of BOARD.filter((s) => s.price !== undefined)) {
      const price = space.price as number;
      const citizen = getMortgageTerms("citizen", price);
      const gross = Math.floor(price / 2);
      expect(citizen.grossAdvance).toBe(gross);
      expect(citizen.processingFee).toBe(Math.floor((gross * 5) / 100));
      expect(citizen.redemptionAmount).toBe(Math.ceil((gross * 110) / 100));
      const politician = getMortgageTerms("politician", price);
      expect(politician.processingFee).toBe(0);
      expect(politician.netAdvance).toBe(price);
      expect(politician.redemptionAmount).toBe(Math.ceil((price * 108) / 100));
    }
  });

  it("charges a Citizen exactly 110% of principal to clear a ৳200 property mortgage", () => {
    expect(getMortgageTerms("citizen", 200).redemptionAmount).toBe(110);
    expect(getMortgageTerms("citizen", 100).redemptionAmount).toBe(55);
  });

  it("demolishes buildings when the Politician sells a property back to the government", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = { ...state, properties: { ...state.properties, lalbagh: { ...state.properties.lalbagh, ownerId: "player-1", houses: 2 } } };
    state = sellProperty(state, "player-1", "lalbagh");
    expect(state.properties.lalbagh.ownerId).toBeNull();
    expect(state.properties.lalbagh.houses ?? 0).toBe(0);
    expect(state.properties.lalbagh.hotel ?? false).toBe(false);
  });
});
