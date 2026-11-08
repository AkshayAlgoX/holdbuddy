import type { SourceStartNotice, PlaybackOutcome } from "@holdbuddy/call-runtime/protocol";
export interface AudioSegmentUploadMeta { segmentId: string; promptId: string; fragmentIndex: number; finalSegment: boolean; playbackOutcome: PlaybackOutcome; playbackDurationMs: number; dtmfCountAtStart: number }
export interface AudioSegmentSink { uploadSegment(sessionId: string, meta: AudioSegmentUploadMeta, wav: Uint8Array): Promise<void>; sourceStarted?(sessionId: string, notice: SourceStartNotice): Promise<void> }
