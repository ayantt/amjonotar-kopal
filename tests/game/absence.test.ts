import { describe, expect, it } from "vitest";
import { ABSENCE, isSeatAway, isTurnOverdue } from "../../src/game/absence";
import { createMultiplayerGame, forfeitPlayer, getCurrentPlayer, rollAndMove } from "../../src/game/engine";
import { seededRandom } from "../../src/game/simulate";
import { playOnBehalf } from "../../src/game/turns";
import { advanceAbsentPlayer } from "../../src/server/roomTick";
import type { GameState } from "../../src/game/types";

const T0 = Date.parse("2026-10-27T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const totalCash = (s: GameState) => s.players.reduce((sum, p) => sum + p.cash, 0) + s.publicFund + s.cooperativeFund;
const game = (n = 4) => createMultiplayerGame(Array.from({ length: n }, (_, i) => `P${i + 1}`), () => 0);

describe("presence rules", () => {
  it("treats a seat as away only after the heartbeat gap passes", () => {
    const seat = { joinedAt: iso(T0 - 600_000), lastSeenAt: iso(T0 - ABSENCE.awayAfterMs) };
    expect(isSeatAway(seat, T0)).toBe(false);
    expect(isSeatAway(seat, T0 + 1)).toBe(true);
  });

  it("measures a seat that never sent a heartbeat from when it joined", () => {
    expect(isSeatAway({ joinedAt: iso(T0 - 31_000) }, T0)).toBe(true);
    expect(isSeatAway({ joinedAt: iso(T0 - 5_000) }, T0)).toBe(false);
  });

  it("plays for a disconnected player only after the grace period", () => {
    const away = { joinedAt: iso(T0 - 600_000), lastSeenAt: iso(T0 - 60_000) };
    expect(isTurnOverdue(away, iso(T0 - ABSENCE.awayGraceMs + 1), T0)).toBe(false);
    expect(isTurnOverdue(away, iso(T0 - ABSENCE.awayGraceMs), T0)).toBe(true);
  });

  it("never rushes a connected player before the idle limit", () => {
    const here = { joinedAt: iso(T0 - 600_000), lastSeenAt: iso(T0 - 1_000) };
    expect(isTurnOverdue(here, iso(T0 - ABSENCE.idleTurnMs + 1), T0)).toBe(false);
    expect(isTurnOverdue(here, iso(T0 - ABSENCE.idleTurnMs), T0)).toBe(true);
  });

  it("ignores unparseable timestamps instead of acting on them", () => {
    expect(isTurnOverdue({ joinedAt: "x" }, "not a date", T0)).toBe(false);
  });
});

describe("forfeitPlayer", () => {
  it("moves cash to the public treasury, frees property and passes the turn without creating or losing money", () => {
    let state = game();
    const leaver = getCurrentPlayer(state);
    state = { ...state, properties: { ...state.properties, "dhaka-heights": { ...state.properties["dhaka-heights"], ownerId: leaver.id, houses: 2 } } };
    const before = totalCash(state);
    const next = forfeitPlayer(state, leaver.id);
    expect(next.players.find((p) => p.id === leaver.id)).toMatchObject({ bankrupt: true, cash: 0, active: false });
    expect(next.publicFund).toBe(state.publicFund + leaver.cash);
    expect(totalCash(next)).toBe(before);
    expect(next.properties["dhaka-heights"]).toMatchObject({ ownerId: null, houses: 0, hotel: false, mortgaged: false });
    expect(getCurrentPlayer(next).id).not.toBe(leaver.id);
    expect(next.phase).toBe("awaiting-roll");
    expect(next.events.some((e) => /left the game and forfeited/.test(e.message))).toBe(true);
  });

  it("ends the game for the last player standing", () => {
    const state = game(2);
    const next = forfeitPlayer(state, state.players[1].id);
    expect(next.phase).toBe("game-over");
    expect(next.winner).toBe(state.players[0].id);
  });

  it("works when it is not the leaver's turn and does not skip the current player", () => {
    const state = game(4);
    const next = forfeitPlayer(state, state.players[2].id);
    expect(getCurrentPlayer(next).id).toBe(getCurrentPlayer(state).id);
    expect(next.phase).toBe("awaiting-roll");
  });

  it("is a no-op for bankrupt players, unknown ids and finished games", () => {
    const state = game(4);
    const once = forfeitPlayer(state, state.players[1].id);
    expect(forfeitPlayer(once, state.players[1].id)).toBe(once);
    expect(forfeitPlayer(state, "nobody")).toBe(state);
    const over = forfeitPlayer(game(2), "player-2");
    expect(forfeitPlayer(over, "player-1")).toBe(over);
  });

  it("recovers a mid-turn abandonment (rolled, property pending) without leaving the game stuck", () => {
    let state = game(3);
    state = rollAndMove(state, seededRandom(5));
    const leaver = getCurrentPlayer(state);
    const next = forfeitPlayer(state, leaver.id);
    expect(next.pendingPropertyId).toBeNull();
    expect(getCurrentPlayer(next).id).not.toBe(leaver.id);
  });
});

describe("playOnBehalf", () => {
  it("plays a whole turn from the start and hands over to the next player, keeping the seat human", () => {
    const state = game(4);
    const next = playOnBehalf(state, seededRandom(3));
    expect(getCurrentPlayer(next).id).not.toBe(state.players[0].id);
    expect(next.players.every((p) => p.controller === "human")).toBe(true);
    expect(next.events.some((e) => /is away, so the computer is playing their turn/.test(e.message))).toBe(true);
  });

  it("finishes a turn abandoned after rolling, including a pending property decision", () => {
    const random = seededRandom(11);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      let state = game(4);
      state = rollAndMove(state, random);
      const next = playOnBehalf(state, random);
      expect(next.pendingPropertyId).toBeNull();
      expect(next.phase === "awaiting-roll" || next.phase === "game-over").toBe(true);
      expect(next.players.every((p) => p.cash >= 0 && Number.isInteger(p.cash))).toBe(true);
    }
  });

  it("never leaves the current player stuck across many seeded turns", () => {
    let state = game(5);
    const random = seededRandom(99);
    for (let turn = 0; turn < 600 && state.phase !== "game-over"; turn += 1) {
      const before = JSON.stringify([state.currentPlayerIndex, state.round, state.phase]);
      state = playOnBehalf(state, random);
      expect(JSON.stringify([state.currentPlayerIndex, state.round, state.phase])).not.toBe(before);
    }
    expect(state.phase).toBe("game-over");
  });

  it("does nothing once the game is over", () => {
    const over = forfeitPlayer(game(2), "player-2");
    expect(playOnBehalf(over)).toBe(over);
  });
});

