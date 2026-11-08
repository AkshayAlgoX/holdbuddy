/**
 * One simulated call. The core decides everything about routing; this class only moves real audio into
 * it and carries its actions out. Commands that can lead to a press run one at a time, in order. Clock
 * ticks, stop and takeover deliberately don't wait in that queue, so a stuck adapter can't block them.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  IvrSession,
  SimulatorDispatcher,
  toObservation,
  type DtmfDigit,
  type IvrAction,
  type ObservationProvenance,
  type PreferredLanguage,
  type SemanticAssist,
  type SessionLimits,
  type SpeechContext,
  type SpeechFormat,
  type SpeechLanguage,
  type StepResult,
  type Transcription,
} from "@holdbuddy/ivr-core";
import { evaluateBoundary, type AudioSegmentMeta } from "./audio-boundary.js";
import type { HandoffJudge, RuntimeLogger, SimulatorPort } from "./ports.js";
import {
  PROTOCOL_VERSION,
  dataSourceOf,
  type DataSource,
  type ObservationProvenance as WireProvenance,
  type PublicSessionStatus,
  type RuntimeEvent,
  type RuntimeEventBody,
  type RuntimeFailureReason,
  type SegmentRejection,
  type SessionClosure,
  type SessionView,
  type SimulatorStopState,
  type SourceStartNotice,
  type SourceStartOutcome,
  type SttFailureCode,
} from "./protocol.js";
import { classifySttError, isFatalSttFailure, type SttBinding } from "./stt.js";

export interface CallSessionOptions {
  goal: string;
  preferredLanguage?: PreferredLanguage;
  /** Optional. Off unless a runtime is explicitly given one. */
  semanticAssist?: SemanticAssist;
  scenarioId?: string;
  simulator: SimulatorPort;
  /** Administrative identity, fixed by the runtime; never used as IVR evidence. */
  simulatorInstanceId?: string;
  stt: SttBinding;
  judge?: HandoffJudge;
  logger?: RuntimeLogger;
  /** Monotonic milliseconds. */
  now?: () => number;
  /** 0 turns the timer off, and tests call tick() themselves. */
  tickIntervalMs?: number;
  sttTimeoutMs?: number;
  sttLanguage?: SpeechLanguage;
  sttFormat?: SpeechFormat;
  sttContext?: SpeechContext;
  limits?: Partial<SessionLimits>;
  maxQueuedSegments?: number;
  maxConsecutiveRejections?: number;
  maxConsecutiveSttFailures?: number;
  maxBufferedEvents?: number;
  /** Closes a call with no audio and no user action for this long. A hold with audio never reaches it. */
  maxSilenceMs?: number;
  /**
   * How many presses in a row may be withdrawn, because newer audio overtook them, before the call ends. A delivered
   * digit resets it. The core's digit and no-progress limits bound it as well.
   */
  maxConsecutiveWithdrawals?: number;
  /** Closes a call this long after it began, whatever is happening on it. */
  maxCallMs?: number;
  /** How long one attempt to tell the simulator to stop may take. */
  simulatorStopTimeoutMs?: number;
}

const DEFAULT_MAX_SILENCE_MS = 15 * 60_000;
const DEFAULT_MAX_CALL_MS = 3 * 60 * 60_000;
const DEFAULT_SIMULATOR_STOP_TIMEOUT_MS = 5_000;
const SIMULATOR_STOP_ATTEMPTS = 2;
const DEFAULT_MAX_CONSECUTIVE_WITHDRAWALS = 2;

/** True if the work finished in time. Never rejects, and leaves no timer behind. */
async function succeedsWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([work.then(() => true, () => false), expired]);
  } finally {
    clearTimeout(timer);
  }
}

export type SessionCommandError = "session_closed" | "segment_queue_full" | "stale_request";

export class SessionCommandFailure extends Error {
  constructor(readonly code: SessionCommandError) {
    super(code);
  }
}

const EXPECTED_PROVENANCE: Record<SttBinding["mode"], ObservationProvenance> = {
  offline_mock: "offline_fixture",
  live_prisma: "prisma_stt",
};

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // No permission means it exists, so it isn't this process's to clean up after.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

/**
 * A killed process can't remove its temporary audio. This removes directories whose name says they belong to a process
 * that no longer exists, and nothing else: another running call's audio and older unnamed directories stay.
 */
export async function sweepOrphanedAudio(directory: string = tmpdir()): Promise<void> {
  const names = await readdir(directory).catch(() => [] as string[]);
  await Promise.all(names.map(async (name) => {
    const owner = /^holdbuddy-audio-p(\d+)-/.exec(name)?.[1];
    if (owner && !isRunning(Number(owner))) await rm(join(directory, name), { recursive: true, force: true }).catch(() => {});
  }));
}

const processStart = performance.now();
const defaultNow = () => Math.floor(performance.now() - processStart);

