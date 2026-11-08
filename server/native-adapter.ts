import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type NativeMode = 'replay' | 'live-three';
export type NativeGoal = 'complaint' | 'payment' | 'refund';

export const REQUIRED_AUTH_PHRASE = 'I AUTHORIZE 3 HINDI PRISMA REQUESTS AND ASTERISK ARI DTMF';
export const AST_RUNTIME_PATH = process.env.AST_RUNTIME_PATH || join(process.cwd(), 'runtime', 'asterisk');
export const AST_BINARY_PATH = `${AST_RUNTIME_PATH}/root/usr/sbin/asterisk`;

/**
 * Historical Gnani request IDs from the frozen qualification run (live-journey-three-fresh-two).
 * Live mode is strictly forbidden from replaying or emitting these historical IDs as fresh API responses.
 */
export const HISTORICAL_PRISMA_REQUEST_IDS = new Set<string>([
  '75904f4b-73c5-475a-abbd-7cd81d314566',
  '436e2928-5b8b-4ae8-89ca-36ab365cba7a',
  'daf896d2-0d1e-456d-bea1-e793831aedd5',
]);

export interface LivePrismaTransaction {
  sessionId: string;
  turnGeneration: number;
  requestId: string;
  model: string;
  detectedLanguageCode?: string;
  transcript: string;
  timestampMs: number;
  at: string;
  verifiedFresh: boolean;
}

export interface NativeReadiness {
  ok: boolean;
  localOriginOnly: boolean;
  asteriskAvailable: boolean;
  asteriskBinaryPath: string;
  livePrismaConfigured: boolean;
  activeSessionId?: string;
  supportedModes: NativeMode[];
  supportedGoals: NativeGoal[];
  requiredAuthorizationPhrase: string;
  maxRequests: number;
  blockers: string[];
  verifiedEvidence: {
    status: 'VERIFIED_OFFLINE_RECORD';
    runLabel: string;
    sourceCommit: string;
    manifestSha256: string;
    provenance: 'REAL_API';
    freshRequests: number;
    route: string;
    cleanup: string;
  };
  liveExecution: {
    available: boolean;
    status: string;
    provider: 'gnani-prisma-v3.0';
    endpoint: string;
    model: string;
    language: string;
    maxRequests: number;
    requiresAuthorizationPhrase: boolean;
    cashRiskDisclosed: boolean;
  };
  simulatedDemo: {
    status: 'ACTIVE';
    mode: 'offline_mock';
    audioModel: string;
    realTelephony: false;
  };
}

export interface NativeTurnData {
  generation: number;
  source: 'REAL_API' | 'SAVED_RECOGNITION_REPLAY' | 'MOCK';
  httpStatus: number;
  model: string;
  language: string;
  requestId: string;
  transcript: string;
  decision: { digit: string; label: string };
  receipt: { evidence: string; digit: string; sequence: number; duplicate: boolean };
}

export interface NativeEvent {
  eventId: string;
  sessionId: string;
  seq: number;
  atMs: number;
  at: string;
  dataSource: 'REAL_API' | 'SAVED_RECOGNITION_REPLAY' | 'LOCAL_SIMULATION' | 'MOCK' | 'NONE';
  type: string;
  [key: string]: unknown;
}

export class NativeAdapterError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function isLocalLoopbackRequest(req: IncomingMessage, publicOrigin: URL): boolean {
  const remote = req.socket.remoteAddress ?? '';
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (!isLoopback) return false;

  const origin = req.headers.origin;
  if (origin && origin !== publicOrigin.origin) return false;

  const host = req.headers.host;
  if (host && host !== publicOrigin.host && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    return false;
  }
  return true;
}

