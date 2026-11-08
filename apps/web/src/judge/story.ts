/**
 * The judge view's model of a call, derived only from the runtime's published events and session view.
 *
 * Nothing here is invented or predicted: every field is copied from an event the runtime sent, or left out. A press is
 * "delivered" only when the simulator's acknowledgement says so, and a recognition's source is the runtime's own
 * dataSource label, never a guess from the text. Pure and browser-safe, so it can be tested against real event streams.
 */
import { initialHandoffState, reduceHandoff } from "../../../../packages/handoff/src/index.js";
import type { DataSource, DtmfDigit, MenuDecision, RuntimeEvent, SessionView } from "../types.js";

export type PressState = "requested" | "delivered" | "not_delivered" | "unknown" | "refused" | "withdrawn";

export interface StoryPress {
  actionId: string;
  digit: DtmfDigit;
  state: PressState;
  /** Why the runtime refused or withdrew it, as the runtime's own code. */
  detail?: string;
  requestedAtMs: number;
  settledAtMs?: number;
}

export interface StoryRecognition {
  providerId?: string;
  dataSource: DataSource;
  status: string;
  transcript: string;
  detectedLanguageCode?: string;
  /** stt.started to transcript.observed, as the runtime timed them. Absent if either is missing. */
  latencyMs?: number;
}

export interface PromptStep {
  kind: "prompt";
  promptId: string;
  firstSeq: number;
  startedAtMs: number;
  audioMs?: number;
  audioRejected?: string[];
  recognition?: StoryRecognition;
  sttFailure?: { code: string; fatal: boolean };
  decision?: MenuDecision;
  /** decision.abstained carries no observation id; it is attached to the prompt it followed. */
  abstained?: string;
  /** A decision.abstained that ended an open question rather than refusing a key, such as request_superseded. */
  requestEnded?: string;
  clarification?: { reason: string; candidates: string[]; answered: boolean };
  presses: StoryPress[];
  engineRejections: string[];
}

export type MilestoneKind =
  | "hold_started"
  | "hold_ended"
  | "possible_human"
  | "human_assessed"
  | "handoff_confirmed"
  | "handoff_rejected"
  | "handoff_expired"
  | "alert_withdrawn"
  | "closed";

export interface Milestone {
  kind: "milestone";
  milestone: MilestoneKind;
  firstSeq: number;
  atMs: number;
  /** Plain values copied from the event: evidence words, who confirmed, the closure outcome. */
  detail?: string;
  by?: string;
  /**
   * For a runtime possible-person candidate: whether the handoff layer (packages/handoff, the same reducer the banner
   * uses) turned it into an alert for the user. A candidate it didn't adopt was never shown to the user as a person.
   */
  alerted?: boolean;
}

export type StoryItem = PromptStep | Milestone;

export interface StoryOutcome {
  closed: boolean;
  outcome?: string;
  failure?: string;
  /** Digits the simulator acknowledged as delivered, in order. */
  delivered: DtmfDigit[];
  notDelivered: DtmfDigit[];
  unknownDelivery: DtmfDigit[];
  refusals: number;
  recognitions: { total: number; bySource: Partial<Record<DataSource, number>>; providers: string[] };
  budget?: { used: number; limit: number };
  simulatorStop?: SessionView["simulatorStop"];
  dtmfInFlight?: DtmfDigit;
  callMs?: number;
}

export interface CallStory {
  sessionId?: string;
  goal?: string;
  sttMode?: string;
  items: StoryItem[];
  outcome: StoryOutcome;
}

const REFUSING = new Set(["abstain", "clarify"]);
/** decision.abstained reasons that close an open question instead of refusing a key. */
const REQUEST_ENDINGS = new Set(["request_superseded", "clarification_timeout", "clarification_limit"]);

