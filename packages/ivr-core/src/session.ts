import { claimForWithdrawal } from "./simulator-dispatch.js";
import { detectHold, detectPossibleHuman } from "./call-signals.js";
import type {
  ActionId,
  AssistableMenu,
  AuditEntry,
  DtmfDigit,
  FailureReason,
  IvrAction,
  IvrEvent,
  IvrEventType,
  MenuDecision,
  MenuOption,
  ObservationProvenance,
  SessionConfig,
  SessionLimits,
  SessionState,
  SessionStatus,
  StepResult,
  TranscriptObservation,
  TransitionErrorCode,
} from "./contracts.js";
import { optionMeaningKey } from "./goal-matcher.js";
import { legacyReasoner, multilingualReasoner, needsCanonicalForm, type MenuReasoner } from "./multilingual/canonicalize.js";
import { decideLanguageMenu, extractOptions, type ExtractedMenu } from "./multilingual/extract.js";
import { knownOperationConflict, semanticEligible } from "./multilingual/eligibility.js";
import { consumeReasoningPermit, OFFLINE_REASONING_MODE } from "./multilingual/structured.js";
import { authorizeDiscourse, DISCOURSE_MODE, type ObservedTextSpan } from "./multilingual/discourse.js";
import { itemize } from "./multilingual/canonicalize.js";
import { parseMenu } from "./menu-parser.js";
import { decideFromMenu, decideFromOptions, type PolicyInput } from "./policy.js";
import { consumeAttestation, verifiedProvenance } from "./provenance.js";

const legacyTextOnly = legacyReasoner;

export const DEFAULT_LIMITS: SessionLimits = {
  maxObservations: 200,
  maxDtmf: 8,
  maxClarifications: 2,
  maxNoProgress: 12,
  maxHoldObservations: 120,
  maxPendingFragments: 8,
  maxRejectedEvents: 50,
  ackTimeoutMs: 10_000,
  clarificationTimeoutMs: 120_000,
  humanConfirmTimeoutMs: 30_000,
};

const MAX_TEXT_CHARS = 8000;
const MAX_GOAL_CHARS = 500;
const MAX_ID_CHARS = 128;
const MAX_AUDIT_ENTRIES = 64;

/** The whole state machine at a glance. Anything not listed is rejected with state unchanged. */
export const ALLOWED_EVENTS: Record<SessionStatus, readonly IvrEventType[]> = {
  listening: ["observation", "assisted_choice", "clock_tick", "end"],
  awaiting_dtmf_ack: ["dtmf_sent", "dtmf_failed", "dtmf_withdrawn", "clock_tick", "end"],
  // Newer speech is accepted here and cancels the request, so an old menu is never used.
  awaiting_clarification: ["observation", "clarification_answer", "assisted_choice", "clock_tick", "end"],
  on_hold: ["observation", "clock_tick", "end"],
  human_candidate: ["observation", "human_confirmed", "human_rejected", "clock_tick", "end"],
  human_confirmed: [],
  ended: [],
  failed: [],
};

const TERMINAL: ReadonlySet<SessionStatus> = new Set(["human_confirmed", "ended", "failed"]);