export class CallSession {
  readonly #core: IvrSession;
  readonly #dispatcher: SimulatorDispatcher;
  readonly #options: CallSessionOptions;
  readonly #now: () => number;
  readonly #events: RuntimeEvent[] = [];
  readonly #subscribers = new Set<(event: RuntimeEvent) => void>();
  readonly #seenSegments = new Set<string>();
  readonly #closedPrompts = new Set<string>();
  readonly #maxBuffered: number;
  readonly #terminated: Promise<void>;
  #resolveTerminated!: () => void;
  #timer: NodeJS.Timeout | undefined;
  #tail: Promise<void> = Promise.resolve();
  #queued = 0;
  #seq = 0;
  #observationId = 0;
  #deliveredPresses = 0;
  #consecutiveRejections = 0;
  #consecutiveSttFailures = 0;
  #closure: SessionClosure | undefined;
  #publicStatus: PublicSessionStatus;
  /** A press handed to the endpoint with no known result. */
  #inFlightPress: { actionId: string; digit: DtmfDigit } | undefined;
  /**
   * Freshness. Each novel segment registers when it arrives, before it waits in the queue, and a segment for a prompt
   * other than the latest one advances the revision. Work decided on an older revision can't create a press. This is
   * freshness from the moment an upload arrives: the source can't yet say when speech began.
   */
  #evidenceRevision = 0;
  #latestPrompt: string | undefined;
  readonly #registeredSegments = new Set<string>();
  readonly #registeredPrompts = new Set<string>();
  /** Prompts whose final segment has arrived. More of one contradicts its source. */
  readonly #finishedPrompts = new Set<string>();
  #consecutiveWithdrawals = 0;
  /** Source-start notices already acted on, by segment, and the highest sequence seen. */
  readonly #startedSegments = new Set<string>();
  #lastSourceSequence = -1;
  /** Clarification answers the core accepted. A press is bound to the goal it was decided for. */
  #goalVersion = 0;
  /** The menu revision that produced the question, rather than the revision when its answer arrives. */
  #clarificationBasis: { requestId: string; revision: number | undefined } | undefined;
  /** Set when session.closed is published. Nothing is published after it. */
  #closedPublished = false;
  #tempDir: Promise<string> | undefined;
  #currentAudio: Uint8Array | undefined;
  #pendingHumanRequest: string | undefined;
  #cleanedUp: Promise<void> = Promise.resolve();
  #startSettled: Promise<void> = Promise.resolve();
  #started = false;
  #lateStartStopScheduled = false;
  #simulatorStop: SimulatorStopState | undefined;
  #authoritativeStopConfirmed = false;
  #simulatorStopped: Promise<void> = Promise.resolve();
  readonly #startedAtMs: number;
  #lastActivityMs: number;

