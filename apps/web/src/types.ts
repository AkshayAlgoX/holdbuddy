/**
 * Web frontend types and protocol re-exports.
 */
import type {
  ClarificationRequest,
  ClosureOutcome,
  CreateSessionRequest,
  DataSource,
  DtmfDigit,
  EventEnvelope,
  HttpErrorBody,
  HttpErrorCode,
  HumanDecisionRequest,
  MenuDecision,
  MenuOption,
  ObservationProvenance,
  ProtocolVersion,
  PublicSessionStatus,
  RequestBudget,
  RuntimeEvent,
  RuntimeEventBody,
  RuntimeEventType,
  RuntimeFailureReason,
  SessionClosure,
  SessionView,
  SttMode,
} from "@holdbuddy/call-runtime/protocol";

export { PROTOCOL_VERSION, dataSourceOf } from "@holdbuddy/call-runtime/protocol";

export type {
  ClarificationRequest,
  ClosureOutcome,
  CreateSessionRequest,
  DataSource,
  DtmfDigit,
  EventEnvelope,
  HttpErrorBody,
  HttpErrorCode,
  HumanDecisionRequest,
  MenuDecision,
  MenuOption,
  ObservationProvenance,
  ProtocolVersion,
  PublicSessionStatus,
  RequestBudget,
  RuntimeEvent,
  RuntimeEventBody,
  RuntimeEventType,
  RuntimeFailureReason,
  SessionClosure,
  SessionView,
  SttMode,
};

export interface ConnectionConfig {
  baseUrl: string;
  userToken: string;
}

export interface HealthResponse {
  recognitionEvidence?: Readonly<import("./api/backend-contracts.js").PublicRecognitionEvidence> | null;
  ok: boolean;
  protocolVersion: ProtocolVersion;
  sttMode: SttMode;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error" | "reconnecting";

export interface ScenarioPreset {
  id: string;
  title: string;
  description: string;
  language: "en" | "hi" | "hinglish" | "kn" | "kn-en";
  sampleGoal: string;
  category: "standard" | "adversarial";
}

export type TimelineFilter = "all" | "speech" | "decisions" | "dtmf" | "system";

export interface FrontendSessionState {
  currentSession: SessionView | null;
  events: RuntimeEvent[];
  connectionState: ConnectionState;
  reconnectAttempts: number;
  lastEventId: number;
  isMockPreview: boolean;
  error: { code: string; message: string } | null;
}
