import { describe, expect, it } from "vitest";
import { BOARD_SPACE_COUNT } from "../../src/game/board";
import { applyMultiplayerAction, buyCooperativeProperty, contributeToCooperative, createMultiplayerGame, createNewGame, endTurn, getDiceCount, movePlayer, rollDice, rollAndMove, resolvePropertyAction, validateSetup, voteForCharter } from "../../src/game/engine";
import { runAiTurn } from "../../src/game/turns";
import { getLegalPropertyActions } from "../../src/game/properties";

describe("game setup", () => {
  it("supports two to six human multiplayer seats and randomly assigns exactly one Politician", () => {
    const twoPlayers = createMultiplayerGame(["Host", "Guest"], () => 0.99);
    expect(twoPlayers.players).toHaveLength(2);
    expect(twoPlayers.players.filter((player) => player.role === "politician").map((player) => player.name)).toEqual(["Guest"]);
    expect(twoPlayers.players.every((player) => player.controller === "human")).toBe(true);

    const sixPlayers = createMultiplayerGame(["A", "B", "C", "D", "E", "F"], () => 0);
    expect(sixPlayers.players).toHaveLength(6);
    expect(sixPlayers.players.filter((player) => player.role === "politician").map((player) => player.name)).toEqual(["A"]);
    expect(sixPlayers.players.filter((player) => player.role === "citizen")).toHaveLength(5);
  });

  it("rejects multiplayer games outside the two-to-six player range", () => {
    expect(() => createMultiplayerGame(["Solo"])).toThrow(/between two and six/);
    expect(() => createMultiplayerGame(["A", "B", "C", "D", "E", "F", "G"])).toThrow(/between two and six/);
  });

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

describe("multiplayer engine entry points", () => {
  it("creates four human-controlled seats with one Politician and three Citizens", () => {
    const state = createMultiplayerGame(["Host", "Amina", "Rafi", "Nila"]);
    expect(state.players.map((player) => player.name)).toEqual(["Host", "Amina", "Rafi", "Nila"]);
    expect(state.players.filter((player) => player.role === "politician")).toHaveLength(1);
    expect(state.players.filter((player) => player.role === "citizen")).toHaveLength(3);
    expect(state.players.every((player) => player.controller === "human")).toBe(true);
  });

  it("rejects commands from a seat that does not own the current turn", () => {
    const state = createMultiplayerGame(["Host", "Amina", "Rafi", "Nila"]);
    expect(() => applyMultiplayerAction(state, "player-2", { type: "roll" }, () => 0)).toThrow("It is not this player's turn.");
  });

  it("routes valid commands through the existing rules engine", () => {
    const state = createMultiplayerGame(["Host", "Amina", "Rafi", "Nila"], () => 0);
    const next = applyMultiplayerAction(state, "player-1", { type: "roll" }, () => 0);
    expect(next.players[0].lastRoll).toEqual([1, 1]);
    expect(next.events.some((event) => event.message.includes("rolled 1 + 1 = 2"))).toBe(true);
  });

  it("rejects commands after the game is over", () => {
    const state = { ...createMultiplayerGame(["Host", "Amina", "Rafi", "Nila"]), phase: "game-over" as const, winner: "citizens" };
    expect(() => applyMultiplayerAction(state, "player-1", { type: "roll" }, () => 0)).toThrow("The game has ended.");
  });
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
    // 38 + 3 lands on Purono Dhaka (a property, not a card), so only the GO reward applies.
    const moved = movePlayer(nearEnd, "player-1", 3);
    expect(moved.players[0].position).toBe(1);
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

describe("property actions and rent", () => {
  it("offers only affordable legal actions for an unclaimed property", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = movePlayer(state, "player-1", 1);
    expect(state.pendingPropertyId).toBe("old-dhaka");
    expect(getLegalPropertyActions(state, state.players[0]).map((action) => action.type)).toEqual(["lease", "buy", "decline"]);
  });
  it("charges rent to a visitor and transfers it to the property owner", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = movePlayer(state, "player-1", 1);
    state = resolvePropertyAction(state, "buy");
    state = endTurn(state);
    const ownerCash = state.players[0].cash;
    const visitorCash = state.players[1].cash;
    state = movePlayer(state, "player-2", 1);
    expect(state.players[0].cash).toBe(ownerCash + 10);
    expect(state.players[1].cash).toBe(visitorCash - 10);
    expect(state.pendingPropertyId).toBeNull();
  });
  it("leases at half price and gives Citizens a five-GO-pass term", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, currentPlayerIndex: 1, players: state.players.map((player, index) => index === 1 ? { ...player, position: 0 } : player) };
    state = movePlayer(state, "player-2", 1);
    state = resolvePropertyAction(state, "lease");
    expect(state.properties["old-dhaka"].leaseholderId).toBe("player-2");
    expect(state.properties["old-dhaka"].leaseExpiresAtGoPass).toBe(5);
    expect(state.players[1].cash).toBe(1_470);
  });
  it("expires a Citizen lease on the fifth GO pass", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...state,
      currentPlayerIndex: 1,
      players: state.players.map((player, index) => index === 1 ? { ...player, position: 39 } : player),
      properties: { ...state.properties, "old-dhaka": { ...state.properties["old-dhaka"], leaseholderId: "player-2", leaseExpiresAtGoPass: 1 } },
    };
    state = movePlayer(state, "player-2", 1);
    expect(state.players[1].goPasses).toBe(1);
    expect(state.properties["old-dhaka"].leaseholderId).toBeNull();
    expect(state.events.some((event) => event.message.includes("lease on Old Dhaka") || event.message.includes("lease on Purono Dhaka"))).toBe(true);
  });
  it("AI chooses an affordable property action and resolves it before ending its turn", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, players: state.players.map((player, index) => index === 0 ? { ...player, position: 39 } : player) };
    state = runAiTurn(state, () => 0);
    expect(state.properties["old-dhaka"].leaseholderId).toBe("player-1");
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.pendingPropertyId).toBeNull();
  });
});

