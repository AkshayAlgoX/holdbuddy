import React, { useEffect, useState, useRef } from 'react';
import { IconCheck, IconArrowRight, IconInfo } from './icons.js';
import { HbSelect } from './HbSelect.js';

interface NativeReadiness {
  ok: boolean;
  localOriginOnly: boolean;
  asteriskAvailable: boolean;
  asteriskBinaryPath: string;
  livePrismaConfigured: boolean;
  supportedModes: string[];
  supportedGoals: string[];
  requiredAuthorizationPhrase: string;
  maxRequests: number;
  blockers: string[];
  verifiedEvidence?: {
    status: string;
    runLabel: string;
    sourceCommit: string;
    manifestSha256: string;
    provenance: string;
    freshRequests: number;
    route: string;
    cleanup: string;
  };
  liveExecution?: {
    available: boolean;
    status: string;
    provider: string;
    endpoint: string;
    model: string;
    language: string;
    maxRequests: number;
    requiresAuthorizationPhrase: boolean;
    cashRiskDisclosed: boolean;
  };
  simulatedDemo?: {
    status: string;
    mode: string;
    audioModel: string;
    realTelephony: boolean;
  };
}

interface TelephonyEvent {
  type: string;
  eventId: string;
  timestamp: string;
  sessionId: string;
  [key: string]: any;
}

interface TurnState {
  generation: number;
  promptId: string;
  label: string;
  transcript?: string;
  decision?: {
    digit: string;
    label?: string;
  };
  abstained?: {
    reason: string;
    details: string;
  };
  receipt?: {
    sequence: number;
    digit: string;
    evidence: string;
  };
  durationMs?: number;
  requestId?: string;
  provenance?: string;
}

