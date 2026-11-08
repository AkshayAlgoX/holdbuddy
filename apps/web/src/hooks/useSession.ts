import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { initialHandoffState, reduceHandoff, tickHandoff } from "../../../../packages/handoff/src/index.js";
import { RuntimeClient, ApiError } from "../api/client.js";
import { SSEClient } from "../api/sse.js";
import { MockPreviewRunner } from "../api/mock-preview.js";
import { readLaunchFragment } from "../judge/launch-fragment.js";
import type {
  ConnectionConfig,
  ConnectionState,
  CreateSessionRequest,
  HealthResponse,
  HumanDecisionRequest,
  PublicSessionStatus,
  RuntimeEvent,
  SessionView,
} from "../types.js";

/** Remembers the open call, so a reload or a new tab can get back to it. The runtime holds the call itself. */
const ACTIVE_SESSION_KEY = "holdbuddy_active_session";
const rememberSession = (sessionId: string | null) => {
  if (typeof window === "undefined") return;
  if (sessionId) sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  else sessionStorage.removeItem(ACTIVE_SESSION_KEY);
};

const DEFAULT_CONFIG: ConnectionConfig = {
  baseUrl: "/api",
  userToken: "public-demo",
};

export function useSession() {
  const [config, setConfig] = useState<ConnectionConfig>(() => {
    return DEFAULT_CONFIG;
  });

  const [currentSession, setCurrentSession] = useState<SessionView | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isMockPreview, setIsMockPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Re-derived from events, so a reconnect or replay can't change or repeat anything.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const handoff = useMemo(() => tickHandoff(events.reduce(reduceHandoff, initialHandoffState()), now), [events, now]);

  const clientRef = useRef<RuntimeClient>(new RuntimeClient(config));
  const sseClientRef = useRef<SSEClient | null>(null);
  const mockRunnerRef = useRef<MockPreviewRunner | null>(null);

  // Update client config when config changes
  useEffect(() => {
    clientRef.current.updateConfig(config);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("holdbuddy_base_url", config.baseUrl);
      if (config.userToken) {
        sessionStorage.setItem("holdbuddy_user_token", config.userToken);
      }
    }
  }, [config]);

  const updateConfig = useCallback((newConfig: Partial<ConnectionConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await clientRef.current.getHealth();
      setHealth(res);
      return res;
    } catch (err: unknown) {
      setHealth(null);
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError(0, "health_check_failed", err instanceof Error ? err.message : "Health check failed");
    }
  }, []);

  // Check health on mount
  useEffect(() => {
    // Browsing the static product needs no local service. A launch or saved connection opts into checking it.
    if (!config.userToken) { setHealth(null); return; }
    checkHealth().catch(() => {});
  }, [checkHealth, config.baseUrl, config.userToken]);

  /** Tests the values just typed. The shared client only picks up a saved change after the next render. */
  const testConnection = useCallback(async (candidate: ConnectionConfig) => {
    const client = new RuntimeClient(candidate);
    let res: HealthResponse;
    try {
      res = await client.getHealth();
    } catch (err: unknown) {
      setHealth(null);
      throw err;
    }
    setHealth(res);
    await client.checkToken();
    return res;
  }, []);

  const sessionGeneration = useRef(0);
  const cleanupActiveSession = useCallback(() => {
    sessionGeneration.current += 1;
    if (sseClientRef.current) {
      sseClientRef.current.stop();
      sseClientRef.current = null;
    }
    if (mockRunnerRef.current) {
      mockRunnerRef.current.stop();
      mockRunnerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupActiveSession();
    };
  }, [cleanupActiveSession]);

  /**
   * Process incoming runtime event to update state and session view.
   */
  const handleEvent = useCallback((event: RuntimeEvent) => {
    if (event.type === "session.closed") rememberSession(null);
    setEvents((prev) => {
      // Deduplicate by eventId or seq
      if (prev.some((e) => e.eventId === event.eventId || e.seq === event.seq)) {
        return prev;
      }
      const next = [...prev, event];
      // Keep strictly sorted by seq
      next.sort((a, b) => a.seq - b.seq);
      return next;
    });

    setCurrentSession((prev) => {
      if (!prev) return null;

      const updated: SessionView = {
        ...prev,
        lastSeq: Math.max(prev.lastSeq, event.seq),
      };

      if (event.type === "session.status_changed") {
        updated.status = event.to;
      } else if (event.type === "session.closed") {
        updated.closed = true;
        updated.status = (event.outcome === "manual_takeover" ? "manual_takeover" : event.outcome === "failed" ? "failed" : "ended") as PublicSessionStatus;
        updated.closure = {
          outcome: event.outcome,
          ...(event.failure ? { failure: event.failure } : {}),
          ...(event.dtmfInFlight ? { dtmfInFlight: event.dtmfInFlight } : {}),
        };
        updated.pendingPress = undefined;
        updated.pendingRequest = undefined;
      } else if (event.type === "clarification.requested") {
        updated.status = "awaiting_clarification";
        updated.pendingRequest = {
          requestId: event.requestId,
          kind: "clarification",
          deadlineMs: event.answerDeadlineMs,
        };
      } else if (event.type === "clarification.answered") {
        if (updated.pendingRequest?.requestId === event.requestId) {
          updated.pendingRequest = undefined;
        }
      } else if (event.type === "handoff.possible_human") {
        updated.status = "human_candidate";
        updated.pendingRequest = {
          requestId: event.requestId,
          kind: "human",
          deadlineMs: event.confirmDeadlineMs,
        };
      } else if (
        event.type === "handoff.confirmed" ||
        event.type === "handoff.rejected" ||
        event.type === "handoff.expired"
      ) {
        if (updated.pendingRequest?.requestId === event.requestId) {
          updated.pendingRequest = undefined;
        }
      } else if (event.type === "dtmf.requested") {
        updated.status = "awaiting_dtmf_ack";
        updated.pendingPress = {
          actionId: event.actionId,
          digit: event.digit,
          deadlineMs: event.ackDeadlineMs,
        };
      } else if (
        event.type === "dtmf.acknowledged" ||
        event.type === "dtmf.refused" ||
        event.type === "dtmf.unknown"
      ) {
        if (updated.pendingPress?.actionId === event.actionId) {
          updated.pendingPress = undefined;
        }
      } else if (event.type === "hold.started") {
        updated.status = "on_hold";
      } else if (event.type === "hold.ended") {
        updated.status = event.to;
      }

      return updated;
    });
  }, []);

  /**
   * After closure, asks the runtime a few times whether the simulator has confirmed it stopped, so the screen can say so.
   * Read-only. Stops at the first settled answer, any error, or a newer call.
   */
  const followSimulatorStop = useCallback(async (sse: SSEClient, sessionId: string) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (sseClientRef.current !== sse) return;
      let view: SessionView;
      try {
        view = await clientRef.current.getSession(sessionId);
      } catch {
        return;
      }
      if (sseClientRef.current !== sse) return;
      if (view.simulatorStop) {
        const stop = view.simulatorStop;
        setCurrentSession((prev) => (prev && prev.sessionId === sessionId ? { ...prev, simulatorStop: stop } : prev));
      }
      if (view.simulatorStop !== "pending") return;
    }
  }, []);

  /** Follows a session's events from the first one, which is how a reload rebuilds the whole screen. */
  const followSession = useCallback(
    (sessionView: SessionView) => {
      setCurrentSession(sessionView);
      const sse = new SSEClient(
        clientRef.current.getConfig(),
        sessionView.sessionId,
        {
          onEvent: (event) => {
            if (sseClientRef.current !== sse) return;
            handleEvent(event);
            if (event.type === "session.closed") void followSimulatorStop(sse, sessionView.sessionId);
          },
          onGap: async (_firstAvailableSeq) => {
            if (sseClientRef.current !== sse) return;
            setError({ code: "stream_gap", message: "Some earlier events are no longer available, so this timeline is incomplete." });
            // Re-fetch current session view
            try {
              const refreshed = await clientRef.current.getSession(sessionView.sessionId);
              if (sseClientRef.current === sse) setCurrentSession(refreshed);
            } catch (err: unknown) {
              console.error("Failed to resync session view on gap", err);
            }
          },
          onConnectionChange: (state, attempt) => {
            if (sseClientRef.current !== sse) return;
            setConnectionState(state);
            setReconnectAttempts(attempt ?? 0);
            if (state === "connected") {
              setError((current) => (current?.code === "stream_error" ? null : current));
            }
          },
          onError: (err) => {
            if (sseClientRef.current !== sse) return;
            setError({ code: "stream_error", message: err.message });
          },
          onClosed: () => {
            if (sseClientRef.current !== sse) return;
            setConnectionState("disconnected");
          },
        },
        // From the beginning: lastSeq from the create response would skip session.started and early audio.
        0,
      );

      sseClientRef.current = sse;
      sse.start();
    },
    [handleEvent, followSimulatorStop],
  );

  // A call outlives the page. Without this, a reload would leave it running with no way to stop it.
  useEffect(() => {
    const saved = typeof window === "undefined" ? null : sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (!saved) return;
    let cancelled = false;
    clientRef.current
      .getSession(saved)
      .then((view) => {
        if (cancelled) return;
        if (view.closed) rememberSession(null);
        else followSession(view);
      })
      .catch((err: unknown) => {
        // The runtime restarted, so that call is gone. Other failures keep it, to try again on the next load.
        if (err instanceof ApiError && err.status === 404) rememberSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [followSession]);

  /**
   * Start a real call using the runtime HTTP/SSE protocol.
   */
  const startRealCall = useCallback(
    async (request: CreateSessionRequest) => {
      cleanupActiveSession();
      setIsLoading(true);
      setError(null);
      setIsMockPreview(false);
      setEvents([]);
      setCurrentSession(null);

      try {
        const sessionView = await clientRef.current.createSession(request);
        rememberSession(sessionView.sessionId);
        followSession(sessionView);
      } catch (err: unknown) {
        const apiError =
          err instanceof ApiError
            ? { code: err.code, message: err.message }
            : { code: "unknown_error", message: err instanceof Error ? err.message : "Failed to start call" };
        setError(apiError);
        setConnectionState("error");
      } finally {
        setIsLoading(false);
      }
    },
    [cleanupActiveSession, followSession],
  );

  /**
   * Start an isolated local mock preview flow.
   */
  const startMockPreview = useCallback(
    (goal: string, scenarioId: string) => {
      cleanupActiveSession();
      setIsLoading(false);
      setError(null);
      setIsMockPreview(true);
      setEvents([]);
      setConnectionState("connected");

      const runner = new MockPreviewRunner(
        goal,
        scenarioId,
        handleEvent,
        (session) => {
          setCurrentSession(session);
        },
      );

      mockRunnerRef.current = runner;
      runner.start();
    },
    [cleanupActiveSession, handleEvent],
  );

  /**
   * Stop session automation.
   */
  const stopCall = useCallback(async () => {
    if (isMockPreview && mockRunnerRef.current) {
      mockRunnerRef.current.stop();
      return;
    }

    if (!currentSession) return;
    setIsLoading(true);
    try {
      const updated = await clientRef.current.stopSession(currentSession.sessionId);
      setCurrentSession(updated);
    } catch (err: unknown) {
      const apiErr = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "stop_failed", message: "Failed to stop call" };
      setError(apiErr);
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, isMockPreview]);

  /**
   * Take over manual control.
   */
  const takeOver = useCallback(async () => {
    if (isMockPreview && mockRunnerRef.current) {
      mockRunnerRef.current.takeOver();
      return;
    }

    if (!currentSession) return;
    setIsLoading(true);
    try {
      const updated = await clientRef.current.takeOverSession(currentSession.sessionId);
      setCurrentSession(updated);
    } catch (err: unknown) {
      const apiErr = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "takeover_failed", message: "Failed to take over session" };
      setError(apiErr);
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, isMockPreview]);

  /**
   * Answer a clarification request.
   */
  const answerClarification = useCallback(
    async (requestId: string, text: string) => {
      if (isMockPreview && mockRunnerRef.current) {
        mockRunnerRef.current.answerClarification(requestId, text);
        return;
      }

      if (!currentSession) return;
      setIsLoading(true);
      try {
        await clientRef.current.answerClarification(currentSession.sessionId, { requestId, text });
      } catch (err: unknown) {
        const apiErr = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "clarification_failed", message: "Failed to submit clarification" };
        setError(apiErr);
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, isMockPreview],
  );

  /**
   * Submit human confirmation or rejection decision.
   */
  const decideHuman = useCallback(
    async (requestId: string, decision: HumanDecisionRequest["decision"]) => {
      if (isMockPreview && mockRunnerRef.current) {
        mockRunnerRef.current.decideHuman(requestId, decision);
        return;
      }

      if (!currentSession) return;
      setIsLoading(true);
      try {
        const updated = await clientRef.current.decideHuman(currentSession.sessionId, { requestId, decision });
        setCurrentSession(updated);
      } catch (err: unknown) {
        const apiErr = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "decision_failed", message: "Failed to submit human decision" };
        setError(apiErr);
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, isMockPreview],
  );

  const resetSession = useCallback(() => {
    rememberSession(null);
    cleanupActiveSession();
    setCurrentSession(null);
    setEvents([]);
    setError(null);
    setIsMockPreview(false);
    setConnectionState("disconnected");
  }, [cleanupActiveSession]);

  /** Reconcile the current view/stream, without repeating a start, stop or button request. */
  const reconnect = useCallback(async () => {
    const id = currentSession?.sessionId ?? sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (!id || isMockPreview) return;
    const generation = sessionGeneration.current;
    const view = await clientRef.current.getSession(id);
    if (generation !== sessionGeneration.current) return;
    cleanupActiveSession();
    if (view.closed) { setCurrentSession(view); rememberSession(null); }
    else followSession(view);
  }, [currentSession, isMockPreview, cleanupActiveSession, followSession]);

  return {
    config,
    updateConfig,
    currentSession,
    events,
    handoff,
    connectionState,
    reconnectAttempts,
    isMockPreview,
    isLoading,
    error,
    health,
    testConnection,
    reconnect,
    startRealCall,
    startMockPreview,
    stopCall,
    takeOver,
    answerClarification,
    decideHuman,
    resetSession,
  };
}