export function buildCallStory(events: readonly RuntimeEvent[], session: SessionView | null): CallStory {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const items: StoryItem[] = [];
  const prompts = new Map<string, PromptStep>();
  const promptOfSegment = new Map<string, string>();
  const promptOfObservation = new Map<number, string>();
  const sttStart = new Map<string, { atMs: number; providerId: string }>();
  const pressById = new Map<string, StoryPress>();
  let lastPrompt: PromptStep | undefined;
  let lastDecisionPrompt: PromptStep | undefined;
  let sttMode: string | undefined = session?.sttMode;
  let budget: { used: number; limit: number } | undefined = session?.requestBudget;
  let handoff = initialHandoffState();

  const promptFor = (promptId: string, event: RuntimeEvent): PromptStep => {
    let step = prompts.get(promptId);
    if (!step) {
      step = { kind: "prompt", promptId, firstSeq: event.seq, startedAtMs: event.atMs, presses: [], engineRejections: [] };
      prompts.set(promptId, step);
      items.push(step);
    }
    lastPrompt = step;
    return step;
  };
  const milestone = (event: RuntimeEvent, kind: MilestoneKind, detail?: string, by?: string, extra: Partial<Milestone> = {}) => {
    items.push({ kind: "milestone", milestone: kind, firstSeq: event.seq, atMs: event.atMs, ...(detail !== undefined ? { detail } : {}), ...(by ? { by } : {}), ...extra });
  };

  for (const event of ordered) {
    // The handoff layer's view, before and after this event, exactly as the banner computes it.
    const alertBefore = Boolean(handoff.alert);
    const notesBefore = handoff.notifications.length;
    handoff = reduceHandoff(handoff, event);
    for (const note of handoff.notifications.slice(notesBefore)) {
      if (note.kind === "ALERT_WITHDRAWN") milestone(event, "alert_withdrawn", note.reason);
    }
    switch (event.type) {
      case "session.started":
        sttMode = event.sttMode;
        break;
      case "source.started":
        promptOfSegment.set(event.segmentId, event.promptId);
        promptFor(event.promptId, event);
        break;
      case "audio.segment_received":
        promptOfSegment.set(event.segmentId, event.promptId);
        promptFor(event.promptId, event);
        break;
      case "audio.segment_accepted": {
        promptOfSegment.set(event.segmentId, event.promptId);
        const step = promptFor(event.promptId, event);
        step.audioMs = (step.audioMs ?? 0) + event.durationMs;
        break;
      }
      case "audio.segment_rejected": {
        const step = promptFor(event.promptId, event);
        step.audioRejected = [...(step.audioRejected ?? []), ...event.reasons];
        break;
      }
      case "stt.started":
        sttStart.set(event.segmentId, { atMs: event.atMs, providerId: event.providerId });
        if (event.requestBudget) budget = event.requestBudget;
        break;
      case "stt.failed": {
        const promptId = promptOfSegment.get(event.segmentId);
        if (promptId) promptFor(promptId, event).sttFailure = { code: event.code, fatal: event.fatal };
        break;
      }
      case "transcript.observed": {
        const step = promptFor(event.promptId, event);
        promptOfObservation.set(event.observationId, event.promptId);
        const started = sttStart.get(event.segmentId);
        step.recognition = {
          ...(started ? { providerId: started.providerId, latencyMs: Math.max(0, event.atMs - started.atMs) } : {}),
          dataSource: event.dataSource,
          status: event.status,
          // Fragments of one prompt are joined in order, as the runtime observed them.
          transcript: step.recognition && step.recognition.transcript !== event.transcript ? `${step.recognition.transcript} ${event.transcript}`.trim() : event.transcript,
          ...(event.detectedLanguageCode ? { detectedLanguageCode: event.detectedLanguageCode } : {}),
        };
        break;
      }
      case "decision.made": {
        const promptId = event.observationId !== undefined ? promptOfObservation.get(event.observationId) : undefined;
        const step = promptId ? prompts.get(promptId) : lastPrompt;
        if (step) {
          step.decision = event.decision;
          lastDecisionPrompt = step;
        }
        break;
      }
      case "decision.abstained":
        if (lastPrompt) {
          if (REQUEST_ENDINGS.has(event.reason)) lastPrompt.requestEnded = event.reason;
          else lastPrompt.abstained = event.reason;
        }
        break;
      case "clarification.requested":
        if (lastPrompt) lastPrompt.clarification = { reason: event.reason, candidates: event.candidates.map((c) => `${c.digit}: ${c.label}`), answered: false };
        break;
      case "clarification.answered":
        for (const step of prompts.values()) if (step.clarification) step.clarification.answered = true;
        break;
      case "engine.rejected":
        lastPrompt?.engineRejections.push(event.code);
        break;
      case "dtmf.requested": {
        const press: StoryPress = { actionId: event.actionId, digit: event.digit, state: "requested", requestedAtMs: event.atMs };
        pressById.set(event.actionId, press);
        (lastDecisionPrompt ?? lastPrompt)?.presses.push(press);
        break;
      }
      case "dtmf.acknowledged": {
        const press = pressById.get(event.actionId);
        if (press) Object.assign(press, { state: event.outcome, settledAtMs: event.atMs });
        break;
      }
      case "dtmf.unknown": {
        const press = pressById.get(event.actionId);
        if (press) Object.assign(press, { state: "unknown", settledAtMs: event.atMs });
        break;
      }
      case "dtmf.refused": {
        const press = pressById.get(event.actionId);
        if (press) Object.assign(press, { state: "refused", detail: event.refusal, settledAtMs: event.atMs });
        break;
      }
      case "dtmf.withdrawn": {
        const press = pressById.get(event.actionId);
        if (press) Object.assign(press, { state: "withdrawn", detail: event.reason, settledAtMs: event.atMs });
        break;
      }
      case "hold.started":
        milestone(event, "hold_started");
        break;
      case "hold.ended":
        milestone(event, "hold_ended", event.to);
        break;
      case "handoff.possible_human":
        milestone(event, "possible_human", event.evidence, undefined, { alerted: alertBefore });
        break;
      case "handoff.assessed":
        milestone(event, "human_assessed", event.assessment, event.by);
        break;
      case "handoff.confirmed":
        milestone(event, "handoff_confirmed", undefined, event.by);
        break;
      case "handoff.rejected":
        milestone(event, "handoff_rejected", undefined, event.by);
        break;
      case "handoff.expired":
        milestone(event, "handoff_expired");
        break;
      case "session.closed":
        milestone(event, "closed", event.outcome);
        break;
      default:
        break;
    }
  }

  const presses = [...prompts.values()].flatMap((step) => step.presses);
  const recognitions = [...prompts.values()].flatMap((step) => (step.recognition ? [step.recognition] : []));
  const bySource: Partial<Record<DataSource, number>> = {};
  for (const r of recognitions) bySource[r.dataSource] = (bySource[r.dataSource] ?? 0) + 1;
  const closedEvent = ordered.find((e): e is Extract<RuntimeEvent, { type: "session.closed" }> => e.type === "session.closed");
  const closure = closedEvent ?? session?.closure;
  const failure = closure?.failure ? `${closure.failure.source}:${closure.failure.reason}` : undefined;
  const first = ordered[0];

  return {
    ...(session?.sessionId ?? first?.sessionId ? { sessionId: session?.sessionId ?? first?.sessionId } : {}),
    ...(session?.goal ? { goal: session.goal } : {}),
    ...(sttMode ? { sttMode } : {}),
    items,
    outcome: {
      closed: Boolean(closedEvent) || Boolean(session?.closed),
      ...(closure?.outcome ? { outcome: closure.outcome } : {}),
      ...(failure ? { failure } : {}),
      delivered: presses.filter((p) => p.state === "delivered").map((p) => p.digit),
      notDelivered: presses.filter((p) => p.state === "not_delivered").map((p) => p.digit),
      unknownDelivery: presses.filter((p) => p.state === "unknown").map((p) => p.digit),
      refusals: [...prompts.values()].filter((s) => (s.decision && REFUSING.has(s.decision.kind)) || s.abstained).length,
      recognitions: { total: recognitions.length, bySource, providers: [...new Set(recognitions.flatMap((r) => (r.providerId ? [r.providerId] : [])))] },
      ...(budget ? { budget } : {}),
      ...(session?.simulatorStop ? { simulatorStop: session.simulatorStop } : {}),
      ...(closure?.dtmfInFlight ? { dtmfInFlight: closure.dtmfInFlight.digit } : {}),
      ...(first && closedEvent ? { callMs: closedEvent.atMs - first.atMs } : {}),
    },
  };
}
