/** Ordered, bounded authorization of observed offers. No goal, model score or simulator input. */
import { canonicalSpeech, itemize, type Item } from "./canonicalize.js";
import { extractOptions, type ExtractedCandidate } from "./extract.js";
import { analyze, hasAmendmentCue, isCourtesyOnly, referencesAnInstruction, retractsAnInstruction } from "../goal-matcher.js";
import { tokenize } from "../text.js";
import { detectHold, detectPossibleHuman } from "../call-signals.js";
import { describesInstructions, parseMenu } from "../menu-parser.js";

export const DISCOURSE_MODE = "DISCOURSE_OFFLINE_ONLY";
export type DiscourseRole = "offer" | "navigation" | "language" | "information" | "advertisement" | "prohibition" | "withdrawal" | "correction" | "menu_boundary" | "greeting" | "hold" | "ambiguous";
export type OfferStatus = "authorized" | "withdrawn" | "superseded" | "prohibited" | "advertisement" | "ambiguous" | "duplicate";
export interface AuthorizedOffer extends ExtractedCandidate {
  clauseId: number;
  generation: number;
  status: OfferStatus;
  reason: string;
  /** Whole clause in original transcript, never synthesized evidence. */
  sourceSpan: [number, number];
}
export interface DiscourseClause {
  id: number;
  span: [number, number];
  text: string;
  /** Observation clock, not audio word timing. */
  observedAtMs?: number;
  roles: DiscourseRole[];
  reasons: string[];
  activeAfter: number[];
}
export interface DiscourseAuthorization {
  clauses: DiscourseClause[];
  offers: AuthorizedOffer[];
  active: AuthorizedOffer[];
  blocked: boolean;
  reason: string;
  scope?: "advertisement" | "ambiguous";
}
export interface ObservedTextSpan { start: number; end: number; observedAtMs: number; }
const MAX_CLAUSES = 64, MAX_OFFERS = 64, MAX_ACTIVE = 16;
const keyItems = (items: readonly Item[]) => [...new Set(items.flatMap((i) => i.digit === undefined ? [] : [i.digit]))];

/**
 * Unknown non-offer speech is a scope barrier, not harmless filler. A model can understand an
 * unfamiliar service label but cannot certify that unknown surrounding speech leaves it in force.
 * Advertisement and ambiguous-speaker scope cannot be escaped by an embedded "menu" announcement.
 */