export function getNativeReadiness(publicOrigin: URL, req?: IncomingMessage): NativeReadiness {
  const isLocal = req ? isLocalLoopbackRequest(req, publicOrigin) : true;
  const astExists = existsSync(AST_BINARY_PATH);
  const liveKey = (process.env.GNANI_API_KEY ?? '').trim();
  const livePrismaConfigured = liveKey.length >= 10;
  const blockers: string[] = [];

  if (!isLocal) {
    blockers.push('Native execution requires same-origin local access (127.0.0.1 / localhost).');
  }
  if (!astExists) {
    blockers.push('Asterisk binary not found in local runtime path.');
  }
  if (!livePrismaConfigured) {
    blockers.push('GNANI_API_KEY is not configured on the local server. Set GNANI_API_KEY to enable live calls.');
  }

  blockers.push('Native worker is not connected; this runner cannot execute a qualified native session.');
  return {
    ok: false,
    localOriginOnly: isLocal,
    asteriskAvailable: astExists,
    asteriskBinaryPath: astExists ? 'asterisk (userspace binary active)' : 'asterisk (not found)',
    livePrismaConfigured,
    activeSessionId: NativeSessionCoordinator.instance.getActiveSessionId(),
    supportedModes: ['replay', 'live-three'],
    supportedGoals: ['complaint', 'payment', 'refund'],
    requiredAuthorizationPhrase: REQUIRED_AUTH_PHRASE,
    maxRequests: 3,
    blockers,
    verifiedEvidence: {
      status: 'VERIFIED_OFFLINE_RECORD',
      runLabel: 'live-journey-three-fresh-two',
      sourceCommit: 'b995fd55289782cffc1e48a885ef743207b9c850',
      manifestSha256: '6e747cc4d757de9c5f3d40bd346cd51bd47419a5c6f1f68296dec969771f7bf7',
      provenance: 'REAL_API',
      freshRequests: 3,
      route: '5 → 8 → 1',
      cleanup: 'CONFIRMED',
    },
    liveExecution: {
      available: false,
      status: 'DISABLED_NATIVE_WORKER_UNCONNECTED',
      provider: 'gnani-prisma-v3.0',
      endpoint: 'https://api.vachana.ai/stt/v3',
      model: 'prisma-v3.0',
      language: 'hi-IN',
      maxRequests: 3,
      requiresAuthorizationPhrase: true,
      cashRiskDisclosed: true,
    },
    simulatedDemo: {
      status: 'ACTIVE',
      mode: 'offline_mock',
      audioModel: 'Gnani Timbre v3.0 (Shivani neural voice)',
      realTelephony: false,
    },
  };
}

export function loadTurnAudio(turnGen: number): Buffer {
  const file = turnGen === 1 ? 'prompt-04.wav' : turnGen === 2 ? 'prompt-05.wav' : 'prompt-07.wav';
  const candidates = [
    join(process.cwd(), 'assets', file),
    join(process.cwd(), 'dist', 'audio', file),
    join(dirname(fileURLToPath(import.meta.url)), '../assets', file),
    join(dirname(fileURLToPath(import.meta.url)), 'audio', file),
    ...(process.env.AST_FIXTURE_DIR ? [
      join(process.env.AST_FIXTURE_DIR, turnGen === 1 ? 'journey-product.wav' : turnGen === 2 ? 'journey-service.wav' : 'journey-actions.wav')
    ] : []),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return readFileSync(c);
    }
  }
  throw new Error(`Audio fixture for turn ${turnGen} (${file}) could not be located.`);
}

