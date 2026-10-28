import { describe, expect, it } from "vitest";
import { popupDurationMs, resolveEventMedia, type EventMediaManifest } from "../../src/app/eventMedia";

const manifest: EventMediaManifest = {
  "space:income-tax": { video: "/media/events/income-tax.mp4", caption: "Taxman cometh", maxSeconds: 8 },
  "type:tax": { image: "/media/events/tax.png" },
  card: { audio: "/media/events/card.mp3" },
  "card:cc-3": { image: "/media/events/cc3.gif" },
  bankrupt: { video: "https://evil.example/x.mp4" },
  forfeit: { video: "/media/events/../secret.mp4" },
};

describe("resolveEventMedia", () => {
  it("prefers the exact key, then the kind of space", () => {
    expect(resolveEventMedia("space:income-tax", manifest)?.video).toBe("/media/events/income-tax.mp4");
    expect(resolveEventMedia("space:luxury-tax", manifest)?.image).toBe("/media/events/tax.png");
  });
  it("falls back from a specific card to the generic card media", () => {
    expect(resolveEventMedia("card:cc-3", manifest)?.image).toBe("/media/events/cc3.gif");
    expect(resolveEventMedia("card:cc-1", manifest)?.audio).toBe("/media/events/card.mp3");
  });
  it("returns null when nothing is configured or there is no key", () => {
    expect(resolveEventMedia(undefined, manifest)).toBeNull();
    expect(resolveEventMedia("space:go", manifest)).toBeNull();
    expect(resolveEventMedia("space:income-tax", {})).toBeNull();
  });
  it("refuses paths outside /media/events/, including other sites and traversal", () => {
    expect(resolveEventMedia("bankrupt", manifest)).toBeNull();
    expect(resolveEventMedia("forfeit", manifest)).toBeNull();
  });
  it("clamps overly long settings", () => {
    const m = resolveEventMedia("x", { x: { video: "/media/events/a.mp4", maxSeconds: 9999, caption: "c".repeat(500) } });
    expect(m?.maxSeconds).toBe(60);
    expect(m?.caption?.length).toBe(200);
  });
});

describe("popupDurationMs", () => {
  it("keeps the normal short popup without media", () => expect(popupDurationMs(null)).toBe(2600));
  it("gives images and audio a few seconds, videos up to 20, or the configured limit", () => {
    expect(popupDurationMs({ image: "/media/events/a.png" })).toBe(5000);
    expect(popupDurationMs({ video: "/media/events/a.mp4" })).toBe(20000);
    expect(popupDurationMs({ video: "/media/events/a.mp4", maxSeconds: 8 })).toBe(8000);
  });
});
