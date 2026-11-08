/** Adapters the runtime needs. None can return a menu, a correct digit or a hidden human flag. */
import type { SimulatedCallEndpoint, SimulatedDtmfPress } from "@holdbuddy/ivr-core";
import type { ClosureOutcome, HumanAssessment } from "./protocol.js";

export type CallStopReason = ClosureOutcome;

export const SIMULATOR_LIFECYCLE_VERSION = "holdbuddy.simulator.lifecycle.v1" as const;
export interface SimulatorPrecondition { instanceId: string; revision: number }
/** Administrative facts only. Never contains a scenario, transcript, menu or answer. */
export interface SimulatorSnapshot extends SimulatorPrecondition {
  protocolVersion: typeof SIMULATOR_LIFECYCLE_VERSION;
  activeSessionIds: readonly string[];
}
export interface SimulatorReconciliation extends SimulatorSnapshot { retiredSessionIds: readonly string[] }

/**
 * A fictional simulator. `receiveDtmf` comes from the core and returns only whether a digit arrived.
 * Starting a call returns nothing: the simulator's only way to speak is uploading audio.
 */
export interface SimulatorPort extends SimulatedCallEndpoint {
  startCall(call: { sessionId: string; scenarioId?: string; precondition?: SimulatorPrecondition }): Promise<void>;
  stopCall(call: { sessionId: string; reason: CallStopReason; instanceId?: string }): Promise<void>;
  receiveDtmf(press: SimulatedDtmfPress & { instanceId?: string }): Promise<"delivered" | "not_delivered">;
  snapshot?(): Promise<SimulatorSnapshot>;
  /** Retires exactly these IDs and fences older starts, conditional on one authoritative snapshot. */
  reconcileCalls?(request: { precondition: SimulatorPrecondition; sessionIds: readonly string[] }): Promise<SimulatorReconciliation>;
}

/** Optional outside judgement. It gets heard audio and engine evidence, never simulator state. */
export interface HandoffJudge {
  assess(input: { sessionId: string; requestId: string; evidence: string; audio: Uint8Array }): Promise<HumanAssessment>;
}

/** Fixed codes only. Never give this a transcript, a provider message or a token. */
export interface RuntimeLogger {
  log(entry: { code: string; sessionId?: string }): void;
}
