import { describe, expect, it } from "vitest";
import { pollDelayMs, retryDelayMs } from "../../src/app/MultiplayerLobby";

describe("online polling cadence", () => {
  it("polls slowly while the tab is hidden", () => {
    expect(pollDelayMs(false)).toBe(1600);
    expect(pollDelayMs(true)).toBeGreaterThan(pollDelayMs(false));
  });
  it("pauses for the server's Retry-After, bounded to a minute", () => {
    expect(retryDelayMs(12)).toBe(12_000);
    expect(retryDelayMs("7")).toBe(7_000);
    expect(retryDelayMs(9999)).toBe(60_000);
  });
  it("falls back to a short pause when the value is missing or invalid", () => {
    for (const bad of [undefined, null, "abc", -3, 0, NaN]) expect(retryDelayMs(bad)).toBe(5_000);
  });
});
