/** Local views are memory-only. Authoritative simulator inventory gates admission and termination. */
import { CallSession, type CallSessionOptions } from "./call-session.js";
import type { HandoffJudge, RuntimeLogger, SimulatorPort, SimulatorSnapshot, SimulatorReconciliation } from "./ports.js";
import type { CreateSessionRequest, RuntimeEvent, SessionView } from "./protocol.js";
import type { SttBinding } from "./stt.js";

/**
 * Off unless given. For each call it gets stated facts and a copy of every published event, the same ones the web app
 * sees, and nothing to act with: no session, no simulator link and no way to answer. A failure in it can't reach the call.
 */
export type SessionObserver = (facts: { sessionId: string; goal: string; preferredLanguage?: string }) => (event: RuntimeEvent) => void;

export interface CallRuntimeOptions {
  simulator: SimulatorPort;
  stt: SttBinding;
  judge?: HandoffJudge;
  logger?: RuntimeLogger;
  maxActiveSessions?: number;
  maxRetainedClosedSessions?: number;
  observe?: SessionObserver;
  /** Explicit escape for isolated in-process test adapters. Never inferred for a remote/older simulator. */
  allowUnmanagedSimulator?: boolean;
  /** Advanced and test settings, passed to every session. */
  session?: Pick<CallSessionOptions, "now" | "tickIntervalMs" | "sttTimeoutMs" | "semanticAssist" | "sttLanguage" | "sttFormat" | "sttContext" | "limits" | "maxQueuedSegments" | "maxConsecutiveRejections" | "maxConsecutiveSttFailures" | "maxBufferedEvents" | "maxSilenceMs" | "maxCallMs" | "simulatorStopTimeoutMs">;
}

export class TooManySessionsError extends Error {}
export class SimulatorUnavailableError extends Error {}
export class SimulatorShutdownError extends Error {
  constructor(readonly unconfirmedSessionIds: readonly string[], readonly reason: string) {
    super("Simulator termination could not be confirmed."); this.name = "SimulatorShutdownError";
  }
}

async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Simulator lifecycle deadline.")), ms); })]);
  } finally { clearTimeout(timer); }
}

export class CallRuntime {
  readonly #options: CallRuntimeOptions;
  readonly #sessions = new Map<string, CallSession>();
  #shuttingDown = false;
  #instanceId: string | undefined;
  #observedActiveSessionIds: readonly string[] = [];
  #instanceConflict = false;
  #recovery: Promise<void> | undefined;
  #shutdown: Promise<void> | undefined;
  #admissions: Promise<void> = Promise.resolve();
  #lifecycle: { state: "unverified" | "ready" | "blocked" | "stopped" | "unmanaged"; reason?: string; recoveredSessions: number } = { state: "unverified", recoveredSessions: 0 };

  constructor(options: CallRuntimeOptions) {
    this.#options = options;
    if (options.allowUnmanagedSimulator) {
      if (typeof options.simulator.snapshot === "function" || typeof options.simulator.reconcileCalls === "function") throw new TypeError("Lifecycle-capable simulators cannot use unmanaged test mode.");
      this.#lifecycle.state = "unmanaged";
      options.logger?.log({ code: "simulator_lifecycle_unmanaged" });
    }
  }

  get sttMode() {
    return this.#options.stt.mode;
  }

  get(sessionId: string): CallSession | undefined {
    return this.#sessions.get(sessionId);
  }

  get lifecycleStatus() { return { ...this.#lifecycle }; }

  #blocked(reason: string): SimulatorUnavailableError {
    this.#lifecycle = { ...this.#lifecycle, state: "blocked", reason };
    this.#options.logger?.log({ code: `simulator_lifecycle_${reason}` });
    return new SimulatorUnavailableError(reason);
  }

  #requireControl(): void {
    if (typeof this.#options.simulator.snapshot !== "function" || typeof this.#options.simulator.reconcileCalls !== "function") throw this.#blocked("unsupported");
  }

  #owns(instanceId: string, sessionId: string): boolean {
    return this.#sessions.get(sessionId)?.simulatorInstanceId === instanceId;
  }

