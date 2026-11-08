/**
 * Public contracts for HoldBuddy's IVR core, frozen for simulator and frontend integration.
 * See docs/architecture/ivr-core.md for the rules that go with them.
 *
 * Blindness rule: the engine's only inputs are the user's goal and preferences, its own state and
 * these events. No type here can carry a menu definition, a route, an answer key or a human flag
 * from a simulator. `human_confirmed` is an outside judgement delivered as an explicit event.
 */

export type DtmfDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "*" | "#";

export type PreferredLanguage = "bn" | "en" | "gu" | "hi" | "kn" | "ml" | "mr" | "pa" | "ta" | "te";

export interface SessionLimits {
  maxObservations: number;
  maxDtmf: number;
  maxClarifications: number;
  /** Consecutive observations that lead nowhere, outside of hold. */
  maxNoProgress: number;
  maxHoldObservations: number;
  /** Fragments of one prompt. Going over this discards them; it never forces a decision. */
  maxPendingFragments: number;
  /** Rejected events in a session. Going over this fails the session. */
  maxRejectedEvents: number;
  ackTimeoutMs: number;
  clarificationTimeoutMs: number;
  humanConfirmTimeoutMs: number;
}

export interface SessionConfig {
  /** Unique for each call. Generated when omitted. Every event must name it. */
  sessionId?: string;
  goal: string;
  preferredLanguage?: PreferredLanguage;
  limits?: Partial<SessionLimits>;
  /** Experimental, fixture-only path. Never enabled by default or for provider observations. */
  reasoningMode?: "FICTIONAL_OFFLINE_ONLY";
  /** Additional experimental context authorization. Requires fixture-only reasoning mode. */
  contextMode?: "DISCOURSE_OFFLINE_ONLY";
}

/**
 * Where a transcript came from, as established by trusted code. Callers can't set this directly:
 * it comes from an attestation, and an attestation can't be written by hand or sent over a network.
 * `offline_fixture` is not evidence about audio or any provider.
 */
export type ObservationProvenance = "prisma_stt" | "mock_stt" | "offline_fixture";

/**
 * Opaque, in-process proof of provenance, issued only by trusted code. Each is bound to one exact
 * transcript and status, and is used up when its observation is accepted. A rejected observation
 * doesn't use it up.
 */
export interface ProvenanceAttestation {
  readonly provenance: ObservationProvenance;
}

export type TranscriptionStatus = "transcribed" | "no_speech" | "truncated";

/**
 * How a chunk relates to earlier chunks of its prompt:
 * - `delta`: only the new words. The prompt is the chunks joined in order.
 * - `cumulative`: everything so far. It replaces earlier text, and must begin with it.
 * A prompt can't mix the two.
 */
export type FragmentKind = "delta" | "cumulative";

/** One piece of speech, after STT. The engine reads these fields and nothing else. */
export interface TranscriptObservation {
  sessionId: string;
  /**
   * Positive integer that must increase within a session. A rejected observation doesn't consume its
   * ID. An accepted one does, so sending it again is rejected.
   */
  observationId: number;
  /** Assigned by the caller per spoken prompt. Fragments combine only within one prompt. */
  promptId: string;
  /** 0 for a prompt's first chunk, then 1, 2 and so on. A gap ends the prompt, because words were lost. */
  fragmentIndex: number;
  fragmentKind: FragmentKind;
  /**
   * True only if the caller knows this prompt has finished. The engine can't detect this: it trusts
   * the signal, so an unreliable signal means an early press.
   */
  promptComplete: boolean;
  /** Caller's monotonic clock. Never decreases within a session. */
  observedAtMs: number;
  transcript: string;
  status: TranscriptionStatus;
  attestation: ProvenanceAttestation;
}

export type ActionId = string;
export type RequestId = string;

