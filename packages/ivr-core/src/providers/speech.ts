import type { FragmentKind, ProvenanceAttestation, TranscriptObservation, TranscriptionStatus } from "../contracts.js";

export type SpeechSingleLanguage = "hi" | "en" | "bn" | "gu" | "kn" | "ml" | "mr" | "pa" | "ta" | "te";
/** One language, a preset, or a list of up to four hints. Prisma v3.0 treats all of them as hints. */
export type SpeechLanguage = SpeechSingleLanguage | "mixed" | "auto" | readonly SpeechSingleLanguage[];
export type SpeechFormat = "verbatim" | "transcribe" | "codemix" | "transliterate";
export interface SpeechContext {
  keyterms?: readonly string[];
  topic?: string;
  previousText?: string;
  speakerNames?: readonly string[];
}

export interface TranscriptionRequest {
  /** A local audio file. Streaming would add a separate method, leaving the engine unchanged. */
  audioPath: string;
  language: SpeechLanguage;
  format?: SpeechFormat;
  context?: SpeechContext;
}

export interface Transcription {
  status: TranscriptionStatus;
  transcript: string;
  /** Issued by trusted adapter code for this exact transcript. Callers pass it along and can't create one. */
  attestation: ProvenanceAttestation;
  /** What the provider says the transcript is written in. Judged from script, so it isn't proof of the language. */
  detectedLanguageCode?: string;
}

/** What the engine needs from STT. Providers live server-side and own their credentials. */
export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(request: TranscriptionRequest): Promise<Transcription>;
}

export interface ObservationContext {
  sessionId: string;
  observationId: number;
  promptId: string;
  fragmentIndex: number;
  fragmentKind: FragmentKind;
  /** Must come from a reliable signal. See TranscriptObservation.promptComplete. */
  promptComplete: boolean;
  observedAtMs: number;
}

export function toObservation(result: Transcription, context: ObservationContext): TranscriptObservation {
  return { ...context, transcript: result.transcript, status: result.status, attestation: result.attestation };
}