describe("card effects and debt resolution", () => {
  it("resolves the first Community card according to the current role", () => {
    let state = createNewGame({ humanRole: "politician" });
    const before = state.players[0].cash;
    state = movePlayer(state, "player-1", 2);
    expect(state.cardDrawCounts.community).toBe(1);
    expect(state.players[0].cash).toBe(before + 250);
    expect(state.events.some((event) => event.message.includes("CC-01: Government Allowance"))).toBe(true);
  });

  it("never allows negative cash and declares bankruptcy after available funds are exhausted", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...state,
      currentPlayerIndex: 1,
      players: state.players.map((player, index) => index === 1 ? { ...player, position: 3, cash: 5 } : player),
    };
    state = movePlayer(state, "player-2", 1);
    expect(state.players[1].cash).toBe(0);
    expect(state.players[1].bankrupt).toBe(true);
    expect(state.players[1].active).toBe(false);
    expect(state.events.some((event) => event.message.includes("went bankrupt"))).toBe(true);
  });

  it("automatically mortgages owned property before a Citizen goes bankrupt", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...state,
      currentPlayerIndex: 1,
      properties: { ...state.properties, "old-dhaka": { ...state.properties["old-dhaka"], ownerId: "player-2" } },
      players: state.players.map((player, index) => index === 1 ? { ...player, position: 3, cash: 0 } : player),
    };
    // Income Tax (৳100) exceeds the ৳29 net advance on a ৳60 property, so the Citizen cannot cover it.
    state = movePlayer(state, "player-2", 1);
    expect(state.events.some((event) => event.message.includes("mortgaged Purono Dhaka"))).toBe(true);
    expect(state.players[1].bankrupt).toBe(true);
    expect(state.properties["old-dhaka"].ownerId).toBe("player-1");
    expect(state.players.every((player) => player.cash >= 0)).toBe(true);
  });

  it("lets the Politician cover a small bill with a full-price mortgage and stay solvent", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = movePlayer(state, "player-1", 1);
    state = resolvePropertyAction(state, "buy");
    state = {
      ...state,
      phase: "awaiting-roll",
      currentPlayerIndex: 0,
      players: state.players.map((player, index) => index === 0 ? { ...player, position: 3, cash: 0 } : player),
    };
    // Income Tax is ৳50 for the Politician; the ৳60 full-price advance covers it, leaving ৳10.
    state = movePlayer(state, "player-1", 1);
    expect(state.events.some((event) => event.message.includes("mortgaged Purono Dhaka"))).toBe(true);
    expect(state.properties["old-dhaka"].mortgaged).toBe(true);
    expect(state.players[0].bankrupt).toBe(false);
    expect(state.players[0].cash).toBe(10);
    expect(state.publicFund).toBe(50);
  });
});

describe("role-specific card costs and card inventory", () => {
  it("contains sixteen cards in each deck", async () => {
    const { CARD_DECKS } = await import("../../src/game/cards");
    expect(CARD_DECKS.community).toHaveLength(16);
    expect(CARD_DECKS.chance).toHaveLength(16);
  });

  it("applies the Citizen processing fee instead of treating it as income", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...state,
      currentPlayerIndex: 1,
      players: state.players.map((player, index) => index === 1 ? { ...player, position: 1 } : player),
    };
    const before = state.players[1].cash;
    state = movePlayer(state, "player-2", 1);
    expect(state.players[1].cash).toBe(before + 80);
  });
});

describe("turn-changing card effects", () => {
  it("marks a Citizen to skip a future turn after Investigation Notice", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = {
      ...state,
      currentPlayerIndex: 1,
      cardDrawCounts: { community: 0, chance: 1 },
      players: state.players.map((player, index) => index === 1 ? { ...player, position: 6 } : player),
    };
    state = movePlayer(state, "player-2", 1);
    expect(state.players[1].skipTurns).toBe(1);
  });

  it("grants the Politician an extra roll from Public Holiday", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = {
      ...state,
      cardDrawCounts: { community: 0, chance: 5 },
      players: state.players.map((player, index) => index === 0 ? { ...player, position: 6 } : player),
    };
    state = movePlayer(state, "player-1", 1);
    expect(state.extraRollAvailable).toBe(true);
    state = endTurn(state);
    expect(state.phase).toBe("awaiting-roll");
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.extraRollAvailable).toBe(false);
  });
});

