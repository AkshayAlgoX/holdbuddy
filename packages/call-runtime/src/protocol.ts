/**
 * The wire protocol described in docs/runtime/integration-contract.md. Types and constants only, with
 * no Node imports, so a browser bundle can import this file.
 */
import type {
  AbstainReason,
  ClarifyReason,
  DtmfDigit,
  FailureReason,
  MenuDecision,
  MenuOption,
  ObservationProvenance,
  SessionStatus,
  TranscriptionStatus,
  TransitionErrorCode, PreferredLanguage } from "@holdbuddy/ivr-core";

export const PROTOCOL_VERSION = "holdbuddy.runtime.v1";
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type { DtmfDigit, MenuDecision, MenuOption, ObservationProvenance };

export type SttMode = "offline_mock" | "live_prisma";
export type DataSource = "REAL_API" | "MOCK" | "NONE";

/** The only mapping from verified core provenance to a display label. */
export function dataSourceOf(provenance: ObservationProvenance | undefined): DataSource {
  if (provenance === undefined) return "NONE";
  return provenance === "prisma_stt" ? "REAL_API" : "MOCK";
}

export type PublicSessionStatus = SessionStatus | "manual_takeover";

export type RuntimeFailureReason =
  | "stt_budget_exhausted"
  | "stt_fatal"
  | "stt_repeated_failure"
  | "stt_provenance_mismatch"
  | "audio_rejection_limit"
  | "simulator_start_failed"
  /** No audio and no user action for too long: the line may be dead. */
  | "source_silent"
  /** The call reached its overall time limit. */
  | "call_time_limit"
  /**
   * Presses kept being overtaken by newer audio before they could be sent, more often in a row than a call recovers
   * from. None of them was handed to the line.
   */
  | "stale_decision"
  | "internal_error";

/**
 * A trusted source's word that it has begun a prompt, sent before any of the prompt's audio, with the source token only.
 * The first segment it names is the one whose upload will follow. sourceSequence rises by one or more with each notice.
 */
export interface SourceStartNotice {
  segmentId: string;
  promptId: string;
  fragmentIndex: number;
  dtmfCountAtStart: number;
  sourceSequence: number;
}

/** What became of a notice. Only "accepted" changes anything. */
export type SourceStartOutcome = "accepted" | "duplicate" | "out_of_order" | "prompt_already_known" | "prompt_closed" | "stale_after_dtmf";

export type ClosureOutcome = "stopped" | "failed" | "manual_takeover" | "handoff";

export interface SessionClosure {
  outcome: ClosureOutcome;
  failure?: { source: "core"; reason: FailureReason } | { source: "runtime"; reason: RuntimeFailureReason };
  /** A press with no known result when the session closed. Its delivery must be shown as unknown. */
  dtmfInFlight?: { actionId: string; digit: DtmfDigit };
}

/**
 * Whether the simulator has been told to stop. A call closes for the user at once, so `session.closed` can come
 * first. Only `confirmed` means the simulator has stopped. `failed` means it may still be running.
 */
export type SimulatorStopState = "pending" | "confirmed" | "failed";

export interface RequestBudget {
  used: number;
  limit: number;
}

export interface SessionView {
  protocolVersion: ProtocolVersion;
  sessionId: string;
  status: PublicSessionStatus;
  closed: boolean;
  sttMode: SttMode;
  goal: string;
  lastSeq: number;
  pendingPress?: { actionId: string; digit: DtmfDigit; deadlineMs: number };
  pendingRequest?: { requestId: string; kind: "clarification" | "human"; deadlineMs: number };
  closure?: SessionClosure;
  simulatorStop?: SimulatorStopState;
  requestBudget?: RequestBudget;
}

export interface CreateSessionRequest {
  goal: string;
  /** The user's language, for language menus. It's independent of the goal's and the IVR's language. */
  preferredLanguage?: PreferredLanguage;
  /** Opaque. Passed to the simulator's startCall only, and never to the engine. */
  simulatorScenarioId?: string;
}

export interface ClarificationRequest {
  requestId: string;
  text: string;
}

export interface HumanDecisionRequest {
  requestId: string;
  decision: "confirmed" | "rejected";
}

export type HttpErrorCode =
  | "invalid_request"
  | "invalid_json"
  | "unknown_field"
  | "unauthorized"
  | "forbidden_role"
  | "forbidden_origin"
  | "forbidden_host"
  | "not_found"
  | "session_closed"
  | "stale_request"
  | "length_required"
  | "body_too_large"
  | "unsupported_media_type"
  | "too_many_sessions"
  | "segment_queue_full"
  | "internal_error"
  | "simulator_unavailable";

export interface HttpErrorBody {
  error: { code: HttpErrorCode; message: string };
}

export const PLAYBACK_OUTCOMES = ["finished", "interrupted", "truncated", "unknown"] as const;
export type PlaybackOutcome = (typeof PLAYBACK_OUTCOMES)[number];

