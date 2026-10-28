import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateSummaries, summarizeGame } from "../../src/game/analytics";
import { parseGameSummary } from "../../src/game/analyticsValidation";
import { createMultiplayerGame, forfeitPlayer, getCurrentPlayer } from "../../src/game/engine";
import { seededRandom, simulateAiGame } from "../../src/game/simulate";
import { advanceAbsentPlayer } from "../../src/server/roomTick";
import { buildJourney, buildOnlineHealth, type EventTotals, type StoredRow } from "../../src/server/analyticsStore";
import type { GameState } from "../../src/game/types";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const row = (o: Partial<StoredRow>): StoredRow => ({ mode: "single", startedAt: minutesAgo(5), finishedAt: null, summary: null, humanRole: "citizen", playerCount: 4, ...o });
const events = (counts: EventTotals["counts"], since: string | null = "2026-10-20"): EventTotals => ({ counts, since });
const room = (n = 3) => createMultiplayerGame(Array.from({ length: n }, (_, i) => `P${i + 1}`), () => 0);
const online = (state: GameState) => summarizeGame(state, "online");
/** A finished all-AI game with one seat marked as the human, as a real single-player game would be. */
const singleGame = () => {
  const state = simulateAiGame(11 * 104_729).state;
  return summarizeGame({ ...state, players: state.players.map((p, i) => ({ ...p, controller: i === 1 ? "human" as const : "ai" as const })) }, "single");
};

describe("game ending reasons", () => {
  it("records why a seat was removed", () => {
    const left = forfeitPlayer(room(), "player-2");
    expect(left.stats?.forfeits).toEqual([{ playerId: "player-2", round: left.round, reason: "left" }]);
    const absent = forfeitPlayer(room(), "player-2", "absent");
    expect(absent.stats?.forfeits?.[0].reason).toBe("absent");
    expect(absent.events.some((e) => /was away for too many turns/.test(e.message))).toBe(true);
  });

  it("labels a finished game by what removed the last opponent", () => {
    expect(online(forfeitPlayer(room(2), "player-2")).endedBy).toBe("left");
    expect(online(forfeitPlayer(room(2), "player-2", "absent")).endedBy).toBe("absent");
    expect(singleGame().endedBy).toBe("bankruptcy");
  });

  it("has no ending while the game is still being played", () => {
    expect(online(room()).endedBy).toBeNull();
  });

  it("marks forfeited seats in the summary", () => {
    const summary = online(forfeitPlayer(room(3), "player-2", "absent"));
    expect(summary.players.map((p) => p.forfeitReason)).toEqual([null, "absent", null]);
  });

  it("counts turns the computer plays for an absent player", () => {
    const state = room(3);
    const current = getCurrentPlayer(state);
    const seats = state.players.map((p) => ({ playerId: p.id, joinedAt: minutesAgo(60), lastSeenAt: minutesAgo(30) }));
    const result = advanceAbsentPlayer({ state, seats, turnStartedAt: minutesAgo(10), now: NOW }, seededRandom(5));
    expect(result.outcome).toBe("played");
    expect(current.id).toBe(getCurrentPlayer(state).id);
    expect(result.state.stats?.autoTurns).toBe(1);
  });

  it("records an absent forfeit after repeated misses", () => {
    const state = room(3);
    const seats = state.players.map((p) => ({ playerId: p.id, joinedAt: minutesAgo(60), lastSeenAt: minutesAgo(30), missedTurns: p.id === getCurrentPlayer(state).id ? 2 : 0 }));
    const result = advanceAbsentPlayer({ state, seats, turnStartedAt: minutesAgo(10), now: NOW });
    expect(result.outcome).toBe("forfeited");
    expect(result.state.stats?.forfeits?.[0].reason).toBe("absent");
  });
});

describe("summary validation of the new fields", () => {
  const base = () => online(forfeitPlayer(room(2), "player-2", "absent"));
  it("keeps the new fields when valid", () => {
    const parsed = parseGameSummary(JSON.parse(JSON.stringify(base())));
    expect(parsed?.endedBy).toBe("absent");
    expect(parsed?.players[1].forfeitReason).toBe("absent");
    expect(parsed?.autoPlayedTurns).toBe(0);
  });
  it("still accepts summaries recorded before they existed", () => {
    const legacy = JSON.parse(JSON.stringify(base())) as Record<string, unknown>;
    delete legacy.endedBy; delete legacy.autoPlayedTurns;
    for (const seat of legacy.players as Array<Record<string, unknown>>) delete seat.forfeitReason;
    const parsed = parseGameSummary(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed?.endedBy).toBeNull();
  });
  it("rejects invented values", () => {
    const bad = (change: (s: Record<string, unknown>) => void) => { const s = JSON.parse(JSON.stringify(base())) as Record<string, unknown>; change(s); return parseGameSummary(s); };
    expect(bad((s) => { s.endedBy = "hacked"; })).toBeNull();
    expect(bad((s) => { s.autoPlayedTurns = -1; })).toBeNull();
    expect(bad((s) => { (s.players as Array<Record<string, unknown>>)[0].forfeitReason = "x"; })).toBeNull();
  });
});

