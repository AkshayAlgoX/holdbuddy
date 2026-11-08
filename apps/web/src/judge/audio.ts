import { publicCapability } from "../api/public-connection.js";
/**
 * Hearing the fictional IVR. The judge stack keeps a copy of each prompt the simulator plays and serves it back to this
 * browser, with the runtime's per-launch user token, from loopback only. Every clip is LOCAL_REPLAY: a file played from
 * this machine, never a phone line and never speech generated now.
 *
 * Playback follows the call story: when the runtime announces that the simulator has begun a prompt, that prompt's clip
 * plays. In a paced stack the runtime only receives the audio once the clip has had time to play, so recognition, the
 * decision and the key appear just after the prompt is heard.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionConfig } from "../types.js";
import type { CallStory } from "./story.js";
import type { StackHint } from "./demo-scenarios.js";

/** Stacks that serve the judge audio. The silent fallback doesn't, so nothing is requested there. */
const AUDIBLE_STACKS: readonly StackHint[] = ["audio", "gnani-path", "live-prisma", "objectives"];

export type ClipOrigin = "public_synthetic" | "local_unverified";
export type ClipStatus = "loading" | "playing" | "played" | "muted" | "blocked" | "unavailable";

export interface ClipState {
  status: ClipStatus;
  origin?: ClipOrigin;
  durationMs?: number;
  fixtureId?: string;
  /** The authored text of an accepted recording, as the manifest holds it. */
  script?: string;
  paced?: boolean;
  startedAtMs?: number;
  /**
   * The clip's real waveform: peak amplitude per bucket, decoded from the very bytes being played, scaled to its own
   * loudest point. Absent if the browser can't decode it; then no waveform is drawn rather than an invented one.
   */
  peaks?: number[];
}

const PEAK_BUCKETS = 96;

/** Decodes a clip offline (no audio output, no autoplay rules) and measures its envelope. */
export async function peaksOf(blob: Blob, buckets = PEAK_BUCKETS): Promise<number[] | undefined> {
  const Context = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Context || typeof blob.arrayBuffer !== "function") return undefined;
  try {
    const decoded = await new Context(1, 1, 16_000).decodeAudioData(await blob.arrayBuffer());
    const data = decoded.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / buckets));
    const peaks: number[] = [];
    for (let b = 0; b < buckets; b += 1) {
      let peak = 0;
      for (let i = b * size; i < Math.min(data.length, (b + 1) * size); i += 1) peak = Math.max(peak, Math.abs(data[i]!));
      peaks.push(peak);
    }
    const loudest = Math.max(...peaks);
    return loudest > 0 ? peaks.map((p) => p / loudest) : peaks;
  } catch {
    return undefined;
  }
}

/** Where the judge audio lives. Through the dev server's proxy by default; tests point at the stack directly. */
export function audioBaseFor(config: ConnectionConfig, stack: StackHint): string | undefined {
  return config.baseUrl.startsWith("/") && AUDIBLE_STACKS.includes(stack) ? "/judge-audio" : undefined;
}

interface FetchedClip {
  url: string;
  blob: Blob;
  /** False when the simulator said more of this prompt follows. */
  final: boolean;
  meta: Omit<ClipState, "status">;
}

async function fetchClip(base: string, token: string, sessionId: string, promptId: string, fragment: number, waitMs: number): Promise<FetchedClip | undefined> {
  const response = await fetch(`${base}/v1/sessions/${encodeURIComponent(sessionId)}/prompts/${encodeURIComponent(promptId)}/fragments/${fragment}?waitMs=${waitMs}`, {
    headers: { authorization: `Bearer ${await publicCapability()}` },
    cache: "no-store",
  });
  if (!response.ok) return undefined;
  const origin = response.headers.get("x-holdbuddy-audio-origin");
  const script = response.headers.get("x-holdbuddy-audio-script");
  const fixtureId = response.headers.get("x-holdbuddy-audio-fixture");
  const duration = Number(response.headers.get("x-holdbuddy-audio-duration-ms"));
  const blob = await response.blob();
  return {
    url: URL.createObjectURL(blob),
    blob,
    final: response.headers.get("x-holdbuddy-audio-final") !== "false",
    meta: {
      // Anything the server didn't positively call an accepted recording is shown as unverified local audio.
      origin: origin === "public_synthetic" ? "public_synthetic" : "local_unverified",
      ...(Number.isFinite(duration) && duration > 0 ? { durationMs: duration } : {}),
      ...(origin === "public_synthetic" && script ? { script: decodeURIComponent(script) } : {}),
      paced: response.headers.get("x-holdbuddy-audio-paced") === "true",
    },
  };
}

