/**
 * Hold and possible-person state for one call, folded from the runtime's published events. The fields
 * read here are the only inputs, so simulator wiring and fixture maps have no way in. It has no timers
 * or I/O, and it never presses anything: the actions it offers go through the runtime's own API.
 */
import { classifyHeard, sameWords } from "./classify.js";

export type HandoffPhase = "navigating" | "on_hold" | "possible_human" | "handoff_confirmed" | "user_takeover" | "stopped" | "failed";
export type HandoffAction = "take_over" | "stop" | "confirm_person" | "not_a_person";
export type NotificationKind = "HOLD_STARTED" | "POSSIBLE_HUMAN" | "ALERT_WITHDRAWN" | "CHECK_LINE" | "LINE_SILENT" | "PRESS_WHILE_WAITING" | "CALL_ENDED";

export interface PossibleHumanAlert {
  type: "POSSIBLE_HUMAN";
  strength: "moderate" | "strong";
  evidence: string;
  /** REAL_API or MOCK, exactly as the runtime labelled the transcript. */
  evidenceSource: string;
  observationId: number;
  seq: number;
  /** Present while the runtime will accept a confirm or reject for this request. */
  requestId?: string;
}

export interface HandoffNotification {
  /** Stable across replays, so a reconnect doesn't notify twice. */
  id: string;
  kind: NotificationKind;
  seq: number;
  message: string;
  reason?: string;
}

export interface HandoffState {
  phase: HandoffPhase;
  /** Every call today is on the fictional simulator. No real line exists to detect a person on. */
  line: "FICTIONAL_SIMULATOR";
  lastSeq: number;
  alert?: PossibleHumanAlert;
  holdPrompts: number;
  silentPrompts: number;
  /** Runtime candidates not raised as alerts because the words sounded automated or repeated. */
  ignoredCandidates: number;
  pressesWhileWaiting: number;
  heldOnce: boolean;
  deliveredPresses: number;
  lastAudioAtMs?: number;
  silenceNotified: boolean;
  closed: boolean;
  dtmfInFlight: boolean;
  /** The runtime's code for why the call failed. Never provider text. */
  failureReason?: string;
  notifications: HandoffNotification[];
  /** Internal. Words so far, used to spot a recording that repeats. Never shown. */
  heard: string[];
  pending?: { observationId: number; transcript: string; source: string };
  fragments?: { promptId: string; parts: string[] };
}

/** The envelope every runtime event has. Anything else is read field by field below. */
export interface HandoffInput {
  type: string;
  seq: number;
  at?: string;
  dataSource?: string;
}

export const initialHandoffState = (): HandoffState => ({
  phase: "navigating",
  line: "FICTIONAL_SIMULATOR",
  lastSeq: 0,
  holdPrompts: 0,
  silentPrompts: 0,
  ignoredCandidates: 0,
  pressesWhileWaiting: 0,
  heldOnce: false,
  deliveredPresses: 0,
  silenceNotified: false,
  closed: false,
  dtmfInFlight: false,
  notifications: [],
  heard: [],
});

const MAX_NOTIFICATIONS = 50;
const MAX_HEARD = 64;
export const LINE_SILENT_AFTER_MS = 180_000;

const MESSAGES: Record<NotificationKind, string> = {
  HOLD_STARTED: "On hold. HoldBuddy is waiting and won't press anything for hold messages.",
  POSSIBLE_HUMAN: "Someone may have answered. Listen, then take over. This could still be a recording.",
  ALERT_WITHDRAWN: "That no longer looks like a person. Still waiting.",
  CHECK_LINE: "The line changed, but it isn't clear how. Listen if you can.",
  LINE_SILENT: "Nothing has been heard for a while. The call may have dropped.",
  PRESS_WHILE_WAITING: "A digit was pressed while waiting, because the speech offered a matching menu option.",
  CALL_ENDED: "The call has ended.",
};

function notify(state: HandoffState, kind: NotificationKind, seq: number, reason?: string): HandoffState {
  const notification: HandoffNotification = { id: `${kind}:${seq}`, kind, seq, message: MESSAGES[kind], ...(reason ? { reason } : {}) };
  return { ...state, notifications: [...state.notifications, notification].slice(-MAX_NOTIFICATIONS) };
}

function withdraw(state: HandoffState, seq: number, reason: string): HandoffState {
  const { alert: _alert, ...rest } = state;
  return notify({ ...rest, phase: state.heldOnce ? "on_hold" : "navigating" }, "ALERT_WITHDRAWN", seq, reason);
}

function assess(state: HandoffState, transcript: string, source: string, observationId: number, seq: number): HandoffState {
  const words = sameWords(transcript);
  const repeated = state.heard.includes(words);
  const next: HandoffState = { ...state, heard: repeated ? state.heard : [...state.heard, words].slice(-MAX_HEARD) };
  const heard = classifyHeard(transcript);
  // Identical words twice is how a recording behaves, even if the first hearing looked like a greeting.
  if (repeated) return next.alert ? withdraw(next, seq, "repeated_recording") : next;
  if (heard.kind === "automated") return next.alert ? withdraw(next, seq, "sounded_automated") : next;
  const waiting = state.heldOnce || state.deliveredPresses > 0;
  if (heard.kind === "greeting" && waiting) {
    return notify(
      { ...next, phase: "possible_human", alert: { type: "POSSIBLE_HUMAN", strength: heard.strength!, evidence: heard.evidence!, evidenceSource: source, observationId, seq } },
      "POSSIBLE_HUMAN",
      seq,
    );
  }
  // A greeting before any navigation is usually the IVR's own front door.
  if (heard.kind === "greeting" || heard.kind === "unclear" || (heard.kind === "other" && state.phase === "on_hold")) {
    return notify(next, "CHECK_LINE", seq, heard.kind === "other" ? "new_speech_while_waiting" : heard.kind === "greeting" ? "greeting_before_navigation" : "unclear_speech");
  }
  return next;
}

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