describe("advanceAbsentPlayer", () => {
  const seatsFor = (state: GameState, lastSeen: number | null) => state.players.map((p) => ({ playerId: p.id, joinedAt: iso(T0 - 3_600_000), ...(lastSeen === null ? {} : { lastSeenAt: iso(lastSeen) }), missedTurns: 0 }));

  it("returns the same references when the turn is not overdue", () => {
    const state = game(3);
    const seats = seatsFor(state, T0 - 1_000);
    const result = advanceAbsentPlayer({ state, seats, turnStartedAt: iso(T0 - 5_000), now: T0 });
    expect(result.outcome).toBe("none");
    expect(result.state).toBe(state);
    expect(result.seats).toBe(seats);
  });

  it("plays the first two missed turns, counting them, then forfeits on the third", () => {
    let state = game(3);
    let seats = seatsFor(state, T0 - 600_000);
    const random = seededRandom(7);
    const outcomes: string[] = [];
    for (let miss = 1; miss <= 3; miss += 1) {
      // Make the same seat the current player each time so its misses accumulate.
      state = { ...state, currentPlayerIndex: 0, phase: "awaiting-roll", pendingPropertyId: null, extraRollAvailable: false };
      const result = advanceAbsentPlayer({ state, seats, turnStartedAt: iso(T0 - 60_000), now: T0 }, random);
      outcomes.push(result.outcome);
      expect(result.seats[0].missedTurns).toBe(miss);
      state = result.state; seats = result.seats;
    }
    expect(outcomes).toEqual(["played", "played", "forfeited"]);
    expect(state.players[0].bankrupt).toBe(true);
  });

  it("ignores finished games and seats that no longer exist", () => {
    const over = forfeitPlayer(game(2), "player-2");
    expect(advanceAbsentPlayer({ state: over, seats: [], turnStartedAt: iso(0), now: T0 }).outcome).toBe("none");
    const state = game(2);
    expect(advanceAbsentPlayer({ state, seats: [], turnStartedAt: iso(0), now: T0 }).outcome).toBe("none");
  });
});

