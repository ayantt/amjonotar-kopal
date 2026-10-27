import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseGameSummary } from "../src/game/analyticsValidation.js";
import { checkRateLimits, clientIp, RATE_RULES } from "../src/server/rateLimit.js";
import { ensureAnalyticsTable, isValidGameId, readAnalytics, recordGameFinish, recordGameProgress, recordGameStart, type NeonSql } from "../src/server/analyticsStore.js";

let neonModulePromise: Promise<typeof import("@neondatabase/serverless")> | undefined;
const MAX_BODY_CHARS = 20_000;

function send(res: VercelResponse, status: number, payload: unknown) {
  return res.status(status).json(payload);
}
function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return {};
  return req.body as Record<string, unknown>;
}
/** Constant-time comparison of the presented admin token against ANALYTICS_ADMIN_TOKEN. */
function isAdmin(req: VercelRequest, expected: string): boolean {
  const header = req.headers.authorization;
  const presented = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * Anonymous game analytics. Clients may only report single-player games (start/finish); online games are recorded by the
 * multiplayer API itself. Reading results requires the admin token. Nothing here stores names, IPs or room codes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const rawPath = typeof req.query.path === "string" ? req.query.path : "";
  const route = rawPath.replace(/^\/+|\/+$/g, "");
  const method = req.method ?? "GET";

  const isStart = route === "games/start" && method === "POST";
  const isFinish = route === "games/finish" && method === "POST";
  const isProgress = route === "games/progress" && method === "POST";
  const isSummary = route === "summary" && method === "GET";
  if (!isStart && !isFinish && !isProgress && !isSummary) {
    if (["games/start", "games/finish", "games/progress"].includes(route)) res.setHeader("Allow", "POST");
    if (route === "summary") res.setHeader("Allow", "GET");
    return send(res, ["games/start", "games/finish", "games/progress", "summary"].includes(route) ? 405 : 404, { error: "Unknown analytics endpoint." });
  }

  if (isSummary) {
    const expected = process.env.ANALYTICS_ADMIN_TOKEN;
    if (!expected) return send(res, 503, { error: "Analytics reporting is not configured. ANALYTICS_ADMIN_TOKEN is missing." });
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return send(res, 503, { error: "Analytics storage is not configured. DATABASE_URL is missing." });

  const body = bodyOf(req);
  if (isStart || isFinish || isProgress) {
    if (JSON.stringify(body).length > MAX_BODY_CHARS) return send(res, 413, { error: "Payload too large." });
    if (!isValidGameId(body.gameId)) return send(res, 400, { error: "A valid gameId is required." });
  }
  const round = isProgress ? body.round : null;
  if (isProgress && (typeof round !== "number" || !Number.isInteger(round) || round < 0 || round > 5000)) return send(res, 400, { error: "A valid round is required." });
  if (isStart && (body.mode !== "single" || (body.humanRole !== "politician" && body.humanRole !== "citizen"))) {
    return send(res, 400, { error: "Only single-player starts can be reported by clients." });
  }
  const summary = isFinish ? parseGameSummary(body.summary) : null;
  if (isFinish && (!summary || summary.mode !== "single")) return send(res, 400, { error: "Invalid game summary." });

  try {
    const { neon } = await (neonModulePromise ??= import("@neondatabase/serverless"));
    const sql = neon(connectionString) as unknown as NeonSql;
    const decision = await checkRateLimits(sql, clientIp(req.headers), isSummary ? RATE_RULES.adminAttempt : RATE_RULES.analyticsWrite, { salt: process.env.RATE_LIMIT_SALT });
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      return send(res, 429, { error: "Too many requests. Please slow down.", retryAfterSeconds: decision.retryAfterSeconds });
    }
    if (isSummary && !isAdmin(req, process.env.ANALYTICS_ADMIN_TOKEN ?? "")) return send(res, 401, { error: "A valid admin token is required." });
    await ensureAnalyticsTable(sql);
    if (isProgress) {
      await recordGameProgress(sql, body.gameId as string, round as number);
      return send(res, 204, {});
    }
    if (isStart) {
      await recordGameStart(sql, body.gameId as string, "single", 4, body.humanRole as string);
      return send(res, 204, {});
    }
    if (isFinish && summary) {
      await recordGameFinish(sql, body.gameId as string, summary);
      return send(res, 204, {});
    }
    return send(res, 200, await readAnalytics(sql));
  } catch (error) {
    console.error("Analytics API error", error);
    return send(res, 500, { error: "The analytics service could not complete the request." });
  }
}
