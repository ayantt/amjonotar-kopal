import { parseSave, serializeSave, type SavedGame } from "../game/save";
import type { GameState } from "../game/types";

const KEY = "amjonotar-kopal-save-v1";

/** The resumable single-player game on this device, or null. Corrupt or outdated saves are removed. */
export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const save = parseSave(raw);
    if (!save) localStorage.removeItem(KEY);
    return save;
  } catch { return null; }
}

/** Saves the game; a finished game clears the save instead. Failures (private mode, full storage) are ignored: saving is a convenience. */
export function writeSavedGame(game: GameState, gameId: string | null): void {
  try {
    if (game.phase === "game-over") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, serializeSave(game, gameId));
  } catch { /* ignore */ }
}

export function clearSavedGame(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
