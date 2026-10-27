import type { NeonSql } from "./analyticsStore.js";

/** One fixed-window allowance: at most `limit` requests per `windowSeconds` for each client. */
export interface RateRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/** Data-driven limits. Polls and heartbeats are deliberately not limited (they are cheap and constant while a game is open). */
export const RATE_RULES = {
  createRoom: [
    { bucket: "room-create-minute", limit: 5, windowSeconds: 60 },
    { bucket: "room-create-hour", limit: 30, windowSeconds: 3600 },
  ],
  joinRoom: [{ bucket: "room-join", limit: 20, windowSeconds: 60 }],
  roomAdmin: [{ bucket: "room-admin", limit: 30, windowSeconds: 60 }],
  action: [{ bucket: "room-action", limit: 300, windowSeconds: 60 }],
  forfeit: [{ bucket: "room-forfeit", limit: 10, windowSeconds: 60 }],
  analyticsWrite: [{ bucket: "analytics-write", limit: 120, windowSeconds: 60 }],
  adminAttempt: [{ bucket: "analytics-admin", limit: 20, windowSeconds: 60 }],
} as const satisfies Record<string, readonly RateRule[]>;

export type RateDecision = { allowed: true } | { allowed: false; bucket: string; retryAfterSeconds: number };

/** Best-effort client address from the platform's proxy headers. Returns null when none is present. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string | null {
  const pick = (name: string) => {
    const value = headers[name];
    const text = Array.isArray(value) ? value[0] : value;
    return typeof text === "string" ? text : "";
  };
  const real = pick("x-real-ip").trim();
  if (real) return real.slice(0, 64);
  const forwarded = pick("x-forwarded-for").split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}

/** Addresses are never stored: the key is a salted hash that is only useful inside one window. */
export async function rateKey(ip: string, bucket: string, salt = ""): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${bucket}:${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

let tableReady = false;
export async function ensureRateLimitTable(sql: NeonSql): Promise<void> {
  if (tableReady) return;
  await sql`CREATE TABLE IF NOT EXISTS rate_limits (
    key text NOT NULL,
    window_start timestamptz NOT NULL,
    count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
  )`;
  tableReady = true;
}
/** Test helper: forget that the table was created. */
export function resetRateLimitTableCache(): void {
  tableReady = false;
}

/**
 * Counts this request against every rule and reports whether it may proceed. Fails open: if the limiter's own storage is
 * unavailable, real players are never locked out of the game because of it.
 */
export async function checkRateLimits(sql: NeonSql, ip: string | null, rules: readonly RateRule[], options: { now?: number; salt?: string } = {}): Promise<RateDecision> {
  if (!ip) return { allowed: true };
  const now = options.now ?? Date.now();
  try {
    await ensureRateLimitTable(sql);
    for (const rule of rules) {
      const windowMs = rule.windowSeconds * 1000;
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const rows = await sql`INSERT INTO rate_limits (key, window_start, count) VALUES (${await rateKey(ip, rule.bucket, options.salt)}, ${new Date(windowStart).toISOString()}, 1)
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count` as unknown as Array<{ count: number }>;
      const count = Number(rows[0]?.count ?? 0);
      if (count > rule.limit) {
        return { allowed: false, bucket: rule.bucket, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
      }
    }
    return { allowed: true };
  } catch (error) {
    console.error("Rate limiter unavailable; allowing request", error);
    return { allowed: true };
  }
}
