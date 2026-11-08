import type { DataSource, PublicSessionStatus } from "../types.js";

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
  } catch {
    return iso;
  }
}

export function formatRelativeMs(ms: number): string {
  const seconds = ms / 1000;
  return `+${seconds.toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function getStatusDisplayName(status: PublicSessionStatus): string {
  switch (status) {
    case "listening":
      return "Listening";
    case "awaiting_dtmf_ack":
      return "Awaiting DTMF Ack";
    case "awaiting_clarification":
      return "Clarification Needed";
    case "on_hold":
      return "Waiting on Hold";
    case "human_candidate":
      return "Someone May Have Answered";
    case "human_confirmed":
      return "Handed Over to You";
    case "ended":
      return "Session Ended";
    case "failed":
      return "Session Failed";
    case "manual_takeover":
      return "Manual Takeover";
    default:
      return status;
  }
}

export function getStatusTheme(status: PublicSessionStatus): {
  bg: string;
  text: string;
  border: string;
  dot: string;
  pulse?: boolean;
} {
  switch (status) {
    case "listening":
      return { bg: "bg-blue-950/40", text: "text-blue-400", border: "border-blue-800/50", dot: "bg-blue-400", pulse: true };
    case "awaiting_dtmf_ack":
      return { bg: "bg-amber-950/40", text: "text-amber-400", border: "border-amber-800/50", dot: "bg-amber-400", pulse: true };
    case "awaiting_clarification":
      return { bg: "bg-purple-950/40", text: "text-purple-400", border: "border-purple-800/50", dot: "bg-purple-400", pulse: true };
    case "on_hold":
      return { bg: "bg-indigo-950/40", text: "text-indigo-400", border: "border-indigo-800/50", dot: "bg-indigo-400", pulse: true };
    case "human_candidate":
      return { bg: "bg-emerald-950/60", text: "text-emerald-300", border: "border-emerald-600", dot: "bg-emerald-400", pulse: true };
    case "human_confirmed":
      return { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-800/50", dot: "bg-emerald-400" };
    case "manual_takeover":
      return { bg: "bg-teal-950/40", text: "text-teal-400", border: "border-teal-800/50", dot: "bg-teal-400" };
    case "ended":
      return { bg: "bg-zinc-900/60", text: "text-zinc-400", border: "border-zinc-800", dot: "bg-zinc-500" };
    case "failed":
      return { bg: "bg-red-950/40", text: "text-red-400", border: "border-red-800/50", dot: "bg-red-500" };
    default:
      return { bg: "bg-zinc-900", text: "text-zinc-300", border: "border-zinc-800", dot: "bg-zinc-400" };
  }
}

export interface DataSourceBadgeMeta {
  badge: "REAL_API" | "MOCK" | "NONE";
  title: string;
  description: string;
  className: string;
}

export function getDataSourceMeta(source: DataSource): DataSourceBadgeMeta {
  switch (source) {
    case "REAL_API":
      return {
        badge: "REAL_API",
        title: "Gnani Prisma Speech-to-Text",
        description: "Derived from actual Gnani recognition response (core provenance: prisma_stt).",
        className: "badge-real-api",
      };
    case "MOCK":
      return {
        badge: "MOCK",
        title: "Offline Mock Fixture",
        description: "Authored offline transcript fixture (core provenance: offline_fixture or mock_stt). NOT genuine audio recognition.",
        className: "badge-mock",
      };
    case "NONE":
    default:
      return {
        badge: "NONE",
        title: "No Transcript Source",
        description: "System lifecycle, audio transmission, or timing event not derived from speech recognition.",
        className: "badge-none",
      };
  }
}

/**
 * The runtime's deadlines use its own monotonic clock, while countdowns use the browser's. Each event
 * carries both clocks, so the difference converts one to the other.
 */
export function withBrowserDeadlines<T extends { pendingRequest?: { deadlineMs: number } | undefined; pendingPress?: { deadlineMs: number } | undefined }>(
  session: T,
  latestEvent: { at: string; atMs: number } | undefined,
): T {
  if (!latestEvent) return session;
  const offset = Date.parse(latestEvent.at) - latestEvent.atMs;
  if (!Number.isFinite(offset)) return session;
  return {
    ...session,
    ...(session.pendingRequest ? { pendingRequest: { ...session.pendingRequest, deadlineMs: session.pendingRequest.deadlineMs + offset } } : {}),
    ...(session.pendingPress ? { pendingPress: { ...session.pendingPress, deadlineMs: session.pendingPress.deadlineMs + offset } } : {}),
  };
}
