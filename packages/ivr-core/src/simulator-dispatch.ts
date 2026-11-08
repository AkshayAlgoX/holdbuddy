import type { DtmfDigit, IvrAction, ObservationProvenance, StepResult } from "./contracts.js";
import type { IvrSession } from "./session.js";

/**
 * The only path from a `send_dtmf` action to anything that receives digits, and it reaches only a
 * fictional simulator. HoldBuddy has no telephone or external call executor. Provenance travels with a
 * press as metadata and authorizes nothing.
 */
export interface SimulatedDtmfPress {
  sessionId: string;
  actionId: string;
  digit: DtmfDigit;
  provenance: ObservationProvenance;
}

export interface SimulatedCallEndpoint {
  readonly kind: "fictional_simulator";
  /** Returns only whether the digit arrived. Nothing about menus or routes can come back this way. */
  receiveDtmf(press: SimulatedDtmfPress): Promise<"delivered" | "not_delivered">;
}

export type SimulatorRefusal = "not_a_press" | "wrong_session" | "not_pending" | "already_dispatched" | "deadline_passed" | "invalid_clock";

export type SimulatorDispatchResult =
  | { outcome: "delivered" | "not_delivered"; step: StepResult }
  /** The endpoint failed midway. Nothing is acknowledged, and the session's deadline ends the wait. */
  | { outcome: "delivery_unknown" }
  | { outcome: "refused"; refusal: SimulatorRefusal };

/** Per session, so a second dispatcher can't send a press again. A withdrawn press is in it too, so it can't be sent. */
const dispatchedBySession = new WeakMap<IvrSession, Set<string>>();

const ledgerOf = (session: IvrSession) => {
  const ledger = dispatchedBySession.get(session) ?? new Set<string>();
  dispatchedBySession.set(session, ledger);
  return ledger;
};

/**
 * Takes an action's one use for a withdrawal instead of a delivery. True only if no dispatcher has ever reserved it,
 * which means it was never handed to an endpoint. After this, no dispatcher can send it. Synchronous, so nothing can
 * run between the check and the claim.
 */
export function claimForWithdrawal(session: IvrSession, actionId: string): boolean {
  const ledger = ledgerOf(session);
  if (ledger.has(actionId)) return false;
  ledger.add(actionId);
  return true;
}

/** A usable reading from the clock, or undefined. A bad clock must never lead to a delivery. */
function readClock(now: () => number, notBefore: number): number | undefined {
  try {
    const time = now();
    return typeof time === "number" && Number.isFinite(time) && time >= 0 && time >= notBefore ? time : undefined;
  } catch {
    return undefined;
  }
}

export class SimulatorDispatcher {
  readonly #session: IvrSession;
  readonly #endpoint: SimulatedCallEndpoint;
  readonly #now: () => number;

  constructor(session: IvrSession, endpoint: SimulatedCallEndpoint, now: () => number) {
    if (endpoint?.kind !== "fictional_simulator") throw new TypeError("SimulatorDispatcher only accepts a fictional simulator.");
    this.#session = session;
    this.#endpoint = endpoint;
    this.#now = now;
  }

  async dispatch(action: IvrAction): Promise<SimulatorDispatchResult> {
    if (action?.type !== "send_dtmf") return { outcome: "refused", refusal: "not_a_press" };
    const state = this.#session.state;
    if (action.sessionId !== state.sessionId) return { outcome: "refused", refusal: "wrong_session" };

    const dispatched = ledgerOf(this.#session);
    if (dispatched.has(action.actionId)) return { outcome: "refused", refusal: "already_dispatched" };

    // The session's own record decides, not the action object, whatever that claims.
    const pending = state.pendingPress;
    if (!pending || pending.actionId !== action.actionId || pending.digit !== action.digit) return { outcome: "refused", refusal: "not_pending" };
    // Checked before the press uses up its one delivery, so a bad clock costs nothing.
    const time = readClock(this.#now, state.lastNowMs);
    if (time === undefined) return { outcome: "refused", refusal: "invalid_clock" };
    if (time >= pending.deadlineMs) return { outcome: "refused", refusal: "deadline_passed" };

    dispatched.add(action.actionId);
    let delivery: "delivered" | "not_delivered";
    try {
      delivery = await this.#endpoint.receiveDtmf({
        sessionId: state.sessionId,
        actionId: pending.actionId,
        digit: pending.digit,
        provenance: state.lastProvenance ?? "offline_fixture",
      });
    } catch {
      return { outcome: "delivery_unknown" };
    }
    if (delivery !== "delivered" && delivery !== "not_delivered") return { outcome: "delivery_unknown" };
    const step = this.#session.dispatch({
      type: delivery === "delivered" ? "dtmf_sent" : "dtmf_failed",
      sessionId: state.sessionId,
      actionId: pending.actionId,
      // If the clock breaks during delivery, the time from before it is still valid.
      receivedAtMs: readClock(this.#now, time) ?? time,
    });
    return { outcome: delivery, step };
  }
}
