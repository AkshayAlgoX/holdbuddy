/** Source-bound semantic decisions. Models interpret intent; local code owns structure and digits. */
import type { AssistableMenu } from "../contracts.js";
import { knownOperationConflict } from "./eligibility.js";

export const OFFLINE_REASONING_MODE = "FICTIONAL_OFFLINE_ONLY";
export const TRANSCRIPT_CONSENT = "I_ACCEPT_REDACTED_TRANSCRIPT_SUBMISSION";
export const PAID_REASONING_CONSENT = "I_ACCEPT_BOUNDED_REASONING_CHARGES";
export interface EvidenceSpan { start: number; end: number; quote: string; }
export interface ReasoningRequest {
  goal: string;
  /** Context contains spoken words with the actual menu keys masked. */
  context: string;
  candidates: ReadonlyArray<{ id: number; description: string }>;
}
export type ReasoningResult =
  | { kind: "abstain"; reason: string }
  | { kind: "choose"; candidateId: number; action: "equivalent"; object: "equivalent"; noExtraAction: true; goalEvidence: EvidenceSpan; optionEvidence: EvidenceSpan; reason: string };
export interface StructuredReasoner {
  readonly id: string;
  readonly exposure: "local" | "external";
  readonly paid: boolean;
  reason(request: ReasoningRequest): Promise<unknown>;
}
export interface StructuredVerifier {
  readonly exposure: "local";
  /** Capacity/model preflight must succeed before any external request consumes budget. */
  ready(): Promise<boolean>;
  verify(request: ReasoningRequest, result: Extract<ReasoningResult, { kind: "choose" }>): Promise<boolean>;
}
declare const permitBrand: unique symbol;
export interface ReasoningPermit { readonly [permitBrand]: true; }
const permits = new WeakMap<object, { fingerprint: string; candidateId: number }>();
const fingerprint = (menu: AssistableMenu) => {
  const context = menu.structuredContext;
  return JSON.stringify([context ? [context.mode, context.sessionId, context.nonce, context.observedAtMs, context.maskedSource] : null, menu.observationId, [...menu.goalTexts], menu.candidates.map(({ id, digit, description }) => [id, digit, description])]);
};

/** Internal state-machine check. A serialized, forged, reused or cross-session permit is worthless. */
export function consumeReasoningPermit(permit: unknown, menu: AssistableMenu, candidateId: number): boolean {
  if (typeof permit !== "object" || permit === null) return false;
  const record = permits.get(permit);
  if (!record || record.candidateId !== candidateId || record.fingerprint !== fingerprint(menu)) return false;
  permits.delete(permit);
  return true;
}

const keysExactly = (input: object, keys: readonly string[]) => Object.keys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function wholeEvidence(input: unknown, source: string): input is EvidenceSpan {
  // Full descriptions prevent cherry-picking just the compatible half of a compound operation.
  return isObject(input) && keysExactly(input, ["start", "end", "quote"]) && input.start === 0 && input.end === source.length && input.quote === source && source.trim().length > 0;
}
export function validateReasoningResult(request: ReasoningRequest, input: unknown): ReasoningResult | undefined {
  if (!isObject(input) || typeof input.reason !== "string" || input.reason.length < 1 || input.reason.length > 240) return undefined;
  if (input.kind === "abstain" && keysExactly(input, ["kind", "reason"])) return { kind: "abstain", reason: input.reason };
  if (input.kind !== "choose" || !keysExactly(input, ["kind", "candidateId", "action", "object", "noExtraAction", "goalEvidence", "optionEvidence", "reason"])) return undefined;
  const candidate = request.candidates.find(({ id }) => id === input.candidateId);
  if (!candidate || !Number.isSafeInteger(input.candidateId) || input.action !== "equivalent" || input.object !== "equivalent" || input.noExtraAction !== true) return undefined;
  if (!wholeEvidence(input.goalEvidence, request.goal) || !wholeEvidence(input.optionEvidence, candidate.description)) return undefined;
  return input as unknown as ReasoningResult;
}

