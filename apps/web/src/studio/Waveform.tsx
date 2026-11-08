import React, { useCallback, useRef } from "react";
import { useAudioProgress } from "./useAudioProgress.js";

const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

interface WaveformProps {
  /** Real peaks decoded from the clip. Without them, no bars are drawn. */
  peaks?: number[];
  durationMs?: number;
  playing: boolean;
  played: boolean;
  loading?: boolean;
  getPlayer: () => HTMLAudioElement | null;
  compact?: boolean;
}

/**
 * The clip's own waveform, with the played part filled to the real playback position. Bars are peaks decoded from the
 * very bytes being played; without them the space says so rather than drawing invented bars.
 */
export function Waveform({ peaks, durationMs, playing, played, loading, getPlayer, compact }: WaveformProps) {
  const box = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const total = durationMs ? durationMs / 1000 : undefined;
  const onTime = useCallback((current: number, all: number) => {
    if (time.current) time.current.textContent = `${fmt(current)} / ${fmt(all)}`;
  }, []);
  useAudioProgress(box, playing, played, getPlayer, onTime);

  if (!peaks) {
    return (
      <div className={`hb-wave ${compact ? "is-compact" : ""} ${loading ? "is-loading" : "is-empty"}`} ref={box}>
        {!compact && <span className="hb-wave-empty-text">{loading ? "Decoding the prompt's audio…" : "Waveform unavailable for this prompt"}</span>}
      </div>
    );
  }
  const step = 4;
  const height = compact ? 26 : 64;
  const bars = peaks.map((peak, i) => {
    const h = Math.max(1.5, peak * (height - 2));
    return <rect key={i} x={i * step} y={(height - h) / 2} width={2} height={h} />;
  });
  return (
    <div className={`hb-wave ${compact ? "is-compact" : ""} ${playing ? "is-playing" : ""}`} ref={box} data-playing={playing ? "true" : "false"}>
      <div className="hb-wave-svgs" aria-hidden="true">
        <svg className="hb-wave-base" viewBox={`0 0 ${peaks.length * step} ${height}`} preserveAspectRatio="none">{bars}</svg>
        <svg className="hb-wave-progress" viewBox={`0 0 ${peaks.length * step} ${height}`} preserveAspectRatio="none">{bars}</svg>
      </div>
      {!compact && total !== undefined && (
        <span className="hb-wave-time hb-num" ref={time}>
          {played ? `${fmt(total)} / ${fmt(total)}` : `0:00 / ${fmt(total)}`}
        </span>
      )}
    </div>
  );
}
