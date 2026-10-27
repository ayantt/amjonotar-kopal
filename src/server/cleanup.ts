import type { NeonSql } from "./analyticsStore.js";

/** Retention windows, in one place so the policy is easy to read and change. */
export const RETENTION = {
  expiredRoomGraceHours: 1,
  rateLimitHours: 2,
  abandonedAnalyticsDays: 30,
  analyticsDays: 365,
} as const;

export interface PruneResult {
  rooms: number;
  rateLimits: number;
  abandonedGames: number;
  oldGames: number;
}

const countOf = (rows: unknown): number => Number((rows as Array<{ n?: number | string }>)[0]?.n ?? 0);

/** Each step is independent: a missing table (feature never used) must not stop the others. */
async function step(label: string, run: () => Promise<number>): Promise<number> {
  try { return await run(); } catch (error) { console.error(`Cleanup step failed: ${label}`, error); return 0; }
}

/** Deletes data that has outlived its purpose. Safe to run any number of times. */
export async function pruneStaleData(sql: NeonSql): Promise<PruneResult> {
  const rooms = await step("rooms", async () => countOf(await sql`WITH d AS (DELETE FROM multiplayer_rooms WHERE expires_at < NOW() - INTERVAL '1 hour' RETURNING 1) SELECT count(*)::int AS n FROM d`));
  const rateLimits = await step("rate limits", async () => countOf(await sql`WITH d AS (DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 hours' RETURNING 1) SELECT count(*)::int AS n FROM d`));
  const abandonedGames = await step("abandoned games", async () => countOf(await sql`WITH d AS (DELETE FROM analytics_games WHERE finished_at IS NULL AND COALESCE(last_seen_at, started_at) < NOW() - INTERVAL '30 days' RETURNING 1) SELECT count(*)::int AS n FROM d`));
  const oldGames = await step("old games", async () => countOf(await sql`WITH d AS (DELETE FROM analytics_games WHERE started_at < NOW() - INTERVAL '365 days' RETURNING 1) SELECT count(*)::int AS n FROM d`));
  return { rooms, rateLimits, abandonedGames, oldGames };
}