export function reduceHandoff(state: HandoffState, input: HandoffInput): HandoffState {
  if (input.seq <= state.lastSeq) return state;
  const event = input as unknown as Record<string, unknown>;
  const at = input.at ? Date.parse(input.at) : Number.NaN;
  let next: HandoffState = { ...state, lastSeq: input.seq };
  if (state.closed) return next;
  const { seq } = input;

  switch (input.type) {
    case "transcript.observed": {
      next = { ...next, silenceNotified: false, ...(Number.isFinite(at) ? { lastAudioAtMs: at } : {}) };
      const transcript = text(event.transcript) ?? "";
      const promptId = text(event.promptId) ?? "";
      if (event.status !== "transcribed") {
        const { pending: _pending, fragments: _fragments, ...rest } = next;
        return event.status === "no_speech" && state.phase === "on_hold" ? { ...rest, silentPrompts: state.silentPrompts + 1 } : rest;
      }
      const parts = next.fragments?.promptId === promptId ? [...next.fragments.parts, transcript] : [transcript];
      if (event.promptComplete !== true) return { ...next, fragments: { promptId, parts } };
      const { fragments: _fragments, ...rest } = next;
      return { ...rest, pending: { observationId: Number(event.observationId), transcript: parts.join(" "), source: input.dataSource ?? "NONE" } };
    }
    case "decision.made": {
      const decision = event.decision as { kind?: unknown; reason?: unknown } | undefined;
      const { pending, ...rest } = next;
      if (!pending || pending.observationId !== event.observationId) return next;
      if (decision?.kind === "listen" && (decision.reason === "on_hold" || decision.reason === "no_menu_detected")) {
        if (classifyHeard(pending.transcript).kind === "hold") {
          const held: HandoffState = { ...rest, holdPrompts: state.holdPrompts + 1 };
          return held.alert ? withdraw(held, seq, "hold_resumed") : held;
        }
        return assess(rest, pending.transcript, pending.source, pending.observationId, seq);
      }
      // Anything else was a menu. Menus are automated by nature, so an open alert can't stand.
      return rest.alert ? withdraw(rest, seq, "menu_resumed") : rest;
    }
    case "hold.started": {
      const held: HandoffState = { ...next, heldOnce: true, ...(next.alert ? {} : { phase: "on_hold" as const }) };
      return state.heldOnce ? held : notify(held, "HOLD_STARTED", seq);
    }
    case "dtmf.requested": {
      if (state.phase !== "on_hold") return next;
      return notify({ ...next, pressesWhileWaiting: state.pressesWhileWaiting + 1 }, "PRESS_WHILE_WAITING", seq);
    }
    case "dtmf.acknowledged":
      return event.outcome === "delivered" ? { ...next, deliveredPresses: state.deliveredPresses + 1, ...(state.phase === "on_hold" ? { phase: "navigating" as const, heldOnce: false } : {}) } : next;
    case "stt.failed":
      return notify(next, "CHECK_LINE", seq, "speech_not_understood");
    case "handoff.possible_human": {
      const requestId = text(event.requestId);
      if (next.alert && requestId) return { ...next, alert: { ...next.alert, requestId } };
      return { ...next, ignoredCandidates: state.ignoredCandidates + 1 };
    }
    case "handoff.expired": {
      if (!next.alert || next.alert.requestId !== event.requestId) return next;
      const { requestId: _requestId, ...alert } = next.alert;
      return { ...next, alert };
    }
    case "handoff.rejected":
      return next.alert && next.alert.requestId === event.requestId ? withdraw(next, seq, "user_rejected") : next;
    case "handoff.confirmed": {
      const { alert: _alert, ...rest } = next;
      return { ...rest, phase: "handoff_confirmed" };
    }
    case "session.closed": {
      const { alert: _alert, pending: _pending, ...rest } = next;
      const phases: Record<string, HandoffPhase> = { handoff: "handoff_confirmed", manual_takeover: "user_takeover", stopped: "stopped", failed: "failed" };
      const failureReason = text((event.failure as { reason?: unknown } | undefined)?.reason);
      return notify({ ...rest, closed: true, phase: phases[text(event.outcome) ?? ""] ?? "stopped", dtmfInFlight: event.dtmfInFlight !== undefined, ...(failureReason ? { failureReason } : {}) }, "CALL_ENDED", seq, text(event.outcome));
    }
    default:
      return next;
  }
}

/** Call now and then. Silence on hold is normal, so this only speaks up after a long time. */
export function tickHandoff(state: HandoffState, nowMs: number, silentAfterMs = LINE_SILENT_AFTER_MS): HandoffState {
  if (state.closed || state.phase !== "on_hold" || state.silenceNotified || state.lastAudioAtMs === undefined) return state;
  if (nowMs - state.lastAudioAtMs < silentAfterMs) return state;
  return notify({ ...state, silenceNotified: true }, "LINE_SILENT", state.lastSeq);
}

/** What the user can do now. Taking over and stopping are always there until the call closes. */
export function availableActions(state: HandoffState): HandoffAction[] {
  if (state.closed) return [];
  return ["take_over", "stop", ...(state.alert?.requestId ? (["confirm_person", "not_a_person"] as const) : [])];
}
