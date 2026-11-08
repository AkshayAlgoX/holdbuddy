/**
 * Local MOCK Preview Runner.
 *
 * Provides a synthetic event replay flow for frontend testing and evaluation
 * when the local Call Runtime server is not yet started.
 *
 * Strict Compliance:
 * - All speech/decision events carry dataSource: "MOCK"
 * - All lifecycle events carry dataSource: "NONE"
 * - NEVER claims or emits dataSource: "REAL_API"
 * - Session ID explicitly formatted as "mock-preview-..."
 * - Fully interactive: allows testing Clarification response and Human Decision confirmation/rejection.
 */
import type {
  DataSource,
  PublicSessionStatus,
  RuntimeEvent,
  RuntimeEventBody,
  SessionView,
} from "../types.js";

export class MockPreviewRunner {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSeq = 0;
  private sessionId = `mock-preview-${Math.random().toString(36).substring(2, 9)}`;
  private status: PublicSessionStatus = "listening";
  private goal: string;
  private scenarioId: string;
  private onEventCallback: (event: RuntimeEvent) => void;
  private onSessionUpdateCallback: (session: SessionView) => void;
  private pendingRequestId: string | null = null;
  private pendingKind: "clarification" | "human" | null = null;

  constructor(
    goal: string,
    scenarioId: string,
    onEvent: (event: RuntimeEvent) => void,
    onSessionUpdate: (session: SessionView) => void,
  ) {
    this.goal = goal || "I need help with my broadband bill.";
    this.scenarioId = scenarioId || "en-broadband-billing-seed-42";
    this.onEventCallback = onEvent;
    this.onSessionUpdateCallback = onSessionUpdate;
  }

  private nextSeq(): number {
    this.currentSeq += 1;
    return this.currentSeq;
  }

  private emit(eventBody: RuntimeEventBody & { dataSource: DataSource }): void {
    const seq = this.nextSeq();
    const event: RuntimeEvent = {
      ...eventBody,
      eventId: `${this.sessionId}:${seq}`,
      seq,
      sessionId: this.sessionId,
      at: new Date().toISOString(),
      atMs: seq * 1000,
    } as RuntimeEvent;

    this.onEventCallback(event);
    this.updateSessionView();
  }

  private updateSessionView(closed = false, outcome?: SessionView["closure"]): void {
    const view: SessionView = {
      protocolVersion: "holdbuddy.runtime.v1",
      sessionId: this.sessionId,
      status: this.status,
      closed,
      sttMode: "offline_mock",
      goal: this.goal,
      lastSeq: this.currentSeq,
      ...(this.pendingRequestId && this.pendingKind
        ? {
            pendingRequest: {
              requestId: this.pendingRequestId,
              kind: this.pendingKind,
              deadlineMs: Date.now() + 30000,
            },
          }
        : {}),
      ...(outcome ? { closure: outcome } : {}),
    };
    this.onSessionUpdateCallback(view);
  }

  start(): void {
    this.active = true;

    // 1. Session started
    this.emit({
      type: "session.started",
      sttMode: "offline_mock",
      protocolVersion: "holdbuddy.runtime.v1",
      dataSource: "NONE",
    });

    // Schedule timeline progression
    this.step1_introAudio();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.status = "ended";
    this.emit({
      type: "session.closed",
      outcome: "stopped",
      dataSource: "NONE",
    });
    this.updateSessionView(true, { outcome: "stopped" });
  }

  takeOver(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.status = "manual_takeover";
    this.emit({
      type: "session.status_changed",
      from: "listening",
      to: "manual_takeover",
      dataSource: "NONE",
    });
    this.emit({
      type: "session.closed",
      outcome: "manual_takeover",
      dataSource: "NONE",
    });
    this.updateSessionView(true, { outcome: "manual_takeover" });
  }

  answerClarification(requestId: string, _text: string): void {
    if (this.pendingRequestId !== requestId) return;
    this.pendingRequestId = null;
    this.pendingKind = null;
    this.emit({
      type: "clarification.answered",
      requestId,
      dataSource: "NONE",
    });
    // Resume to menu decision
    this.status = "listening";
    this.emit({
      type: "session.status_changed",
      from: "awaiting_clarification",
      to: "listening",
      dataSource: "NONE",
    });
    this.step3_menuDecision();
  }

  decideHuman(requestId: string, decision: "confirmed" | "rejected"): void {
    if (this.pendingRequestId !== requestId) return;
    this.pendingRequestId = null;
    this.pendingKind = null;

    if (decision === "confirmed") {
      this.active = false;
      this.status = "human_confirmed";
      this.emit({
        type: "handoff.confirmed",
        requestId,
        by: "user",
        dataSource: "NONE",
      });
      this.emit({
        type: "session.status_changed",
        from: "human_candidate",
        to: "human_confirmed",
        dataSource: "NONE",
      });
      this.emit({
        type: "session.closed",
        outcome: "handoff",
        dataSource: "NONE",
      });
      this.updateSessionView(true, { outcome: "handoff" });
    } else {
      this.status = "listening";
      this.emit({
        type: "handoff.rejected",
        requestId,
        by: "user",
        dataSource: "NONE",
      });
      this.emit({
        type: "session.status_changed",
        from: "human_candidate",
        to: "listening",
        dataSource: "NONE",
      });
      // Continue simulation
      this.step6_wrapUp();
    }
  }

