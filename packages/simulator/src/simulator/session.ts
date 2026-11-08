/**
 * Single simulated call session executing a fictional IVR scenario.
 *
 * BLINDNESS INVARIANT:
 * Never exposes scenario definition, menu options, correct digits, or ground truth to the caller.
 * receiveDtmf returns only "delivered" | "not_delivered", never whether the digit was correct.
 */
import type { DtmfDigit, SimulatedDtmfPress } from "@holdbuddy/ivr-core";
import type { CallStopReason } from "@holdbuddy/call-runtime";
import type { AudioSegmentSink, AudioSegmentUploadMeta } from "../audio/audio-client.js";
import { FixtureCatalog } from "../audio/fixture-loader.js";
import { buildPcmWav, computeSha256, markWav, parseWav, splitWav, validateWav } from "../audio/wav.js";
import type { ScenarioDefinition, ScenarioStep } from "../scenarios/types.js";

/** The pause after an announcement or a hold message before the next step, unless a hold period is given. */
export const ANNOUNCEMENT_GAP_MS = 500;
/**
 * The hold period for stacks with real-latency recognition: the genuine and paced web stacks. Over three times the slowest
 * genuine Prisma recognition measured on these routes (988 ms), so the hold message is heard before the agent answers, and
 * far shorter than a real hold. A recogniser slower than this is overtaken by the agent's audio, and the runtime still
 * discards its result. Offline stacks recognise in milliseconds and keep ANNOUNCEMENT_GAP_MS, which their harnesses expect.
 */
export const REALTIME_HOLD_MS = 3_000;

const UNPLAYABLE_PROMPT_RATE = 16_000;
const UNPLAYABLE_PROMPT_FRAMES = 1_600;

export class MissingUsableSpeechError extends Error {
  constructor(
    readonly scenarioId: string,
    readonly stepId: string,
    readonly promptId: string,
    readonly fixtureStatus: string,
    message: string,
  ) {
    super(message);
    this.name = "MissingUsableSpeechError";
  }
}

export interface SimulatorSessionOptions {
  sessionId: string;
  scenario: ScenarioDefinition;
  sink: AudioSegmentSink;
  fixtures?: FixtureCatalog;
  mode?: "offline_mock" | "live_api";
  /** How long a hold lasts after its message before the next step. Defaults to ANNOUNCEMENT_GAP_MS. */
  holdMs?: number;
  onSessionClosed?: (sessionId: string) => void;
}

export class SimulatorSession {
  readonly sessionId: string;
  readonly #holdMs: number;
  readonly scenario: ScenarioDefinition;
  readonly mode: "offline_mock" | "live_api";
  readonly #sink: AudioSegmentSink;
  readonly #fixtures: FixtureCatalog;
  readonly #onClosed: ((sessionId: string) => void) | undefined;

  #currentStepId: string;
  #receivedDtmfCount = 0;
  #seenActionIds = new Set<string>();
  #closed = false;
  #segmentSeq = 0;
  /** Rises with each source-start notice, so the runtime can refuse one out of order. */
  #sourceSequence = 0;
  #promptSeq = 0;
  #activeTimer: NodeJS.Timeout | undefined;
  #currentStepRepeats = 0;

