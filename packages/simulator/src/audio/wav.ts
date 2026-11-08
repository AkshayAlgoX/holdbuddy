/**
 * RIFF/WAVE parsing, validation and manipulation according to holdbuddy.runtime.v1.
 * Strict: linear PCM, 16-bit, mono, 8 kHz to 44.1 kHz, 100 ms to 30,000 ms,
 * peak > -40 dBFS (>328), trailing silence >= 300 ms with peak <= 328.
 */
import { createHash } from "node:crypto";

export const WAV_CONSTRAINTS = {
  minSampleRate: 8_000,
  maxSampleRate: 44_100,
  minDurationMs: 100,
  maxDurationMs: 30_000,
  playbackToleranceMs: 150,
  trailingSilenceMs: 300,
  silencePeak: 328,
  maxAudioBytes: 4 * 1024 * 1024,
} as const;

export interface WavMetadata {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  encodingTag: number;
  dataOffset: number;
  dataBytes: number;
  durationMs: number;
  chunkIds: string[];
}

export type WavValidationReason =
  | "invalid_riff_header"
  | "size_mismatch"
  | "missing_fmt_or_data"
  | "unsupported_encoding"
  | "unsupported_channel_count"
  | "unsupported_sample_rate"
  | "unsupported_bit_depth"
  | "duration_too_short"
  | "duration_too_long"
  | "body_too_large"
  | "silent_segment"
  | "no_trailing_silence";

export function parseWav(bytes: Uint8Array): WavMetadata | undefined {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 12) return undefined;
  if (buffer.toString("latin1", 0, 4) !== "RIFF" || buffer.toString("latin1", 8, 12) !== "WAVE") return undefined;
  if (buffer.readUInt32LE(4) + 8 !== buffer.length) return undefined;

  let format: Pick<WavMetadata, "sampleRate" | "channels" | "bitsPerSample" | "encodingTag"> | undefined;
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
      const encodingTag = buffer.readUInt16LE(start);
      const channels = buffer.readUInt16LE(start + 2);
      const sampleRate = buffer.readUInt32LE(start + 4);
      const byteRate = buffer.readUInt32LE(start + 8);
      blockAlign = buffer.readUInt16LE(start + 12);
      const bitsPerSample = buffer.readUInt16LE(start + 14);
      if (
        channels === 0 ||
        sampleRate === 0 ||
        blockAlign !== (channels * bitsPerSample) / 8 ||
        byteRate !== sampleRate * blockAlign
      ) {
        return undefined;
      }
      format = { sampleRate, channels, bitsPerSample, encodingTag };
    } else if (id === "data") {
      if (data || !format) return undefined;
      data = { offset: start, bytes: size };
    }
    chunkIds.push(id);
    offset = padded;
  }

  if (!format || !data || data.bytes === 0 || data.bytes % blockAlign !== 0) return undefined;
  const durationMs = (data.bytes / blockAlign / format.sampleRate) * 1000;
  return { ...format, dataOffset: data.offset, dataBytes: data.bytes, durationMs, chunkIds };
}

export function peakOf(buffer: Buffer, start: number, end: number): number {
  let peak = 0;
  for (let at = start; at + 1 < end; at += 2) {
    peak = Math.max(peak, Math.abs(buffer.readInt16LE(at)));
  }
  return peak;
}

