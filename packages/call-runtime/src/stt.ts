/**
 * STT bindings. A binding fixes one mode for the whole process. Offline output always carries the
 * core's `offline_fixture` attestation, and only the core's Prisma adapter can produce `prisma_stt`.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { attestOfflineFixture, type SpeechToTextProvider, type Transcription, type TranscriptionRequest, type TranscriptionStatus } from "@holdbuddy/ivr-core";
import type { RequestBudget, SttFailureCode, SttMode } from "./protocol.js";


export class SttBudgetError extends Error {
  constructor() {
    super("STT request budget is used up.");
    this.name = "SttBudgetError";
  }
}

/** The text is fixed. The rejected response is never attached, so nothing can log or forward it. */
export class SttUnsafeResponseError extends Error {
  constructor() {
    super("The speech provider's response was rejected.");
    this.name = "SttUnsafeResponseError";
  }
}

export interface SttBinding {
  readonly mode: SttMode;
  readonly provider: SpeechToTextProvider;
  budget(): RequestBudget | undefined;
}

export interface MockTranscript {
  transcript: string;
  status?: TranscriptionStatus;
}

/**
 * Stands in for a recogniser: real bytes in, the fixture registered for exactly those bytes out. It
 * recognises nothing, so its output is always MOCK. Unknown audio is `no_speech`, never a guess.
 */
export function createOfflineMockBinding(fixturesBySha256: ReadonlyMap<string, MockTranscript>): SttBinding {
  return {
    mode: "offline_mock",
    budget: () => undefined,
    provider: {
      id: "offline-mock-by-audio-hash",
      async transcribe(request: TranscriptionRequest): Promise<Transcription> {
        const digest = createHash("sha256").update(await readFile(request.audioPath)).digest("hex");
        const fixture = fixturesBySha256.get(digest);
        const transcript = fixture?.transcript ?? "";
        const status = fixture?.status ?? (fixture ? "transcribed" : "no_speech");
        return { transcript, status, attestation: attestOfflineFixture(transcript, status) };
      },
    },
  };
}

const PROVIDER_KINDS: ReadonlySet<string> = new Set<SttFailureCode>([
  "timeout", "network", "auth", "insufficient_credit", "forbidden", "rate_limited", "bad_request", "server", "invalid_input", "invalid_response", "response_too_large",
]);
const FATAL: ReadonlySet<SttFailureCode> = new Set<SttFailureCode>(["budget_exhausted", "auth", "insufficient_credit", "forbidden", "provenance_mismatch", "unsafe_provider_response"]);

/** Reads one allowlisted field. The error's message and provider detail are never touched. */
export function classifySttError(error: unknown): SttFailureCode {
  if (error instanceof SttBudgetError) return "budget_exhausted";
  if (error instanceof SttUnsafeResponseError) return "unsafe_provider_response";
  const kind = typeof error === "object" && error !== null && "kind" in error ? (error as { kind: unknown }).kind : undefined;
  return typeof kind === "string" && PROVIDER_KINDS.has(kind) ? (kind as SttFailureCode) : "stt_error";
}

export const isFatalSttFailure = (code: SttFailureCode) => FATAL.has(code);