  private step1_introAudio(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;
      this.emit({
        type: "audio.segment_received",
        segmentId: "seg_intro_01",
        promptId: "prompt_intro",
        fragmentIndex: 0,
        bytes: 64044,
        dataSource: "NONE",
      });
      this.emit({
        type: "audio.segment_accepted",
        segmentId: "seg_intro_01",
        promptId: "prompt_intro",
        durationMs: 2000,
        promptComplete: true,
        dataSource: "NONE",
      });
      this.emit({
        type: "stt.started",
        segmentId: "seg_intro_01",
        providerId: "mock_offline_stt",
        dataSource: "NONE",
      });
      this.emit({
        type: "transcript.observed",
        segmentId: "seg_intro_01",
        promptId: "prompt_intro",
        observationId: 1,
        status: "transcribed",
        transcript: "Welcome to HoldBuddy Broadband customer support. Please listen carefully as our menu options have changed.",
        promptComplete: true,
        provenance: "offline_fixture",
        dataSource: "MOCK",
      });
      this.emit({
        type: "decision.made",
        observationId: 1,
        decision: { kind: "listen", reason: "no_menu_detected" },
        provenance: "offline_fixture",
        dataSource: "MOCK",
      });

      this.step2_menuAudio();
    }, 1000);
  }

  private step2_menuAudio(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;
      this.emit({
        type: "audio.segment_received",
        segmentId: "seg_menu_02",
        promptId: "prompt_menu",
        fragmentIndex: 0,
        bytes: 128044,
        dataSource: "NONE",
      });
      this.emit({
        type: "audio.segment_accepted",
        segmentId: "seg_menu_02",
        promptId: "prompt_menu",
        durationMs: 4000,
        promptComplete: true,
        dataSource: "NONE",
      });
      this.emit({
        type: "stt.started",
        segmentId: "seg_menu_02",
        providerId: "mock_offline_stt",
        dataSource: "NONE",
      });
      this.emit({
        type: "transcript.observed",
        segmentId: "seg_menu_02",
        promptId: "prompt_menu",
        observationId: 2,
        status: "transcribed",
        transcript: "For billing and payment inquiries, press 1. For technical support and outages, press 2. For new connections, press 3.",
        promptComplete: true,
        provenance: "offline_fixture",
        dataSource: "MOCK",
      });

      this.step3_menuDecision();
    }, 2000);
  }

  private step3_menuDecision(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;

      this.emit({
        type: "decision.made",
        observationId: 2,
        decision: {
          kind: "press",
          digit: "1",
          label: "billing and payment inquiries",
          score: 1.0,
          basis: "concept_and_literal",
          alternatives: 2,
        },
        provenance: "offline_fixture",
        dataSource: "MOCK",
      });

      this.status = "awaiting_dtmf_ack";
      this.emit({
        type: "session.status_changed",
        from: "listening",
        to: "awaiting_dtmf_ack",
        dataSource: "NONE",
      });

      this.emit({
        type: "dtmf.requested",
        actionId: "dtmf-1",
        digit: "1",
        ackDeadlineMs: Date.now() + 10000,
        provenance: "offline_fixture",
        dataSource: "MOCK",
      });

      this.step4_dtmfAck();
    }, 1500);
  }

  private step4_dtmfAck(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;

      this.emit({
        type: "dtmf.acknowledged",
        actionId: "dtmf-1",
        digit: "1",
        outcome: "delivered",
        dataSource: "MOCK",
      });

      this.status = "on_hold";
      this.emit({
        type: "session.status_changed",
        from: "awaiting_dtmf_ack",
        to: "on_hold",
        dataSource: "NONE",
      });

      this.emit({
        type: "hold.started",
        dataSource: "MOCK",
      });

      this.step5_humanCandidate();
    }, 1500);
  }

  private step5_humanCandidate(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;

      this.emit({
        type: "audio.segment_received",
        segmentId: "seg_agent_03",
        promptId: "prompt_agent",
        fragmentIndex: 0,
        bytes: 88044,
        dataSource: "NONE",
      });
      this.emit({
        type: "audio.segment_accepted",
        segmentId: "seg_agent_03",
        promptId: "prompt_agent",
        durationMs: 2800,
        promptComplete: true,
        dataSource: "NONE",
      });
      this.emit({
        type: "stt.started",
        segmentId: "seg_agent_03",
        providerId: "mock_offline_stt",
        dataSource: "NONE",
      });
      this.emit({
        type: "transcript.observed",
        segmentId: "seg_agent_03",
        promptId: "prompt_agent",
        observationId: 3,
        status: "transcribed",
        transcript: "Hello, thank you for waiting. My name is Priya from customer billing. How can I help you today?",
        promptComplete: true,
        provenance: "offline_fixture",
        dataSource: "MOCK",
      });

      this.status = "human_candidate";
      this.emit({
        type: "session.status_changed",
        from: "on_hold",
        to: "human_candidate",
        dataSource: "NONE",
      });

      const requestId = "human-1";
      this.pendingRequestId = requestId;
      this.pendingKind = "human";

      this.emit({
        type: "handoff.possible_human",
        requestId,
        evidence: "Hello, thank you for waiting. My name is Priya from customer billing.",
        confirmDeadlineMs: Date.now() + 30000,
        dataSource: "MOCK",
      });

      this.emit({
        type: "handoff.assessed",
        requestId,
        assessment: "human",
        by: "judge",
        dataSource: "NONE",
      });
    }, 3000);
  }

  private step6_wrapUp(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;
      this.active = false;
      this.status = "ended";
      this.emit({
        type: "session.closed",
        outcome: "stopped",
        dataSource: "NONE",
      });
      this.updateSessionView(true, { outcome: "stopped" });
    }, 2000);
  }
}
