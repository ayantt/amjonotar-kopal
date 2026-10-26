import { summarizeGame } from "../game/analytics";
import type { GameState, PlayerRole } from "../game/types";

/**
 * Anonymous single-player game reporting. It sends only a random per-game id, the role the player chose and, when the
 * game ends, an aggregate summary (no names). Failures are silent and never affect play; browsers that send
 * Do Not Track are skipped entirely.
 */
const optedOut = () => typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1");

export function newGameId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function post(path: string, body: unknown) {
  if (optedOut()) return;
  try {
    void fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
  } catch {
    // Analytics must never interrupt gameplay.
  }
}

export function trackGameStart(gameId: string, humanRole: PlayerRole) {
  post("/api/analytics/games/start", { gameId, mode: "single", humanRole });
}
export function trackGameFinish(gameId: string, state: GameState) {
  post("/api/analytics/games/finish", { gameId, summary: summarizeGame(state, "single") });
}
/** Reports how far a game has got so drop-off can be measured. Called every few rounds, never per action. */
export function trackGameProgress(gameId: string, round: number) {
  post("/api/analytics/games/progress", { gameId, round });
}