const SOUND_KEY = "holdbuddy_judge_sound";

export function useJudgeAudio(story: CallStory, config: ConnectionConfig, closed: boolean, stack: StackHint) {
  const [soundOn, setSoundOnState] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [clips, setClips] = useState<Record<string, ClipState>>({});
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const player = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string[]>());
  const handled = useRef(new Set<string>());
  const automaticQueue = useRef<Promise<void>>(Promise.resolve());
  const sessionRef = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const closedRef = useRef(closed);
  closedRef.current = closed;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const base = audioBaseFor(config, stack);
  const sessionId = story.sessionId;

  const [playingPromptId, setPlayingPromptId] = useState<string | undefined>(undefined);
  const update = useCallback((promptId: string, patch: Partial<ClipState>) => {
    if (patch.status === "playing") setPlayingPromptId(promptId);
    else if (patch.status) setPlayingPromptId((now) => (now === promptId ? undefined : now));
    setClips((prev) => ({ ...prev, [promptId]: { ...(prev[promptId] ?? { status: "loading" }), ...patch } }));
  }, []);

  /** The clip playing now, and how to finish its wait if it is cut short. */
  const current = useRef<{ promptId: string; finish: () => void } | null>(null);

  const stopPlayback = useCallback(() => {
    const playing = current.current;
    current.current = null;
    if (player.current) {
      player.current.onended = null;
      player.current.pause();
    }
    // A clip cut short still counts as heard up to here; its card must not stay on "playing".
    playing?.finish();
  }, []);

  /** Plays a prompt's fragments in order, from the cache. Resolves when the last one ends, is cut, or is refused. */
  const playFrom = useCallback(
    async (promptId: string, list: string[], startedAtMs?: number, automatic = false) => {
      if (typeof Audio === "undefined" || list.length === 0) return;
      const ownGeneration = generation.current;
      const isCurrent = () => generation.current === ownGeneration;
      const canPlay = () => isCurrent() && (!automatic || (!closedRef.current && soundRef.current));
      if (!canPlay()) return;
      const audio = (player.current ??= new Audio());
      // The runtime can answer a prompt in the clip's last moments. Let the clip finish rather than clip its last words.
      if (current.current && !audio.paused && Number.isFinite(audio.duration) && audio.duration - audio.currentTime < 1.2) {
        await new Promise<void>((done) => {
          const timer = setTimeout(done, 1_300);
          audio.addEventListener("ended", () => (clearTimeout(timer), done()), { once: true });
        });
      }
      if (!canPlay()) return;
      stopPlayback();
      update(promptId, { status: "playing", ...(startedAtMs ? { startedAtMs } : { startedAtMs: Date.now() }) });
      for (const [index, url] of list.entries()) {
        if (!canPlay()) return;
        audio.src = url;
        let cut = false;
        const ended = new Promise<void>((done) => {
          audio.onended = () => done();
          current.current = { promptId, finish: () => ((cut = true), done()) };
        });
        try {
          await audio.play();
        } catch {
          if (!isCurrent()) return;
          if (current.current?.promptId === promptId) current.current = null;
          update(promptId, { status: automatic && !canPlay() ? "played" : "blocked" });
          return;
        }
        if (!isCurrent()) return;
        if (!canPlay()) stopPlayback();
        await ended;
        if (!isCurrent()) return;
        if (index === list.length - 1 || cut) {
          if (current.current?.promptId === promptId) current.current = null;
          update(promptId, { status: "played" });
          return;
        }
      }
    },
    [stopPlayback, update],
  );

  useEffect(() => () => {
    generation.current += 1;
    sessionRef.current = undefined;
    stopPlayback();
    for (const list of urls.current.values()) for (const url of list) URL.revokeObjectURL(url);
    urls.current.clear();
    handled.current.clear();
  }, [stopPlayback]);

  // A new call: forget the last one's clips.
  useEffect(() => {
    if (sessionRef.current === sessionId) return;
    generation.current += 1;
    sessionRef.current = sessionId;
    automaticQueue.current = Promise.resolve();
    stopPlayback();
    setPlayingPromptId(undefined);
    for (const list of urls.current.values()) for (const url of list) URL.revokeObjectURL(url);
    urls.current.clear();
    handled.current.clear();
    setClips({});
  }, [sessionId, stopPlayback]);

  // The line closed: whatever was playing is gone with it.
  useEffect(() => {
    if (closed) stopPlayback();
  }, [closed, stopPlayback]);

  // Each prompt the simulator begins: fetch its clip, and play it if sound is on.
  useEffect(() => {
    if (!base || !sessionId || !config.userToken) return;
    const ownGeneration = generation.current;
    const isCurrent = () => generation.current === ownGeneration && sessionRef.current === sessionId;
    const autoPlay = () => isCurrent() && soundRef.current && !closedRef.current;
    for (const item of story.items) {
      if (item.kind !== "prompt" || handled.current.has(item.promptId)) continue;
      const promptId = item.promptId;
      handled.current.add(promptId);
      update(promptId, { status: "loading" });
      // Keep complete prerecorded prompts in source order even when media fetch/decode lags behind SSE.
      // Generation checks still cancel old work; stopPlayback releases an active wait on stop/unmount.
      automaticQueue.current = automaticQueue.current.catch(() => {}).then(async () => {
        if (!isCurrent()) return;
        const fetched: FetchedClip[] = [];
        try {
          const first = await fetchClip(base, config.userToken, sessionId, promptId, 0, 3_000);
          if (!isCurrent()) {
            if (first) URL.revokeObjectURL(first.url);
            return;
          }
          if (!first) {
            update(promptId, { status: "unavailable" });
            return;
          }
          setAvailable(true);
          fetched.push(first);
          update(promptId, { ...first.meta, status: autoPlay() ? "loading" : "muted" });
          // The waveform comes from the same bytes, decoded off the main audio path. It never delays playback.
          void peaksOf(first.blob).then((peaks) => {
            if (peaks && isCurrent()) update(promptId, { peaks });
          });
          urls.current.set(promptId, [first.url]);
          let playing = autoPlay() ? playFrom(promptId, [first.url], undefined, true) : Promise.resolve();
          // A prompt sent in fragments: each later fragment is fetched only if the simulator said one follows, and
          // played after the one before it.
          let last = first;
          for (let index = 1; !last.final && index < 8; index += 1) {
            const next = await fetchClip(base, config.userToken, sessionId, promptId, index, 5_000).catch(() => undefined);
            if (!isCurrent()) {
              if (next) URL.revokeObjectURL(next.url);
              return;
            }
            if (!next) break;
            fetched.push(next);
            urls.current.set(promptId, fetched.map((f) => f.url));
            await playing;
            if (!isCurrent()) return;
            playing = autoPlay() ? playFrom(promptId, [next.url], undefined, true) : Promise.resolve();
            last = next;
          }
          await playing;
        } catch {
          if (!isCurrent()) return;
          setAvailable((was) => was ?? false);
          update(promptId, { status: "unavailable" });
        }
      });
    }
  }, [story.items, base, sessionId, config.userToken, closed, update, playFrom]);

  // Prime the same media element in the start button's gesture for mobile autoplay policies.
  const unlock = useCallback(() => {
    if (typeof Audio === "undefined") return;
    const audio = (player.current ??= new Audio());
    if (current.current) return;
    const header = new ArrayBuffer(44 + 1600);
    const view = new DataView(header);
    const tag = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    tag(0, "RIFF"); view.setUint32(4, header.byteLength - 8, true); tag(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    tag(36, "data"); view.setUint32(40, 1600, true);
    const url = URL.createObjectURL(new Blob([header], {type: "audio/wav"}));
    audio.src = url;
    void audio.play().catch(() => {}).finally(() => URL.revokeObjectURL(url));
  }, []);

  const setSoundOn = useCallback(
    (on: boolean) => {
      if (on) unlock();
      setSoundOnState(on);
      try {
        localStorage.setItem(SOUND_KEY, on ? "on" : "off");
      } catch {
        // Only a convenience.
      }
      if (!on) stopPlayback();
    },
    [stopPlayback, unlock],
  );

  /** Replays one prompt, on the judge's click. */
  const replay = useCallback((promptId: string) => void playFrom(promptId, urls.current.get(promptId) ?? []), [playFrom]);

  /** The element really playing, so a waveform can follow its actual position. */
  const getPlayer = useCallback(() => player.current, []);

  return { unlock, soundOn, setSoundOn, clips, replay, audioEnabled: Boolean(base), available, playingPromptId, getPlayer, stop: stopPlayback };
}