export function createSessionState(config: SessionConfig): SessionState {
  if (config.contextMode !== undefined && (config.contextMode !== DISCOURSE_MODE || config.reasoningMode !== OFFLINE_REASONING_MODE)) throw new RangeError("Discourse requires explicit fixture-only reasoning mode");
  if (config.reasoningMode !== undefined && config.reasoningMode !== OFFLINE_REASONING_MODE) throw new RangeError("Invalid experimental reasoning mode");
  const goal = typeof config.goal === "string" ? config.goal.trim() : "";
  if (goal === "" || goal.length > MAX_GOAL_CHARS) {
    throw new RangeError(`goal must be 1 to ${MAX_GOAL_CHARS} characters.`);
  }
  const limits: SessionLimits = { ...DEFAULT_LIMITS, ...config.limits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer.`);
  }
  if (config.sessionId !== undefined && (typeof config.sessionId !== "string" || config.sessionId === "" || config.sessionId.length > MAX_ID_CHARS)) {
    throw new RangeError(`sessionId must be 1 to ${MAX_ID_CHARS} characters.`);
  }
  return {
    sessionId: config.sessionId ?? `session-${crypto.randomUUID()}`,
    status: "listening",
    goal,
    goalRefinements: [],
    ...(config.preferredLanguage ? { preferredLanguage: config.preferredLanguage } : {}),
    ...(config.reasoningMode ? { reasoningMode: config.reasoningMode } : {}),
    ...(config.contextMode ? { contextMode: config.contextMode } : {}),
    limits,
    pendingFragments: [],
    pendingFragmentCount: 0,
    closedPromptIds: [],
    answeredOptions: [],
    lastObservationId: 0,
    lastNowMs: 0,
    nextActionNumber: 1,
    audit: [],
    counters: { observations: 0, dtmf: 0, clarifications: 0, noProgress: 0, holdObservations: 0, rejectedEvents: 0 },
  };
}

const policyInput = (state: SessionState, reasoner: MenuReasoner): PolicyInput => ({
  goalTexts: [state.goal, ...state.goalRefinements].map((text) => reasoner.goal(text)),
  ...(state.preferredLanguage ? { preferredLanguage: state.preferredLanguage } : {}),
});

function withoutPending(state: SessionState): SessionState {
  const { pendingPromptId: _id, pendingProvenance: _provenance, pendingFragmentKind: _kind, pendingFragmentTimes: _times, ...rest } = state;
  return { ...rest, pendingFragments: [], pendingFragmentCount: 0 };
}

/** Closes a prompt for good. Later chunks with its ID are rejected, so damaged speech can't resume. */
function closePrompt(state: SessionState, promptId: string | undefined): SessionState {
  if (promptId === undefined || state.closedPromptIds.includes(promptId)) return state;
  return { ...state, closedPromptIds: [...state.closedPromptIds, promptId] };
}

function closePending(state: SessionState): SessionState {
  return withoutPending(closePrompt(state, state.pendingPromptId));
}

const uncertainContext = (state: SessionState): SessionState => state.contextMode === DISCOURSE_MODE ? { ...state, contextScope: "ambiguous" } : state;

function withoutRequest(state: SessionState): SessionState {
  const { pendingRequestId: _request, deadlineMs: _deadline, lastMenu: _menu, humanEvidence: _evidence, ...rest } = state;
  return rest;
}

function withAudit(state: SessionState, decision: MenuDecision | undefined): SessionState {
  if (!decision) return state;
  const detail = decision.kind === "press" ? decision.digit : decision.reason;
  const entry: AuditEntry = {
    ...(state.lastObservationId ? { observationId: state.lastObservationId } : {}),
    ...(state.lastProvenance ? { provenance: state.lastProvenance } : {}),
    kind: decision.kind,
    detail,
  };
  return { ...state, audit: [...state.audit, entry].slice(-MAX_AUDIT_ENTRIES) };
}

function done(state: SessionState, actions: IvrAction[], decision?: MenuDecision): StepResult {
  return {
    ok: true,
    state: withAudit(state, decision),
    actions,
    ...(decision ? { decision } : {}),
    ...(state.lastProvenance ? { provenance: state.lastProvenance } : {}),
  };
}

/** Moves to `failed`. A failed session can never report a press. */
function fail(state: SessionState, reason: FailureReason, decision?: MenuDecision, leading: IvrAction[] = []): StepResult {
  const { pendingPress: _press, ...rest } = withoutRequest(withoutPending(state));
  return done({ ...rest, status: "failed", failureReason: reason }, [...leading, { type: "session_failed", reason }], decision);
}

function reject(state: SessionState, code: TransitionErrorCode, message: string): StepResult {
  // These don't belong to this session, so they can't be allowed to use up its rejection budget.
  const isOutsider = code === "wrong_session" || code === "untrusted_provenance";
  if (TERMINAL.has(state.status) || isOutsider) return { ok: false, state, actions: [], error: { code, message } };
  const rejectedEvents = state.counters.rejectedEvents + 1;
  const counted: SessionState = { ...state, counters: { ...state.counters, rejectedEvents } };
  if (rejectedEvents >= state.limits.maxRejectedEvents) {
    const failed = fail(counted, "rejected_event_limit");
    return { ok: false, state: failed.state, actions: failed.actions, error: { code, message } };
  }
  return { ok: false, state: counted, actions: [], error: { code, message } };
}

function noProgress(state: SessionState, decision: MenuDecision, actions: IvrAction[]): StepResult {
  const count = state.counters.noProgress + 1;
  const next: SessionState = {
    ...state,
    status: "listening",
    counters: { ...state.counters, noProgress: count, holdObservations: 0 },
  };
  if (count >= state.limits.maxNoProgress) return fail(next, "no_progress", decision, actions);
  return done(next, actions, decision);
}

const abstain = (state: SessionState, reason: Extract<MenuDecision, { kind: "abstain" }>["reason"], leading: IvrAction[] = []) =>
  noProgress(state, { kind: "abstain", reason }, [...leading, { type: "abstained", reason }]);

/** Turns a policy decision into a state change, enforcing press and clarification limits. */
function applyDecision(state: SessionState, decision: MenuDecision, options: readonly MenuOption[], leading: IvrAction[] = []): StepResult {
  if (decision.kind === "press") {
    const chosen = options.find((option) => option.digit === decision.digit && option.label === decision.label);
    const key = chosen ? optionMeaningKey(chosen) : `${decision.digit}:`;
    if (state.answeredOptions.includes(key)) return abstain(state, "repeated_menu", leading);
    if (state.counters.dtmf >= state.limits.maxDtmf) {
      const refused: MenuDecision = { kind: "abstain", reason: "dtmf_limit" };
      return fail(state, "dtmf_limit", refused, [...leading, { type: "abstained", reason: "dtmf_limit" }]);
    }
    const actionId: ActionId = `dtmf-${state.nextActionNumber}`;
    const deadlineMs = state.lastNowMs + state.limits.ackTimeoutMs;
    const provenance: ObservationProvenance = state.lastProvenance ?? "offline_fixture";
    return done(
      {
        ...state,
        status: "awaiting_dtmf_ack",
        pendingPress: { actionId, digit: decision.digit, deadlineMs },
        nextActionNumber: state.nextActionNumber + 1,
        answeredOptions: [...state.answeredOptions, key],
        counters: { ...state.counters, dtmf: state.counters.dtmf + 1, noProgress: 0, holdObservations: 0 },
      },
      [...leading, { type: "send_dtmf", sessionId: state.sessionId, actionId, digit: decision.digit, provenance, ackDeadlineMs: deadlineMs }],
      decision,
    );
  }
  if (decision.kind === "clarify") {
    if (state.counters.clarifications >= state.limits.maxClarifications) return abstain(state, "clarification_limit", leading);
    const requestId = `clarify-${state.nextActionNumber}`;
    const deadlineMs = state.lastNowMs + state.limits.clarificationTimeoutMs;
    return done(
      {
        ...state,
        status: "awaiting_clarification",
        lastMenu: [...options],
        pendingRequestId: requestId,
        deadlineMs,
        nextActionNumber: state.nextActionNumber + 1,
        counters: { ...state.counters, clarifications: state.counters.clarifications + 1, holdObservations: 0 },
      },
      [...leading, { type: "request_clarification", sessionId: state.sessionId, requestId, reason: decision.reason, candidates: decision.candidates, answerDeadlineMs: deadlineMs }],
      decision,
    );
  }
  if (decision.kind === "abstain") return abstain(state, decision.reason, leading);
  return noProgress(state, decision, leading);
}

function onObservation(previous: SessionState, observation: TranscriptObservation, provenance: ObservationProvenance, reasoner: MenuReasoner): StepResult {
  // Newer speech supersedes anything still being waited on, so the old menu can never be used.
  const superseded = previous.status === "awaiting_clarification" || previous.status === "human_candidate";
  const { assistable: _stale, discourse: _oldDiscourse, ...withoutAssist } = previous;
  const fresh = superseded ? withoutRequest(withoutAssist) : withoutAssist;
  const counters = { ...fresh.counters, observations: fresh.counters.observations + 1 };
  const base: SessionState = {
    ...fresh,
    ...(superseded ? { status: "listening" as const } : {}),
    counters,
    lastObservationId: observation.observationId,
    lastNowMs: observation.observedAtMs,
    lastProvenance: provenance,
  };
  const leadingBase: IvrAction[] = superseded ? [{ type: "abstained", reason: "request_superseded" }] : [];
  if (counters.observations > base.limits.maxObservations) return fail(base, "observation_limit", undefined, leadingBase);

  const stayOnHold = (state: SessionState, leading: IvrAction[] = [], decision: MenuDecision = { kind: "listen", reason: "on_hold" }): StepResult => {
    const holdObservations = state.counters.holdObservations + 1;
    const next: SessionState = { ...state, status: "on_hold", counters: { ...state.counters, holdObservations, noProgress: 0 } };
    if (holdObservations > state.limits.maxHoldObservations) return fail(next, "hold_limit", undefined, leading);
    return done(next, [...leading, ...(previous.status === "on_hold" ? [] : [{ type: "hold_started" } as const])], decision);
  };

  const { promptId } = observation;
  const hadFragments = base.pendingFragmentCount > 0;

  // Silence ends a prompt: anything held from it can't be joined with what comes after.
  if (observation.status === "no_speech") {
    const closed = observation.promptComplete ? closePrompt(base, promptId) : base;
    if (hadFragments) return abstain(uncertainContext(closePending(closed)), "prompt_interrupted", leadingBase);
    if (previous.status === "on_hold") return stayOnHold(closed, leadingBase);
    return noProgress(closed, { kind: "listen", reason: "no_speech" }, leadingBase);
  }
  if (observation.status === "truncated") {
    return abstain(uncertainContext(closePrompt(closePending(base), promptId)), "incomplete_transcript", leadingBase);
  }

  // Fragments only combine within one prompt, from one source.
  const samePrompt = base.pendingPromptId === promptId && base.pendingProvenance === provenance;
  const interrupted = hadFragments && !samePrompt;
  const state = interrupted ? uncertainContext(closePending(base)) : base;
  const leading: IvrAction[] = interrupted ? [...leadingBase, { type: "abstained", reason: "prompt_interrupted" }] : leadingBase;

  // A hold message in the middle of a prompt also ends it.
  if (!interrupted && hadFragments && detectHold(reasoner.speech(observation.transcript)) && parseMenu(reasoner.speech(observation.transcript)).options.length === 0) {
    return stayOnHold(uncertainContext(closePrompt(closePending(state), promptId)), [...leading, { type: "abstained", reason: "prompt_interrupted" }]);
  }

  // Missing or out-of-order chunks mean lost words. "Do not" could be what went missing.
  const damaged = (reason: "prompt_interrupted" | "prompt_too_long") => abstain(uncertainContext(closePrompt(closePending(state), promptId)), reason, leading);
  if (observation.fragmentIndex !== state.pendingFragmentCount) return damaged("prompt_interrupted");
  if (state.pendingFragmentKind !== undefined && state.pendingFragmentKind !== observation.fragmentKind) return damaged("prompt_interrupted");

  let fragments: string[];
  if (observation.fragmentKind === "cumulative") {
    if (!observation.transcript.startsWith(state.pendingFragments[0] ?? "")) return damaged("prompt_interrupted");
    fragments = [observation.transcript];
  } else {
    fragments = [...state.pendingFragments, observation.transcript];
  }
  const fragmentCount = state.pendingFragmentCount + 1;
  const heardText = fragments.join(" ");
  const fragmentTimes = observation.fragmentKind === "cumulative" ? [observation.observedAtMs] : [...(state.pendingFragmentTimes ?? []), observation.observedAtMs];

  // Applies to the final chunk too. Reaching a limit discards the prompt; it never forces a decision.
  if (fragmentCount > state.limits.maxPendingFragments || heardText.length > MAX_TEXT_CHARS) return damaged("prompt_too_long");

  if (!observation.promptComplete) {
    return done(
      {
        ...state,
        pendingFragments: fragments,
        pendingFragmentCount: fragmentCount,
        pendingFragmentKind: observation.fragmentKind,
        pendingPromptId: promptId,
        pendingProvenance: provenance,
        ...(state.contextMode ? { pendingFragmentTimes: fragmentTimes } : {}),
      },
      leading,
      { kind: "listen", reason: "prompt_incomplete" },
    );
  }

  const cleared = closePrompt(withoutPending(state), promptId);
  if (cleared.contextMode === DISCOURSE_MODE) {
    if (provenance !== "offline_fixture") return abstain(cleared, "non_instruction", leading);
    let offset = 0;
    const timing: ObservedTextSpan[] = fragments.map((fragment, index) => {
      const span = { start: offset, end: offset + fragment.length, observedAtMs: fragmentTimes[index] ?? observation.observedAtMs };
      offset += fragment.length + 1;
      return span;
    });
    return onAuthorizedPrompt(cleared, heardText, timing, reasoner, leading, stayOnHold);
  }
  const text = reasoner.speech(heardText);
  const menu = parseMenu(text);
  const extracted = extractOptions(heardText);
  // Hindi and English speech keeps the core's own path, unless the user prefers another language.
  const coreHandlesLanguages = !needsCanonicalForm(heardText) && (cleared.preferredLanguage === undefined || cleared.preferredLanguage === "hi" || cleared.preferredLanguage === "en");
  const languageDecision = reasoner === legacyTextOnly || coreHandlesLanguages || menu.issues.length > 0 ? undefined : decideLanguageMenu(extracted, cleared.preferredLanguage);
  if (languageDecision?.kind === "abstain") return abstain(cleared, languageDecision.reason, leading);
  if (languageDecision?.kind === "press") {
    const decision: MenuDecision = { kind: "press", digit: languageDecision.digit as DtmfDigit, label: languageDecision.label, score: 1, basis: "language_preference", alternatives: 0 };
    return applyDecision(cleared, decision, [{ digit: decision.digit, label: decision.label, excluded: false }], leading);
  }
  if (menu.options.length > 0 || menu.issues.length > 0 || menu.inputRequested || (reasoner !== legacyTextOnly && needsCanonicalForm(heardText) && extracted.candidates.length > 0)) {
    let decision = decideFromMenu(policyInput(cleared, reasoner), menu);
    // Retain the core's specific refusal reasons, but never let a successful or deferred decision
    // cross a prohibition that only the multilingual structural pass understood.
    if (reasoner !== legacyTextOnly && decision.kind !== "abstain") {
      if (extracted.addressedToHelper || extracted.nonActionContext || extracted.candidates.some(({ promotional }) => promotional)) decision = { kind: "abstain", reason: "non_instruction" };
      else if (extracted.retracted) decision = { kind: "abstain", reason: "retracted_instruction" };
    }
    // A refused advertisement is not evidence that the line left hold. Clean new menus still follow
    // the normal transition below; hold observations and the hold limit remain bounded.
    const offerNotice = /^\s*offers?\s+for\b/i.test(text) && menu.issues.includes("mixed_clause");
    if (previous.status === "on_hold" && decision.kind === "abstain" &&
        (offerNotice || extracted.nonActionContext || extracted.candidates.some(candidate => candidate.promotional))) {
      return stayOnHold(cleared, [...leading, { type: "abstained", reason: decision.reason }], decision);
    }
    // The older parser can't read comma lists. Local structural checks still apply to assistance;
    // non-instructions are never bypassed, even if another sentence appears executable.
    const parserClear = menu.amendments.length === 0 && menu.issues.every((issue) => issue === "unlabeled_option" || issue === "ambiguous_structure");
    const hardParserIssue = menu.issues.some((issue) => ["non_instruction", "retracted_instruction", "mixed_clause", "conflicting_digit", "conflicting_label", "sequence_required", "multi_digit_prompt"].includes(issue));
    const assistable = reasoner === legacyTextOnly || (cleared.reasoningMode === OFFLINE_REASONING_MODE && hardParserIssue) ? undefined : assistableMenu(cleared, extracted, parserClear, decision, heardText);
    return applyDecision(assistable ? { ...cleared, assistable } : cleared, decision, menu.options, leading);
  }
  const human = detectPossibleHuman(text);
  if (human) {
    const requestId = `human-${cleared.nextActionNumber}`;
    const deadlineMs = cleared.lastNowMs + cleared.limits.humanConfirmTimeoutMs;
    return done(
      {
        ...cleared,
        status: "human_candidate",
        humanEvidence: human,
        pendingRequestId: requestId,
        deadlineMs,
        nextActionNumber: cleared.nextActionNumber + 1,
        counters: { ...cleared.counters, holdObservations: 0, noProgress: 0 },
      },
      [...leading, { type: "possible_human", sessionId: cleared.sessionId, requestId, evidence: human, confirmDeadlineMs: deadlineMs }],
      { kind: "listen", reason: "no_menu_detected" },
    );
  }
  if (detectHold(text) || previous.status === "on_hold") return stayOnHold(cleared, leading);
  return noProgress(cleared, { kind: "listen", reason: "no_menu_detected" }, leading);
}

/** Only the documented fields survive, so nothing else on an input object can influence a decision. */
function readObservation(input: unknown): TranscriptObservation | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { sessionId, observationId, promptId, fragmentIndex, fragmentKind, promptComplete, observedAtMs, transcript, status, attestation } = input as Partial<TranscriptObservation>;
  if (typeof sessionId !== "string") return undefined;
  if (typeof observationId !== "number" || !Number.isSafeInteger(observationId) || observationId < 1) return undefined;
  if (typeof promptId !== "string" || promptId === "" || promptId.length > MAX_ID_CHARS) return undefined;
  if (typeof fragmentIndex !== "number" || !Number.isSafeInteger(fragmentIndex) || fragmentIndex < 0) return undefined;
  if (fragmentKind !== "delta" && fragmentKind !== "cumulative") return undefined;
  if (typeof promptComplete !== "boolean") return undefined;
  if (typeof observedAtMs !== "number" || !Number.isFinite(observedAtMs) || observedAtMs < 0) return undefined;
  if (typeof transcript !== "string" || transcript.length > MAX_TEXT_CHARS) return undefined;
  if (status !== "transcribed" && status !== "no_speech" && status !== "truncated") return undefined;
  return { sessionId, observationId, promptId, fragmentIndex, fragmentKind, promptComplete, observedAtMs, transcript, status, attestation: attestation as TranscriptObservation["attestation"] };
}

/** Applies any deadline that has passed by `nowMs`. Returns undefined if none has. */
function expireDeadlines(state: SessionState, nowMs: number): StepResult | undefined {
  const timed: SessionState = { ...state, lastNowMs: nowMs };
  if (state.status === "awaiting_dtmf_ack" && state.pendingPress && nowMs >= state.pendingPress.deadlineMs) {
    return fail(timed, "dtmf_ack_timeout");
  }
  if (state.status === "awaiting_clarification" && state.deadlineMs !== undefined && nowMs >= state.deadlineMs) {
    return abstain(withoutRequest(timed), "clarification_timeout");
  }
  if (state.status === "human_candidate" && state.deadlineMs !== undefined && nowMs >= state.deadlineMs) {
    return done({ ...withoutRequest(timed), status: "listening" }, []);
  }
  return undefined;
}

const ASSISTABLE_REASONS: ReadonlySet<string> = new Set(["no_matching_option", "action_mismatch", "unsupported_option_wording", "goal_not_understood", "input_requested", "non_instruction", "menu_structure_unclear"]);

/** Context authorization precedes both lexical policy and learned comparison. Neither sees dead offers. */
function onAuthorizedPrompt(state: SessionState, source: string, timing: ObservedTextSpan[], reasoner: MenuReasoner, leading: IvrAction[], stayOnHold: (state: SessionState, leading: IvrAction[]) => StepResult): StepResult {
  const discourse = authorizeDiscourse(source, timing, state.contextScope);
  const current: SessionState = { ...state, discourse, ...(discourse.blocked ? { contextScope: discourse.scope ?? "ambiguous" } : {}) };
  if (discourse.blocked) return abstain(current, "non_instruction", leading);
  if (!discourse.active.length) {
    if (discourse.clauses.at(-1)?.roles.includes("hold")) return stayOnHold(current, leading);
    if (discourse.clauses.every((c) => c.roles.every((r) => r === "greeting"))) return noProgress(current, { kind: "listen", reason: "no_menu_detected" }, leading);
    return abstain(current, "non_instruction", leading);
  }
  const offered = discourse.active;
  const languageMenu: ExtractedMenu = { candidates: offered, retracted: false, amended: false, addressedToHelper: false, nonActionContext: false, inputRequested: false, sequenceRequired: false, structureUnclear: false, conflicting: false };
  const language = decideLanguageMenu(languageMenu, current.preferredLanguage);
  const options: MenuOption[] = offered.map((c) => ({ digit: c.digit as DtmfDigit, label: reasoner.speech(c.description), excluded: false }));
  let decision: MenuDecision = language ? language.kind === "press" ? { kind: "press", digit: language.digit as DtmfDigit, label: language.label, score: 1, basis: "language_preference", alternatives: 0 } : language : decideFromOptions(policyInput(current, reasoner), options);
  if (decision.kind === "press") return applyDecision(current, decision, options, leading);
  if (decision.kind === "clarify" && decision.reason === "goal_contains_negation") return applyDecision(current, decision, options, leading);
  // Language and navigation choices need explicit preference/goal policy, never embedding fallback.
  const candidates = offered.filter((c) => c.kind === "choice").map(({ id, digit, description }) => ({ id, digit: digit as DtmfDigit, description }));
  if (!language && candidates.length && (decision.kind === "abstain" || decision.kind === "clarify")) {
    let maskedSource = source;
    for (const i of itemize(source).filter((i) => i.digit !== undefined).reverse()) maskedSource = maskedSource.slice(0, i.start) + "[key]" + maskedSource.slice(i.end);
    const assistable: AssistableMenu = { observationId: current.lastObservationId, goalTexts: [current.goal, ...current.goalRefinements], candidates, structuredContext: { mode: OFFLINE_REASONING_MODE, sessionId: current.sessionId, nonce: crypto.randomUUID(), observedAtMs: current.lastNowMs, maskedSource } };
    // Do not expose a lexical clarification path that could bypass learned evidence/active membership.
    decision = { kind: "abstain", reason: "no_matching_option" };
    return applyDecision({ ...current, assistable }, decision, options, leading);
  }
  return applyDecision(current, decision, options, leading);
}

/** What a ranker may see: spoken descriptions and positions. Any spoken warning rules the prompt out. */
function assistableMenu(state: SessionState, extracted: ExtractedMenu, parserClear: boolean, decision: MenuDecision, source: string): AssistableMenu | undefined {
  const structured = state.reasoningMode === OFFLINE_REASONING_MODE;
  if (decision.kind !== "abstain" && decision.kind !== "clarify") return undefined;
  if (!structured && (!parserClear || !ASSISTABLE_REASONS.has(decision.reason))) return undefined;
  if (structured && state.lastProvenance !== "offline_fixture") return undefined;
  if (extracted.retracted || extracted.amended || extracted.inputRequested || extracted.sequenceRequired || extracted.structureUnclear || extracted.conflicting) return undefined;
  if (extracted.addressedToHelper || extracted.nonActionContext) return undefined;
  if (extracted.candidates.some(({ negated, promotional }) => negated || promotional)) return undefined;
  const goal = [state.goal, ...state.goalRefinements].join(". ");
  const candidates = extracted.candidates.filter(({ kind, description, addressedToHelper }) => kind === "choice" && description !== "" && !addressedToHelper && (structured || semanticEligible(goal, description))).map(({ id, digit, description }) => ({ id, digit: digit as DtmfDigit, description }));
  if (candidates.length === 0) return undefined;
  let maskedSource = source;
  for (const { digitSpan } of [...extracted.candidates].sort((a, b) => b.digitSpan[0] - a.digitSpan[0])) maskedSource = maskedSource.slice(0, digitSpan[0]) + "[key]" + maskedSource.slice(digitSpan[1]);
  return { observationId: state.lastObservationId, goalTexts: [state.goal, ...state.goalRefinements], candidates, ...(structured ? { structuredContext: { mode: OFFLINE_REASONING_MODE, sessionId: state.sessionId, nonce: crypto.randomUUID(), observedAtMs: state.lastNowMs, maskedSource } } : {}) };
}

const ALL_EVENT_TYPES: Record<IvrEventType, true> = {
  observation: true,
  dtmf_sent: true,
  dtmf_failed: true,
  dtmf_withdrawn: true,
  clock_tick: true,
  clarification_answer: true,
  human_confirmed: true,
  human_rejected: true,
  assisted_choice: true,
  end: true,
};

/**
 * Internal, and not exported from the package, because it trusts the state it is given. The order of
 * checks matters: nothing from an event can change the session until the event has proved it belongs
 * to this session and, for speech, carries valid provenance.
 */
export function transition(state: SessionState, event: IvrEvent, reasoner: MenuReasoner = multilingualReasoner, withdrawalClaimed = false): StepResult {
  const type = (event as { type?: unknown } | null | undefined)?.type;
  if (TERMINAL.has(state.status)) return reject(state, "invalid_transition", "The session is over.");
  if (typeof type !== "string" || !Object.hasOwn(ALL_EVENT_TYPES, type)) return reject(state, "invalid_event", "Unknown event.");
  if ((event as { sessionId?: unknown }).sessionId !== state.sessionId && event.type !== "observation") {
    return reject(state, "wrong_session", "This event belongs to a different session.");
  }

  let eventTime: number | undefined;
  let observation: TranscriptObservation | undefined;
  let provenance: ObservationProvenance | undefined;
  if (event.type === "observation") {
    observation = readObservation(event.observation);
    if (!observation) return reject(state, "invalid_event", "Malformed observation.");
    if (observation.sessionId !== state.sessionId) return reject(state, "wrong_session", "This observation belongs to a different session.");
    provenance = verifiedProvenance(observation.attestation, observation.transcript, observation.status);
    if (!provenance) return reject(state, "untrusted_provenance", "Observation has no valid attestation for this transcript.");
    if (observation.observationId <= state.lastObservationId) return reject(state, "replayed_observation", "Observation ID is not newer than the last accepted one.");
    eventTime = observation.observedAtMs;
  } else if (event.type === "clock_tick") {
    eventTime = event.nowMs;
  } else if (event.type !== "end") {
    eventTime = event.receivedAtMs;
  }
  if (event.type !== "end") {
    if (typeof eventTime !== "number" || !Number.isFinite(eventTime)) return reject(state, "invalid_event", "Malformed event time.");
    if (eventTime < state.lastNowMs) return reject(state, "clock_went_backwards", "Event time went backwards.");
  }

  // Time moves on even for an event that won't be accepted, so a stuck wait always ends. A late
  // response is handled here as expired, and never reaches the code that would act on it.
  if (eventTime !== undefined) {
    const expired = expireDeadlines(state, eventTime);
    if (expired) return expired;
  }

  if (!ALLOWED_EVENTS[state.status].includes(event.type)) {
    return reject(state, "invalid_transition", `Event ${event.type} is not allowed while ${state.status}.`);
  }

  switch (event.type) {
    case "observation": {
      if (state.closedPromptIds.includes(observation!.promptId)) return reject(state, "prompt_closed", "That prompt has ended.");
      consumeAttestation(observation!.attestation);
      return onObservation(state, observation!, provenance!, reasoner);
    }
    case "clock_tick":
      return { ok: true, state: { ...state, lastNowMs: event.nowMs }, actions: [] };
    case "dtmf_sent":
    case "dtmf_failed": {
      if (!state.pendingPress || event.actionId !== state.pendingPress.actionId) {
        return reject(state, "stale_action", "That action is not the pending press.");
      }
      const { pendingPress: _press, ...rest } = state;
      const next: SessionState = { ...rest, status: "listening", lastNowMs: event.receivedAtMs };
      if (event.type === "dtmf_sent") return done(next, []);
      // Never pressed again automatically, and this meaning stays answered, so a repeat abstains.
      return abstain(next, "dtmf_not_sent");
    }
    case "dtmf_withdrawn": {
      if (!state.pendingPress || event.actionId !== state.pendingPress.actionId) return reject(state, "stale_action", "That action is not the pending press.");
      if (!withdrawalClaimed) return reject(state, "stale_action", "That press may already have been handed to the line.");
      // It was never sent, so its meaning wasn't answered. It is the last one recorded: nothing else can be decided
      // while a press is pending. Its count stays spent, so withdrawals can't go on forever, and it is no progress.
      const { pendingPress: _press, ...rest } = state;
      const next: SessionState = { ...rest, status: "listening", lastNowMs: event.receivedAtMs, answeredOptions: state.answeredOptions.slice(0, -1) };
      return abstain(next, "decision_superseded");
    }
    case "assisted_choice": {
      const { assistable } = state;
      if (!assistable || assistable.observationId !== event.observationId || state.lastObservationId !== event.observationId) return reject(state, "stale_request", "That prompt is no longer the latest.");
      const candidate = assistable.candidates.find(({ id }) => id === event.candidateId);
      if (!candidate) return reject(state, "invalid_event", "That wasn't one of the spoken options.");
      if (state.contextMode && (state.discourse?.blocked || !state.discourse?.active.some((o) => o.id === candidate.id && o.digit === candidate.digit && o.description === candidate.description))) return reject(state, "invalid_event", "That offer is no longer authorized.");
      if (state.reasoningMode === OFFLINE_REASONING_MODE) {
        if (!assistable.structuredContext || event.receivedAtMs >= assistable.structuredContext.observedAtMs + 30_000 || knownOperationConflict(assistable.goalTexts.join(". "), candidate.description) || !consumeReasoningPermit(event.reasoningPermit, assistable, candidate.id)) return reject(state, "invalid_event", "Missing, expired or mismatched reasoning evidence.");
      } else if (!semanticEligible(assistable.goalTexts.join(". "), candidate.description)) return reject(state, "invalid_event", "That operation is not eligible.");
      const { assistable: _used, ...rest } = withoutRequest(state);
      const next: SessionState = { ...rest, status: "listening", lastNowMs: event.receivedAtMs };
      const decision: MenuDecision = { kind: "press", digit: candidate.digit, label: candidate.description, score: 1, basis: "semantic_ranker", alternatives: assistable.candidates.length - 1 };
      return applyDecision(next, decision, [{ digit: candidate.digit, label: candidate.description, excluded: false }]);
    }
    case "clarification_answer": {
      if (event.requestId !== state.pendingRequestId) return reject(state, "stale_request", "That request is no longer open.");
      const text = typeof event.text === "string" ? event.text.trim() : "";
      if (text === "" || text.length > MAX_GOAL_CHARS) return reject(state, "invalid_event", "Malformed clarification.");
      const options = state.lastMenu ?? [];
      const next: SessionState = { ...withoutRequest(state), status: "listening", lastNowMs: event.receivedAtMs, goalRefinements: [...state.goalRefinements, text] };
      return applyDecision(next, decideFromOptions(policyInput(next, reasoner), options), options);
    }
    case "human_confirmed":
    case "human_rejected": {
      if (event.requestId !== state.pendingRequestId) return reject(state, "stale_request", "That request is no longer open.");
      const next = { ...withoutRequest(state), lastNowMs: event.receivedAtMs };
      if (event.type === "human_confirmed") return done({ ...next, status: "human_confirmed" }, [{ type: "handoff_to_user" }]);
      return done({ ...next, status: "listening" }, []);
    }
    case "end": {
      const { pendingPress: _press, ...rest } = withoutRequest(withoutPending(state));
      return done({ ...rest, status: "ended" }, [{ type: "session_ended" }]);
    }
  }
}

/**
 * The public way to run a session. It owns its state: snapshots from `state` are copies, and can't be
 * loaded back in. A restarted server starts a new session, because DTMF delivery can't be recovered.
 */
export class IvrSession {
  #state: SessionState;
  readonly #reasoner: MenuReasoner;

  constructor(config: SessionConfig, reasoner: MenuReasoner = multilingualReasoner) {
    this.#state = createSessionState(config);
    this.#reasoner = reasoner;
  }

  get sessionId(): string {
    return this.#state.sessionId;
  }

  get state(): SessionState {
    return structuredClone(this.#state);
  }

  dispatch(event: IvrEvent): StepResult {
    // A withdrawal must take the action's one use from the dispatch ledger, so a press already handed to the line can't
    // be withdrawn, and a withdrawn one can't be sent. The transition is pure, so it is tried first, and the ledger is
    // claimed only if it would be accepted: a refused withdrawal leaves the press as it was.
    const withdrawing = event?.type === "dtmf_withdrawn";
    let result = transition(this.#state, event, this.#reasoner, withdrawing);
    const accepted = withdrawing && result.ok && result.decision?.kind === "abstain" && result.decision.reason === "decision_superseded";
    if (accepted && !claimForWithdrawal(this, event.actionId)) result = transition(this.#state, event, this.#reasoner, false);
    this.#state = result.state;
    return structuredClone(result);
  }
}
