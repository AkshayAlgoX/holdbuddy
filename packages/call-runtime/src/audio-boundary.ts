/**
 * The audio-turn boundary, section 5 of the contract. Pure: it looks only at bytes and the source's
 * report. It never decides a prompt is complete from a transcript.
 */
import { createHash } from "node:crypto";
import type { PlaybackOutcome, SegmentRejection } from "./protocol.js";

export interface AudioSegmentMeta {
  segmentId: string;
  promptId: string;
  fragmentIndex: number;
  finalSegment: boolean;
  playbackOutcome: PlaybackOutcome;
  playbackDurationMs: number;
  dtmfCountAtStart: number;
  audioSha256: string;
}

export const BOUNDARY = {
  minSampleRate: 8_000,
  maxSampleRate: 44_100,
  minDurationMs: 100,
  maxDurationMs: 30_000,
  playbackToleranceMs: 150,
  trailingSilenceMs: 300,
  /** About -40 dBFS on 16-bit samples. */
  silencePeak: 328,
} as const;

export interface WavLayout {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  encodingTag: number;
  dataOffset: number;
  dataBytes: number;
  durationMs: number;
  chunkIds: string[];
}

/** Every byte must belong to a declared chunk, so a cut-off file fails. Returns undefined when invalid. */
export function parseWavLayout(bytes: Uint8Array): WavLayout | undefined {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 12) return undefined;
  if (buffer.toString("latin1", 0, 4) !== "RIFF" || buffer.toString("latin1", 8, 12) !== "WAVE") return undefined;
  if (buffer.readUInt32LE(4) + 8 !== buffer.length) return undefined;

  let format: Pick<WavLayout, "sampleRate" | "channels" | "bitsPerSample" | "encodingTag"> | undefined;
  let blockAlign = 0;
  let data: { offset: number; bytes: number } | undefined;
  const chunkIds: string[] = [];
  let offset = 12;
  while (offset < buffer.length) {
    if (buffer.length - offset < 8) return undefined;
    const id = buffer.toString("latin1", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    const padded = end + (size % 2);
    if (padded > buffer.length) return undefined;
    if (id === "fmt ") {
      if (format || data || size < 16) return undefined;
      const channels = buffer.readUInt16LE(start + 2);
      const sampleRate = buffer.readUInt32LE(start + 4);
      const byteRate = buffer.readUInt32LE(start + 8);
      blockAlign = buffer.readUInt16LE(start + 12);
      const bitsPerSample = buffer.readUInt16LE(start + 14);
      if (channels === 0 || sampleRate === 0 || blockAlign !== (channels * bitsPerSample) / 8 || byteRate !== sampleRate * blockAlign) return undefined;
      format = { sampleRate, channels, bitsPerSample, encodingTag: buffer.readUInt16LE(start) };
    } else if (id === "data") {
      if (data || !format) return undefined;
      data = { offset: start, bytes: size };
    }
    chunkIds.push(id);
    offset = padded;
  }
  if (!format || !data || data.bytes === 0 || data.bytes % blockAlign !== 0) return undefined;
  const durationMs = ((data.bytes / blockAlign) / format.sampleRate) * 1000;
  return { ...format, dataOffset: data.offset, dataBytes: data.bytes, durationMs, chunkIds };
}

const peakOf = (buffer: Buffer, start: number, end: number): number => {
  let peak = 0;
  for (let at = start; at + 1 < end; at += 2) peak = Math.max(peak, Math.abs(buffer.readInt16LE(at)));
  return peak;
};

export type BoundaryResult =
  | { ok: true; promptComplete: boolean; durationMs: number; hasMockChunk: boolean }
  | { ok: false; reasons: SegmentRejection[] };

export function evaluateBoundary(meta: AudioSegmentMeta, bytes: Uint8Array): BoundaryResult {
  const reasons: SegmentRejection[] = [];
  if (createHash("sha256").update(bytes).digest("hex") !== meta.audioSha256) reasons.push("sha256_mismatch");
  if (meta.playbackOutcome !== "finished") reasons.push("playback_not_finished");

  const wav = parseWavLayout(bytes);
  if (!wav) return { ok: false, reasons: [...reasons, "invalid_wav"] };
  const supported =
    wav.encodingTag === 1 &&
    wav.bitsPerSample === 16 &&
    wav.channels === 1 &&
    wav.sampleRate >= BOUNDARY.minSampleRate &&
    wav.sampleRate <= BOUNDARY.maxSampleRate &&
    wav.durationMs >= BOUNDARY.minDurationMs &&
    wav.durationMs <= BOUNDARY.maxDurationMs;
  if (!supported) return { ok: false, reasons: [...reasons, "unsupported_audio_format"] };

  if (Math.abs(meta.playbackDurationMs - wav.durationMs) > BOUNDARY.playbackToleranceMs) reasons.push("playback_duration_mismatch");

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataEnd = wav.dataOffset + wav.dataBytes;
  if (peakOf(buffer, wav.dataOffset, dataEnd) <= BOUNDARY.silencePeak) {
    reasons.push("silent_segment");
  } else if (meta.finalSegment) {
    const tailBytes = Math.ceil((BOUNDARY.trailingSilenceMs / 1000) * wav.sampleRate) * 2;
    const tooShort = tailBytes >= wav.dataBytes;
    if (tooShort || peakOf(buffer, dataEnd - tailBytes, dataEnd) > BOUNDARY.silencePeak) reasons.push("no_trailing_silence");
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, promptComplete: meta.finalSegment, durationMs: wav.durationMs, hasMockChunk: wav.chunkIds.includes("MOCK") };
}
