/**
 * The Line: the call drawn as a route. Each prompt is a station whose length follows its real audio; the decoded waveform
 * rides on the line, filled to the real playback position. The line steps up one level each time the simulator
 * acknowledges a key, holds as a double rail while waiting, and meets an open "?" where a person may be. Everything here
 * is derived from runtime events and real playback; before a call, a ghost preview of the scripted route is shown as such.
 */
import React, { useEffect, useRef } from "react";
import type { Milestone, PromptStep, StoryItem } from "../judge/story.js";
import { explainDecision } from "../judge/explain.js";
import type { ClipState } from "../judge/audio.js";
import { Waveform } from "./Waveform.js";
import { useAudioProgress } from "./useAudioProgress.js";
import { PREVIEW_ROUTE } from "./preview.js";

const secs = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)} s`);
const widthFor = (ms?: number) => Math.round(Math.min(290, Math.max(164, ((ms ?? 3000) / 1000) * 22)));
export const PREVIEW_TITLES = ["Broadband", "Billing", "Thank you", "Bill complaint", "On hold", "Your turn"] as const;

function routeKeys(event: React.KeyboardEvent<HTMLOListElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button.hb-station")];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  const step = /ArrowRight|ArrowDown/.test(event.key) ? 1 : /ArrowLeft|ArrowUp/.test(event.key) ? -1 : 0;
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : step ? (at + step + buttons.length) % buttons.length : -1;
  if (next < 0) return;
  event.preventDefault(); buttons[next]?.focus();
}

export interface Station {
  step: PromptStep;
  n: number;
  level: number;
  rise: boolean;
  hold: boolean;
  person?: "open" | "confirmed" | "rejected" | "ignored";
}

/** The route's geometry, from the story only: levels rise with each delivered key. */
export function stationsOf(items: StoryItem[]): Station[] {
  const stations: Station[] = [];
  let level = 0;
  let n = 0;
  for (const [i, item] of items.entries()) {
    if (item.kind !== "prompt") continue;
    n += 1;
    const previous = stations.at(-1);
    const rise = previous ? previous.step.presses.some((p) => p.state === "delivered") : false;
    if (rise) level += 1;
    const hold = item.decision?.kind === "listen" && item.decision.reason === "on_hold";
    // A person candidate belongs to the prompt it follows.
    const later = items.slice(i + 1);
    const nextPrompt = later.findIndex((x) => x.kind === "prompt");
    const until = nextPrompt < 0 ? later : later.slice(0, nextPrompt);
    const candidate = until.find((x): x is Milestone => x.kind === "milestone" && x.milestone === "possible_human");
    const confirmed = until.some((x) => x.kind === "milestone" && x.milestone === "handoff_confirmed");
    const rejected = until.some((x) => x.kind === "milestone" && x.milestone === "handoff_rejected");
    const person = candidate ? (!candidate.alerted ? "ignored" : confirmed ? "confirmed" : rejected ? "rejected" : "open") : undefined;
    stations.push({ step: item, n, level, rise, hold, ...(person ? { person } : {}) });
  }
  return stations;
}

interface RouteTrackProps {
  items: StoryItem[];
  clips: Record<string, ClipState>;
  playingId?: string;
  focusId?: string;
  onFocus: (promptId: string) => void;
  getPlayer: () => HTMLAudioElement | null;
  callClosed: boolean;
  terminationConfirmed?: boolean;
  /** How the call ended, so the line can pass to you. */
  ending?: "handoff" | "manual_takeover" | "stopped" | "failed";
}

export function RouteTrack({ items, clips, playingId, focusId, onFocus, getPlayer, callClosed, ending, terminationConfirmed }: RouteTrackProps) {
  const stations = stationsOf(items);
  const track = useRef<HTMLOListElement>(null);
  const last = stations.at(-1);

  // Follow the newest station as the call moves, unless the reader has picked one.
  useEffect(() => {
    const el = track.current?.querySelector<HTMLElement>(`[data-prompt="${focusId}"]`);
    if (!el || !track.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const box = track.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if ((r.left < box.left || r.right > box.right) && typeof track.current.scrollBy === "function") track.current.scrollBy({ left: r.left - box.left - 48, behavior: reduce ? "auto" : "smooth" });
  }, [focusId, stations.length]);

  // When the line closes, show where it ended: yours, or stopped.
  useEffect(() => {
    if (!callClosed || !track.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const el = track.current;
    if (typeof el.scrollTo === "function") el.scrollTo({ left: el.scrollWidth, behavior: reduce ? "auto" : "smooth" });
    else el.scrollLeft = el.scrollWidth;
  }, [callClosed]);

  const yours = terminationConfirmed && (ending === "handoff" || ending === "manual_takeover");
  return (
    <ol className="hb-track" ref={track} aria-label="The call so far, as a route" onKeyDown={routeKeys}>
      {stations.map((s) => {
        const clip = clips[s.step.promptId];
        const rec = s.step.recognition;
        const explained = explainDecision(s.step.decision, s.step.abstained);
        const press = s.step.presses.at(-1);
        const playing = playingId === s.step.promptId;
        const duration = clip?.durationMs ?? s.step.audioMs;
        const unheard = !rec && !s.step.sttFailure && callClosed;
        return (
          <li key={s.step.promptId} className="hb-track-item" style={{ ["--w" as string]: `${widthFor(duration)}px` }} data-prompt={s.step.promptId}>
            <button
              type="button"
              className={`hb-log-row hb-station ${focusId === s.step.promptId ? "is-focus" : ""} ${playing ? "is-playing" : ""} ${s.hold ? "is-hold" : ""}`}
              aria-pressed={focusId === s.step.promptId}
              tabIndex={focusId === s.step.promptId ? 0 : -1}
              aria-controls="hb-current-prompt"
              onFocus={() => onFocus(s.step.promptId)}
              onClick={() => onFocus(s.step.promptId)}
              aria-label={`Prompt ${s.n}${explained ? `: ${explained.headline}` : ""}`}
            >
              <span className="hb-station-head">
                <span className="hb-log-n hb-station-n hb-num">{s.n}</span>
                <span className="hb-station-time hb-num">{secs(duration)}</span>
                {playing && <span className="hb-station-live">Playing</span>}
              </span>
              <span className="hb-log-text hb-station-said">
                {s.person ? "Possible person" : s.hold ? "On hold" : rec ? (s.step.decision?.kind === "press" ? "Menu choice" : s.step.decision?.kind === "abstain" ? "Choice refused" : "Announcement") : (s.step.sttFailure ? "Recognition failed" : unheard ? "Not recognized" : playing ? "Speaking…" : "Recognising…")}
              </span>
              <Rail station={s} clip={clip} playing={playing} getPlayer={getPlayer} press={press} refused={explained?.tone === "refuse" && !press} />
              <span className={`hb-station-act tone-${explained?.tone ?? "none"}`}>{explained?.headline ?? (s.step.sttFailure ? "Nothing pressed" : "")}</span>
            </button>
          </li>
        );
      })}
      {callClosed && last && (
        <li className={`hb-track-item hb-track-end ${yours ? "is-yours" : "is-ended"}`} style={{ ["--w" as string]: "180px" }}>
          <span className="hb-station hb-station-end" aria-label={yours ? "The line passes to you" : terminationConfirmed ? "The line ends" : "Automation ended; line closure unconfirmed"}>
            <span className="hb-station-head"><span className="hb-station-time">{yours ? "You" : terminationConfirmed ? "Ended" : "Checking closure"}</span></span>
            <span className="hb-station-said">{yours ? "The call is yours." : terminationConfirmed ? "No key after this." : "Line closure unconfirmed."}</span>
            <span className="hb-rail" style={{ ["--level" as string]: last.level + (last.step.presses.some((p) => p.state === "delivered") ? 1 : 0) }}>
              <span className="hb-rail-line is-end" />
              <span className="hb-rail-terminus" />
            </span>
            <span className="hb-station-act" />
          </span>
        </li>
      )}
    </ol>
  );
}

function Rail({ station, clip, playing, getPlayer, press, refused }: { station: Station; clip?: ClipState; playing: boolean; getPlayer: () => HTMLAudioElement | null; press?: PromptStep["presses"][number]; refused?: boolean }) {
  const rail = useRef<HTMLSpanElement>(null);
  useAudioProgress(rail, playing, clip?.status === "played" || Boolean(station.step.recognition), getPlayer);
  return (
    <span className={`hb-rail ${station.hold ? "is-hold" : ""}`} ref={rail} style={{ ["--level" as string]: station.level }}>
      {station.rise && (
        <svg className="hb-rail-riser" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M0 28 L28 0" />
        </svg>
      )}
      <span className="hb-rail-wave">
        <Waveform peaks={clip?.peaks} durationMs={clip?.durationMs} playing={playing} played={clip?.status === "played"} getPlayer={getPlayer} compact />
      </span>
      <span className="hb-rail-line" />
      <span className="hb-rail-fill" />
      <span className="hb-rail-dot" />
      {press && (
        <span className={`hb-rail-key is-${press.state}`} aria-hidden="true">
          {press.digit}
        </span>
      )}
      {/* A refusal ends the line here, like a buffer stop: nothing was pressed. */}
      {refused && <span className="hb-rail-stop" aria-hidden="true" />}
      {station.person && <span className={`hb-rail-person is-${station.person}`} aria-hidden="true">{station.person === "confirmed" ? "" : "?"}</span>}
    </span>
  );
}

/** Before a call: the scripted route as a ghost. Each stop can be explored; nothing plays. */
export function PreviewTrack({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  let level = 0;
  return (
    <ol className="hb-track is-preview" aria-label="Preview of the scripted Hindi route" onKeyDown={routeKeys}>
      {PREVIEW_ROUTE.map((stop, i) => {
        const rise = i > 0 && Boolean(PREVIEW_ROUTE[i - 1]!.key);
        if (rise) level += 1;
        return (
          <li key={i} className="hb-track-item" style={{ ["--w" as string]: `${widthFor(stop.durationMs)}px` }}>
            <button type="button" className={`hb-station is-preview ${selected === i ? "is-focus" : ""} ${stop.kind === "hold" ? "is-hold" : ""}`} aria-pressed={selected === i} aria-controls="hb-preview-detail" aria-label={`Stop ${i + 1}: ${PREVIEW_TITLES[i]}`} tabIndex={selected === i ? 0 : -1} onClick={() => onSelect(i)} onFocus={() => onSelect(i)}>
              <span className="hb-station-head">
                <span className="hb-station-n hb-num">{i + 1}</span>
                <span className="hb-station-time hb-num">{secs(stop.durationMs)}</span>
              </span>
              <span className="hb-station-said">{PREVIEW_TITLES[i]}</span>
              <span className={`hb-rail ${stop.kind === "hold" ? "is-hold" : ""}`} style={{ ["--level" as string]: level }}>
                {rise && (
                  <svg className="hb-rail-riser" viewBox="0 0 28 28" aria-hidden="true">
                    <path d="M0 28 L28 0" />
                  </svg>
                )}
                <span className="hb-rail-line" />
                <span className="hb-rail-dot" />
                {stop.key && <span className="hb-rail-key is-expected" aria-hidden="true">{stop.key}</span>}
                {stop.kind === "agent" && <span className="hb-rail-person is-open" aria-hidden="true">?</span>}
              </span>
              <span className="hb-station-act">{stop.key ? `Expects ${stop.key}` : stop.kind === "hold" ? "Waits" : stop.kind === "agent" ? "Asks you" : "Listens"}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
