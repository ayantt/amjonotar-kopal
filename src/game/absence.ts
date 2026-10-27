/** Timing rules for online players who stop responding (RD-130). All values are milliseconds unless noted. */
export const ABSENCE = {
  /** A seat that has not sent a heartbeat for this long counts as disconnected. */
  awayAfterMs: 30_000,
  /** A disconnected player gets this long after their turn begins to come back before the computer plays for them. */
  awayGraceMs: 20_000,
  /** A connected player who takes no action for this long has their turn played for them. */
  idleTurnMs: 180_000,
  /** Consecutive missed turns after which the seat forfeits. */
  forfeitAfterMisses: 3,
} as const;

export interface PresenceInfo { joinedAt: string | Date; lastSeenAt?: string | Date | null }

const at = (value: string | Date | null | undefined) => value ? new Date(value).getTime() : Number.NaN;

/** True when the seat has stopped sending heartbeats. A seat that never sent one is measured from when it joined. */
export function isSeatAway(seat: PresenceInfo, now: number): boolean {
  const seen = at(seat.lastSeenAt);
  const reference = Number.isFinite(seen) ? seen : at(seat.joinedAt);
  return Number.isFinite(reference) && now - reference > ABSENCE.awayAfterMs;
}

/**
 * Whether the current player's turn should now be played for them: either they are disconnected and the grace period has
 * passed, or they are connected but have taken no action for the idle limit.
 */
export function isTurnOverdue(seat: PresenceInfo, turnStartedAt: string | Date, now: number): boolean {
  const started = at(turnStartedAt);
  if (!Number.isFinite(started)) return false;
  const elapsed = now - started;
  if (elapsed >= ABSENCE.idleTurnMs) return true;
  return isSeatAway(seat, now) && elapsed >= ABSENCE.awayGraceMs;
}