export type IvrEvent =
  | { type: "observation"; observation: TranscriptObservation }
  /** The pending press was delivered. Only the pending action's ID is accepted. */
  | { type: "dtmf_sent"; sessionId: string; actionId: ActionId; receivedAtMs: number }
  /** The pending press was definitely not delivered. It is never retried automatically. */
  | { type: "dtmf_failed"; sessionId: string; actionId: ActionId; receivedAtMs: number }
  /**
   * The pending press was never handed to anything, and won't be: newer speech made it obsolete. Accepted only if the
   * once-only dispatch ledger confirms it was never dispatched, and it then can never be dispatched by anyone.
   */
  | { type: "dtmf_withdrawn"; sessionId: string; actionId: ActionId; receivedAtMs: number }
  /** Lets deadlines expire when nothing else is happening. */
  | { type: "clock_tick"; sessionId: string; nowMs: number }
  /** Answers one specific request. A newer prompt cancels the request, and the answer is then stale. */
  | { type: "clarification_answer"; sessionId: string; requestId: RequestId; text: string; receivedAtMs: number }
  | { type: "human_confirmed"; sessionId: string; requestId: RequestId; receivedAtMs: number }
  | { type: "human_rejected"; sessionId: string; requestId: RequestId; receivedAtMs: number }
  /**
   * A ranker's choice among the options of the last prompt, by position. It can't name a digit, and it
   * is refused once newer speech has arrived.
   */
  | { type: "assisted_choice"; sessionId: string; observationId: number; candidateId: number; receivedAtMs: number; reasoningPermit?: import("./multilingual/structured.js").ReasoningPermit }
  | { type: "end"; sessionId: string };

export type IvrEventType = IvrEvent["type"];

export type SessionStatus =
  | "listening"
  | "awaiting_dtmf_ack"
  | "awaiting_clarification"
  | "on_hold"
  | "human_candidate"
  | "human_confirmed"
  | "ended"
  | "failed";

export type FailureReason =
  | "observation_limit"
  | "dtmf_limit"
  | "no_progress"
  | "hold_limit"
  | "rejected_event_limit"
  /** Delivery is unknown, so pressing again could double-press. The session stops. */
  | "dtmf_ack_timeout";

export interface MenuOption {
  digit: DtmfDigit;
  /** Words the IVR associated with this digit, with only function words removed. */
  label: string;
  /** The instruction itself was negated, as in "do not press 1". */
  excluded: boolean;
}

export type AbstainReason =
  | "no_matching_option"
  | "language_preference_unknown"
  | "language_not_offered"
  | "language_option_negated"
  | "action_mismatch"
  | "conflicting_options"
  | "menu_structure_unclear"
  | "mixed_clause"
  | "unsupported_option_wording"
  | "negated_option"
  | "conditional_option"
  | "service_unavailable"
  | "amended_option"
  | "sequence_required"
  | "non_instruction"
  | "retracted_instruction"
  | "combined_actions"
  | "input_requested"
  | "repeated_menu"
  | "incomplete_transcript"
  | "prompt_interrupted"
  | "prompt_too_long"
  | "clarification_limit"
  | "clarification_timeout"
  | "request_superseded"
  | "dtmf_limit"
  | "dtmf_not_sent"
  /** A press was withdrawn before it was sent, because newer speech overtook it. */
  | "decision_superseded";

export type ClarifyReason =
  | "ambiguous_options"
  | "action_unclear"
  | "goal_not_understood"
  | "goal_contains_negation";

export type ListenReason = "no_speech" | "no_menu_detected" | "prompt_incomplete" | "on_hold";

export type MatchBasis = "concept" | "literal" | "concept_and_literal" | "language_preference" | "semantic_ranker";

/** What the policy concluded. A `press` is only ever returned with a `send_dtmf` action. */
export type MenuDecision =
  | { kind: "press"; digit: DtmfDigit; label: string; score: number; basis: MatchBasis; alternatives: number }
  | { kind: "clarify"; reason: ClarifyReason; candidates: MenuOption[] }
  | { kind: "abstain"; reason: AbstainReason }
  | { kind: "listen"; reason: ListenReason };

