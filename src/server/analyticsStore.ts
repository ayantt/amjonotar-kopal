import { aggregateSummaries, distribution, type AnalyticsReport, type Distribution, type GameSummary } from "../game/analytics.js";
import { parseGameSummary } from "../game/analyticsValidation.js";

/** The tagged-template query function returned by `neon()`; declared structurally so this module has no driver dependency. */
export type NeonSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
export type GameMode = "single" | "online";

export interface AnalyticsOverview {
  generatedAt: string;
  funnel: Record<GameMode, { started: number; finished: number; completionRate: number | null }>;
  daily: Array<{ day: string; started: number; finished: number }>;
  /** Player behaviour per scope: who plays, how long, and where they stop. */
  activity: Record<"all" | GameMode, PlayerActivity>;
  reports: { all: AnalyticsReport; single: AnalyticsReport; online: AnalyticsReport };
}

const MAX_ROWS = 5000;

export async function ensureAnalyticsTable(sql: NeonSql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS analytics_games (
    game_id text PRIMARY KEY,
    mode text NOT NULL CHECK (mode IN ('single', 'online')),
    player_count integer NOT NULL,
    human_role text,
    started_at timestamptz NOT NULL DEFAULT NOW(),
    finished_at timestamptz,
    summary jsonb
  )`;
  // Drop-off tracking: the highest round a single-player game reached and when it last reported.
  await sql`ALTER TABLE analytics_games ADD COLUMN IF NOT EXISTS last_round integer`;
  await sql`ALTER TABLE analytics_games ADD COLUMN IF NOT EXISTS last_seen_at timestamptz`;
}

/** Game ids are random client/server tokens, never room codes or player data. */
export const isValidGameId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);

export async function recordGameStart(sql: NeonSql, gameId: string, mode: GameMode, playerCount: number, humanRole: string | null): Promise<void> {
  await sql`INSERT INTO analytics_games (game_id, mode, player_count, human_role) VALUES (${gameId}, ${mode}, ${playerCount}, ${humanRole}) ON CONFLICT (game_id) DO NOTHING`;
}

/** Records how far an unfinished single-player game has got. Never creates rows and never touches finished games. */
export async function recordGameProgress(sql: NeonSql, gameId: string, round: number): Promise<void> {
  await sql`UPDATE analytics_games SET last_round = GREATEST(COALESCE(last_round, 0), ${round}), last_seen_at = NOW() WHERE game_id = ${gameId} AND mode = 'single' AND finished_at IS NULL`;
}

/** The first finished summary for a game wins; later duplicates are ignored. */
export async function recordGameFinish(sql: NeonSql, gameId: string, summary: GameSummary): Promise<void> {
  await sql`INSERT INTO analytics_games (game_id, mode, player_count, human_role, finished_at, summary)
    VALUES (${gameId}, ${summary.mode}, ${summary.playerCount}, ${summary.humanRole}, NOW(), ${JSON.stringify(summary)}::jsonb)
    ON CONFLICT (game_id) DO UPDATE SET finished_at = COALESCE(analytics_games.finished_at, NOW()), summary = COALESCE(analytics_games.summary, EXCLUDED.summary)`;
}

/** A stored game row as read back from Postgres (timestamps may arrive as Date or string). */
export interface StoredRow {
  mode: GameMode;
  startedAt: string | Date;
  finishedAt: string | Date | null;
  lastRound?: number | null;
  lastSeenAt?: string | Date | null;
  humanRole?: string | null;
  playerCount?: number | null;
  summary: unknown;
}
export interface PlayerActivity {
  started: number;
  finished: number;
  inProgress: number;
  abandoned: number;
  /** Finished / (finished + abandoned): games still in progress are not counted against completion. */
  completionRate: number | null;
  /** Single-player: which office players chose when starting. */
  roleChoice: { politician: number; citizen: number };
  /** Online: finished or not, how many players each room started with. */
  roomSizes: Array<{ players: number; games: number }>;
  /** Wall-clock minutes from start to finish, finished games only. */
  durationMinutes: Distribution | null;
  /** Where abandoned single-player games stopped, in 20-round buckets (the last bucket is open-ended). */
  dropOff: Array<{ label: string; games: number }>;
  /** Games started per UTC hour of day, index 0-23. */
  startsByHour: number[];
}

/** A single-player game with no report for this long is treated as abandoned; an online room is abandoned once it would have expired. */
export const ABANDON_AFTER_MS = { single: 60 * 60 * 1000, online: 12 * 60 * 60 * 1000 } as const;
const MAX_DURATION_MINUTES = 600;
const DROP_OFF_BUCKET = 20;
const DROP_OFF_BUCKETS = 6;
const time = (value: string | Date) => new Date(value).getTime();
const toRate = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;

/** Pure and clock-injected so it can be tested: turns stored rows into player-behaviour statistics. */
export function summarizeActivity(rows: StoredRow[], now: number): PlayerActivity {
  let finished = 0, inProgress = 0, abandoned = 0;
  const roleChoice = { politician: 0, citizen: 0 };
  const rooms = new Map<number, number>();
  const durations: number[] = [];
  const dropOff = Array.from({ length: DROP_OFF_BUCKETS }, () => 0);
  const startsByHour = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    const started = time(row.startedAt);
    if (Number.isFinite(started)) startsByHour[new Date(started).getUTCHours()] += 1;
    if (row.mode === "single" && (row.humanRole === "politician" || row.humanRole === "citizen")) roleChoice[row.humanRole] += 1;
    if (row.mode === "online" && row.playerCount) rooms.set(row.playerCount, (rooms.get(row.playerCount) ?? 0) + 1);
    if (row.finishedAt) {
      finished += 1;
      const minutes = (time(row.finishedAt) - started) / 60_000;
      if (Number.isFinite(minutes) && minutes >= 0 && minutes <= MAX_DURATION_MINUTES) durations.push(Math.round(minutes * 10) / 10);
      continue;
    }
    const lastActive = row.lastSeenAt ? time(row.lastSeenAt) : started;
    if (now - lastActive < ABANDON_AFTER_MS[row.mode]) { inProgress += 1; continue; }
    abandoned += 1;
    if (row.mode === "single") dropOff[Math.min(DROP_OFF_BUCKETS - 1, Math.floor((row.lastRound ?? 0) / DROP_OFF_BUCKET))] += 1;
  }
  return {
    started: rows.length, finished, inProgress, abandoned, completionRate: toRate(finished, finished + abandoned),
    roleChoice,
    roomSizes: [...rooms.entries()].sort((a, b) => a[0] - b[0]).map(([players, games]) => ({ players, games })),
    durationMinutes: distribution(durations),
    dropOff: dropOff.map((games, index) => ({ label: index === DROP_OFF_BUCKETS - 1 ? `${index * DROP_OFF_BUCKET}+` : `${index * DROP_OFF_BUCKET}–${index * DROP_OFF_BUCKET + DROP_OFF_BUCKET - 1}`, games })),
    startsByHour,
  };
}

export async function readAnalytics(sql: NeonSql): Promise<AnalyticsOverview> {
  const rows = await sql`SELECT mode, started_at AS "startedAt", finished_at AS "finishedAt", last_round AS "lastRound", last_seen_at AS "lastSeenAt", human_role AS "humanRole", player_count AS "playerCount", summary FROM analytics_games ORDER BY started_at DESC LIMIT ${MAX_ROWS}` as unknown as Array<StoredRow>;
  const funnel = { single: { started: 0, finished: 0, completionRate: null as number | null }, online: { started: 0, finished: 0, completionRate: null as number | null } };
  const days = new Map<string, { started: number; finished: number }>();
  const summaries: Record<GameMode, GameSummary[]> = { single: [], online: [] };
  for (const row of rows) {
    funnel[row.mode].started += 1;
    const day = new Date(row.startedAt).toISOString().slice(0, 10);
    const bucket = days.get(day) ?? { started: 0, finished: 0 };
    bucket.started += 1;
    if (row.finishedAt) {
      funnel[row.mode].finished += 1;
      bucket.finished += 1;
      // Re-validate on read so a bad row can never break the dashboard.
      const parsed = parseGameSummary(row.summary);
      if (parsed) summaries[row.mode].push(parsed);
    }
    days.set(day, bucket);
  }
  for (const mode of ["single", "online"] as const) {
    const { started, finished } = funnel[mode];
    funnel[mode].completionRate = started > 0 ? Math.round((finished / started) * 1000) / 1000 : null;
  }
  return {
    generatedAt: new Date().toISOString(),
    funnel,
    daily: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30).map(([day, value]) => ({ day, ...value })),
    activity: {
      all: summarizeActivity(rows, Date.now()),
      single: summarizeActivity(rows.filter((row) => row.mode === "single"), Date.now()),
      online: summarizeActivity(rows.filter((row) => row.mode === "online"), Date.now()),
    },
    reports: { all: aggregateSummaries([...summaries.single, ...summaries.online]), single: aggregateSummaries(summaries.single), online: aggregateSummaries(summaries.online) },
  };
}