export function validateWav(bytes: Uint8Array, options: { checkTrailingSilence?: boolean } = {}): {
  valid: boolean;
  meta?: WavMetadata;
  reasons: WavValidationReason[];
} {
  const reasons: WavValidationReason[] = [];
  if (bytes.length > WAV_CONSTRAINTS.maxAudioBytes) reasons.push("body_too_large");

  const meta = parseWav(bytes);
  if (!meta) {
    return { valid: false, reasons: [...reasons, "invalid_riff_header"] };
  }

  if (meta.encodingTag !== 1) reasons.push("unsupported_encoding");
  if (meta.channels !== 1) reasons.push("unsupported_channel_count");
  if (meta.bitsPerSample !== 16) reasons.push("unsupported_bit_depth");
  if (meta.sampleRate < WAV_CONSTRAINTS.minSampleRate || meta.sampleRate > WAV_CONSTRAINTS.maxSampleRate) {
    reasons.push("unsupported_sample_rate");
  }
  if (meta.durationMs < WAV_CONSTRAINTS.minDurationMs) reasons.push("duration_too_short");
  if (meta.durationMs > WAV_CONSTRAINTS.maxDurationMs) reasons.push("duration_too_long");

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataEnd = meta.dataOffset + meta.dataBytes;
  const overallPeak = peakOf(buffer, meta.dataOffset, dataEnd);
  if (overallPeak <= WAV_CONSTRAINTS.silencePeak) {
    reasons.push("silent_segment");
  }

  if (options.checkTrailingSilence) {
    const tailBytes = Math.ceil((WAV_CONSTRAINTS.trailingSilenceMs / 1000) * meta.sampleRate) * 2;
    if (tailBytes >= meta.dataBytes || peakOf(buffer, dataEnd - tailBytes, dataEnd) > WAV_CONSTRAINTS.silencePeak) {
      reasons.push("no_trailing_silence");
    }
  }

  return { valid: reasons.length === 0, meta, reasons };
}

export function computeSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Creates a valid RIFF/WAVE buffer containing 16-bit mono linear PCM samples.
 */
export function buildPcmWav(samples: Int16Array, sampleRate: number = 16000): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  // RIFF header
  buffer.write("RIFF", 0, "latin1");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "latin1");

  // fmt chunk
  buffer.write("fmt ", 12, "latin1");
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(2, 32); // BlockAlign (NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(16, 34); // BitsPerSample (16)

  // data chunk
  buffer.write("data", 36, "latin1");
  buffer.writeUInt32LE(dataBytes, 40);

  const sampleBuffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  sampleBuffer.copy(buffer, 44);

  return buffer;
}

/**
 * Ensures the WAV has at least `minSilenceMs` of trailing silence (samples with magnitude <= 328).
 * Appends zero samples if needed and adjusts RIFF/data lengths accordingly.
 */
export function ensureTrailingSilence(wav: Buffer, minSilenceMs: number = 350): Buffer {
  const meta = parseWav(wav);
  if (!meta) throw new Error("Cannot ensure trailing silence on invalid WAV.");

  const tailBytes = Math.ceil((minSilenceMs / 1000) * meta.sampleRate) * 2;
  const dataEnd = meta.dataOffset + meta.dataBytes;
  const currentTailPeak = tailBytes < meta.dataBytes ? peakOf(wav, dataEnd - tailBytes, dataEnd) : Infinity;

  if (currentTailPeak <= WAV_CONSTRAINTS.silencePeak) {
    return wav;
  }

  // Needs silence padding
  const paddingBytes = tailBytes;
  const newWav = Buffer.alloc(wav.length + paddingBytes);
  wav.copy(newWav);

  // Update RIFF size (offset 4) and data chunk size (offset meta.dataOffset - 4)
  newWav.writeUInt32LE(newWav.readUInt32LE(4) + paddingBytes, 4);
  newWav.writeUInt32LE(meta.dataBytes + paddingBytes, meta.dataOffset - 4);

  return newWav;
}

/**
 * A copy whose bytes also depend on a key. Only the lowest bit of early samples changes, and trailing silence
 * stays silent. The mock recognizer finds a transcript by audio hash, so two meanings need two hashes.
 */
export function markWav(wav: Buffer, key: string): Buffer {
  const meta = parseWav(wav);
  if (!meta) throw new Error("Cannot mark invalid WAV.");
  const marked = Buffer.from(wav);
  const bits = createHash("sha256").update(key).digest();
  for (let index = 0; index < bits.length * 8; index += 1) {
    const offset = meta.dataOffset + (index + 1) * 2;
    if (offset >= meta.dataOffset + meta.dataBytes) break;
    marked[offset] = (marked[offset]! & 0xfe) | ((bits[index >> 3]! >> (index & 7)) & 1);
  }
  return marked;
}

/**
 * Splits a WAV file into two fragments at a specified millisecond boundary.
 * Useful for adversarial scenarios testing prompt boundaries and mid-prompt pauses.
 */