describe("cooperative economy and victory", () => {
  it("moves a Citizen contribution into the separate cooperative fund", () => {
    const initial = createNewGame({ humanRole: "citizen" });
    const state = { ...initial, currentPlayerIndex: 1 };
    const citizen = state.players[1];
    const next = contributeToCooperative(state, citizen.id, 100);
    expect(next.players[1].cash).toBe(citizen.cash - 100);
    expect(next.cooperativeFund).toBe(100);
    expect(next.publicFund).toBe(0);
  });

  it("requires a majority and a thousand taka before the Charter is pending", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, currentPlayerIndex: 1, cooperativeFund: 1_000 };
    state = voteForCharter(state, "player-2");
    expect(state.charterPendingRound).toBeNull();
    state = { ...state, currentPlayerIndex: 2 };
    state = voteForCharter(state, "player-3");
    expect(state.charterPendingRound).toBe(1);
    expect(state.charterVotes).toHaveLength(2);
  });

  it("allows Citizens to buy an unclaimed property from the cooperative fund", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, phase: "awaiting-end-turn", currentPlayerIndex: 1, pendingPropertyId: "old-dhaka", cooperativeFund: 500 };
    state = buyCooperativeProperty(state, "player-2");
    expect(state.cooperativePropertyIds).toContain("old-dhaka");
    expect(state.cooperativeFund).toBe(440);
    expect(state.pendingPropertyId).toBeNull();
  });

  it("requires all three Citizens and the fund/property/cash thresholds for a joint victory", () => {
    let state = createNewGame({ humanRole: "citizen" });
    const citizenIds = ["player-2", "player-3", "player-4"];
    const propertyIds = Object.keys(state.properties).slice(0, 8);
    state = {
      ...state,
      phase: "awaiting-end-turn",
      currentPlayerIndex: 3,
      cooperativeFund: 1_000,
      charterVotes: ["player-2", "player-3"],
      charterPendingRound: 1,
      properties: Object.fromEntries(Object.entries(state.properties).map(([id, property], index) => [id, propertyIds.includes(id) ? { ...property, ownerId: citizenIds[index % 3] } : property])),
      players: state.players.map((player) => player.role === "citizen" ? { ...player, cash: 1_100 } : player),
    };
    state = endTurn(state);
    expect(state.currentPlayerIndex).toBe(0);
    state = { ...state, phase: "awaiting-end-turn", currentPlayerIndex: 0, round: 2 };
    state = endTurn(state);
    expect(state.phase).toBe("game-over");
    expect(state.winner).toBe("citizens");
  });
  it("routes rent from a cooperative property into the shared fund", () => {
    let state = createNewGame({ humanRole: "citizen" });
    state = { ...state, currentPlayerIndex: 1, cooperativePropertyIds: ["old-dhaka"] };
    state = movePlayer(state, "player-2", 1);
    expect(state.cooperativeFund).toBe(10);
    expect(state.publicFund).toBe(0);
    expect(state.players[1].cash).toBe(1_490);
  });

  it("ends the game when the Politician reaches ৳8,000 in cash plus owned-property value", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = {
      ...state,
      players: state.players.map((player) => player.id === "player-1"
        ? { ...player, cash: 7_600, position: 38 }
        : player),
    };
    state = movePlayer(state, "player-1", 2);
    expect(state.players[0].cash).toBe(8_200);
    expect(state.phase).toBe("game-over");
    expect(state.winner).toBe("politician");
    expect(state.events.some((event) => event.message.includes("৳8,000"))).toBe(true);
  });

  it("counts active Politician leases toward the seven-property control victory", () => {
    let state = createNewGame({ humanRole: "politician" });
    const ids = Object.keys(state.properties).slice(0, 7);
    state = {
      ...state,
      properties: Object.fromEntries(Object.entries(state.properties).map(([id, property], index) => [
        id,
        ids.includes(id)
          ? { ...property, ownerId: null, leaseholderId: "player-1" }
          : property,
      ])),
    };
    state = movePlayer(state, "player-1", 1);
    expect(state.phase).toBe("game-over");
    expect(state.winner).toBe("politician");
    expect(state.events.some((event) => event.message.includes("controlling at least seven properties"))).toBe(true);
  });

  it("ends the game when the Politician controls seven properties", () => {
    let state = createNewGame({ humanRole: "politician" });
    const ids = Object.keys(state.properties).slice(0, 7);
    state = { ...state, properties: Object.fromEntries(Object.entries(state.properties).map(([id, property]) => [id, ids.includes(id) ? { ...property, ownerId: "player-1" } : property])) };
    state = movePlayer(state, "player-1", 1);
    expect(state.phase).toBe("game-over");
    expect(state.winner).toBe("politician");
  });

});