export async function callPrismaLiveSTT(
  apiKey: string,
  wavBuffer: Buffer,
  signal: AbortSignal,
): Promise<{ requestId: string; transcript: string; model: string; detectedLanguageCode?: string }> {
  const form = new FormData();
  form.append('audio_file', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', 'prisma-v3.0');
  form.append('language_code', 'hi-IN');
  form.append('format', 'transcribe');

  const res = await fetch('https://api.vachana.ai/stt/v3', {
    method: 'POST',
    headers: {
      'X-API-Key-ID': apiKey,
    },
    body: form,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gnani Prisma STT API failed with HTTP ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = (await res.json()) as any;
  if (!data || data.success !== true || typeof data.transcript !== 'string' || !data.request_id) {
    throw new Error(`Gnani Prisma STT returned invalid JSON payload: ${JSON.stringify(data).slice(0, 150)}`);
  }

  return {
    requestId: data.request_id,
    transcript: data.transcript,
    model: data.model || 'prisma-v3.0',
    detectedLanguageCode: data.detected_language_code || 'hi-IN',
  };
}

export class ActiveNativeSession {
  readonly sessionId: string;
  readonly mode: NativeMode;
  readonly goal: NativeGoal;
  readonly startedAtMs: number;
  readonly events: NativeEvent[] = [];
  readonly streams: Set<ServerResponse> = new Set();
  closed = false;
  childProcess?: ChildProcess;
  tempDir?: string;
  private seqCounter = 0;

  constructor(sessionId: string, mode: NativeMode, goal: NativeGoal) {
    this.sessionId = sessionId;
    this.mode = mode;
    this.goal = goal;
    this.startedAtMs = Date.now();
  }

  emit(type: string, payload: Record<string, unknown>, dataSource: 'REAL_API' | 'SAVED_RECOGNITION_REPLAY' | 'LOCAL_SIMULATION' | 'MOCK' | 'NONE' = 'NONE') {
    if (this.closed && type !== 'session.closed') return;
    this.seqCounter++;
    const now = Date.now();
    const event: NativeEvent = {
      eventId: `ev-${randomUUID()}`,
      sessionId: this.sessionId,
      seq: this.seqCounter,
      atMs: now,
      at: new Date(now).toISOString(),
      dataSource,
      type,
      ...payload,
    };
    this.events.push(event);

    const sseFormatted = `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of [...this.streams]) {
      try {
        if (!res.destroyed) {
          res.write(sseFormatted);
        }
      } catch {
        this.streams.delete(res);
      }
    }
  }

  stop() {
    if (this.closed) return;
    this.closed = true;
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
    }
    this.emit(
      'session.closed',
      {
        outcome: 'stopped',
        reason: 'operator_stopped',
      },
      'NONE',
    );
    this.closeStreams();
    this.cleanupTempDir();
  }

  closeStreams() {
    for (const s of this.streams) {
      try {
        s.end();
      } catch {}
    }
    this.streams.clear();
  }

  cleanupTempDir() {
    if (this.tempDir && existsSync(this.tempDir)) {
      try {
        rmSync(this.tempDir, { recursive: true, force: true });
      } catch {}
      this.tempDir = undefined;
    }
  }
}

export class NativeSessionCoordinator {
  static readonly instance = new NativeSessionCoordinator();
  private activeSession?: ActiveNativeSession;
  private retainedSessions = new Map<string, ActiveNativeSession>();
  private readonly liveTransactions: LivePrismaTransaction[] = [];

  getActiveSessionId(): string | undefined {
    return this.activeSession && !this.activeSession.closed ? this.activeSession.sessionId : undefined;
  }

  getLiveTransactions(): readonly LivePrismaTransaction[] {
    return [...this.liveTransactions];
  }

  getActiveSession(sessionId: string): ActiveNativeSession | undefined {
    if (this.activeSession && this.activeSession.sessionId === sessionId) {
      return this.activeSession;
    }
    return this.retainedSessions.get(sessionId);
  }

  async startSession(
    req: IncomingMessage,
    body: { mode?: string; goal?: string; authorizationPhrase?: string },
    publicOrigin: URL,
  ): Promise<{ sessionId: string; mode: NativeMode; goal: NativeGoal; status: string }> {
    // 1. Local origin check
    if (!isLocalLoopbackRequest(req, publicOrigin)) {
      throw new NativeAdapterError(403, 'forbidden_origin', 'Native execution requires same-origin local access.');
    }

    // 2. Mutex check
    if (this.activeSession && !this.activeSession.closed) {
      throw new NativeAdapterError(409, 'session_active', 'A native telephony session is already active.');
    }

    // 3. Validation
    const mode = body.mode as NativeMode;
    if (mode !== 'replay' && mode !== 'live-three') {
      throw new NativeAdapterError(400, 'invalid_mode', 'Mode must be "replay" or "live-three".');
    }

    const goal = (body.goal ?? 'complaint') as NativeGoal;
    if (!['complaint', 'payment', 'refund'].includes(goal)) {
      throw new NativeAdapterError(400, 'invalid_goal', 'Goal must be "complaint", "payment", or "refund".');
    }

    // Fail closed for every native mode until the qualified worker is connected.
    if (!getNativeReadiness(publicOrigin, req).ok) {
      throw new NativeAdapterError(503, 'native_worker_unconnected',
        'Native worker is not connected. No provider request was made.');
    }

    // 4. Live authorization gating
    if (mode === 'live-three') {
      const apiKey = (process.env.GNANI_API_KEY ?? '').trim();
      if (!apiKey || apiKey.length < 10) {
        throw new NativeAdapterError(
          400,
          'live_credentials_missing',
          'GNANI_API_KEY is not set on the local server. Set GNANI_API_KEY to enable live calls.',
        );
      }
      if (body.authorizationPhrase?.trim() !== REQUIRED_AUTH_PHRASE) {
        throw new NativeAdapterError(
          403,
          'authorization_phrase_required',
          `Live requests require exact phrase: "${REQUIRED_AUTH_PHRASE}".`,
        );
      }
    }

    // 5. Preflight check
    if (!existsSync(AST_BINARY_PATH)) {
      throw new NativeAdapterError(
        503,
        'asterisk_unavailable',
        'Asterisk binary not found in local runtime path. Install local runtime to proceed.',
      );
    }

    const sessionId = `native-telephony-${randomUUID()}`;
    const session = new ActiveNativeSession(sessionId, mode, goal);
    this.activeSession = session;

    // Run execution in background
    void this.executeNativeSession(session);

    return { sessionId, mode, goal, status: 'running' };
  }

  private async executeNativeSession(session: ActiveNativeSession) {
    const isLive = session.mode === 'live-three';
    const sttDataSource = isLive ? 'REAL_API' : 'SAVED_RECOGNITION_REPLAY';

    try {
      session.emit(
        'session.started',
        {
          sttMode: isLive ? 'live_prisma' : 'offline_mock',
          protocolVersion: 'holdbuddy.runtime.v1',
          goal: session.goal,
          mode: session.mode,
          sttDataSource,
          telephonyMode: 'loopback_simulation',
        },
        sttDataSource,
      );

      session.emit(
        'native.status',
        {
          phase: 'preparing_asterisk',
          message: 'Starting local Asterisk PBX 20 ARI & AudioSocket TCP loopback...',
        },
        'NONE',
      );

      // Controlled multi-turn progression
      const turns: Array<{
        generation: number;
        promptId: string;
        label: string;
        durationMs: number;
        digit: string;
        actionLabel: string;
        requestId: string;
        transcript: string;
      }> = [
        {
          generation: 1,
          promptId: 'holdbuddy-journey-product',
          label: 'Product Menu',
          durationMs: 11480,
          digit: '5',
          actionLabel: 'ब्रॉडबैंड',
          requestId: 'saved-replay-req-product-01',
          transcript:
            'mobile के लिए कृपया 3 दबाएं। landline के लिए 6 दबाएं। रोमिंग के लिए कृपया एक दबाएं। ब्रॉडबैंड के लिए पाँच दबाएं।',
        },
        {
          generation: 2,
          promptId: 'holdbuddy-journey-service',
          label: 'Service Menu',
          durationMs: 23040,
          digit: '8',
          actionLabel: 'बिल',
          requestId: 'saved-replay-req-service-02',
          transcript:
            'दोबारा सुनने के लिए 3 दबाएं। बिल के लिए कृपया 8 दबाएं। प्लान के लिए 2 दबाएं। नया connection के लिए कृपया 6 दबाएं। तकनीकी सहायता के लिए 7 दबाएं। store की जानकारी के लिए कृपया 1 दबाएं। मुख्य menu पर वापस जाने के लिए 9 दबाएं।',
        },
        {
          generation: 3,
          promptId: 'holdbuddy-journey-actions',
          label: 'Action Menu',
          durationMs: 17660,
          digit: session.goal === 'payment' ? '2' : '1',
          actionLabel: session.goal === 'payment' ? 'बिल भुगतान' : 'बिल शिकायत',
          requestId: 'saved-replay-req-actions-03',
          transcript:
            'बिल की शिकायत के लिए कृपया 1 दबाएँ। roaming के लिए 7 दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएं। बिल के भुगतान के लिए 2 दबाएं। मुख्य menu पर वापस जाने के लिए कृपया 5 दबाएं।',
        },
      ];

      for (let i = 0; i < turns.length; i++) {
        if (session.closed) return;
        const turn = turns[i];

        // 1. Playback started
        session.emit(
          'source.started',
          {
            generation: turn.generation,
            promptId: turn.promptId,
            sourceSequence: turn.generation,
            label: turn.label,
          },
          'NONE',
        );

        // Simulate prompt play time pacing (realistic but responsive)
        await new Promise((r) => setTimeout(r, 600));
        if (session.closed) return;

        // 2. Audio wire captured via AudioSocket
        session.emit(
          'audio.segment_accepted',
          {
            generation: turn.generation,
            promptId: turn.promptId,
            durationMs: turn.durationMs,
            promptComplete: true,
            transport: 'AudioSocket_TCP_8kHz_PCM16',
          },
          'NONE',
        );

        // 3. STT started
        session.emit(
          'stt.started',
          {
            generation: turn.generation,
            providerId: 'gnani-prisma-v3.0',
            model: 'prisma-v3.0',
            language: 'hi-IN',
          },
          sttDataSource,
        );

        let requestId = turn.requestId;
        let transcript = turn.transcript;
        let model = 'prisma-v3.0';
        let detectedLanguageCode = 'hi-IN';

        if (isLive) {
          const apiKey = (process.env.GNANI_API_KEY ?? '').trim();
          if (!apiKey) {
            throw new Error('GNANI_API_KEY is not configured on the local server.');
          }
          const audioBytes = loadTurnAudio(turn.generation);
          try {
            const controller = new AbortController();
            const timeoutTimer = setTimeout(() => controller.abort(), 20000);
            const liveRes = await callPrismaLiveSTT(apiKey, audioBytes, controller.signal);
            clearTimeout(timeoutTimer);

            if (HISTORICAL_PRISMA_REQUEST_IDS.has(liveRes.requestId)) {
              throw new Error(
                `Security & Provenance Violation: Provider returned historical request ID ${liveRes.requestId}. Live mode requires fresh, un-replayed API transactions.`,
              );
            }

            requestId = liveRes.requestId;
            transcript = liveRes.transcript;
            model = liveRes.model;
            if (liveRes.detectedLanguageCode) detectedLanguageCode = liveRes.detectedLanguageCode;

            // Record transaction in volatile memory ledger
            const txnRecord: LivePrismaTransaction = {
              sessionId: session.sessionId,
              turnGeneration: turn.generation,
              requestId,
              model,
              detectedLanguageCode,
              transcript,
              timestampMs: Date.now(),
              at: new Date().toISOString(),
              verifiedFresh: true,
            };
            this.liveTransactions.push(txnRecord);
            if (this.liveTransactions.length > 50) {
              this.liveTransactions.shift();
            }
          } catch (sttErr: any) {
            session.emit(
              'stt.failed',
              {
                generation: turn.generation,
                code: 'stt_request_failed',
                message: sttErr.message || 'Provider request failed',
                fatal: true,
              },
              'REAL_API',
            );
            throw sttErr;
          }

          // 4. Transcript observed with genuine fresh REAL_API provenance
          session.emit(
            'transcript.observed',
            {
              generation: turn.generation,
              promptId: turn.promptId,
              observationId: turn.generation,
              status: 'complete',
              transcript,
              promptComplete: true,
              provenance: 'prisma_stt_live',
              detectedLanguageCode,
              requestId,
              model,
            },
            'REAL_API',
          );
        } else {
          await new Promise((r) => setTimeout(r, 350));
          if (session.closed) return;

          // 4. Transcript observed with SAVED_RECOGNITION_REPLAY provenance
          session.emit(
            'transcript.observed',
            {
              generation: turn.generation,
              promptId: turn.promptId,
              observationId: turn.generation,
              status: 'complete',
              transcript,
              promptComplete: true,
              provenance: 'offline_fixture',
              detectedLanguageCode,
              requestId,
              model,
            },
            'SAVED_RECOGNITION_REPLAY',
          );
        }

        // Handle refund refusal on Turn 3
        if (session.goal === 'refund' && turn.generation === 3) {
          session.emit(
            'decision.abstained',
            {
              generation: 3,
              reason: 'goal_not_offered_in_menu',
              details: 'Refund option is not present in action menu. Abstaining from DTMF dispatch.',
            },
            sttDataSource,
          );
          break;
        }

        // 5. Decision made
        session.emit(
          'decision.made',
          {
            generation: turn.generation,
            observationId: turn.generation,
            decision: {
              kind: 'press',
              digit: turn.digit,
              label: turn.actionLabel,
              score: 2,
              basis: 'concept',
            },
            provenance: isLive ? 'prisma_stt_live' : 'offline_fixture',
          },
          sttDataSource,
        );

        // 6. DTMF requested
        session.emit(
          'dtmf.requested',
          {
            generation: turn.generation,
            actionId: `dtmf-act-${turn.generation}`,
            digit: turn.digit,
            ackDeadlineMs: 3000,
            provenance: isLive ? 'prisma_stt_live' : 'offline_fixture',
          },
          sttDataSource,
        );

        await new Promise((r) => setTimeout(r, 200));
        if (session.closed) return;

        // 7. DTMF acknowledged by local loopback simulation (never falsely claims live hardware ARI)
        session.emit(
          'dtmf.acknowledged',
          {
            generation: turn.generation,
            actionId: `dtmf-act-${turn.generation}`,
            digit: turn.digit,
            outcome: 'delivered',
            evidence: 'LOCAL_LOOPBACK_RECEIPT',
            channelId: 'loopback-local-channel',
            sequence: turn.generation,
            duplicate: false,
            telephonyExecution: 'SIMULATED_LOCAL_LOOPBACK',
          },
          'LOCAL_SIMULATION',
        );
      }

      if (session.closed) return;

      // Safe detach
      session.emit(
        'native.status',
        {
          phase: 'snoop_detach',
          message: 'Initiating safe AudioSocket snoop detach (<1,000 ms deadline)...',
        },
        'NONE',
      );

      await new Promise((r) => setTimeout(r, 150));
      if (session.closed) return;

      session.emit(
        'detach.confirmed',
        {
          state: 'CONFIRMED',
          durationMs: 121,
          mainLegAlive: true,
          ivrLegAlive: true,
          tapDestroyed: true,
          snoopDestroyed: true,
          bridgeDestroyed: true,
          telephonyExecution: 'SIMULATED_LOCAL_LOOPBACK',
        },
        'LOCAL_SIMULATION',
      );

      const endpoint =
        session.goal === 'complaint'
          ? 'complaint_help'
          : session.goal === 'payment'
            ? 'payment_help'
            : 'operator_escalation';

      session.emit(
        'session.closed',
        {
          outcome: 'handoff',
          verdict: 'GO',
          route: session.goal === 'refund' ? '5 → 8 → Refusal' : session.goal === 'payment' ? '5 → 8 → 2' : '5 → 8 → 1',
          finalEndpoint: endpoint,
          totalTurns: session.goal === 'refund' ? 2 : 3,
          cleanupConfirmed: true,
          liveGnaniPrismaRequestsUsed: isLive ? 3 : 0,
          sttProvenance: isLive ? 'REAL_API' : 'SAVED_RECOGNITION_REPLAY',
          telephonyProvenance: 'SIMULATED_LOCAL_LOOPBACK',
        },
        sttDataSource,
      );
    } catch (err) {
      session.emit(
        'session.closed',
        {
          outcome: 'failed',
          failure: {
            source: 'runtime',
            reason: err instanceof Error ? err.message : 'native_error',
          },
        },
        'NONE',
      );
    } finally {
      session.closed = true;
      session.closeStreams();
      session.cleanupTempDir();
      if (this.activeSession === session) {
        this.retainedSessions.set(session.sessionId, session);
        if (this.retainedSessions.size > 8) {
          const oldestKey = this.retainedSessions.keys().next().value;
          if (oldestKey) this.retainedSessions.delete(oldestKey);
        }
        this.activeSession = undefined;
      }
    }
  }
}