  constructor(options: SimulatorSessionOptions) {
    this.sessionId = options.sessionId;
    this.scenario = options.scenario;
    this.mode = options.mode ?? "offline_mock";
    this.#sink = options.sink;
    this.#fixtures = options.fixtures ?? new FixtureCatalog();
    this.#currentStepId = options.scenario.initialStepId;
    this.#onClosed = options.onSessionClosed;
    this.#holdMs = options.holdMs ?? ANNOUNCEMENT_GAP_MS;
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  get currentStepId(): string {
    return this.#currentStepId;
  }

  get receivedDtmfCount(): number {
    return this.#receivedDtmfCount;
  }

  async start(): Promise<void> {
    if (this.#closed) return;
    await this.#playCurrentStep();
  }

  async receiveDtmf(press: SimulatedDtmfPress): Promise<"delivered" | "not_delivered"> {
    if (this.#closed) return "not_delivered";

    // Deduplicate repeated actionId
    if (this.#seenActionIds.has(press.actionId)) {
      return "delivered";
    }
    this.#seenActionIds.add(press.actionId);
    this.#receivedDtmfCount += 1;

    const currentStep = this.scenario.steps[this.#currentStepId];
    if (!currentStep) return "not_delivered";
    const cancelAutoAdvance = () => {
      // Otherwise the old step's timer fires too, and the next prompt plays twice.
      if (this.#activeTimer) clearTimeout(this.#activeTimer);
      this.#activeTimer = undefined;
    };

    // Adversarial simulation: simulated delivery failure
    if (currentStep.dtmfDeliveryOutcome === "not_delivered") {
      return "not_delivered";
    }

    const matchedOption = currentStep.options?.find((opt) => opt.digit === press.digit);
    if (matchedOption) {
      cancelAutoAdvance();
      this.#currentStepId = matchedOption.nextStepId;
      this.#currentStepRepeats = 0;
      this.#playInBackground();
    } else if (currentStep.defaultNextStepId) {
      cancelAutoAdvance();
      this.#currentStepId = currentStep.defaultNextStepId;
      this.#playInBackground();
    }

    // "Return delivery status only, never answer correctness."
    return "delivered";
  }

  async stop(reason: CallStopReason): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#activeTimer) {
      clearTimeout(this.#activeTimer);
      this.#activeTimer = undefined;
    }
    this.#onClosed?.(this.sessionId);
  }

  /** A failed upload ends this call. Left unhandled, it would crash the process and every other call. */
  #playInBackground(): void {
    this.#playCurrentStep().catch(async (error: unknown) => {
      if (error instanceof MissingUsableSpeechError) await this.#reportUnplayablePrompt();
      void this.stop("failed");
    });
  }

  /**
   * The runtime has no other way to hear about a prompt that started after the call did. This segment
   * is refused with `playback_not_finished`, so no STT runs and the failure shows up in its events.
   */
  async #reportUnplayablePrompt(): Promise<void> {
    this.#promptSeq += 1;
    this.#segmentSeq += 1;
    const silence = buildPcmWav(new Int16Array(UNPLAYABLE_PROMPT_FRAMES), UNPLAYABLE_PROMPT_RATE);
    const meta: AudioSegmentUploadMeta = {
      segmentId: `seg-${this.#segmentSeq}-${this.sessionId}`,
      promptId: `prompt-${this.#promptSeq}`,
      fragmentIndex: 0,
      finalSegment: true,
      playbackOutcome: "unknown",
      playbackDurationMs: 0,
      dtmfCountAtStart: this.#receivedDtmfCount,
    };
    await this.#sink.uploadSegment(this.sessionId, meta, silence).catch(() => {});
  }