  #confirmedIn(instanceId: string, sessionId: string): boolean {
    return this.#owns(instanceId, sessionId) && this.#sessions.get(sessionId)!.simulatorStopConfirmed;
  }

  async #snapshot(): Promise<SimulatorSnapshot> {
    this.#requireControl();
    if (this.#instanceConflict) throw this.#blocked("instance_changed");
    let snapshot: SimulatorSnapshot;
    try { snapshot = await bounded(this.#options.simulator.snapshot!(), this.#options.session?.simulatorStopTimeoutMs ?? 5_000); }
    catch { throw this.#blocked("unavailable"); }
    if (this.#instanceId !== undefined && this.#instanceId !== snapshot.instanceId) {
      if ([...this.#sessions.values()].some((session) => !session.simulatorStopConfirmed) || this.#observedActiveSessionIds.some((id) => !this.#confirmedIn(this.#instanceId!, id))) {
        this.#instanceConflict = true;
        throw this.#blocked("instance_changed");
      }
      this.#options.logger?.log({ code: "simulator_instance_changed_after_confirmed_stop" });
    }
    this.#instanceId = snapshot.instanceId;
    this.#observedActiveSessionIds = [...snapshot.activeSessionIds];
    return snapshot;
  }

  async #retire(sessionIds: readonly string[], instanceId: string): Promise<SimulatorReconciliation> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const basis = await this.#snapshot();
      if (basis.instanceId !== instanceId) { this.#instanceConflict = true; throw this.#blocked("instance_changed"); }
      try {
        const proof = await bounded(this.#options.simulator.reconcileCalls!({ precondition: { instanceId: basis.instanceId, revision: basis.revision }, sessionIds }), this.#options.session?.simulatorStopTimeoutMs ?? 5_000);
        if (this.#instanceConflict || this.#instanceId !== basis.instanceId) {
          this.#instanceConflict = true;
          throw this.#blocked("instance_changed");
        }
        if (proof.instanceId !== basis.instanceId || proof.revision <= basis.revision || sessionIds.some((id) => !proof.retiredSessionIds.includes(id) || proof.activeSessionIds.includes(id))) throw new Error("Incomplete retirement proof.");
        for (const id of sessionIds) {
          const session = this.#sessions.get(id);
          if (session?.closed && session.simulatorInstanceId === instanceId) session.confirmSimulatorStopped();
        }
        this.#observedActiveSessionIds = [...proof.activeSessionIds];
        return proof;
      } catch { this.#options.logger?.log({ code: "simulator_reconciliation_attempt_unconfirmed" }); }
    }
    throw this.#blocked("termination_unconfirmed");
  }

  /** Explicit controller-authorized recovery. Never silently terminates an unknown call during admission. */
  reconcileSimulator(): Promise<void> {
    if (this.#recovery) return this.#recovery;
    if (this.#shuttingDown || [...this.#sessions.values()].some((session) => !session.closed)) return Promise.reject(this.#blocked("busy"));
    const work = (async () => {
      const snapshot = await this.#snapshot();
      const ids = [...new Set([...snapshot.activeSessionIds, ...[...this.#sessions.keys()].filter((id) => this.#owns(snapshot.instanceId, id))])];
      const proof = await this.#retire(ids, snapshot.instanceId);
      if (proof.activeSessionIds.length) throw this.#blocked("unowned_sessions");
      this.#lifecycle = { state: "ready", recoveredSessions: this.#lifecycle.recoveredSessions + snapshot.activeSessionIds.length };
      this.#options.logger?.log({ code: "simulator_reconciliation_confirmed" });
    })();
    this.#recovery = work;
    void work.then(() => { this.#recovery = undefined; }, () => { this.#recovery = undefined; });
    return work;
  }

  create(request: CreateSessionRequest): Promise<{ session: CallSession; view: SessionView }> {
    if (this.#options.allowUnmanagedSimulator) return this.#create(request);
    // Only admission waits here. Stop, takeover and shutdown never join this queue.
    // Wait for this runtime's earlier start acknowledgement before taking another revision snapshot.
    const work = this.#admissions.then(() => this.#create(request));
    this.#admissions = work.then(() => {}, () => {});
    return work;
  }

  async #create(request: CreateSessionRequest): Promise<{ session: CallSession; view: SessionView }> {
    if (this.#shuttingDown) throw new TooManySessionsError();
    if (this.#recovery) throw this.#blocked("busy");
    // A failed or timed out stop still owns its slot. Reconcile it before admitting another call.
    await Promise.all([...this.#sessions.values()].filter((session) => session.closed).map((session) => session.reconcileSimulatorStop()));
    let snapshot: SimulatorSnapshot | undefined;
    if (!this.#options.allowUnmanagedSimulator) {
      snapshot = await this.#snapshot();
      if (snapshot.activeSessionIds.some((id) => !this.#owns(snapshot!.instanceId, id))) throw this.#blocked("unowned_sessions");
      const closed = [...this.#sessions.values()].filter((session) => session.simulatorInstanceId === snapshot!.instanceId && session.closed && (!session.simulatorStopConfirmed || snapshot!.activeSessionIds.includes(session.sessionId)));
      if (closed.length) snapshot = await this.#retire(closed.map((session) => session.sessionId), snapshot.instanceId);
    }
    const sessions = [...this.#sessions.values()];
    if (snapshot?.activeSessionIds.some((id) => !this.#owns(snapshot!.instanceId, id))) throw this.#blocked("unowned_sessions");
    if (this.#recovery) throw this.#blocked("busy");
    if (this.#shuttingDown || sessions.filter((session) => !session.closed).length >= (this.#options.maxActiveSessions ?? 4)) throw new TooManySessionsError();
    if (sessions.some((session) => session.closed && !session.simulatorStopConfirmed)) throw new SimulatorUnavailableError();
    const { simulator, stt, judge, logger } = this.#options;
    const bound: SimulatorPort = snapshot ? {
      kind: "fictional_simulator",
      startCall: (call) => simulator.startCall({ ...call, precondition: { instanceId: snapshot!.instanceId, revision: snapshot!.revision } }),
      stopCall: (call) => simulator.stopCall({ ...call, instanceId: snapshot!.instanceId }),
      receiveDtmf: (press) => simulator.receiveDtmf({ ...press, instanceId: snapshot!.instanceId }),
    } : simulator;
    const session = new CallSession({
      ...this.#options.session,
      goal: request.goal,
      ...(request.preferredLanguage ? { preferredLanguage: request.preferredLanguage } : {}),
      ...(request.simulatorScenarioId === undefined ? {} : { scenarioId: request.simulatorScenarioId }),
      simulator: bound,
      ...(snapshot ? { simulatorInstanceId: snapshot.instanceId } : {}),
      stt,
      ...(judge ? { judge } : {}),
      ...(logger ? { logger } : {}),
    });
    this.#sessions.set(session.sessionId, session);
    this.#evictClosed();
    this.#attachObserver(session, request);
    if (snapshot) this.#lifecycle = { state: "ready", recoveredSessions: this.#lifecycle.recoveredSessions };
    await session.start();
    if (!this.#shuttingDown && snapshot && session.view().closure?.failure?.source === "runtime") this.#blocked("start_unconfirmed");
    return { session, view: session.view() };
  }

  #attachObserver(session: CallSession, request: CreateSessionRequest): void {
    const { observe, logger } = this.#options;
    if (!observe) return;
    try {
      const listener = observe({ sessionId: session.sessionId, goal: request.goal, ...(request.preferredLanguage ? { preferredLanguage: request.preferredLanguage } : {}) });
      // A copy, so nothing it does to an event can change what the web app replays.
      session.subscribe((event) => listener(structuredClone(event)));
    } catch {
      logger?.log({ code: "observer_failed", sessionId: session.sessionId });
    }
  }

  #evictClosed(): void {
    const closed = [...this.#sessions.values()].filter((session) => session.closed && session.simulatorStopConfirmed);
    const excess = closed.length - (this.#options.maxRetainedClosedSessions ?? 16);
    for (const session of closed.slice(0, Math.max(0, excess))) {
      if (session.simulatorInstanceId === this.#instanceId) this.#observedActiveSessionIds = this.#observedActiveSessionIds.filter((id) => id !== session.sessionId);
      this.#sessions.delete(session.sessionId);
    }
  }

  /** Resolves only on confirmed termination. A failed attempt is explicit and may be retried. */
  shutdown(): Promise<void> {
    this.#shuttingDown = true;
    if (this.#shutdown) return this.#shutdown;
    let done!: () => void, fail!: (error: unknown) => void;
    const work = new Promise<void>((resolve, reject) => { done = resolve; fail = reject; });
    // Reserve completion before stop publishes events: a listener may synchronously call shutdown again.
    this.#shutdown = work;
    const cleanup = (async () => {
      if (this.#recovery) await this.#recovery.catch(() => {});
      const sessions = [...this.#sessions.values()];
      for (const session of sessions) session.stop();
      await Promise.all(sessions.flatMap((session) => [session.cleanedUp(), session.reconcileSimulatorStop()]));
      let remainingIds: readonly string[] = [];
      try {
        if (this.#options.allowUnmanagedSimulator) {
          if (sessions.some((session) => !session.simulatorStopConfirmed)) throw new Error("An unmanaged stop is unconfirmed.");
        } else {
          const basis = await this.#snapshot();
          const proof = await this.#retire(sessions.filter((session) => session.simulatorInstanceId === basis.instanceId).map((session) => session.sessionId), basis.instanceId);
          remainingIds = proof.activeSessionIds;
          if (remainingIds.length) throw this.#blocked("unowned_sessions");
        }
      } catch {
        this.#options.logger?.log({ code: "simulator_shutdown_unconfirmed" });
        const observedUnconfirmed = this.#observedActiveSessionIds.filter((id) => !this.#confirmedIn(this.#instanceId ?? "", id));
        throw new SimulatorShutdownError([...new Set([...remainingIds, ...observedUnconfirmed, ...sessions.filter((session) => !session.simulatorStopConfirmed).map((session) => session.sessionId)])], this.#lifecycle.reason ?? "termination_unconfirmed");
      }
      this.#lifecycle = { state: "stopped", recoveredSessions: this.#lifecycle.recoveredSessions };
    })();
    void cleanup.then(done, fail);
    void work.catch(() => { if (this.#shutdown === work) this.#shutdown = undefined; });
    return work;
  }
}
