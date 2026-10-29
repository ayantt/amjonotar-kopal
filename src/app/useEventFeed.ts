import { useEffect, useRef, useState } from "react";
import type { GameState } from "../game/types";
import { playSound } from "./sound";
import { popupDurationMs, resolveEventMedia, type EventMedia } from "./eventMedia";

type FeedEvent = GameState["events"][number];

export type EventFeed = {
  /** Events revealed so far; lags behind `events` while popups play so the log matches what the player has seen. */
  displayedEvents: FeedEvent[];
  activeEvent: FeedEvent | null;
  /** Event-specific media (video, image or audio) for the active popup, if any is configured. */
  activeMedia: EventMedia | null;
  popupsEnabled: boolean;
  /** True while queued popups are still being shown (AI turns wait for this). */
  isPlaying: boolean;
  togglePopups: () => void;
  dismiss: () => void;
};

/**
 * Turns a growing event list into a queue of timed popups with sound. Shared by single-player and online play so both
 * modes present game events identically. `resetKey` restarts the feed for a new game or room.
 */
export function useEventFeed(events: FeedEvent[], soundEnabled: boolean, resetKey: string | null): EventFeed {
  const [popupsEnabled, setPopupsEnabled] = useState(true);
  const [displayedEvents, setDisplayedEvents] = useState<FeedEvent[]>([]);
  const [queue, setQueue] = useState<FeedEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<FeedEvent | null>(null);
  const lastSeenEventId = useRef<number | null>(null);

  useEffect(() => {
    lastSeenEventId.current = null;
    setDisplayedEvents([]);
    setQueue([]);
    setActiveEvent(null);
  }, [resetKey]);

  useEffect(() => {
    if (events.length === 0) {
      setDisplayedEvents([]);
      return;
    }
    const latestId = events[events.length - 1].id;
    if (lastSeenEventId.current === null) {
      lastSeenEventId.current = latestId;
      setDisplayedEvents(events);
      return;
    }
    const fresh = events.filter((event) => event.id > (lastSeenEventId.current ?? 0));
    if (!popupsEnabled) {
      lastSeenEventId.current = latestId;
      setDisplayedEvents(events);
      setQueue([]);
      setActiveEvent(null);
      return;
    }
    if (fresh.length > 0) {
      lastSeenEventId.current = latestId;
      setQueue((pending) => [...pending, ...fresh]);
    }
  }, [events, popupsEnabled]);

  useEffect(() => {
    if (!popupsEnabled || activeEvent || queue.length === 0) return;
    setActiveEvent(queue[0]);
    setQueue((pending) => pending.slice(1));
  }, [popupsEnabled, activeEvent, queue]);

  useEffect(() => {
    if (!activeEvent || !popupsEnabled) return;
    const media = resolveEventMedia(activeEvent.key, activeEvent.role);
    // Event media brings its own sound, so the generic chime only plays for ordinary popups.
    if (!media) playSound(activeEvent.kind === "money" ? "money" : activeEvent.kind === "ai" ? "event" : "turn", soundEnabled);
    setDisplayedEvents((shown) => shown.some((event) => event.id === activeEvent.id) ? shown : [...shown, activeEvent]);
    const timer = window.setTimeout(() => setActiveEvent(null), popupDurationMs(media));
    return () => window.clearTimeout(timer);
  }, [activeEvent, popupsEnabled, soundEnabled]);

  return {
    displayedEvents,
    activeEvent,
    activeMedia: activeEvent ? resolveEventMedia(activeEvent.key, activeEvent.role) : null,
    popupsEnabled,
    isPlaying: Boolean(activeEvent) || queue.length > 0,
    togglePopups: () => {
      if (popupsEnabled) {
        setDisplayedEvents(events);
        setQueue([]);
        setActiveEvent(null);
        lastSeenEventId.current = events.length ? events[events.length - 1].id : null;
      }
      setPopupsEnabled(!popupsEnabled);
    },
    dismiss: () => setActiveEvent(null),
  };
}