describe("end-reason aggregation", () => {
  const parse = (s: unknown) => parseGameSummary(JSON.parse(JSON.stringify(s)))!;
  it("counts how games ended and how many seats forfeited", () => {
    const report = aggregateSummaries([
      parse(online(forfeitPlayer(room(2), "player-2", "left"))),
      parse(online(forfeitPlayer(forfeitPlayer(room(3), "player-2", "absent"), "player-3", "absent"))),
      parse(singleGame()),
    ]);
    expect(report.endReasons).toEqual({ bankruptcy: 1, left: 1, absent: 1, unknown: 0 });
    expect(report.forfeits).toMatchObject({ left: 1, absent: 2, seats: 3 });
    expect(report.forfeits.rate).toBeCloseTo(3 / 9, 3);
  });
  it("counts older summaries as unknown and reports automatic turns only for online games", () => {
    const legacy = JSON.parse(JSON.stringify(singleGame())) as Record<string, unknown>;
    delete legacy.endedBy;
    expect(aggregateSummaries([parse(legacy)]).endReasons.unknown).toBe(1);
    expect(aggregateSummaries([parse(legacy)]).autoPlayedTurnsPerGame).toBeNull();
    const withAuto = { ...JSON.parse(JSON.stringify(online(forfeitPlayer(room(2), "player-2")))), autoPlayedTurns: 4 };
    expect(aggregateSummaries([parse(withAuto)]).autoPlayedTurnsPerGame).toBe(4);
  });
  it("handles no games", () => {
    expect(aggregateSummaries([])).toMatchObject({ endReasons: { bankruptcy: 0, left: 0, absent: 0, unknown: 0 }, forfeits: { seats: 0, rate: null }, autoPlayedTurnsPerGame: null });
  });
});

describe("buildJourney", () => {
  it("counts each step and the share of the one before", () => {
    const journey = buildJourney([
      row({ finishedAt: minutesAgo(1) }),
      row({ lastRound: 10 }),
      row({ lastRound: 5 }),
      row({ lastRound: 0 }),
      row({ mode: "online", finishedAt: minutesAgo(1) }),
    ], events({ visit: 20, replay: 1 }));
    expect(journey.steps.map((s) => [s.key, s.count])).toEqual([["visits", 20], ["started", 4], ["reached-5", 3], ["finished", 1], ["replayed", 1]]);
    expect(journey.steps.map((s) => s.rateOfPrevious)).toEqual([null, 0.2, 0.75, 0.333, 1]);
    expect(journey.since).toBe("2026-10-20");
  });
  it("never shows a rate over 100% or divides by zero", () => {
    const journey = buildJourney([row({})], events({ visit: 0 }));
    expect(journey.steps[1].rateOfPrevious).toBeNull();
    expect(journey.steps.every((s) => s.rateOfPrevious === null || s.rateOfPrevious <= 1)).toBe(true);
    expect(buildJourney([], events({}, null)).steps.every((s) => s.count === 0)).toBe(true);
  });
});

describe("buildOnlineHealth", () => {
  it("reports creation, start and finish rates", () => {
    const health = buildOnlineHealth([
      row({ mode: "online", startedAt: minutesAgo(120), finishedAt: minutesAgo(60), playerCount: 3 }),
      row({ mode: "online", startedAt: minutesAgo(30), playerCount: 2 }),
      row({ mode: "online", startedAt: minutesAgo(60 * 20), playerCount: 2 }),
      row({ mode: "single" }),
    ], events({ "room-created": 10, "lobby-open": 25 }), NOW);
    expect(health).toMatchObject({ lobbyOpens: 25, roomsCreated: 10, started: 3, finished: 1, inProgress: 1, abandoned: 1, startRate: 0.3, finishRate: 0.5 });
    expect(health.medianMinutes).toBe(60);
  });
  it("has no start rate without created rooms, and caps it at 100%", () => {
    expect(buildOnlineHealth([row({ mode: "online" })], events({}), NOW).startRate).toBeNull();
    expect(buildOnlineHealth([row({ mode: "online" }), row({ mode: "online" })], events({ "room-created": 1 }), NOW).startRate).toBe(1);
  });
});

describe("browser event tracking", () => {
  afterEach(() => vi.unstubAllGlobals());
  function stubBrowser(options: { dnt?: boolean } = {}) {
    const store = new Map<string, string>();
    const sent: Array<{ path: string; body: unknown }> = [];
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal("navigator", { doNotTrack: options.dnt ? "1" : "0" });
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", async (path: string, init: { body: string }) => { sent.push({ path, body: JSON.parse(init.body) }); return { ok: true }; });
    return sent;
  }
  it("counts one visit per tab session", async () => {
    const sent = stubBrowser();
    const { trackVisit } = await import("../../src/app/telemetry");
    trackVisit(); trackVisit();
    expect(sent).toEqual([{ path: "/api/analytics/events", body: { event: "visit" } }]);
  });
  it("counts a replay only after a finished game, and only once per finish", async () => {
    const sent = stubBrowser();
    const { trackReplayIfAny, markGameFinished } = await import("../../src/app/telemetry");
    trackReplayIfAny();
    expect(sent).toHaveLength(0);
    markGameFinished();
    trackReplayIfAny(); trackReplayIfAny();
    expect(sent.map((s) => s.body)).toEqual([{ event: "replay" }]);
  });
  it("sends nothing when Do Not Track is on", async () => {
    const sent = stubBrowser({ dnt: true });
    const { trackVisit, trackLobbyOpen } = await import("../../src/app/telemetry");
    trackVisit(); trackLobbyOpen();
    expect(sent).toHaveLength(0);
  });
});
