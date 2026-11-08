/**
 * A replaceable way to judge meaning the rules can't read. A ranker sees the goal and the spoken
 * descriptions, identified only by position. It never sees a digit, simulator data or an expected
 * answer, and it can only rank what was actually spoken. Its scores never decide alone: this gate adds
 * its own checks, and any doubt, failure or spent budget ends in abstention.
 */
import type { AssistableMenu } from "../contracts.js";
import { itemize } from "./canonicalize.js";
import { semanticEligible } from "./eligibility.js";

export interface RankRequest {
  goal: string;
  candidates: ReadonlyArray<{ id: number; description: string }>;
}
export type RankResult = { ranking: ReadonlyArray<{ id: number; score: number }> } | { abstain: string };

export interface SemanticMatcher {
  readonly id: string;
  /** True if using it costs money or sends text off the machine. */
  readonly chargeable: boolean;
  rank(request: RankRequest): Promise<RankResult>;
}

export interface GateThresholds {
  /** The top score must reach this. */
  minScore: number;
  /** The top score must beat the second by this. */
  minMargin: number;
  /** Absolute floor for a lone eligible option, which has no runner-up for a margin check. */
  minSingleScore: number;
}

export const CHARGEABLE_MATCHER_CONSENT = "I_ACCEPT_MODEL_CHARGES";

export interface SemanticAssistConfig {
  matcher: SemanticMatcher;
  thresholds: GateThresholds;
  maxRequests: number;
  timeoutMs: number;
  /** Required, exactly, for a chargeable matcher. */
  consent?: string;
}

export type AssistOutcome =
  | { kind: "choose"; candidateId: number; matcherId: string; score: number; margin: number | null }
  | { kind: "abstain"; matcherId: string; reason: "no_consent" | "budget_exhausted" | "matcher_busy" | "matcher_failed" | "matcher_abstained" | "malformed_ranking" | "unknown_option" | "low_score" | "low_margin" | "action_conflict" };

/** Kinds of action and department. Used only to refuse a choice, never to make one. */
const CLASSES: ReadonlyArray<[string, RegExp, readonly string[]]> = [
  ["pay", /\b(pay|paying|payment|payments)\b/i, ["payment"]],
  ["complaint", /\b(complaint|complaints|dispute|disputes|disputed|grievance|overcharged|incorrect charge|wrong charge)\b/i, ["complaint"]],
  ["refund", /\b(refund|refunds|money back)\b/i, ["refund"]],
  ["cancel", /\b(cancel|cancellation|terminate|disconnect|close my)\b/i, ["cancellation"]],
  ["new", /\b(new connection|new service|fresh connection)\b/i, ["new connection"]],
  ["technical", /\b(technical|troubleshoot|troubleshooting|repair|outage|not working|connectivity)\b/i, ["technical"]],
];

/** Action kinds named in any supported language, with no judgement about what the rest means. */
export function actionClasses(text: string): Set<string> {
  const concepts = new Set(itemize(text).filter(({ kind }) => kind === "concept").map(({ value }) => value));
  const found = new Set<string>();
  for (const [name, english, values] of CLASSES) if (english.test(text) || values.some((value) => concepts.has(value))) found.add(name);
  return found;
}

export function gateRanking(request: RankRequest, result: RankResult, thresholds: GateThresholds, matcherId: string): AssistOutcome {
  const abstain = (reason: Extract<AssistOutcome, { kind: "abstain" }>["reason"]): AssistOutcome => ({ kind: "abstain", matcherId, reason });
  if ("abstain" in result) return abstain("matcher_abstained");
  const { ranking } = result;
  if (!Array.isArray(ranking) || ranking.length === 0 || ranking.some((row) => typeof row?.score !== "number" || !Number.isFinite(row.score) || typeof row.id !== "number")) return abstain("malformed_ranking");
  const known = new Set(request.candidates.map(({ id }) => id));
  if (ranking.some(({ id }) => !known.has(id))) return abstain("unknown_option");
  if (new Set(ranking.map(({ id }) => id)).size !== ranking.length || ranking.length !== request.candidates.length) return abstain("malformed_ranking");
  const sorted = [...ranking].sort((a, b) => b.score - a.score);
  const top = sorted[0]!;
  const margin = sorted[1] ? top.score - sorted[1].score : null;
  if (top.score < (request.candidates.length === 1 ? thresholds.minSingleScore : thresholds.minScore)) return abstain("low_score");
  if (margin !== null && margin < thresholds.minMargin) return abstain("low_margin");
  if (!semanticEligible(request.goal, request.candidates.find(({ id }) => id === top.id)!.description)) return abstain("action_conflict");
  return { kind: "choose", candidateId: top.id, matcherId, score: top.score, margin };
}

export function createSemanticAssist(config: SemanticAssistConfig) {
  if (!Number.isSafeInteger(config.maxRequests) || config.maxRequests < 0 || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0 || config.timeoutMs > 30_000 || [config.thresholds.minScore, config.thresholds.minMargin, config.thresholds.minSingleScore].some((n) => !Number.isFinite(n) || n < 0 || n > 1)) throw new RangeError("Invalid semantic budget or thresholds");
  let used = 0;
  let busy = false;
  const { matcher } = config;
  return {
    used: () => used,
    matcherId: matcher.id,
    async choose(menu: AssistableMenu): Promise<AssistOutcome> {
      if (matcher.chargeable && config.consent !== CHARGEABLE_MATCHER_CONSENT) return { kind: "abstain", matcherId: matcher.id, reason: "no_consent" };
      if (busy) return { kind: "abstain", matcherId: matcher.id, reason: "matcher_busy" };
      const goal = menu.goalTexts.join(". ");
      const candidates = menu.candidates.filter(({ description }) => semanticEligible(goal, description));
      if (candidates.length === 0) return { kind: "abstain", matcherId: matcher.id, reason: "action_conflict" };
      if (used >= config.maxRequests) return { kind: "abstain", matcherId: matcher.id, reason: "budget_exhausted" };
      used += 1;
      busy = true;
      // Rebuilt field by field, so only the goal, positions and spoken words can reach a matcher.
      const request: RankRequest = { goal, candidates: candidates.map(({ id, description }) => ({ id, description })) };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), config.timeoutMs);
        });
        // A timeout is not cancellation. Keep the slot occupied until the actual task finishes.
        const work = Promise.resolve().then(() => matcher.rank(request)).finally(() => { busy = false; });
        return gateRanking(request, await Promise.race([work, timeout]), config.thresholds, matcher.id);
      } catch {
        return { kind: "abstain", matcherId: matcher.id, reason: "matcher_failed" };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
export type SemanticAssist = ReturnType<typeof createSemanticAssist>;