export function splitWav(wav: Buffer, splitAtMs: number): { first: Buffer; second: Buffer } {
  const meta = parseWav(wav);
  if (!meta) throw new Error("Cannot split invalid WAV.");

  const splitSamples = Math.round((splitAtMs / 1000) * meta.sampleRate);
  const totalSamples = meta.dataBytes / 2;
  const clampedSplit = Math.max(1, Math.min(splitSamples, totalSamples - 1));

  const sampleBuffer = wav.subarray(meta.dataOffset, meta.dataOffset + meta.dataBytes);
  const int16 = new Int16Array(sampleBuffer.buffer, sampleBuffer.byteOffset, totalSamples);

  const firstSamples = int16.slice(0, clampedSplit);
  const secondSamples = int16.slice(clampedSplit);

  return {
    first: buildPcmWav(firstSamples, meta.sampleRate),
    second: buildPcmWav(secondSamples, meta.sampleRate),
  };
}

const UNKNOWN_CHUNK_SIZE = 0xffffffff;
const METADATA_CHUNK_IDS = new Set([
  "LIST", "JUNK", "junk", "fact", "bext", "id3 ", "ID3 ", "cue ", "smpl", "inst", "PAD ", "fmt ", "data",
]);
const MIN_UNKNOWN_CHUNK_BYTES = 16;

function findUnknownSizeDataChunk(buffer: Buffer): number | undefined {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4);
    if (buffer.toString("latin1", offset, offset + 4) === "data") {
      return size === UNKNOWN_CHUNK_SIZE ? offset : undefined;
    }
    offset += 8 + size + (size % 2);
  }
  return undefined;
}

function assertPayloadIsOnlySamples(buffer: Buffer, start: number): void {
  if (buffer.subarray(start).includes("WAVEfmt ", 0, "latin1")) {
    throw new Error("Streamed audio contains a second WAV header");
  }
  for (let offset = start; offset + 8 <= buffer.length; offset += 1) {
    const size = buffer.readUInt32LE(offset + 4);
    const remaining = buffer.length - offset - 8;
    if (size !== remaining && size + 1 !== remaining) continue;
    const idBytes = buffer.subarray(offset, offset + 4);
    if (idBytes.some((byte) => byte < 0x20 || byte > 0x7e)) continue;
    if (METADATA_CHUNK_IDS.has(idBytes.toString("latin1")) || size >= MIN_UNKNOWN_CHUNK_BYTES) {
      throw new Error("Streamed audio ends in another chunk, not samples");
    }
  }
}

export interface NormalizedStreamedWav {
  audio: Buffer;
  meta: WavMetadata | undefined;
  streamingHeaderDetected: boolean;
  normalized: boolean;
}

/**
 * Normalizes streamed WAV responses from TTS providers (e.g. Gnani Timbre) where
 * the RIFF header or data chunk size is set to the streaming sentinel 0xFFFFFFFF.
 */
export function normalizeStreamedWav(buffer: Buffer): NormalizedStreamedWav {
  const hasWavHeader =
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WAVE";
  const riffSize = hasWavHeader ? buffer.readUInt32LE(4) : 0;
  const dataHeader = hasWavHeader ? findUnknownSizeDataChunk(buffer) : undefined;

  if (!hasWavHeader || (riffSize !== UNKNOWN_CHUNK_SIZE && dataHeader === undefined)) {
    return { audio: buffer, meta: parseWav(buffer), streamingHeaderDetected: false, normalized: false };
  }

  if (riffSize !== UNKNOWN_CHUNK_SIZE && riffSize + 8 !== buffer.length) {
    throw new Error(`RIFF header declares ${riffSize + 8} bytes but the file has ${buffer.length}`);
  }

  const audio = Buffer.from(buffer);
  audio.writeUInt32LE(audio.length - 8, 4);
  if (dataHeader !== undefined) {
    assertPayloadIsOnlySamples(audio, dataHeader + 8);
    audio.writeUInt32LE(audio.length - dataHeader - 8, dataHeader + 4);
  }
  return { audio, meta: parseWav(audio), streamingHeaderDetected: true, normalized: true };
}