export function authorizeDiscourse(transcript: string, timing: readonly ObservedTextSpan[] = [], priorScope?: "advertisement" | "ambiguous"): DiscourseAuthorization {
  const result: DiscourseAuthorization = { clauses: [], offers: [], active: [], blocked: false, reason: "no_current_offer" };
  if (typeof transcript !== "string" || transcript.length > 8000 || priorScope !== undefined && priorScope !== "advertisement" && priorScope !== "ambiguous" || timing.length > 20 || timing.some((t, i) => !Number.isSafeInteger(t.start) || !Number.isSafeInteger(t.end) || t.start < 0 || t.end < t.start || t.end > transcript.length || !Number.isFinite(t.observedAtMs) || t.observedAtMs < 0 || (i > 0 && (t.start < timing[i - 1]!.end || t.observedAtMs < timing[i - 1]!.observedAtMs)))) return { ...result, blocked: true, reason: "input_limit_or_timing" };
  let generation = 0, quarantine = priorScope;
  if (priorScope) result.reason = "prior_authority_scope_unresolved";
  const active = new Map<string, AuthorizedOffer>();
  const prohibited = new Set<string>();
  const invalidate = (status: OfferStatus, reason: string, digits = [...active.keys()]) => {
    for (const digit of digits) {
      const old = active.get(digit);
      if (old) { old.status = status; old.reason = reason; active.delete(digit); }
    }
  };
  const barrier = (reason: string, kind: "advertisement" | "ambiguous" = "ambiguous") => {
    quarantine ??= kind;
    invalidate(kind, reason);
    result.reason = reason;
  };
  // Sentence/colon boundaries retain original offsets. Split "not 9, press 0" at the comma only
  // when its prefix is an explicit negated key, never by copying a previous label onto the new key.
  const pieces: Array<{ text: string; start: number }> = [];
  for (const match of transcript.matchAll(/[^.।॥!?;\n:]+/gu)) {
    const comma = match[0].search(/[,،]/u), prefix = comma < 0 ? [] : itemize(match[0].slice(0, comma));
    if (comma >= 0 && prefix.some((i) => i.kind === "negation") && keyItems(prefix).length === 1 && prefix.every((i) => i.kind === "negation" || i.kind === "filler" || i.digit !== undefined)) {
      pieces.push({ text: match[0].slice(0, comma), start: match.index }, { text: match[0].slice(comma + 1), start: match.index + comma + 1 });
    } else pieces.push({ text: match[0], start: match.index });
    if (pieces.length > MAX_CLAUSES) return { ...result, active: [], blocked: true, reason: "clause_limit" };
  }
  const quoted = /["“”«»「」]|(?:^|[^\p{L}\p{M}])'[^']+'(?:$|[^\p{L}\p{M}])/u.test(transcript);
  if (quoted) barrier("quoted_or_ambiguous_authority");
  for (const piece of pieces) {
    const trim = piece.text.trim();
    if (!trim) continue;
    const start = piece.start + piece.text.indexOf(trim), end = start + trim.length;
    const clause: DiscourseClause = { id: result.clauses.length, span: [start, end], text: trim, roles: [], reasons: [], activeAfter: [] };
    const observed = timing.findLast((t) => t.start < end && t.end > start);
    if (observed) clause.observedAtMs = observed.observedAtMs;
    const items = itemize(trim), extracted = extractOptions(trim), tokens = tokenize(trim);
    const say = (role: DiscourseRole, reason: string) => { clause.roles.push(role); clause.reasons.push(reason); };
    const keys = keyItems(items);
    const advertisement = extracted.nonActionContext || extracted.addressedToHelper || describesInstructions(tokens);
    const warning = extracted.retracted || extracted.amended || (extracted.candidates.length === 0 && (retractsAnInstruction(tokens) || items.some((i) => i.kind === "negation" || i.kind === "negated_press" || i.kind === "retraction" || i.kind === "status")));
    const bareNegatedKey = extracted.candidates.length === 0 && keys.length === 1 && items.some((i) => i.kind === "negation") && items.every((i) => i.kind === "negation" || i.kind === "filler" || i.digit !== undefined);
    if (advertisement) {
      say("advertisement", "non_authoritative_scope"); barrier("non_authoritative_scope", "advertisement");
    } else if (detectPossibleHuman(trim) || items.some((i) => i.kind === "spoof")) {
      say("ambiguous", "speaker_authority_uncertain"); barrier("speaker_authority_uncertain");
    } else if (warning && extracted.candidates.length === 0) {
      // Only explicit keys, or an instruction reference with exactly one active offer, resolve scope.
      // Never match a warning to an option by embedding similarity or by a nearest-key heuristic.
      const targets = keys.length ? keys : referencesAnInstruction(tokens) && active.size === 1 ? [...active.keys()] : [];
      // Reuse the core's existing retraction grammar, including negated validity, instead of
      // maintaining a second warning vocabulary in this layer. Other residual words remain unsafe.
      const referenceContext = items.filter((i) => i.kind === "negation" || referencesAnInstruction(tokenize(trim.slice(i.start, i.end)))).flatMap((i) => tokenize(trim.slice(i.start, i.end)));
      const remainder = items.filter((i) => i.kind !== "negation" && i.kind !== "retraction" && i.kind !== "status" && i.kind !== "filler" && i.digit === undefined && !referencesAnInstruction(tokenize(trim.slice(i.start, i.end))) && !retractsAnInstruction([...referenceContext, ...tokenize(trim.slice(i.start, i.end))]));
      const scopeUnderstood = !items.some((i) => i.kind === "condition" || i.kind === "sequence") && isCourtesyOnly(remainder.flatMap((i) => tokenize(trim.slice(i.start, i.end))));
      if (!scopeUnderstood) { say("ambiguous", "withdrawal_scope_uncertain"); barrier("withdrawal_scope_uncertain"); }
      else if (!keys.length && referencesAnInstruction(tokens) && hasAmendmentCue(tokens) && !items.some((i) => i.kind === "negation" || i.kind === "retraction")) {
        invalidate("superseded", "menu_superseded"); generation++; say("menu_boundary", "menu_superseded");
      } else if (targets.length && (bareNegatedKey || referencesAnInstruction(tokens) || items.some((i) => i.kind === "retraction" || i.kind === "status"))) {
        invalidate(bareNegatedKey ? "prohibited" : "withdrawn", "explicit_withdrawal", targets);
        if (bareNegatedKey) targets.forEach((key) => prohibited.add(key));
        say(bareNegatedKey ? "prohibition" : "withdrawal", "explicit_withdrawal");
      } else if (!keys.length && referencesAnInstruction(tokens) && items.some((i) => i.kind === "status") && !items.some((i) => i.kind === "negation" || i.kind === "retraction")) {
        invalidate("superseded", "menu_superseded"); generation++; say("menu_boundary", "menu_superseded");
      } else { say("ambiguous", "withdrawal_scope_uncertain"); barrier("withdrawal_scope_uncertain"); }
    } else if (extracted.candidates.length) {
      const parserProhibition = parseMenu(canonicalSpeech(trim)).issues.some((i) => ["non_instruction", "mixed_clause", "sequence_required", "multi_digit_prompt", "conflicting_digit", "conflicting_label"].includes(i));
      const uncovered = items.filter((i) => !["press", "negated_press", "filler"].includes(i.kind) && !(i.kind === "negation" && extracted.candidates.some((c) => c.negated)) && !extracted.candidates.some((c) => c.descriptionSpan && i.start >= c.descriptionSpan[0] && i.end <= c.descriptionSpan[1] || i.start === c.digitSpan[0] && i.end === c.digitSpan[1]));
      const unaccountedSpeech = !isCourtesyOnly(uncovered.flatMap((i) => tokenize(trim.slice(i.start, i.end))));
      if (extracted.sequenceRequired || extracted.inputRequested || extracted.structureUnclear || extracted.conflicting || warning || unaccountedSpeech || parserProhibition || items.some((i) => i.kind === "condition")) {
        say("ambiguous", "offer_structure_or_scope_uncertain"); barrier("offer_structure_or_scope_uncertain");
      }
    } else if (detectHold(trim) || items.some((i) => i.kind === "signal" && (i.value === "please hold" || i.value === "all agents are busy"))) {
      invalidate("superseded", "hold_ends_menu"); say("hold", "hold_ends_menu");
    } else if (items.length && (isCourtesyOnly(tokens) || items.every((i) => i.kind === "filler"))) {
      // Existing courtesy parser only: no new greeting/announcement dictionary.
      say("greeting", "understood_courtesy");
    } else if (analyze(trim).facets.action.has("return") && !items.some((i) => i.kind === "press" || i.kind === "negated_press")) {
      invalidate("superseded", "navigation_boundary"); generation++; say("menu_boundary", "navigation_boundary");
    } else {
      say("information", "uninterpreted_non_offer"); say("ambiguous", "uninterpreted_non_offer"); barrier("uninterpreted_non_offer");
    }
    for (const candidate of extracted.candidates) {
      if (result.offers.length >= MAX_OFFERS) { barrier("offer_limit"); break; }
      const offer: AuthorizedOffer = { ...candidate, id: result.offers.length, clauseId: clause.id, generation, sourceSpan: [start, end], digitSpan: [start + candidate.digitSpan[0], start + candidate.digitSpan[1]], descriptionSpan: candidate.descriptionSpan ? [start + candidate.descriptionSpan[0], start + candidate.descriptionSpan[1]] : null, status: "authorized", reason: "observed_actionable_offer" };
      result.offers.push(offer);
      if (quarantine) { offer.status = quarantine; offer.reason = result.reason; }
      else if (candidate.negated || prohibited.has(candidate.digit)) {
        prohibited.add(candidate.digit);
        invalidate("prohibited", "explicit_prohibition", [candidate.digit]); offer.status = "prohibited"; offer.reason = "explicit_prohibition"; say("prohibition", offer.reason);
      } else if (!candidate.description || !candidate.descriptionSpan || candidate.promotional || candidate.addressedToHelper) {
        barrier("unlabelled_or_non_authoritative_offer"); offer.status = "ambiguous"; offer.reason = "unlabelled_or_non_authoritative_offer";
      } else {
        const old = active.get(candidate.digit);
        const sameLabelOtherKey = [...active.values()].some((o) => o.digit !== candidate.digit && o.description.toLowerCase() === candidate.description.toLowerCase());
        if (old && old.description.toLowerCase() !== candidate.description.toLowerCase() || sameLabelOtherKey) {
          barrier("conflicting_current_offers"); offer.status = "ambiguous"; offer.reason = "conflicting_current_offers";
        } else if (old) { offer.status = "duplicate"; offer.reason = "identical_current_offer"; }
        else if (active.size >= MAX_ACTIVE) { barrier("active_option_limit"); offer.status = "ambiguous"; offer.reason = "active_option_limit"; }
        else {
          active.set(offer.digit, offer);
          if (result.clauses.at(-1)?.roles.some((r) => r === "withdrawal" || r === "prohibition")) say("correction", "explicit_new_offer_after_withdrawal");
          say(candidate.kind === "replay" || candidate.kind === "back" ? "navigation" : candidate.kind === "language" ? "language" : "offer", offer.reason);
        }
      }
    }
    clause.activeAfter = [...active.values()].map((o) => o.id);
    result.clauses.push(clause);
  }
  result.active = quarantine ? [] : [...active.values()];
  result.blocked = quarantine !== undefined;
  if (quarantine) result.scope = quarantine;
  if (!result.blocked) result.reason = result.active.length ? "authorized_current_offers" : "no_current_offer";
  return result;
}
