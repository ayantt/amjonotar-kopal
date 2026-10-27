import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pruneStaleData } from "../src/server/cleanup.js";
import type { NeonSql } from "../src/server/analyticsStore.js";

function authorised(req: VercelRequest, secret: string): boolean {
  const header = req.headers.authorization;
  const presented = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

/** Daily clean-up, invoked by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "Maintenance is not configured. CRON_SECRET is missing." });
  if (!authorised(req, secret)) return res.status(401).json({ error: "Unauthorized." });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(503).json({ error: "DATABASE_URL is missing." });
  try {
    const { neon } = await import("@neondatabase/serverless");
    const result = await pruneStaleData(neon(connectionString) as unknown as NeonSql);
    return res.status(200).json({ pruned: result });
  } catch (error) {
    console.error("Maintenance failed", error);
    return res.status(500).json({ error: "Maintenance could not complete." });
  }
}