export const wholeSpan = (quote: string): EvidenceSpan => ({ start: 0, end: quote.length, quote });
/** For local implementations; a model score cannot mint a permit by itself. */
export function supportedChoice(request: ReasoningRequest, candidateId: number, reason: string): ReasoningResult {
  const option = request.candidates.find(({ id }) => id === candidateId);
  if (!option) return { kind: "abstain", reason: "unknown_option" };
  return { kind: "choose", candidateId, action: "equivalent", object: "equivalent", noExtraAction: true, goalEvidence: wholeSpan(request.goal), optionEvidence: wholeSpan(option.description), reason };
}

export interface StructuredAssistConfig {
  mode: typeof OFFLINE_REASONING_MODE;
  reasoner: StructuredReasoner;
  /** An external model is never its own verifier. */
  verifier?: StructuredVerifier;
  maxRequests: number;
  timeoutMs: number;
  transcriptConsent?: string;
  paidConsent?: string;
}
export type StructuredOutcome =
  | { kind: "choose"; candidateId: number; permit: ReasoningPermit; matcherId: string; score: number; margin: null }
  | { kind: "abstain"; matcherId: string; reason: string };

export function createStructuredAssist(config: StructuredAssistConfig) {
  if (config.mode !== OFFLINE_REASONING_MODE || !Number.isSafeInteger(config.maxRequests) || config.maxRequests < 0 || config.maxRequests > 220 || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0 || config.timeoutMs > 30_000 || typeof config.reasoner.paid !== "boolean" || !["local", "external"].includes(config.reasoner.exposure) || typeof config.reasoner.reason !== "function") throw new RangeError("Invalid offline reasoning configuration");
  if (config.reasoner.exposure === "external" && (!config.verifier || config.verifier.exposure !== "local" || typeof config.verifier.ready !== "function")) throw new Error("External reasoning requires a separate verifier");
  let used = 0, busy = false;
  const abstain = (reason: string): StructuredOutcome => ({ kind: "abstain", matcherId: config.reasoner.id, reason });
  return {
    used: () => used,
    matcherId: config.reasoner.id,
    async choose(menu: AssistableMenu): Promise<StructuredOutcome> {
      if (!menu.structuredContext || menu.structuredContext.mode !== OFFLINE_REASONING_MODE) return abstain("not_structurally_authorized");
      if (config.reasoner.exposure === "external" && config.transcriptConsent !== TRANSCRIPT_CONSENT) return abstain("no_transcript_consent");
      if (config.reasoner.paid && config.paidConsent !== PAID_REASONING_CONSENT) return abstain("no_paid_consent");
      if (busy) return abstain("reasoner_busy");
      if (used >= config.maxRequests) return abstain("budget_exhausted");
      const request: ReasoningRequest = { goal: menu.goalTexts.join(". "), context: menu.structuredContext.maskedSource, candidates: menu.candidates.map(({ id, description }) => ({ id, description })) };
      if (request.candidates.length < 1 || request.candidates.length > 16 || request.goal.length > 1500 || request.context.length > 9000 || request.candidates.some(({ description }) => description.length > 2048)) return abstain("input_limit");
      const binding = fingerprint(menu);
      busy = true;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const work = (async () => {
        if (config.verifier && !await config.verifier.ready()) return abstain("verifier_unavailable");
        if (cancelled) return abstain("reasoner_timeout");
        used++;
        const result = validateReasoningResult(request, await config.reasoner.reason(structuredClone(request)));
        if (!result) return abstain("unsupported_result");
        if (result.kind === "abstain") return abstain("reasoner_abstained");
        const proposed = request.candidates.find(({ id }) => id === result.candidateId)!;
        if (knownOperationConflict(request.goal, proposed.description)) return abstain("known_operation_conflict");
        if (config.verifier && !await config.verifier.verify(structuredClone(request), structuredClone(result))) return abstain("verification_failed");
        const permit = Object.freeze({}) as ReasoningPermit;
        permits.set(permit, { fingerprint: binding, candidateId: result.candidateId });
        return { kind: "choose", candidateId: result.candidateId, permit, matcherId: config.reasoner.id, score: 1, margin: null } as StructuredOutcome;
      })().finally(() => { busy = false; });
      try {
        return await Promise.race([work, new Promise<StructuredOutcome>((resolve) => { timer = setTimeout(() => { cancelled = true; resolve(abstain("reasoner_timeout")); }, config.timeoutMs); })]);
      } catch { return abstain("reasoner_failed"); }
      finally { if (timer) clearTimeout(timer); }
    },
  };
}