/** Header names for POST /v1/sessions/:id/audio-segments. */
export const SEGMENT_HEADERS = {
  segmentId: "x-holdbuddy-segment-id",
  promptId: "x-holdbuddy-prompt-id",
  fragmentIndex: "x-holdbuddy-fragment-index",
  finalSegment: "x-holdbuddy-final-segment",
  playbackOutcome: "x-holdbuddy-playback-outcome",
  playbackDurationMs: "x-holdbuddy-playback-duration-ms",
  dtmfCountAtStart: "x-holdbuddy-dtmf-count-at-start",
  audioSha256: "x-holdbuddy-audio-sha256",
} as const;

export type SegmentRejection =
  | "sha256_mismatch"
  | "invalid_wav"
  | "unsupported_audio_format"
  | "playback_not_finished"
  | "playback_duration_mismatch"
  | "silent_segment"
  | "stale_after_dtmf"
  | "duplicate_segment"
  | "prompt_closed"
  | "awaiting_dtmf_ack"
  | "mock_audio_in_live_mode"
  | "no_trailing_silence";

export type SttFailureCode =
  | "budget_exhausted"
  | "timeout"
  | "network"
  | "auth"
  | "insufficient_credit"
  | "forbidden"
  | "rate_limited"
  | "bad_request"
  | "server"
  | "invalid_input"
  | "invalid_response"
  | "response_too_large"
  | "provenance_mismatch"
  | "unsafe_provider_response"
  | "stt_error";

export type HumanAssessment = "human" | "not_human" | "uncertain";

export type RuntimeEventBody =
  | { type: "session.started"; sttMode: SttMode; protocolVersion: ProtocolVersion }
  | { type: "session.status_changed"; from: PublicSessionStatus; to: PublicSessionStatus }
  | ({ type: "session.closed" } & SessionClosure)
  | { type: "audio.segment_received"; segmentId: string; promptId: string; fragmentIndex: number; bytes: number }
  | { type: "audio.segment_accepted"; segmentId: string; promptId: string; durationMs: number; promptComplete: boolean }
  | { type: "audio.segment_rejected"; segmentId: string; promptId: string; reasons: SegmentRejection[] }
  | { type: "stt.started"; segmentId: string; providerId: string; requestBudget?: RequestBudget }
  | { type: "stt.failed"; segmentId: string; code: SttFailureCode; fatal: boolean }
  | { type: "transcript.observed"; segmentId: string; promptId: string; observationId: number; status: TranscriptionStatus; transcript: string; promptComplete: boolean; provenance: ObservationProvenance; detectedLanguageCode?: string }
  | { type: "decision.made"; observationId?: number; decision: MenuDecision; provenance?: ObservationProvenance }
  | { type: "decision.abstained"; reason: AbstainReason }
  /** A semantic ranker's outcome, after the gate's own checks. The press itself follows as decision.made. */
  | { type: "semantic.assessed"; observationId: number; matcherId: string; outcome: "chosen" | "abstained"; reason?: string; score?: number; margin?: number | null }
  | { type: "engine.rejected"; code: TransitionErrorCode | "deadline_expired_first" | "superseded_by_newer_audio" | "answer_superseded_by_newer_audio" }
  | { type: "dtmf.requested"; actionId: string; digit: DtmfDigit; ackDeadlineMs: number; provenance: ObservationProvenance }
  | { type: "dtmf.acknowledged"; actionId: string; digit: DtmfDigit; outcome: "delivered" | "not_delivered" }
  | { type: "dtmf.unknown"; actionId: string; digit: DtmfDigit }
  | { type: "dtmf.refused"; actionId: string; digit: DtmfDigit; refusal: string }
  /** A trusted source began a prompt. No audio of it has arrived yet, and none may: this only makes older work stale. */
  | { type: "source.started"; segmentId: string; promptId: string; sourceSequence: number }
  /** A press decided, then overtaken by newer audio before it was sent. It was never handed to the line, and never will be. */
  | { type: "dtmf.withdrawn"; actionId: string; digit: DtmfDigit; reason: "superseded_by_newer_audio" }
  | { type: "clarification.requested"; requestId: string; reason: ClarifyReason; candidates: MenuOption[]; answerDeadlineMs: number }
  | { type: "clarification.answered"; requestId: string }
  | { type: "hold.started" }
  | { type: "hold.ended"; to: PublicSessionStatus }
  | { type: "handoff.possible_human"; requestId: string; evidence: string; confirmDeadlineMs: number }
  | { type: "handoff.assessed"; requestId: string; assessment: HumanAssessment; by: "judge" | "none" }
  | { type: "handoff.confirmed"; requestId: string; by: "user" | "judge" }
  | { type: "handoff.rejected"; requestId: string; by: "user" | "judge" }
  | { type: "handoff.expired"; requestId: string };

export interface EventEnvelope {
  eventId: string;
  seq: number;
  sessionId: string;
  at: string;
  atMs: number;
  dataSource: DataSource;
}

export type RuntimeEvent = EventEnvelope & RuntimeEventBody;
export type RuntimeEventType = RuntimeEventBody["type"];
