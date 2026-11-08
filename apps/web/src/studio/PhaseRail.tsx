import React from "react";
import type { HandoffState } from "../../../../packages/handoff/src/index.js";
import type { CallStory } from "../judge/story.js";
import type { SessionView } from "../types.js";

export type PhaseStatus = "idle" | "current" | "done" | "skipped" | "failed";
export interface Phase {
  key: "connect" | "menus" | "hold" | "person" | "outcome";
  label: string;
  /** For narrow screens. */
  short: string;
  detail: string;
  status: PhaseStatus;
}

const OUTCOME_LABEL: Record<string, string> = { handoff: "Handed over", manual_takeover: "You took over", stopped: "Stopped", failed: "Failed" };
const OUTCOME_SHORT: Record<string, string> = { handoff: "Handed", manual_takeover: "Yours", stopped: "Ended", failed: "Failed" };

/** The call's stages, read only from the session, its events and the handoff reducer. */
export function phasesOf(session: SessionView | null, story: CallStory, handoff: HandoffState): Phase[] {
  const closed = Boolean(session?.closed || story.outcome.closed);
  const started = Boolean(session);
  const heard = story.items.some((i) => i.kind === "prompt");
  const alerted = story.items.some((i) => i.kind === "milestone" && i.milestone === "possible_human" && i.alerted);
  const held = handoff.heldOnce;
  const outcome = story.outcome.outcome;
  const pick = (done: boolean, current: boolean): PhaseStatus => (done ? "done" : current ? "current" : closed ? "skipped" : "idle");

  return [
    { key: "connect", label: "Dial", short: "Dial", detail: "The fictional line answers", status: !started ? "idle" : pick(heard || closed, !heard) },
    { key: "menus", label: "Menus", short: "Menus", detail: "Listen, decide, press", status: !started ? "idle" : pick(held || alerted || (closed && heard), heard && handoff.phase === "navigating" && !closed) },
    { key: "hold", label: "Hold", short: "Hold", detail: "Wait without pressing", status: !started ? "idle" : pick(held && handoff.phase !== "on_hold", handoff.phase === "on_hold" && !closed) },
    { key: "person", label: "Person?", short: "Person", detail: "Ask you, never assume", status: !started ? "idle" : pick(alerted && (closed || handoff.phase !== "possible_human"), handoff.phase === "possible_human" && !closed) },
    {
      key: "outcome",
      label: closed && outcome ? (OUTCOME_LABEL[outcome] ?? "Ended") : "Outcome",
      short: closed && outcome ? (OUTCOME_SHORT[outcome] ?? "Ended") : "End",
      detail: closed ? (outcome === "failed" ? "Ended safely on a failure" : "Automation has ended") : "Handed back to you",
      status: !closed ? "idle" : outcome === "failed" ? "failed" : "done",
    },
  ];
}

export function PhaseRail({ phases }: { phases: Phase[] }) {
  const current = phases.find((p) => p.status === "current");
  return (
    <ol className="hb-phases" aria-label={`Call stage${current ? `: ${current.label}` : ""}`}>
      {phases.map((phase) => (
        <li key={phase.key} className={`hb-phase is-${phase.status}`} aria-current={phase.status === "current" ? "step" : undefined}>
          <span className="hb-phase-node" aria-hidden="true" />
          <span className="hb-phase-text">
            <span className="hb-phase-label">{phase.label}</span>
            <span className="hb-phase-short" aria-hidden="true">{phase.short}</span>
            <span className="hb-phase-detail">{phase.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
