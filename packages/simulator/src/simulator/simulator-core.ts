/**
 * Core fictional simulator implementing SimulatorPort from @holdbuddy/call-runtime/ports.
 *
 * BLINDNESS INVARIANT:
 * Call operations and administrative lifecycle identity only. The runtime binds a four-method call port for the core.
 * No properties exposing menu definitions, scripts, answer keys, or human state.
 */
import type { SimulatedDtmfPress } from "@holdbuddy/ivr-core";
import { randomUUID } from "node:crypto";
import { SIMULATOR_LIFECYCLE_VERSION, type CallStopReason, type SimulatorPort, type SimulatorPrecondition, type SimulatorSnapshot, type SimulatorReconciliation } from "@holdbuddy/call-runtime";
import type { AudioSegmentSink } from "../audio/audio-client.js";
import { FixtureCatalog } from "../audio/fixture-loader.js";
import { getScenario } from "../scenarios/catalog.js";
import type { ScenarioDefinition } from "../scenarios/types.js";
import { SimulatorSession } from "./session.js";

export interface SimulatorEngineOptions {
  sink: AudioSegmentSink;
  fixtures?: FixtureCatalog;
  defaultScenarioId?: string;
  mode?: "offline_mock" | "live_api";
  /** How long a hold lasts after its message before the next step. Each session's default is ANNOUNCEMENT_GAP_MS. */
  holdMs?: number;
}

export class SimulatorSessionConflictError extends Error {}

export class SimulatorEngine implements SimulatorPort {
  readonly kind = "fictional_simulator" as const;
  readonly mode: "offline_mock" | "live_api";
  readonly #sink: AudioSegmentSink;
  readonly #fixtures: FixtureCatalog;
  readonly #holdMs: number | undefined;
  readonly #defaultScenarioId: string;
  readonly #sessions = new Map<string, SimulatorSession>();
  /** Stops also retire unknown IDs, fencing a start delayed on another HTTP connection. */
  readonly #retiredSessionIds = new Set<string>();
  #shuttingDown = false;
  readonly #instanceId = randomUUID();
  #revision = 0;
  #reconciling = false;

  constructor(options: SimulatorEngineOptions) {
    this.mode = options.mode ?? "offline_mock";
    this.#sink = options.sink;
    this.#fixtures = options.fixtures ?? new FixtureCatalog();
    this.#holdMs = options.holdMs;
    this.#defaultScenarioId = options.defaultScenarioId ?? "en-broadband-billing-seed-42";
  }

  get activeSessionCount(): number {
    return this.#sessions.size;
  }

  async snapshot(): Promise<SimulatorSnapshot> {
    return { protocolVersion: SIMULATOR_LIFECYCLE_VERSION, instanceId: this.#instanceId, revision: this.#revision, activeSessionIds: [...this.#sessions.keys()] };
  }

  #requireInstance(instanceId: string): void {
    if (instanceId !== this.#instanceId) throw new SimulatorSessionConflictError("The simulator instance changed.");
  }

  #requireSnapshot(precondition: SimulatorPrecondition): void {
    this.#requireInstance(precondition.instanceId);
    if (precondition.revision !== this.#revision || this.#reconciling || this.#shuttingDown) throw new SimulatorSessionConflictError("The simulator lifecycle state changed.");
  }

  async reconcileCalls(request: { precondition: SimulatorPrecondition; sessionIds: readonly string[] }): Promise<SimulatorReconciliation> {
    this.#requireSnapshot(request.precondition);
    this.#reconciling = true;
    // Even an empty reconciliation fences starts that were sent before this snapshot was checked.
    this.#revision += 1;
    const retiredSessionIds = [...new Set(request.sessionIds)];
    for (const id of retiredSessionIds) this.#retiredSessionIds.add(id);
    try {
      for (const sessionId of retiredSessionIds) await this.stopCall({ sessionId, reason: "stopped", instanceId: this.#instanceId });
      return { ...await this.snapshot(), retiredSessionIds };
    } finally { this.#reconciling = false; }
  }

  async startCall(call: { sessionId: string; scenarioId?: string; precondition?: SimulatorPrecondition }): Promise<void> {
    if (call.precondition) this.#requireSnapshot(call.precondition);
    if (this.#shuttingDown || this.#reconciling || this.#sessions.has(call.sessionId) || this.#retiredSessionIds.has(call.sessionId)) {
      throw new SimulatorSessionConflictError("This simulator session cannot be started.");
    }
    const scenarioId = call.scenarioId ?? this.#defaultScenarioId;
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario '${scenarioId}' not found in simulator catalog.`);
    }

    const session = new SimulatorSession({
      sessionId: call.sessionId,
      scenario,
      sink: this.#sink,
      fixtures: this.#fixtures,
      mode: this.mode,
      ...(this.#holdMs !== undefined ? { holdMs: this.#holdMs } : {}),
      onSessionClosed: (id) => {
        if (this.#sessions.get(id) === session) {
          this.#sessions.delete(id);
          this.#retiredSessionIds.add(id);
          this.#revision += 1;
        }
      },
    });

    this.#sessions.set(call.sessionId, session);
    this.#revision += 1;
    try {
      await session.start();
    } catch (error) {
      // The runtime hears about this as a failed start, and may never send a stop for it.
      await session.stop("failed");
      this.#sessions.delete(call.sessionId);
      throw error;
    }
  }

  async receiveDtmf(press: SimulatedDtmfPress & { instanceId?: string }): Promise<"delivered" | "not_delivered"> {
    if (press.instanceId) this.#requireInstance(press.instanceId);
    const session = this.#sessions.get(press.sessionId);
    if (!session) {
      return "not_delivered";
    }
    return session.receiveDtmf(press);
  }

  async stopCall(call: { sessionId: string; reason: CallStopReason; instanceId?: string }): Promise<void> {
    if (call.instanceId) this.#requireInstance(call.instanceId);
    if (!this.#retiredSessionIds.has(call.sessionId)) this.#revision += 1;
    this.#retiredSessionIds.add(call.sessionId);
    const session = this.#sessions.get(call.sessionId);
    if (session) {
      await session.stop(call.reason);
      this.#sessions.delete(call.sessionId);
    }
  }

  /** Close local owners even if the runtime's remote stop never reached this server. */
  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    await Promise.all([...this.#sessions.keys()].map((sessionId) => this.stopCall({ sessionId, reason: "stopped" })));
  }

}
