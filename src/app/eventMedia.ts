import { BOARD } from "../game/board";
import type { PlayerRole } from "../game/types";
import manifest from "./eventMedia.json";

/**
 * Media shown in the popup for one kind of game event. Every field is optional; give at least one of video, image or audio.
 * Paths start with `/media/events/` and point at files in `public/media/events/`.
 */
export interface EventMedia {
  video?: string;
  image?: string;
  audio?: string;
  /** Text shown with the media and read by screen readers (also the alt text for an image). */
  caption?: string;
  /** Longest time, in seconds, the popup stays open for this media. Videos close earlier when they end. */
  maxSeconds?: number;
}
export type EventMediaManifest = Record<string, EventMedia>;

export const EVENT_MEDIA: EventMediaManifest = (manifest as { events: EventMediaManifest }).events;

const DEFAULT_POPUP_MS = 2600;
const DEFAULT_IMAGE_SECONDS = 5;
const DEFAULT_VIDEO_SECONDS = 20;
const MAX_SECONDS = 60;
const SAFE_PATH = /^\/media\/events\/[A-Za-z0-9._-]+$/;

/**
 * Finds the media for an event. Lookup order: the exact key for the player's role (`space:income-tax@politician`), the exact key
 * for everyone (`space:income-tax`), then the same two for the kind of space (`type:tax@citizen`, `type:tax`), or the generic
 * `card` key for any card. `role` is the role of the player the event is about, so every viewer sees the same clip.
 * Returns null when nothing is configured.
 */
export function resolveEventMedia(key: string | undefined, role?: PlayerRole, media: EventMediaManifest = EVENT_MEDIA): EventMedia | null {
  if (!key) return null;
  const candidates = [key];
  if (key.startsWith("space:")) {
    const space = BOARD.find((entry) => entry.id === key.slice("space:".length));
    if (space) candidates.push(`type:${space.type}`);
  } else if (key.startsWith("card:")) candidates.push("card");
  for (const candidate of candidates) {
    for (const name of role ? [`${candidate}@${role}`, candidate] : [candidate]) {
      const entry = media[name];
      if (entry && (isSafe(entry.video) || isSafe(entry.image) || isSafe(entry.audio))) return sanitize(entry);
    }
  }
  return null;
}
const isSafe = (path: string | undefined): path is string => typeof path === "string" && SAFE_PATH.test(path);
function sanitize(entry: EventMedia): EventMedia {
  return {
    ...(isSafe(entry.video) ? { video: entry.video } : {}),
    ...(isSafe(entry.image) ? { image: entry.image } : {}),
    ...(isSafe(entry.audio) ? { audio: entry.audio } : {}),
    ...(typeof entry.caption === "string" ? { caption: entry.caption.slice(0, 200) } : {}),
    ...(typeof entry.maxSeconds === "number" && entry.maxSeconds > 0 ? { maxSeconds: Math.min(entry.maxSeconds, MAX_SECONDS) } : {}),
  };
}

/** How long a popup stays open before closing by itself. */
export function popupDurationMs(media: EventMedia | null): number {
  if (!media) return DEFAULT_POPUP_MS;
  const seconds = media.maxSeconds ?? (media.video ? DEFAULT_VIDEO_SECONDS : DEFAULT_IMAGE_SECONDS);
  return Math.round(seconds * 1000);
}