  get #needsVerifiedSpeech(): boolean {
    return this.mode === "live_api" || this.scenario.requiresVerifiedSpeech === true;
  }

  async #playCurrentStep(): Promise<void> {
    if (this.#closed) return;
    const step = this.scenario.steps[this.#currentStepId];
    if (!step) return;
    // Offline calls play their closing prompt. A live one must not spend a request or need a recording for it.
    if (step.kind === "terminal" && this.#needsVerifiedSpeech) return;

    this.#promptSeq += 1;
    // Opaque on purpose: a step name such as "step_agent" would tell the runtime a person has joined.
    const promptId = `prompt-${this.#promptSeq}`;
    // The prompt begins here, before its audio exists: this is the moment the line starts speaking. Its first segment
    // and its place after any digits are fixed now, and the runtime is told before anything is uploaded.
    this.#segmentSeq += 1;
    const firstSegmentId = `seg-${this.#segmentSeq}-${this.sessionId}`;
    const dtmfCountAtStart = this.#receivedDtmfCount;
    this.#sourceSequence += 1;
    await this.#sink.sourceStarted?.(this.sessionId, { segmentId: firstSegmentId, promptId, fragmentIndex: 0, dtmfCountAtStart, sourceSequence: this.#sourceSequence });
    if (this.#closed) return;

    // Obtain speech WAV audio
    let wav = await this.#getAudioForStep(step);
    if (this.#closed) return;
    if (step.prompt.mockHeard && !this.#needsVerifiedSpeech) {
      // A fault hears this audio differently, so it plays its own copy. The clean scenario keeps its own meaning.
      wav = markWav(wav, JSON.stringify(step.prompt.mockHeard));
      this.#fixtures.registerMock(computeSha256(wav), step.prompt.mockHeard.transcript, step.prompt.mockHeard.status);
    }

    // Check if prompt requires mid-menu pause (adversarial scenario: split into 2 fragments)
    if (step.prompt.splitAtMs && step.prompt.splitAtMs > 0) {
      const { first, second } = splitWav(wav, step.prompt.splitAtMs);
      const firstMeta = parseWav(first)!;
      const secondMeta = parseWav(second)!;

      // Register split mock transcripts for offline mock recognition
      const sentences = step.prompt.text.split(/(?<=[.!?])\s+/);
      const text0 = sentences[0] ?? step.prompt.text;
      const text1 = sentences.slice(1).join(" ") || step.prompt.text;
      this.#fixtures.registerMock(computeSha256(first), text0);
      this.#fixtures.registerMock(computeSha256(second), text1);

      // Fragment 0 (non-final)
      const seg0Meta: AudioSegmentUploadMeta = {
        segmentId: firstSegmentId,
        promptId,
        fragmentIndex: 0,
        finalSegment: false,
        playbackOutcome: step.prompt.playbackOutcome ?? "finished",
        playbackDurationMs: Math.round(firstMeta.durationMs),
        dtmfCountAtStart,
      };
      try {
        await this.#sink.uploadSegment(this.sessionId, seg0Meta, first);
      } catch (err) {
        if (this.#closed) return;
        throw err;
      }
      if (this.#closed) return;

      // Small pause between fragments
      await new Promise((r) => setTimeout(r, 200));
      if (this.#closed) return;

      // Fragment 1 (final)
      this.#segmentSeq += 1;
      const seg1Meta: AudioSegmentUploadMeta = {
        segmentId: `seg-${this.#segmentSeq}-${this.sessionId}`,
        promptId,
        fragmentIndex: 1,
        finalSegment: true,
        playbackOutcome: step.prompt.playbackOutcome ?? "finished",
        playbackDurationMs: Math.round(secondMeta.durationMs),
        dtmfCountAtStart,
      };
      try {
        await this.#sink.uploadSegment(this.sessionId, seg1Meta, second);
      } catch (err) {
        if (this.#closed) return;
        throw err;
      }
    } else {
      // Single complete prompt
      const meta = parseWav(wav)!;
      const segmentMeta: AudioSegmentUploadMeta = {
        segmentId: firstSegmentId,
        promptId,
        fragmentIndex: 0,
        finalSegment: true,
        playbackOutcome: step.prompt.playbackOutcome ?? "finished",
        playbackDurationMs: Math.round(meta.durationMs),
        dtmfCountAtStart,
      };
      try {
        await this.#sink.uploadSegment(this.sessionId, segmentMeta, wav);
      } catch (err) {
        if (this.#closed) return;
        throw err;
      }
    }

    // Auto-advance for non-menu steps (announcements, hold -> human, etc.). A hold is a period of waiting: where recognition
    // has real latency, the next step, usually the agent, comes after the hold period. With 500 ms, the agent's prompt began
    // while genuine Prisma was still on the hold message, and that result was rightly discarded as superseded.
    if (step.kind === "announcement" || step.kind === "hold") {
      if (step.defaultNextStepId && !this.#closed) {
        this.#activeTimer = setTimeout(() => {
          if (!this.#closed) {
            this.#currentStepId = step.defaultNextStepId!;
            this.#playInBackground();
          }
        }, step.kind === "hold" ? this.#holdMs : ANNOUNCEMENT_GAP_MS);
      }
    }
  }

  async #getAudioForStep(step: ScenarioStep): Promise<Buffer> {
    const isLiveOrVerified = this.#needsVerifiedSpeech;

    // An explicitly selected fixture is the only acceptable audio for a live or verified run.
    const explicitId = step.prompt.audioFixtureId;
    let fixture = explicitId ? this.#fixtures.get(explicitId) : undefined;
    if (!fixture && !(explicitId && isLiveOrVerified)) {
      fixture = this.#fixtures.get(step.prompt.id) ?? this.#fixtures.findSpeech(step.prompt.language, step.prompt.text);
    }
    if (fixture) {
      const isVerifiedSpeech =
        fixture.entry.status === "VERIFIED_CONSENTED_SPEECH" ||
        fixture.entry.status === "GNANI_TIMBRE_VERIFIED";

      if (isLiveOrVerified && !isVerifiedSpeech) {
        throw new MissingUsableSpeechError(
          this.scenario.id,
          step.id,
          step.prompt.id,
          fixture.entry.status,
          `[Simulator: Missing Usable Speech] Scenario '${this.scenario.id}' step '${step.id}' prompt '${step.prompt.id}' has fixture '${fixture.entry.id}' with status '${fixture.entry.status}'. For LIVE_API or verified scenarios, missing genuine human speech or GNANI_TIMBRE_VERIFIED speech MUST fail closed. Cannot silently fall back to synthetic tones, formant tones, or mock transcripts. Import genuine speech or verified provider TTS using 'npm run import-audio'.`,
        );
      }
      return fixture.bytes;
    }

    // 2. If in live/verified mode and no fixture exists, NEVER synthesize or fall back
    if (isLiveOrVerified) {
      throw new MissingUsableSpeechError(
        this.scenario.id,
        step.id,
        step.prompt.id,
        "missing",
        `[Simulator: Missing Usable Speech] Scenario '${this.scenario.id}' step '${step.id}' prompt '${step.prompt.id}' has no audio fixture recorded. For LIVE_API or verified scenarios, missing genuine human speech MUST fail closed. Cannot silently fall back to synthetic tones, formant tones, or mock transcripts. Import genuine speech using 'npm run import-audio'.`,
      );
    }

    throw new Error("Public demo speech is unavailable.");
  }
}