/** Work for the caller to do. The engine never touches audio, networks or phones. */
export type IvrAction =
  | { type: "send_dtmf"; sessionId: string; actionId: ActionId; digit: DtmfDigit; provenance: ObservationProvenance; ackDeadlineMs: number }
  | { type: "request_clarification"; sessionId: string; requestId: RequestId; reason: ClarifyReason; candidates: MenuOption[]; answerDeadlineMs: number }
  | { type: "abstained"; reason: AbstainReason }
  | { type: "hold_started" }
  | { type: "possible_human"; sessionId: string; requestId: RequestId; evidence: string; confirmDeadlineMs: number }
  | { type: "handoff_to_user" }
  | { type: "session_failed"; reason: FailureReason }
  | { type: "session_ended" };

export type TransitionErrorCode =
  | "invalid_transition"
  | "invalid_event"
  | "replayed_observation"
  | "stale_action"
  | "stale_request"
  | "wrong_session"
  | "prompt_closed"
  | "clock_went_backwards"
  | "untrusted_provenance";

/** A bounded record of decisions. It holds labels and reasons only, never transcripts. */
export interface AuditEntry {
  observationId?: number;
  provenance?: ObservationProvenance;
  kind: MenuDecision["kind"];
  /** A digit for a press, otherwise the reason. */
  detail: string;
}

export interface AssistableMenu {
  observationId: number;
  goalTexts: string[];
  candidates: Array<{ id: number; digit: DtmfDigit; description: string }>;
  /** Only emitted for opt-in, fixture-only structured reasoning, after structural prohibitions. */
  structuredContext?: { mode: "FICTIONAL_OFFLINE_ONLY"; sessionId: string; nonce: string; observedAtMs: number; maskedSource: string };
}

export interface PendingPress {
  actionId: ActionId;
  digit: DtmfDigit;
  deadlineMs: number;
}

/**
 * A read-only snapshot for display and logging. It holds only what the engine was told. There is no way
 * to resume from one, because a snapshot could be stale or altered and DTMF delivery can't be replayed.
 */
export interface SessionState {
  sessionId: string;
  status: SessionStatus;
  goal: string;
  goalRefinements: string[];
  preferredLanguage?: PreferredLanguage;
  reasoningMode?: "FICTIONAL_OFFLINE_ONLY";
  contextMode?: "DISCOURSE_OFFLINE_ONLY";
  discourse?: import("./multilingual/discourse.js").DiscourseAuthorization;
  /** A new prompt ID alone is not evidence that advertising/unknown authority ended. */
  contextScope?: "advertisement" | "ambiguous";
  pendingFragmentTimes?: number[];
  limits: SessionLimits;
  pendingFragments: string[];
  pendingFragmentCount: number;
  pendingFragmentKind?: FragmentKind;
  pendingPromptId?: string;
  /** Finished, interrupted or damaged prompts. Later chunks for these are rejected. */
  closedPromptIds: string[];
  /** The clarification or human confirmation being waited for. */
  pendingRequestId?: RequestId;
  pendingProvenance?: ObservationProvenance;
  pendingPress?: PendingPress;
  /** The deadline for answering a clarification or confirming a human. */
  deadlineMs?: number;
  lastMenu?: MenuOption[];
  /** Options a ranker may choose from. Only set when the rules abstained and no spoken warning applies. */
  assistable?: AssistableMenu;
  /** Meaning of each option pressed, so a reworded repeat of one is not pressed again. */
  answeredOptions: string[];
  humanEvidence?: string;
  failureReason?: FailureReason;
  lastObservationId: number;
  lastNowMs: number;
  lastProvenance?: ObservationProvenance;
  nextActionNumber: number;
  audit: AuditEntry[];
  counters: {
    observations: number;
    dtmf: number;
    clarifications: number;
    noProgress: number;
    holdObservations: number;
    rejectedEvents: number;
  };
}

export type StepResult =
  | { ok: true; state: SessionState; actions: IvrAction[]; decision?: MenuDecision; provenance?: ObservationProvenance }
  | { ok: false; state: SessionState; actions: IvrAction[]; error: { code: TransitionErrorCode; message: string } };