  constructor(options: CallSessionOptions) {
    this.#options = options;
    this.#now = options.now ?? defaultNow;
    this.#startedAtMs = this.#now();
    this.#lastActivityMs = this.#startedAtMs;
    this.#maxBuffered = options.maxBufferedEvents ?? 1024;
    this.#core = new IvrSession({
      goal: options.goal,
      ...(options.preferredLanguage ? { preferredLanguage: options.preferredLanguage } : {}),
      ...(options.limits ? { limits: options.limits } : {}),
    });
    this.#dispatcher = new SimulatorDispatcher(this.#core, options.simulator, this.#now);
    this.#publicStatus = this.#core.state.status;
    this.#terminated = new Promise((resolve) => {
      this.#resolveTerminated = resolve;
    });
  }

  get sessionId(): string {
    return this.#core.sessionId;
  }

  get simulatorInstanceId(): string | undefined { return this.#options.simulatorInstanceId; }

  get closed(): boolean {
    return this.#closure !== undefined;
  }

  /** Throws nothing. A simulator that won't start closes the session as failed. */
  async start(): Promise<void> {
    if (this.closed || this.#started) return;
    this.#started = true;
    this.#emit({ type: "session.started", sttMode: this.#options.stt.mode, protocolVersion: PROTOCOL_VERSION }, "NONE");
    if (this.closed) return;
    const interval = this.#options.tickIntervalMs ?? 250;
    if (interval > 0) {
      this.#timer = setInterval(() => this.tick(), interval);
      this.#timer.unref();
    }
    // Install the start barrier before calling an adapter that can synchronously call back into this session.
    let settleStart!: () => void;
    this.#startSettled = new Promise<void>((resolve) => { settleStart = resolve; });
    const started = (async () =>
      this.#options.simulator.startCall({
        sessionId: this.sessionId,
        ...(this.#options.scenarioId === undefined ? {} : { scenarioId: this.#options.scenarioId }),
      }))();
    void started.then(settleStart, settleStart);
    try {
      await Promise.race([started, this.#terminated]);
    } catch {
      this.#options.logger?.log({ code: "simulator_start_failed", sessionId: this.sessionId });
      this.#failRuntime("simulator_start_failed");
    }
  }

  view(): SessionView {
    const state = this.#core.state;
    const budget = this.#options.stt.budget();
    const open = !this.closed;
    const requestKind = state.status === "awaiting_clarification" ? "clarification" : "human";
    return {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: this.sessionId,
      status: this.#publicStatus,
      closed: this.closed,
      sttMode: this.#options.stt.mode,
      goal: state.goal,
      lastSeq: this.#seq,
      ...(open && state.pendingPress ? { pendingPress: state.pendingPress } : {}),
      ...(open && state.pendingRequestId !== undefined && state.deadlineMs !== undefined
        ? { pendingRequest: { requestId: state.pendingRequestId, kind: requestKind, deadlineMs: state.deadlineMs } }
        : {}),
      ...(this.#closure ? { closure: this.#closure } : {}),
      ...(this.#simulatorStop ? { simulatorStop: this.#simulatorStop } : {}),
      ...(budget ? { requestBudget: budget } : {}),
    };
  }

  /** Buffered events after `afterSeq`, and the oldest sequence still held, for SSE replay. */
  eventsAfter(afterSeq: number): { events: RuntimeEvent[]; firstAvailableSeq: number } {
    return {
      events: this.#events.filter((event) => event.seq > afterSeq),
      firstAvailableSeq: this.#events[0]?.seq ?? this.#seq + 1,
    };
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.#subscribers.add(listener);
    return () => this.#subscribers.delete(listener);
  }

  /** Resolves when all queued commands have settled. */
  idle(): Promise<void> {
    return this.#tail;
  }

  /** After closing: resolves once this session's temporary audio has been removed. */
  cleanedUp(): Promise<void> {
    return this.#cleanedUp;
  }

  /** After closing: resolves once the simulator confirmed the stop, or every attempt failed. Never rejects. */
  simulatorStopped(): Promise<void> {
    return this.#simulatorStopped;
  }

  get simulatorStopConfirmed(): boolean {
    return this.#simulatorStop === "confirmed";
  }

  /** Trusted runtime only: a completed, instance-bound reconciliation retired this closed call's ID. */
  confirmSimulatorStopped(): void {
    if (!this.closed) throw new Error("An open call cannot be confirmed stopped.");
    this.#authoritativeStopConfirmed = true;
    this.#simulatorStop = "confirmed";
  }

  /** Retrying an idempotent stop is safe; retrying a digit is not. Concurrent callers share this attempt. */
  reconcileSimulatorStop(): Promise<void> {
    if (this.#simulatorStop === "failed" && this.#closure) {
      this.#simulatorStop = "pending";
      this.#simulatorStopped = this.#stopSimulator(this.#closure.outcome);
    }
    return this.#simulatorStopped;
  }

  /** Queues one audio segment. Its outcome arrives as events. */
  submitAudioSegment(meta: AudioSegmentMeta, wav: Uint8Array): void {
    if (this.closed) throw new SessionCommandFailure("session_closed");
    // Before the queue check: a newer menu dropped because the queue is full still makes older work stale.
    const basis = this.#register(meta);
    if (this.#queued >= (this.#options.maxQueuedSegments ?? 4)) throw new SessionCommandFailure("segment_queue_full");
    this.#lastActivityMs = this.#now();
    this.#queued += 1;
    this.#enqueue(async () => {
      this.#queued -= 1;
      await this.#processSegment(meta, wav, basis);
    });
  }

  /**
   * A trusted source has begun a prompt, before any of its audio exists. A relevant one makes all older work stale at
   * once, exactly as the first upload of that prompt would, and the upload that follows acts on the new revision.
   * Duplicates, notices out of sequence, a prompt already heard or closed, and a prompt from before the last delivered
   * digit change nothing. It isn't audio, so it doesn't keep a silent line open. Synchronous, so it takes effect before
   * anything else can run.
   */
  sourceStarted(notice: SourceStartNotice): SourceStartOutcome {
    if (this.closed) throw new SessionCommandFailure("session_closed");
    if (this.#startedSegments.has(notice.segmentId)) return "duplicate";
    if (notice.sourceSequence <= this.#lastSourceSequence) return "out_of_order";
    this.#lastSourceSequence = notice.sourceSequence;
    this.#startedSegments.add(notice.segmentId);
    if (this.#closedPrompts.has(notice.promptId) || this.#finishedPrompts.has(notice.promptId)) return "prompt_closed";
    if (this.#registeredSegments.has(notice.segmentId) || notice.promptId === this.#latestPrompt) return "prompt_already_known";
    if (notice.dtmfCountAtStart < this.#deliveredPresses) return "stale_after_dtmf";
    // A prompt heard before, starting again after a newer one: older than what is current, so it only makes others stale.
    const reordered = this.#registeredPrompts.has(notice.promptId);
    this.#registeredPrompts.add(notice.promptId);
    this.#latestPrompt = notice.promptId;
    this.#evidenceRevision += 1;
    if (reordered) return "out_of_order";
    this.#emit({ type: "source.started", segmentId: notice.segmentId, promptId: notice.promptId, sourceSequence: notice.sourceSequence }, "NONE");
    return "accepted";
  }

  /**
   * Records a segment the moment it arrives, and returns the revision work on it may act on, or undefined if no work on
   * it may ever act. A repeat, a closed prompt or audio from before the last delivered digit says nothing new, so it
   * changes nothing. A prompt seen before that isn't the latest arrived out of order: it makes everything older
   * stale, and can't act itself.
   */
  #register(meta: AudioSegmentMeta): number | undefined {
    if (this.#registeredSegments.has(meta.segmentId)) return undefined;
    this.#registeredSegments.add(meta.segmentId);
    // Another segment of a prompt its source already called finished: perhaps a correction, perhaps not. Whatever was
    // decided on that prompt can't be trusted, and this segment can't act either.
    if (this.#finishedPrompts.has(meta.promptId) && meta.dtmfCountAtStart >= this.#deliveredPresses) {
      this.#evidenceRevision += 1;
      return undefined;
    }
    if (meta.finalSegment) this.#finishedPrompts.add(meta.promptId);
    // Audio from before the last delivered digit is about a past menu. Audio counted ahead of it was captured after a
    // digit whose acknowledgement hasn't been processed yet: it is newer, and processing still refuses it if that
    // acknowledgement never comes.
    if (this.#closedPrompts.has(meta.promptId) || meta.dtmfCountAtStart < this.#deliveredPresses) return undefined;
    if (meta.promptId === this.#latestPrompt) return this.#evidenceRevision;
    const reordered = this.#registeredPrompts.has(meta.promptId);
    this.#registeredPrompts.add(meta.promptId);
    this.#latestPrompt = meta.promptId;
    this.#evidenceRevision += 1;
    return reordered ? undefined : this.#evidenceRevision;
  }

  #isCurrent(basis: number | undefined): basis is number {
    return basis !== undefined && basis === this.#evidenceRevision;
  }

  answerClarification(requestId: string, text: string): void {
    if (this.closed) throw new SessionCommandFailure("session_closed");
    this.#lastActivityMs = this.#now();
    const question = this.#clarificationBasis;
    const basis = question?.requestId === requestId ? question.revision : this.#evidenceRevision;
    this.#enqueue(async () => {
      this.#flushDeadlines();
      if (this.closed) return;
      // The question was about speech that newer audio may have replaced, and an answer can press at once. That audio
      // supersedes the question when it is heard, as any newer observation does.
      if (basis !== this.#evidenceRevision) {
        this.#emit({ type: "engine.rejected", code: "answer_superseded_by_newer_audio" }, "NONE");
        return;
      }
      const step = this.#core.dispatch({ type: "clarification_answer", sessionId: this.sessionId, requestId, text, receivedAtMs: this.#clock() });
      if (step.ok) {
        this.#goalVersion += 1;
        this.#emit({ type: "clarification.answered", requestId }, "NONE");
      }
      await this.#applyStep(step, { basis });
    });
  }

  /** A user's judgement. Synchronous, because it can't lead to a press. */
  decideHuman(requestId: string, decision: "confirmed" | "rejected"): void {
    if (this.closed) throw new SessionCommandFailure("session_closed");
    this.#lastActivityMs = this.#now();
    this.#flushDeadlines();
    if (this.closed) throw new SessionCommandFailure("session_closed");
    if (!this.#applyHumanDecision(requestId, decision, "user")) throw new SessionCommandFailure("stale_request");
  }

  stop(): void {
    this.#close({ outcome: "stopped" }, "ended");
  }

  /** Stops automation for good, in any open state. No digit is sent after this returns. */
  takeOver(): void {
    if (this.closed) throw new SessionCommandFailure("session_closed");
    this.#close({ outcome: "manual_takeover" }, "manual_takeover");
  }

  /** Lets deadlines expire when nothing else is happening. */
  tick(): void {
    this.#expireIfOverdue();
    this.#flushDeadlines();
  }

  /** A silent line sends nothing, so without this a dead call would hold its slot forever. */
  #expireIfOverdue(): void {
    if (this.closed) return;
    const now = this.#now();
    if (now - this.#startedAtMs >= (this.#options.maxCallMs ?? DEFAULT_MAX_CALL_MS)) return this.#failRuntime("call_time_limit");
    if (now - this.#lastActivityMs >= (this.#options.maxSilenceMs ?? DEFAULT_MAX_SILENCE_MS)) this.#failRuntime("source_silent");
  }

  #flushDeadlines(): void {
    if (this.closed) return;
    const before = this.#core.state;
    const step = this.#core.dispatch({ type: "clock_tick", sessionId: this.sessionId, nowMs: this.#clock(before.lastNowMs) });
    if (before.status === "human_candidate" && step.state.status === "listening" && before.pendingRequestId !== undefined) {
      this.#pendingHumanRequest = undefined;
      this.#emit({ type: "handoff.expired", requestId: before.pendingRequestId }, "NONE");
    }
    void this.#applyStep(step, { tick: true });
  }

  #clock(notBefore?: number): number {
    return Math.max(this.#now(), notBefore ?? this.#core.state.lastNowMs);
  }

  #enqueue(work: () => Promise<void>): void {
    this.#tail = this.#tail.then(async () => {
      if (this.closed) return;
      try {
        await work();
      } catch {
        this.#options.logger?.log({ code: "internal_error", sessionId: this.sessionId });
        this.#failRuntime("internal_error");
      }
    });
  }

  #refuseSegment(meta: AudioSegmentMeta, reasons: SegmentRejection[]): void {
    this.#closedPrompts.add(meta.promptId);
    this.#emit({ type: "audio.segment_rejected", segmentId: meta.segmentId, promptId: meta.promptId, reasons }, "NONE");
    this.#consecutiveRejections += 1;
    if (this.#consecutiveRejections >= (this.#options.maxConsecutiveRejections ?? 20)) this.#failRuntime("audio_rejection_limit");
  }

  async #processSegment(meta: AudioSegmentMeta, wav: Uint8Array, basis: number | undefined): Promise<void> {
    this.#emit({ type: "audio.segment_received", segmentId: meta.segmentId, promptId: meta.promptId, fragmentIndex: meta.fragmentIndex, bytes: wav.byteLength }, "NONE");
    this.#flushDeadlines();
    if (this.closed) return;

    if (this.#seenSegments.has(meta.segmentId)) {
      // A repeat says nothing about the original, so its prompt stays as it was.
      this.#emit({ type: "audio.segment_rejected", segmentId: meta.segmentId, promptId: meta.promptId, reasons: ["duplicate_segment"] }, "NONE");
      return;
    }
    this.#seenSegments.add(meta.segmentId);

    const reasons: SegmentRejection[] = [];
    if (this.#closedPrompts.has(meta.promptId)) reasons.push("prompt_closed");
    if (meta.dtmfCountAtStart !== this.#deliveredPresses) reasons.push("stale_after_dtmf");
    if (this.#core.state.status === "awaiting_dtmf_ack") reasons.push("awaiting_dtmf_ack");
    const boundary = evaluateBoundary(meta, wav);
    if (!boundary.ok) reasons.push(...boundary.reasons);
    else if (boundary.hasMockChunk && this.#options.stt.mode === "live_prisma") reasons.push("mock_audio_in_live_mode");
    if (reasons.length > 0 || !boundary.ok) {
      this.#refuseSegment(meta, reasons);
      return;
    }
    this.#consecutiveRejections = 0;
    this.#emit({ type: "audio.segment_accepted", segmentId: meta.segmentId, promptId: meta.promptId, durationMs: boundary.durationMs, promptComplete: boundary.promptComplete }, "NONE");

    const transcription = await this.#transcribe(meta, wav);
    if (!transcription || this.closed) return;

    // Past deadlines apply first, so the observation is judged against the state that really holds.
    this.#flushDeadlines();
    if (this.closed) return;
    if (boundary.promptComplete) this.#closedPrompts.add(meta.promptId);

    // A complete prompt is where the core decides. If newer audio arrived while this one was recognised, what it would
    // decide may already be obsolete, so it doesn't reach the core. A fragment that isn't the last can't lead to a
    // press, and goes in as usual, so a prompt's earlier words are never dropped.
    if (boundary.promptComplete && !this.#isCurrent(basis)) {
      this.#emit({ type: "engine.rejected", code: "superseded_by_newer_audio" }, "NONE");
      return;
    }

    this.#observationId += 1;
    const observationId = this.#observationId;
    const step = this.#core.dispatch({
      type: "observation",
      observation: toObservation(transcription, {
        sessionId: this.sessionId,
        observationId,
        promptId: meta.promptId,
        fragmentIndex: meta.fragmentIndex,
        fragmentKind: "delta",
        promptComplete: boundary.promptComplete,
        observedAtMs: this.#clock(),
      }),
    });
    // The core may have closed a damaged prompt, so later fragments shouldn't be spent on STT.
    if (step.state.closedPromptIds.includes(meta.promptId)) this.#closedPrompts.add(meta.promptId);
    if (!step.ok) {
      this.#closedPrompts.add(meta.promptId);
    } else if (step.state.lastObservationId !== observationId) {
      this.#closedPrompts.add(meta.promptId);
      this.#emit({ type: "engine.rejected", code: "deadline_expired_first" }, "NONE");
    } else {
      const provenance = step.state.lastProvenance as WireProvenance;
      this.#emit(
        { type: "transcript.observed", segmentId: meta.segmentId, promptId: meta.promptId, observationId, status: transcription.status, transcript: transcription.transcript, promptComplete: boundary.promptComplete, provenance, ...(transcription.detectedLanguageCode ? { detectedLanguageCode: transcription.detectedLanguageCode } : {}) },
        dataSourceOf(provenance),
      );
    }
    this.#currentAudio = wav;
    try {
      await this.#applyStep(step, { basis });
      await this.#assist(step, basis);
    } finally {
      this.#currentAudio = undefined;
    }
  }

  /** Only runs when the rules abstained on a clean prompt. New speech waits in the queue meanwhile. */
  async #assist(step: StepResult, basis: number | undefined): Promise<void> {
    const { semanticAssist } = this.#options;
    const menu = step.ok ? step.state.assistable : undefined;
    if (!semanticAssist || !menu || this.closed) return;
    const outcome = await semanticAssist.choose(menu);
    if (this.closed) return;
    // Newer audio arrived while the choice was made, so the menu it was made on may be gone.
    if (!this.#isCurrent(basis)) {
      this.#emit({ type: "engine.rejected", code: "superseded_by_newer_audio" }, "NONE");
      return;
    }
    const source = dataSourceOf(this.#core.state.lastProvenance);
    if (outcome.kind === "abstain") {
      this.#emit({ type: "semantic.assessed", observationId: menu.observationId, matcherId: outcome.matcherId, outcome: "abstained", reason: outcome.reason }, source);
      return;
    }
    this.#emit({ type: "semantic.assessed", observationId: menu.observationId, matcherId: outcome.matcherId, outcome: "chosen", score: outcome.score, margin: outcome.margin }, source);
    await this.#applyStep(this.#core.dispatch({ type: "assisted_choice", sessionId: this.sessionId, observationId: menu.observationId, candidateId: outcome.candidateId, receivedAtMs: this.#clock() }), { basis });
  }

  /** Returns undefined for any failure. A failed segment closes its prompt, and nothing is retried. */
  async #transcribe(meta: AudioSegmentMeta, wav: Uint8Array): Promise<Transcription | undefined> {
    if (this.closed) return undefined;
    const { stt } = this.#options;
    const budget = stt.budget();
    if (budget && budget.used >= budget.limit) {
      this.#sttFailed(meta, "budget_exhausted");
      return undefined;
    }
    let path: string | undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      path = await this.#writeSegment(wav);
      // Stop/takeover can run while the file is being written. Do not begin a provider request afterwards.
      if (this.closed) return undefined;
      const request = stt.provider.transcribe({ audioPath: path, language: this.#options.sttLanguage ?? "mixed", ...(this.#options.sttFormat ? { format: this.#options.sttFormat } : {}), ...(this.#options.sttContext ? { context: this.#options.sttContext } : {}) });
      const current = stt.budget();
      this.#emit({ type: "stt.started", segmentId: meta.segmentId, providerId: stt.provider.id, ...(current ? { requestBudget: current } : {}) }, "NONE");
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), this.#options.sttTimeoutMs ?? 70_000);
      });
      const result = await Promise.race([request, timeout, this.#terminated.then(() => "closed" as const)]);
      if (result === "closed") {
        request.catch(() => {});
        return undefined;
      }
      if (result === "timeout") {
        request.catch(() => {});
        this.#sttFailed(meta, "timeout");
        return undefined;
      }
      // Checked here for a clear failure. The core separately verifies the attestation itself.
      if (result.attestation?.provenance !== EXPECTED_PROVENANCE[stt.mode]) {
        this.#sttFailed(meta, "provenance_mismatch");
        return undefined;
      }
      this.#consecutiveSttFailures = 0;
      return result;
    } catch (error) {
      if (!this.closed) this.#sttFailed(meta, classifySttError(error));
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
      if (path) await rm(path, { force: true }).catch(() => {});
    }
  }

  async #writeSegment(wav: Uint8Array): Promise<string> {
    this.#tempDir ??= mkdtemp(join(tmpdir(), `holdbuddy-audio-p${process.pid}-`));
    const path = join(await this.#tempDir, `${randomUUID()}.wav`);
    await writeFile(path, wav, { mode: 0o600, flag: "wx" });
    return path;
  }

  #sttFailed(meta: AudioSegmentMeta, code: SttFailureCode): void {
    this.#closedPrompts.add(meta.promptId);
    const fatal = isFatalSttFailure(code);
    this.#emit({ type: "stt.failed", segmentId: meta.segmentId, code, fatal }, "NONE");
    this.#options.logger?.log({ code: `stt_failed:${code}`, sessionId: this.sessionId });
    if (code === "budget_exhausted") return this.#failRuntime("stt_budget_exhausted");
    if (code === "provenance_mismatch") return this.#failRuntime("stt_provenance_mismatch");
    if (fatal) return this.#failRuntime("stt_fatal");
    this.#consecutiveSttFailures += 1;
    if (this.#consecutiveSttFailures >= (this.#options.maxConsecutiveSttFailures ?? 3)) this.#failRuntime("stt_repeated_failure");
  }

  /**
   * Publishes one core result, then carries out its actions. A listener may close the call while any event is
   * published, so closure is checked after each one, and nothing after it is published, recorded or carried out.
   */
  async #applyStep(step: StepResult, context: { tick?: boolean; basis?: number | undefined } = {}): Promise<void> {
    if (this.closed) return;
    // What a press here would be decided on. A tick decides on whatever is current when it runs.
    const basis = "basis" in context ? context.basis : this.#evidenceRevision;
    if (!step.ok && !context.tick) this.#emit({ type: "engine.rejected", code: step.error.code }, "NONE");
    const provenance = step.state.lastProvenance;
    const source = dataSourceOf(provenance);
    if (step.ok && step.decision) {
      this.#emit(
        {
          type: "decision.made",
          decision: step.decision,
          ...(step.state.lastObservationId ? { observationId: step.state.lastObservationId } : {}),
          ...(provenance ? { provenance } : {}),
        },
        source,
      );
      if (this.closed) return;
    }
    let press: Extract<IvrAction, { type: "send_dtmf" }> | undefined;
    let closure: SessionClosure | undefined;
    for (const action of step.actions) {
      switch (action.type) {
        case "send_dtmf":
          press = action;
          this.#emit({ type: "dtmf.requested", actionId: action.actionId, digit: action.digit, ackDeadlineMs: action.ackDeadlineMs, provenance: action.provenance }, dataSourceOf(action.provenance));
          break;
        case "request_clarification":
          this.#clarificationBasis = { requestId: action.requestId, revision: basis };
          this.#emit({ type: "clarification.requested", requestId: action.requestId, reason: action.reason, candidates: action.candidates, answerDeadlineMs: action.answerDeadlineMs }, source);
          break;
        case "abstained":
          this.#emit({ type: "decision.abstained", reason: action.reason }, source);
          break;
        case "hold_started":
          this.#emit({ type: "hold.started" }, source);
          break;
        case "possible_human":
          this.#pendingHumanRequest = action.requestId;
          this.#emit({ type: "handoff.possible_human", requestId: action.requestId, evidence: action.evidence, confirmDeadlineMs: action.confirmDeadlineMs }, source);
          this.#assessHuman(action.requestId, action.evidence);
          break;
        case "session_failed":
          closure = { outcome: "failed", failure: { source: "core", reason: action.reason } };
          break;
        case "handoff_to_user":
          closure = { outcome: "handoff" };
          break;
        case "session_ended":
          closure = { outcome: "stopped" };
          break;
      }
      if (this.closed) return;
    }
    this.#syncStatus(step.state.status);
    if (this.closed) return;
    if (closure) {
      this.#close(closure, step.state.status);
      return;
    }
    if (press) await this.#press(press, { revision: basis, goalVersion: this.#goalVersion, observationId: step.state.lastObservationId, delivered: this.#deliveredPresses });
  }

  /**
   * Only through the core's dispatcher, which still checks the pending action, the session, the clock and the deadline,
   * and reserves the action once before the endpoint. First, synchronously and with no await before the dispatcher,
   * this checks what the press was decided on still holds: the call is open, no newer audio arrived, the goal and the
   * observation are the same, and no other digit was delivered. A press that fails was never handed to the line.
   */
  async #press(action: Extract<IvrAction, { type: "send_dtmf" }>, basis: { revision: number | undefined; goalVersion: number; observationId: number | undefined; delivered: number }): Promise<void> {
    if (this.closed) return;
    const holds = this.#isCurrent(basis.revision) && basis.goalVersion === this.#goalVersion && basis.observationId === this.#core.state.lastObservationId && basis.delivered === this.#deliveredPresses;
    if (!holds) return this.#withdraw(action);
    const { actionId, digit, provenance } = action;
    const source: DataSource = dataSourceOf(provenance);
    this.#inFlightPress = { actionId, digit };
    const result = await Promise.race([this.#dispatcher.dispatch(action), this.#terminated.then(() => "closed" as const)]);
    if (result === "closed") return;
    switch (result.outcome) {
      case "delivered":
      case "not_delivered":
        this.#inFlightPress = undefined;
        this.#lastActivityMs = this.#now();
        if (result.outcome === "delivered") {
          this.#deliveredPresses += 1;
          this.#consecutiveWithdrawals = 0;
        }
        this.#emit({ type: "dtmf.acknowledged", actionId, digit, outcome: result.outcome }, source);
        await this.#applyStep(result.step);
        return;
      case "delivery_unknown":
        this.#emit({ type: "dtmf.unknown", actionId, digit }, source);
        return;
      case "refused":
        this.#inFlightPress = undefined;
        this.#emit({ type: "dtmf.refused", actionId, digit, refusal: result.refusal }, source);
        return;
    }
  }

  /**
   * A press overtaken by newer audio before it was sent. The core withdraws it only after the once-only ledger confirms
   * no dispatcher ever reserved it, and then no dispatcher can. The call goes back to listening, and the newer audio,
   * already queued, is heard and decided as usual. Nothing is retried: a new decision makes a new action. Past the limit,
   * or if the core refuses, the call ends without sending, as it did before recovery existed.
   */
  async #withdraw(action: Extract<IvrAction, { type: "send_dtmf" }>): Promise<void> {
    this.#options.logger?.log({ code: "stale_decision_withdrawn", sessionId: this.sessionId });
    if (this.#consecutiveWithdrawals >= (this.#options.maxConsecutiveWithdrawals ?? DEFAULT_MAX_CONSECUTIVE_WITHDRAWALS)) return this.#failRuntime("stale_decision");
    const step = this.#core.dispatch({ type: "dtmf_withdrawn", sessionId: this.sessionId, actionId: action.actionId, receivedAtMs: this.#clock() });
    if (!step.ok || step.state.pendingPress !== undefined) return this.#failRuntime("stale_decision");
    this.#consecutiveWithdrawals += 1;
    this.#emit({ type: "dtmf.withdrawn", actionId: action.actionId, digit: action.digit, reason: "superseded_by_newer_audio" }, dataSourceOf(action.provenance));
    await this.#applyStep(step);
  }

  #assessHuman(requestId: string, evidence: string): void {
    const { judge } = this.#options;
    if (!judge) {
      this.#emit({ type: "handoff.assessed", requestId, assessment: "uncertain", by: "none" }, "NONE");
      return;
    }
    const audio = this.#currentAudio ?? new Uint8Array();
    void judge
      .assess({ sessionId: this.sessionId, requestId, evidence, audio })
      .catch(() => "uncertain" as const)
      .then((assessment) => {
        if (this.closed || this.#pendingHumanRequest !== requestId) return;
        const known = assessment === "human" || assessment === "not_human" ? assessment : "uncertain";
        this.#emit({ type: "handoff.assessed", requestId, assessment: known, by: "judge" }, "NONE");
        if (known === "human") this.#applyHumanDecision(requestId, "confirmed", "judge");
        if (known === "not_human") this.#applyHumanDecision(requestId, "rejected", "judge");
      });
  }

  #applyHumanDecision(requestId: string, decision: "confirmed" | "rejected", by: "user" | "judge"): boolean {
    const step = this.#core.dispatch({
      type: decision === "confirmed" ? "human_confirmed" : "human_rejected",
      sessionId: this.sessionId,
      requestId,
      receivedAtMs: this.#clock(),
    });
    if (step.ok) {
      this.#pendingHumanRequest = undefined;
      this.#emit({ type: decision === "confirmed" ? "handoff.confirmed" : "handoff.rejected", requestId, by }, "NONE");
    }
    void this.#applyStep(step);
    return step.ok;
  }

  #syncStatus(next: PublicSessionStatus): void {
    const previous = this.#publicStatus;
    if (next === previous) return;
    this.#publicStatus = next;
    this.#emit({ type: "session.status_changed", from: previous, to: next }, "NONE");
    if (previous === "on_hold") this.#emit({ type: "hold.ended", to: next }, "NONE");
  }

  #failRuntime(reason: RuntimeFailureReason): void {
    this.#close({ outcome: "failed", failure: { source: "runtime", reason } }, "failed");
  }

  /** The single way a session ends. Idempotent, and `session.closed` is always the last event. */
  #close(closure: SessionClosure, status: PublicSessionStatus): void {
    if (this.closed) return;
    if (this.#timer) clearInterval(this.#timer);
    const coreStatus = this.#core.state.status;
    if (coreStatus !== "ended" && coreStatus !== "failed" && coreStatus !== "human_confirmed") {
      this.#core.dispatch({ type: "end", sessionId: this.sessionId });
    }
    const final: SessionClosure = { ...closure, ...(this.#inFlightPress ? { dtmfInFlight: this.#inFlightPress } : {}) };
    // Set first, so a listener reacting to the events below can't close the session a second time.
    this.#closure = final;
    this.#simulatorStop = "pending";
    this.#simulatorStopped = this.#stopSimulator(final.outcome);
    this.#syncStatus(status);
    this.#emit({ type: "session.closed", ...final }, "NONE");
    this.#closedPublished = true;
    this.#resolveTerminated();
    this.#subscribers.clear();
    const dir = this.#tempDir;
    if (dir) this.#cleanedUp = this.#tail.then(() => dir).then((path) => rm(path, { recursive: true, force: true })).catch(() => {});
  }

  /**
   * Waits for the start first. Otherwise a stop can overtake it on another connection, find nothing to stop and
   * leave the call running. Stopping is safe to repeat, so a passing failure gets one more attempt.
   */
  async #stopSimulator(reason: SessionClosure["outcome"]): Promise<void> {
    const limit = this.#options.simulatorStopTimeoutMs ?? DEFAULT_SIMULATOR_STOP_TIMEOUT_MS;
    const startSettled = await succeedsWithin(this.#startSettled, limit);
    if (this.#authoritativeStopConfirmed) return;
    for (let attempt = 0; attempt < SIMULATOR_STOP_ATTEMPTS; attempt += 1) {
      const stopped = (async () => this.#options.simulator.stopCall({ sessionId: this.sessionId, reason }))();
      const completed = await succeedsWithin(stopped, limit);
      if (this.#authoritativeStopConfirmed) return;
      if (completed) {
        if (startSettled) {
          this.#simulatorStop = "confirmed";
          return;
        }
        // This stop may have found nothing while start was still in transit. It is only best effort.
        break;
      }
    }
    this.#simulatorStop = "failed";
    this.#options.logger?.log({ code: "simulator_stop_failed", sessionId: this.sessionId });
    if (!startSettled && !this.#lateStartStopScheduled) {
      this.#lateStartStopScheduled = true;
      // A timeout must not abandon the eventual start. Reconcile after it, without delaying local closure.
      void this.#startSettled.then(() => this.reconcileSimulatorStop());
    }
  }

  #emit(body: RuntimeEventBody, dataSource: DataSource): void {
    // session.closed is the last event, for live listeners and for anyone replaying the buffer.
    if (this.#closedPublished) return;
    this.#seq += 1;
    const event = {
      eventId: `${this.sessionId}:${this.#seq}`,
      seq: this.#seq,
      sessionId: this.sessionId,
      at: new Date().toISOString(),
      atMs: this.#now(),
      dataSource,
      ...body,
    } as RuntimeEvent;
    this.#events.push(event);
    if (this.#events.length > this.#maxBuffered) this.#events.shift();
    for (const listener of [...this.#subscribers]) {
      try {
        listener(event);
      } catch {
        this.#options.logger?.log({ code: "event_listener_failed", sessionId: this.sessionId });
      }
    }
  }
}
