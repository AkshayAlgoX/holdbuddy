import { publicCapability } from "./public-connection.js";
/**
 * Authorized fetch-based Server-Sent Events (SSE) reader for HoldBuddy Call Runtime.
 *
 * Implements:
 * - Authorization: Bearer <userToken> header support (native EventSource lacks this)
 * - Last-Event-ID replay header
 * - Chunk buffering & multiline SSE block parsing
 * - Comment (: keepalive) handling
 * - stream.gap event handling for out-of-bounds replay
 * - Duplicate event suppression by seq and eventId
 * - Exponential backoff reconnection until session closure
 * - Explicit abort and resource cleanup
 */
import type { ConnectionConfig, ConnectionState, RuntimeEvent } from "../types.js";

export interface SSEClientCallbacks {
  onEvent: (event: RuntimeEvent) => void;
  onGap: (firstAvailableSeq: number) => void;
  onConnectionChange: (state: ConnectionState, attempt?: number) => void;
  onError: (error: Error) => void;
  onClosed: () => void;
}

export class SSEClient {
  private abortController: AbortController | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private highestSeq = 0;
  private seenEventIds = new Set<string>();
  private reconnectAttempts = 0;
  private isIntentionallyClosed = false;
  private sessionIsClosed = false;
  private maxReconnectAttempts = 8;
  private baseBackoffMs = 1000;
  private maxBackoffMs = 15000;
  // The runtime sends a keepalive every 15s. Silence for longer means the stream is dead, even if
  // a proxy in between never closed it.
  private idleTimeoutMs = 40000;

  constructor(
    private config: ConnectionConfig,
    private sessionId: string,
    private callbacks: SSEClientCallbacks,
    initialLastSeq = 0,
  ) {
    this.highestSeq = initialLastSeq;
  }

  start(): void {
    this.isIntentionallyClosed = false;
    this.sessionIsClosed = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  stop(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.callbacks.onConnectionChange("disconnected");
  }

  private getBackoffMs(): number {
    const delay = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** this.reconnectAttempts);
    // Add jitter
    return delay + Math.floor(Math.random() * 500);
  }

  private async connect(): Promise<void> {
    if (this.isIntentionallyClosed || this.sessionIsClosed) return;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(this.sessionId)}/events`;
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (this.config.userToken) {
      headers["Authorization"] = `Bearer ${await publicCapability()}`;
    }
    if (this.highestSeq > 0) {
      headers["Last-Event-ID"] = String(this.highestSeq);
    }

    try {
      this.callbacks.onConnectionChange(this.reconnectAttempts > 0 ? "reconnecting" : "connecting", this.reconnectAttempts);

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal,
      });
      if (signal.aborted || this.isIntentionallyClosed) {
        await response.body?.cancel();
        return;
      }

      if (!response.ok) {
        throw new Error(`SSE HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is not readable");
      }

      this.reconnectAttempts = 0;
      this.callbacks.onConnectionChange("connected");

      await this.readStream(response.body, signal);
      if (signal.aborted) return;

      // If we exit readStream without an error and session was closed, done
      if (this.sessionIsClosed || this.isIntentionallyClosed) {
        this.callbacks.onConnectionChange("disconnected");
        this.callbacks.onClosed();
        return;
      }

      // If server ended connection prematurely (e.g. network disconnect before session.closed), try reconnect
      this.scheduleReconnect();
    } catch (err: unknown) {
      if (signal.aborted || this.isIntentionallyClosed) {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError(error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isIntentionallyClosed || this.sessionIsClosed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onConnectionChange("error");
      this.callbacks.onError(new Error(`Failed to reconnect to session stream after ${this.maxReconnectAttempts} attempts.`));
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.getBackoffMs();
    this.callbacks.onConnectionChange("reconnecting", this.reconnectAttempts);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, delay);
  }

  private async readStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const watchIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => void reader.cancel().catch(() => {}), this.idleTimeoutMs);
    };

    try {
      while (!signal.aborted) {
        watchIdle();
        const { value, done } = await reader.read();
        if (done || signal.aborted || this.isIntentionallyClosed) break;

        buffer += decoder.decode(value, { stream: true });

        // Normalize CRLF to LF
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Split buffer by complete SSE message boundaries (\n\n)
        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex !== -1) {
          const rawBlock = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);

          if (rawBlock.trim().length > 0) {
            this.parseBlock(rawBlock);
          }

          boundaryIndex = buffer.indexOf("\n\n");
        }
      }
    } finally {
      clearTimeout(idleTimer);
      reader.releaseLock();
    }
  }

  /**
   * Parse a single SSE block comprising event, id, data, comments.
   */
  parseBlock(block: string): void {
    if (this.isIntentionallyClosed) return;
    const lines = block.split("\n");
    let eventType = "message";
    let eventId: string | null = null;
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      // Comment / keepalive line
      if (line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("id:")) {
        eventId = line.slice(3).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    const dataText = dataLines.join("\n");
    if (!dataText) return;

    if (eventType === "stream.gap") {
      try {
        const parsed = JSON.parse(dataText) as { firstAvailableSeq?: number };
        if (typeof parsed.firstAvailableSeq === "number") {
          this.callbacks.onGap(parsed.firstAvailableSeq);
        }
      } catch {
        // Malformed gap payload
      }
      return;
    }

    try {
      const event = JSON.parse(dataText) as RuntimeEvent;

      if (typeof event !== "object" || event === null || typeof event.seq !== "number") {
        return;
      }
      if (event.sessionId !== this.sessionId || !Number.isSafeInteger(event.seq) || event.seq < 1 || event.eventId !== `${this.sessionId}:${event.seq}`) return;

      // Duplicate suppression
      if (this.seenEventIds.has(event.eventId)) {
        return;
      }
      if (event.seq <= this.highestSeq && this.seenEventIds.size > 0) {
        return;
      }

      this.seenEventIds.add(event.eventId);
      if (event.seq > this.highestSeq) {
        this.highestSeq = event.seq;
      }

      this.callbacks.onEvent(event);

      if (event.type === "session.closed") {
        this.sessionIsClosed = true;
      }
    } catch {
      // Ignore unparseable data frames
    }
  }
}