describe("rooms with players who come and go (stress)", () => {
  /**
   * Each step the current player is either present (a real turn, modelled by the standard AI strategy) or away (the server
   * watchdog acts after the timeout). Whatever mix of players drops out, every room must finish, never get stuck, and keep
   * money and ownership valid.
   */
  function playRoom(seed: number, players: number, awayChance: number) {
    const random = seededRandom(seed);
    let state = createMultiplayerGame(Array.from({ length: players }, (_, i) => `P${i + 1}`), seededRandom(seed * 31));
    let seats = state.players.map((p) => ({ playerId: p.id, joinedAt: iso(T0 - 3_600_000), lastSeenAt: iso(T0), missedTurns: 0 }));
    let now = T0;
    let steps = 0;
    while (state.phase !== "game-over" && steps < 6000) {
      steps += 1;
      const current = getCurrentPlayer(state);
      const away = random() < awayChance;
      if (away) {
        now += ABSENCE.idleTurnMs + 1_000;
        const result = advanceAbsentPlayer({ state, seats: seats.map((s) => s.playerId === current.id ? { ...s, lastSeenAt: iso(now - 10 * ABSENCE.awayAfterMs) } : { ...s, lastSeenAt: iso(now) }), turnStartedAt: iso(now - ABSENCE.idleTurnMs - 500), now }, random);
        if (result.outcome === "none") throw new Error(`watchdog did nothing for an away player (seed ${seed})`);
        state = result.state; seats = result.seats;
      } else {
        // A present player acts for themselves, which resets their missed-turn count.
        now += 5_000;
        state = playOnBehalf(state, random);
        seats = seats.map((s) => s.playerId === current.id ? { ...s, missedTurns: 0 } : s);
      }
      for (const p of state.players) {
        if (!Number.isInteger(p.cash) || p.cash < 0) throw new Error(`bad cash ${p.cash} (seed ${seed})`);
      }
    }
    return { state, steps };
  }

  it.each([
    [2, 0.3], [3, 0.5], [4, 0.2], [4, 0.9], [5, 0.6], [6, 0.8],
  ])("finishes %i-player rooms where players are away %f of the time", (players, awayChance) => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const { state, steps } = playRoom(seed * 977 + players, players, awayChance);
      expect(state.phase, `seed ${seed} stuck after ${steps} steps`).toBe("game-over");
      const alive = state.players.filter((p) => !p.bankrupt);
      expect(alive).toHaveLength(1);
      expect(state.winner).toBe(alive[0].id);
    }
  });

  it("ends a room where everybody is permanently away, with one remaining player as the winner", () => {
    let state = game(4);
    let seats = state.players.map((p) => ({ playerId: p.id, joinedAt: iso(T0 - 3_600_000), lastSeenAt: iso(T0 - 3_600_000), missedTurns: 0 }));
    let now = T0;
    for (let i = 0; i < 200 && state.phase !== "game-over"; i += 1) {
      now += 30_000;
      const result = advanceAbsentPlayer({ state, seats, turnStartedAt: iso(now - 25_000), now }, seededRandom(i + 1));
      state = result.state; seats = result.seats;
    }
    expect(state.phase).toBe("game-over");
    expect(state.players.filter((p) => !p.bankrupt)).toHaveLength(1);
  });
});
