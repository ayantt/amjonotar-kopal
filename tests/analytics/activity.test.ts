import { describe, expect, it } from "vitest";
import { ABANDON_AFTER_MS, summarizeActivity, type StoredRow } from "../../src/server/analyticsStore";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const row = (overrides: Partial<StoredRow>): StoredRow => ({ mode: "single", startedAt: minutesAgo(5), finishedAt: null, summary: null, humanRole: "citizen", playerCount: 4, ...overrides });

describe("summarizeActivity", () => {
  it("handles no games", () => {
    const result = summarizeActivity([], NOW);
    expect(result).toMatchObject({ started: 0, finished: 0, inProgress: 0, abandoned: 0, completionRate: null, durationMinutes: null });
    expect(result.startsByHour).toHaveLength(24);
    expect(result.dropOff.every((bucket) => bucket.games === 0)).toBe(true);
  });

  it("separates finished, in-progress and abandoned single-player games", () => {
    const result = summarizeActivity([
      row({ startedAt: minutesAgo(90), finishedAt: minutesAgo(60) }),
      row({ startedAt: minutesAgo(10) }),
      row({ startedAt: minutesAgo(300), lastSeenAt: minutesAgo(200), lastRound: 35 }),
      row({ startedAt: minutesAgo(300), lastSeenAt: minutesAgo(10), lastRound: 20 }),
    ], NOW);
    expect(result).toMatchObject({ started: 4, finished: 1, inProgress: 2, abandoned: 1 });
    expect(result.completionRate).toBe(0.5);
    expect(result.dropOff.find((bucket) => bucket.label === "20–39")?.games).toBe(1);
  });

  it("uses the 60-minute single-player and 12-hour online abandonment thresholds", () => {
    expect(ABANDON_AFTER_MS).toEqual({ single: 3_600_000, online: 43_200_000 });
    const result = summarizeActivity([
      row({ startedAt: minutesAgo(61) }),
      row({ startedAt: minutesAgo(59) }),
      row({ mode: "online", humanRole: null, startedAt: minutesAgo(60 * 11) }),
      row({ mode: "online", humanRole: null, startedAt: minutesAgo(60 * 13) }),
    ], NOW);
    expect(result).toMatchObject({ inProgress: 2, abandoned: 2 });
  });

  it("buckets drop-off with an open-ended last bucket and treats missing progress as round 0", () => {
    const result = summarizeActivity([
      row({ startedAt: minutesAgo(500) }),
      row({ startedAt: minutesAgo(500), lastSeenAt: minutesAgo(400), lastRound: 500 }),
    ], NOW);
    expect(result.dropOff[0]).toEqual({ label: "0–19", games: 1 });
    expect(result.dropOff[5]).toEqual({ label: "100+", games: 1 });
  });

  it("counts role choice, room sizes and start hours", () => {
    const result = summarizeActivity([
      row({ humanRole: "politician", startedAt: "2026-10-25T03:10:00Z" }),
      row({ humanRole: "citizen", startedAt: "2026-10-25T03:50:00Z" }),
      row({ humanRole: "citizen", startedAt: "2026-10-25T20:00:00Z" }),
      row({ mode: "online", humanRole: null, playerCount: 3 }),
      row({ mode: "online", humanRole: null, playerCount: 3 }),
      row({ mode: "online", humanRole: null, playerCount: 6 }),
    ], NOW);
    expect(result.roleChoice).toEqual({ politician: 1, citizen: 2 });
    expect(result.roomSizes).toEqual([{ players: 3, games: 2 }, { players: 6, games: 1 }]);
    expect(result.startsByHour[3]).toBe(2);
    expect(result.startsByHour[20]).toBe(1);
  });

  it("measures wall-clock duration and ignores impossible values", () => {
    const result = summarizeActivity([
      row({ startedAt: minutesAgo(100), finishedAt: minutesAgo(80) }),
      row({ startedAt: minutesAgo(100), finishedAt: minutesAgo(70) }),
      row({ startedAt: minutesAgo(100), finishedAt: minutesAgo(130) }),
      row({ startedAt: minutesAgo(2000), finishedAt: minutesAgo(10) }),
    ], NOW);
    expect(result.finished).toBe(4);
    expect(result.durationMinutes).toMatchObject({ min: 20, max: 30 });
  });
});
