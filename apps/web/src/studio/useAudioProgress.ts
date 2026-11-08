import { useEffect, type RefObject } from "react";

/**
 * Writes the real playback position (0–1) of the element actually playing to `--hb-progress` on `ref`, once per animation
 * frame and only while that clip plays. Nothing re-renders per frame, and nothing moves when no audio is playing.
 */
export function useAudioProgress(ref: RefObject<HTMLElement | null>, playing: boolean, played: boolean, getPlayer: () => HTMLAudioElement | null, onTime?: (current: number, total: number) => void): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!playing) {
      el.style.setProperty("--hb-progress", played ? "1" : "0");
      return;
    }
    let frame = 0;
    const tick = () => {
      const audio = getPlayer();
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        el.style.setProperty("--hb-progress", String(Math.min(1, audio.currentTime / audio.duration)));
        onTime?.(audio.currentTime, audio.duration);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref, playing, played, getPlayer, onTime]);
}
