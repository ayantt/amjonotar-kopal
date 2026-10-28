import { useEffect, useRef, useState } from "react";
import type { EventMedia } from "./eventMedia";

const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Plays the media configured for an event inside its popup. A broken or missing file simply disappears, so the normal text popup
 * is always what the player is left with. Sound follows the game's sound toggle, and videos close the popup when they end.
 */
export function EventMediaView({ media, soundEnabled, onFinished }: { media: EventMedia; soundEnabled: boolean; onFinished: () => void }) {
  const [failed, setFailed] = useState<{ video?: boolean; image?: boolean; audio?: boolean }>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced) return;
    // Browsers may refuse to start sound on their own; fall back to a silent video rather than showing nothing.
    video.play().catch(() => { video.muted = true; void video.play().catch(() => setFailed((current) => ({ ...current, video: true }))); });
  }, [media.video, reduced]);

  const showVideo = Boolean(media.video) && !failed.video;
  const showImage = Boolean(media.image) && !failed.image && !showVideo;
  const showAudio = Boolean(media.audio) && !failed.audio && soundEnabled;
  if (!showVideo && !showImage && !showAudio) return null;

  return <figure className="event-media">
    {showVideo && <video ref={videoRef} className="event-media-video" src={media.video} playsInline muted={!soundEnabled} controls={reduced} preload="auto"
      aria-label={media.caption} poster={media.image} onEnded={onFinished} onError={() => setFailed((current) => ({ ...current, video: true }))} />}
    {showImage && <img className="event-media-image" src={media.image} alt={media.caption ?? ""} onError={() => setFailed((current) => ({ ...current, image: true }))} />}
    {showAudio && <audio src={media.audio} autoPlay onError={() => setFailed((current) => ({ ...current, audio: true }))} />}
    {media.caption && <figcaption>{media.caption}</figcaption>}
  </figure>;
}