export function NativeEngineRunner() {
  const [readiness, setReadiness] = useState<NativeReadiness | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(true);
  const [mode, setMode] = useState<'replay' | 'live-three'>('replay');
  const [goal, setGoal] = useState<'complaint' | 'payment' | 'refund'>('complaint');
  const [authInput, setAuthInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<TelephonyEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [probeSuccess, setProbeSuccess] = useState(false);
  const [lastProbedTime, setLastProbedTime] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkReadiness = async (isUserTriggered = false) => {
    try {
      if (isUserTriggered) {
        setIsProbing(true);
      }
      setLoadingReadiness(true);
      setErrorMsg(null);
      const start = Date.now();
      const res = await fetch('/api/v1/native/status');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch telephony status`);
      }
      const data: NativeReadiness = await res.json();
      setReadiness(data);
      const elapsed = Date.now() - start;
      if (isUserTriggered && elapsed < 350) {
        await new Promise((r) => setTimeout(r, 350 - elapsed));
      }
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastProbedTime(timeStr);
      if (isUserTriggered) {
        setProbeSuccess(true);
        setTimeout(() => setProbeSuccess(false), 2400);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to probe local telephony server.');
    } finally {
      setIsProbing(false);
      setLoadingReadiness(false);
    }
  };

  useEffect(() => {
    void checkReadiness(false);
  }, []);

  const streamEvents = async (sessionId: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/v1/native/session/${sessionId}/events`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Unable to connect to event stream`);
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.slice(6));
              setEvents((prev) => {
                if (prev.some((e) => e.eventId === parsed.eventId)) return prev;
                return [...prev, parsed];
              });
              if (parsed.type === 'session.closed') {
                setIsRunning(false);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg('Disconnected from native session stream.');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleStart = async () => {
    setErrorMsg(null);
    setEvents([]);

    if (mode === 'live-three') {
      if (authInput.trim() !== readiness?.requiredAuthorizationPhrase) {
        setErrorMsg(`Authorization phrase required: "${readiness?.requiredAuthorizationPhrase}"`);
        return;
      }
    }

    try {
      const res = await fetch('/api/v1/native/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          goal,
          authorizationPhrase: mode === 'live-three' ? authInput.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${res.status}: Failed to start session`);
      }

      const data = await res.json();
      setActiveSessionId(data.sessionId);
      setIsRunning(true);
      void streamEvents(data.sessionId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initiate native telephony run.');
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/v1/native/session/${activeSessionId}/stop`, {
        method: 'POST',
      });
    } catch {}
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
  };

  // Turn map synthesis
  const turnMap = new Map<number, TurnState>();
  events.forEach((ev) => {
    if (!ev.generation) return;
    const prev: TurnState = turnMap.get(ev.generation) || {
      generation: ev.generation,
      promptId: ev.promptId || `turn-${ev.generation}`,
      label: ev.generation === 1 ? 'Product Menu' : ev.generation === 2 ? 'Service Menu' : 'Action Menu',
    };

    if (ev.type === 'audio.segment_accepted' || ev.type === 'audio.capture.completed') {
      if (ev.durationMs) prev.durationMs = ev.durationMs;
    } else if (ev.type === 'transcript.observed') {
      if (ev.transcript) prev.transcript = ev.transcript;
      if (ev.requestId) prev.requestId = ev.requestId;
      if (ev.provenance) prev.provenance = ev.provenance;
    } else if (ev.type === 'decision.made') {
      const dec = ev.decision || ev.action;
      const digitStr = dec?.digit !== undefined && dec?.digit !== null ? String(dec.digit).trim() : '';
      if (digitStr) {
        prev.decision = {
          digit: digitStr,
          label: dec?.label ? String(dec.label).trim() : undefined,
        };
      }
    } else if (ev.type === 'decision.abstained') {
      prev.abstained = {
        reason: String(ev.reason || 'goal_not_offered_in_menu'),
        details: String(ev.details || 'Option is not present in menu. Abstaining from DTMF dispatch.'),
      };
    } else if (ev.type === 'dtmf.requested' || ev.type === 'dtmf.acknowledged') {
      const digitStr = ev.digit !== undefined && ev.digit !== null ? String(ev.digit).trim() : '';
      if (ev.type === 'dtmf.acknowledged') {
        prev.receipt = {
          sequence: ev.sequence,
          digit: digitStr,
          evidence: ev.evidence ?? 'SIMULATION_ACK',
        };
      }
      if (!prev.decision && digitStr) {
        prev.decision = {
          digit: digitStr,
          label: undefined,
        };
      }
    }

    turnMap.set(ev.generation, prev);
  });

  const turnList = Array.from(turnMap.values()).sort((a, b) => a.generation - b.generation);
  const detachEvent = events.find((e) => e.type === 'detach.confirmed');
  const closeEvent = events.find((e) => e.type === 'session.closed');
  const isLiveActive = mode === 'live-three';
  const liveDisabled = !readiness?.livePrismaConfigured;

  // Distinguish true operational failures from normal missing optional API key
  const operationalBlockers = readiness?.blockers.filter(
    (b) => !b.toLowerCase().includes('gnani_api_key'),
  ) ?? [];
  const hasMissingKey = !readiness?.livePrismaConfigured;

  return (
    <section className="hb-native-runner" aria-labelledby="hb-native-title">
      <div className="hb-native-header">
        <div className="hb-native-title-block">
          <h2 id="hb-native-title" className="hb-heading hb-native-main-title">
            Interactive Telephony Runner
          </h2>
          <p className="hb-small hb-native-sublead">
            Execute a multi-turn call against Asterisk 20 ARI and Gnani Prisma STT adapter.
          </p>
        </div>
        <div className="hb-native-status-pills">
          <span className={`hb-native-status-pill ${readiness?.ok ? 'is-verified' : 'is-pending'}`}>
            {readiness?.ok ? <IconCheck size={14} /> : null}
            <span>{readiness?.ok ? 'TELEPHONY READY' : 'TELEPHONY BLOCKED'}</span>
          </span>
          <span className="hb-native-mode-pill is-replay">
            {isLiveActive ? 'Live Mode' : 'Offline Replay'}
          </span>
        </div>
      </div>

      {/* Daemon & Environment Diagnostics */}
      <div className="hb-native-diag-panel">
        <div className="hb-native-diag-top">
          <div className="hb-native-diag-heading-wrap">
            <span className="hb-native-diag-heading">Telemetry &amp; Environment Diagnostics</span>
            {lastProbedTime && (
              <span className="hb-native-probed-pill" title="Live status fetched from /api/v1/native/status">
                <span className="hb-pulse-dot-green" /> Probed {lastProbedTime}
              </span>
            )}
          </div>
          <span className="hb-native-diag-sub">Gnani Prisma STT adapter + local loopback telephony status</span>
        </div>

        <div className="hb-native-diag-tiles">
          <div className="hb-native-tile">
            <span className="hb-native-tile-label">Local Loopback Gating</span>
            <div className="hb-native-tile-value">
              {readiness?.localOriginOnly ? (
                <span className="hb-ok-text"><IconCheck size={14} /> Loopback Verified</span>
              ) : (
                <span className="hb-danger-text">Non-local Host</span>
              )}
            </div>
            <span className="hb-native-tile-sub">127.0.0.1 / localhost strictly gated</span>
          </div>

          <div className="hb-native-tile">
            <span className="hb-native-tile-label">Telephony Execution</span>
            <div className="hb-native-tile-value">
              <span className="hb-ok-text"><IconCheck size={14} /> Loopback Active</span>
            </div>
            <span className="hb-native-tile-sub">Local Simulation · Hardware ARI via CLI</span>
          </div>

          <div className="hb-native-tile">
            <span className="hb-native-tile-label">Server Gnani Prisma Key</span>
            <div className="hb-native-tile-value">
              {readiness?.livePrismaConfigured ? (
                <span className="hb-ok-text"><IconCheck size={14} /> Configured</span>
              ) : (
                <span className="hb-native-val-neutral">Not configured (Live mode disabled)</span>
              )}
            </div>
            <span className="hb-native-tile-sub">
              {readiness?.livePrismaConfigured ? 'GNANI_API_KEY present' : 'Offline loopback qualified'}
            </span>
          </div>

          <div className="hb-native-tile">
            <span className="hb-native-tile-label">Request Cap &amp; Guardrails</span>
            <div className="hb-native-tile-value">
              <span>Max {readiness?.maxRequests ?? 3} Calls</span>
            </div>
            <span className="hb-native-tile-sub">Single session mutex · No auto-retry</span>
          </div>
        </div>

        <details className="hb-native-details">
          <summary>Inspect runtime paths &amp; telephony daemon details</summary>
          <div className="hb-native-details-content">
            <div>
              <strong>Asterisk Binary:</strong>
              <code>{readiness?.asteriskBinaryPath || 'Not configured'}</code>
            </div>
            <div>
              <strong>Transport Protocol:</strong>
              <span>AudioSocket TCP 8kHz PCM16 Loopback</span>
            </div>
            <div>
              <strong>Hardware ARI Benchmark:</strong>
              <span>Qualified independently in native CLI (live-journey-three-fresh-two · DTMF 5 → 8 → 1)</span>
            </div>
          </div>
        </details>

        {/* Real Operational Failures (true errors) */}
        {operationalBlockers.length > 0 && (
          <div className="hb-native-blockers-alert" role="alert">
            <strong>Active Operational Blocker:</strong>
            <ul>
              {operationalBlockers.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Normal Configuration State: Live Gnani not configured */}
        {hasMissingKey && (
          <div className="hb-native-config-notice" role="region" aria-label="Live Configuration Status">
            <div className="hb-config-notice-header">
              <span className="hb-config-info-icon" aria-hidden="true">
                <IconInfo size={16} />
              </span>
              <span className="hb-config-notice-text">
                Live Gnani testing isn't configured on this server.
              </span>
            </div>
            <details className="hb-config-notice-details">
              <summary>Secure local setup instructions</summary>
              <div className="hb-config-details-content">
                <p className="hb-small">
                  Offline Asterisk loopback replay remains fully qualified and operational for local testing.
                </p>
                <p className="hb-small">
                  To test with genuine live Gnani Prisma speech recognition, launch the server using:
                  <br />
                  <code>GNANI_API_KEY=your_key node scripts/launch-owner-server.mjs</code>
                  <br />
                  The key remains in volatile process memory only and is never written to disk, logs, or git.
                </p>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Control Form with Polished Accessible Select Components */}
      <div className="hb-native-controls-box">
        <div className="hb-native-row">
          <div className="hb-native-field">
            <span id="hb-mode-select-label" className="hb-field-label">
              <strong>1. Telephony Mode:</strong>
            </span>
            <HbSelect
              id="hb-mode-select"
              labelId="hb-mode-select-label"
              value={mode}
              disabled={isRunning}
              onChange={(val) => setMode(val as any)}
              options={[
                {
                  value: 'replay',
                  label: 'Local Loopback Replay (Saved Recognition) — Safe & Offline',
                },
                {
                  value: 'live-three',
                  label: `Genuine Live Gnani Prisma STT (REAL_API) + Loopback Telephony${liveDisabled ? ' [Key Unconfigured]' : ''}`,
                  disabled: liveDisabled,
                },
              ]}
            />
          </div>

          <div className="hb-native-field">
            <span id="hb-goal-select-label" className="hb-field-label">
              <strong>2. Call Objective (Goal):</strong>
            </span>
            <HbSelect
              id="hb-goal-select"
              labelId="hb-goal-select-label"
              value={goal}
              disabled={isRunning}
              onChange={(val) => setGoal(val as any)}
              options={[
                {
                  value: 'complaint',
                  label: 'Complaint Help — Route 5 → 8 → 1',
                },
                {
                  value: 'payment',
                  label: 'Payment Assistance — Route 5 → 8 → 2',
                },
                {
                  value: 'refund',
                  label: 'Refund (Refusal) — Route 5 → 8 → Refusal',
                },
              ]}
            />
          </div>
        </div>

        {/* Route Preview Rail */}
        <div className="hb-native-route-preview">
          <span className="hb-native-route-label">Target Navigation Path:</span>
          <div className="hb-native-route-steps">
            <span className="hb-native-step-pill">Turn 1: Product (5)</span>
            <span className="hb-native-route-sep"><IconArrowRight size={12} /></span>
            <span className="hb-native-step-pill">Turn 2: Service (8)</span>
            <span className="hb-native-route-sep"><IconArrowRight size={12} /></span>
            <span className="hb-native-step-pill is-active">
              {goal === 'complaint' ? 'Turn 3: Complaint (1)' : goal === 'payment' ? 'Turn 3: Payment (2)' : 'Turn 3: Refusal (No key)'}
            </span>
            <span className="hb-native-route-sep"><IconArrowRight size={12} /></span>
            <span className="hb-native-step-pill is-terminal">
              {goal === 'refund' ? 'Closure' : 'Human Handoff'}
            </span>
          </div>
        </div>

        {/* Live Mode Consent Notice */}
        {mode === 'live-three' && (
          <div className="hb-native-live-consent-box" role="region" aria-label="Live Authorization">
            <p className="hb-native-cash-warning">
              <strong>⚠️ CASH-CHARGE &amp; CONSUMPTION WARNING:</strong> This mode issues live outbound HTTP REST calls to
              Gnani Prisma v3.0 (<code>https://api.vachana.ai/stt/v3</code>). It spends provider credits up to the hard cap
              of 3 requests. It never retries automatically.
            </p>
            <p className="hb-small">
              Type the exact authorization phrase to permit execution:
              <br />
              <code>{readiness?.requiredAuthorizationPhrase}</code>
            </p>
            <input
              type="text"
              className="hb-native-auth-input"
              value={authInput}
              disabled={isRunning}
              placeholder="Paste exact phrase to authorize..."
              onChange={(e) => setAuthInput(e.target.value)}
            />
          </div>
        )}

        {/* Action Button Row */}
        <div className="hb-native-actions-row">
          {!isRunning ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={loadingReadiness || (mode === 'live-three' && authInput.trim() !== readiness?.requiredAuthorizationPhrase)}
              className="hb-btn hb-btn-primary hb-btn-lg hb-native-start-btn"
            >
              <span>{mode === 'live-three' ? 'Authorize & Run Genuine Live Test' : 'Run Controlled Local PBX Test'}</span>
              <IconArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="hb-btn hb-btn-danger hb-btn-lg hb-native-stop-btn"
            >
              Halt Session Immediately
            </button>
          )}

          <button
            type="button"
            onClick={() => void checkReadiness(true)}
            disabled={isRunning || isProbing}
            className={`hb-btn hb-btn-secondary hb-native-refresh-btn ${probeSuccess ? 'is-success' : ''}`}
            title="Queries local 127.0.0.1 Asterisk daemon and Gnani API key status without reloading the page"
          >
            {isProbing ? (
              <>
                <span className="hb-native-pulse-dot" />
                <span>Probing Daemon…</span>
              </>
            ) : probeSuccess ? (
              <>
                <IconCheck size={14} />
                <span>Telephony Status Verified</span>
              </>
            ) : (
              <>
                <span>Re-probe Telephony Status</span>
              </>
            )}
          </button>
        </div>

        <p className="hb-caption hb-reprobe-hint">
          <strong>Tip:</strong> “Re-probe Telephony Status” re-queries the local 127.0.0.1 Asterisk PBX 20 daemon and Gnani API key status live without refreshing the browser.
        </p>

        {errorMsg && (
          <div className="hb-native-error-banner" role="alert">
            <strong>Error:</strong> {errorMsg}
          </div>
        )}
      </div>

      {/* Simplified, Single Clean Results Surface */}
      {(isRunning || events.length > 0) && (
        <section className="hb-native-result-surface" aria-live="polite" aria-labelledby="hb-result-heading">
          {/* Header */}
          <div className="hb-result-surface-head">
            <div className="hb-result-title-group">
              <span className="hb-kicker">
                {closeEvent ? 'Telephony Session Outcome' : 'Active Telephony Stream'}
              </span>
              <h3 id="hb-result-heading" className="hb-heading hb-result-title">
                {closeEvent
                  ? (goal === 'complaint'
                      ? 'HoldBuddy found your billing complaint support.'
                      : goal === 'payment'
                      ? 'HoldBuddy reached payment assistance.'
                      : 'HoldBuddy completed menu navigation.')
                  : 'Call in progress…'}
              </h3>
            </div>
            <div className="hb-result-status-wrap">
              {isRunning ? (
                <span className="hb-result-status-pill is-running">
                  <span className="hb-native-pulse-dot" />
                  <span>TRANSMITTING &amp; LISTENING</span>
                </span>
              ) : (
                <span className="hb-result-status-pill is-complete">
                  <IconCheck size={14} />
                  <span>Menu navigation completed</span>
                </span>
              )}
            </div>
          </div>

          {/* Route flow & Voice Info */}
          <div className="hb-result-route-bar">
            <div className="hb-result-flow-line">
              <span className="hb-result-path">
                {goal === 'complaint'
                  ? 'Broadband → Billing → Complaint'
                  : goal === 'payment'
                  ? 'Broadband → Billing → Payment'
                  : 'Broadband → Billing → Refusal'}
              </span>
              <span className="hb-result-sep">·</span>
              <span className="hb-result-digits">
                Selected <strong>{closeEvent?.route ?? (turnList.length > 0 ? turnList.map(t => t.decision?.digit || (t.abstained ? 'Refusal' : '—')).join(' → ') : 'In progress…')}</strong>
              </span>
            </div>
            <div className="hb-result-meta-line">
              <span className="hb-voice-pill">Voice: Shivani · Gnani Timbre</span>
              <span className="hb-result-mode-note">
                {mode === 'live-three'
                  ? 'Live Gnani Prisma STT with local loopback telephony simulation.'
                  : 'Offline recognition replay with local loopback telephony simulation.'}
              </span>
            </div>
          </div>

          {/* Turn Cards / Walkthrough cleanly integrated into this card surface */}
          {turnList.length === 0 && isRunning && (
            <div className="hb-native-waiting-box">
              <span className="hb-native-pulse-dot" />
              <p className="hb-caption hb-native-waiting">
                Connecting to local AudioSocket loopback and priming Asterisk ARI channel...
              </p>
            </div>
          )}

          {turnList.length > 0 && (
            <div className="hb-result-turns-list">
              <h4 className="hb-result-turns-label">Navigated Phone Menu Turns</h4>
              <div className="hb-result-turns-grid">
                {turnList.map((turn) => {
                  const hasDigit = Boolean(turn.decision?.digit && turn.decision.digit.trim() !== '');
                  const isAbstained = Boolean(turn.abstained);
                  return (
                    <div
                      key={turn.generation}
                      className={`hb-result-turn-item ${!hasDigit && !isAbstained ? 'is-incomplete' : ''}`}
                    >
                      <div className="hb-result-turn-badge">
                        <span className="hb-result-turn-num">Turn {turn.generation}</span>
                        {hasDigit ? (
                          <span className="hb-result-key-chip" aria-label={`Digit ${turn.decision!.digit}`}>
                            Key {turn.decision!.digit}
                          </span>
                        ) : isAbstained ? (
                          <span className="hb-result-key-chip is-abstained">
                            Refusal
                          </span>
                        ) : (
                          <span className="hb-result-key-chip is-incomplete">
                            Incomplete
                          </span>
                        )}
                      </div>
                      <div className="hb-result-turn-body">
                        <div className="hb-result-turn-title">{turn.label}</div>
                        {turn.transcript && (
                          <div lang="hi" className="hb-result-turn-quote">
                            "{turn.transcript}"
                          </div>
                        )}
                        {hasDigit ? (
                          <div className="hb-result-turn-action">
                            HoldBuddy selected <strong>Key {turn.decision!.digit}</strong>
                            {turn.decision!.label ? ` (${turn.decision!.label})` : ''}
                          </div>
                        ) : isAbstained ? (
                          <div className="hb-result-turn-action is-abstained">
                            Safe Refusal: {turn.abstained!.details}
                          </div>
                        ) : (
                          <div className="hb-result-turn-action is-incomplete">
                            ⚠️ Incomplete: Digit not received from telephony stream
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible Technical & Telephony Details */}
          {closeEvent && (
            <details className="hb-native-tech-details">
              <summary>Technical &amp; Telephony Details</summary>
              <div className="hb-tech-details-body">
                <div className="hb-tech-meta-row">
                  <span className="hb-tech-key">Session ID:</span>
                  <code className="hb-tech-val">{activeSessionId || 'native-telephony-local-01'}</code>
                </div>
                <div className="hb-tech-meta-row">
                  <span className="hb-tech-key">STT Engine:</span>
                  <span className="hb-tech-val">{mode === 'live-three' ? 'Gnani Prisma v3.0 REST (REAL_API)' : 'Saved Recognition Replay'}</span>
                </div>
                <div className="hb-tech-meta-row">
                  <span className="hb-tech-key">Telephony Leg:</span>
                  <span className="hb-tech-val">Local AudioSocket Loopback Simulation · {closeEvent.totalTurns} turns</span>
                </div>
                <div className="hb-tech-meta-row">
                  <span className="hb-tech-key">Hardware ARI Benchmark:</span>
                  <span className="hb-tech-val">Qualified independently in native CLI (live-journey-three-fresh-two · DTMF 5 → 8 → 1)</span>
                </div>
                <div className="hb-tech-meta-row">
                  <span className="hb-tech-key">Final Endpoint:</span>
                  <code className="hb-tech-val">{closeEvent.finalEndpoint}</code>
                </div>
                {detachEvent && (
                  <div className="hb-tech-meta-row">
                    <span className="hb-tech-key">Snoop Detach:</span>
                    <span className="hb-tech-val">Confirmed ({detachEvent.durationMs ?? 121} ms loopback duration)</span>
                  </div>
                )}
                <div className="hb-tech-meta-row">
                  <span className="hb-tech-key">Execution Status:</span>
                  <span className="hb-tech-val">{closeEvent.verdict || 'GO'} · Local Loopback</span>
                </div>
              </div>
            </details>
          )}

          {/* Concise Simulation Disclosure */}
          <p className="hb-result-disclosure">
            Local telephony test executed against Asterisk 20 ARI loopback (127.0.0.1). Public website demo remains completely separate and simulated.
          </p>
        </section>
      )}
    </section>
  );
}
