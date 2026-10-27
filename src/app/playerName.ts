const KEY = "amjonotar-kopal-player-name";
export const MAX_PLAYER_NAME = 24;

/** Normalizes a typed name the same way the server does: trimmed, single-spaced, at most 24 characters. */
export const cleanPlayerName = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, MAX_PLAYER_NAME);

/** The display name remembered on this device, or "" when none is saved or storage is unavailable (private mode, blocked data). */
export function loadPlayerName(): string {
  try { return cleanPlayerName(localStorage.getItem(KEY) ?? ""); } catch { return ""; }
}

/** Remembers the name on this device only; it is never sent anywhere except as the room display name the player chose. An empty name clears it. */
export function savePlayerName(value: string): void {
  try {
    const name = cleanPlayerName(value);
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch { /* Remembering the name is a convenience only. */ }
}
