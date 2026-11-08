/** Independent of embedding scores: an unknown operation is not permission to act. */
import { analyze, compareOperations, goalHasNegation, goalHasStateQualifier, type Meaning, type OperationFrame } from "../goal-matcher.js";
import { canonicalGoal, itemize } from "./canonicalize.js";

/** Word-level operation families, not menu sentences or digit mappings. Relations remain in order. */
function semanticWords(text: string): string {
  return canonicalGoal(text)
    .replace(/\bgrievances?\b/gi, "complaint")
    .replace(/\b(disputes?|disputed|complaints?)\b/gi, "complaint")
    .replace(/\b(remit|remitting|remittance|remittances)\b/gi, "payment")
    .replace(/\b(reimburse|reimbursement|reimbursements|reimbursed)\b/gi, "refund")
    .replace(/\b(troubleshooting|troubleshoot|connectivity)\b/gi, "technical")
    .replace(/\b(statements?|invoices?)\b/gi, "bill")
    .replace(/\b(charges?|dues)\b/gi, "bill")
    .replace(/\b(details|information|enquiries|inquiries)\b/gi, "information");
}

function operation(frame: OperationFrame): OperationFrame {
  const copy = { ...frame, actedOn: new Set(frame.actedOn), subjects: new Set(frame.subjects), services: new Set(frame.services) };
  // A payment being complained about/refunded is a financial object, not a second payment command.
  // Keep nested operations intact for cancel/stop/confirm/inform: cancelling a payment is not paying.
  if ((copy.action === "complaint" || copy.action === "refund") && copy.actedOn.has("pay")) {
    copy.actedOn.delete("pay");
    copy.subjects.add("billing");
    if (copy.object === "pay") copy.object = "billing";
  }
  return copy;
}

function meaning(text: string): Meaning {
  const parsed = analyze(semanticWords(text));
  return { ...parsed, frames: parsed.frames.map(operation) };
}

const intent = (frame: OperationFrame) => frame.action ?? (frame.subjects.has("balance") ? "inform" : frame.subjects.has("technical") ? "technical" : frame.subjects.has("new_connection") ? "new" : undefined);
const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((value) => b.has(value));

/**
 * Positive evidence of a compatible operation AND object is needed before scoring. Unknown nouns may
 * be resolved by similarity only inside that boundary; an unknown action cannot. This intentionally
 * refuses unfamiliar domains and compound requests the frame parser cannot independently establish.
 */
export function explainSemanticEligibility(goalText: string, description: string): string {
  if (itemize(description).some(({ kind, value }) => kind === "spoof" || kind === "retraction" || (kind === "signal" && value === "limited time offer"))) return "unsafe_description";
  const goal = meaning(goalText), offered = meaning(description);
  if (goalHasNegation(semanticWords(goalText)) || goalHasStateQualifier(goal)) return "goal_qualifier";
  if (goalHasStateQualifier(offered)) return "option_qualifier";
  if (goal.frames.length !== offered.frames.length) return "frame_count";
  const remaining = [...goal.frames];
  for (const choice of offered.frames) {
    let reason = "operation_conflict";
    const match = remaining.findIndex((wanted) => {
      const wantedIntent = intent(wanted), offeredIntent = intent(choice);
      if (wantedIntent === undefined || offeredIntent === undefined) { reason = "unknown_operation"; return false; }
      // No score may turn an ambiguous bill goal into a transaction, or a transaction into information.
      if (wantedIntent !== offeredIntent) { reason = "intent_mismatch"; return false; }
      const sharedObject = overlaps(wanted.subjects, choice.subjects) || overlaps(wanted.services, choice.services) || overlaps(wanted.actedOn, choice.actedOn);
      // Naming the same action alone (e.g. "refund") doesn't identify what it acts on.
      if (!sharedObject) { reason = "no_shared_object"; return false; }
      const one = { ...goal, frames: [wanted] }, two = { ...offered, frames: [choice] };
      return compareOperations(one, two) === "exact";
    });
    if (match === -1) return reason;
    remaining.splice(match, 1);
  }
  return "eligible";
}

export function semanticEligible(goalText: string, description: string): boolean {
  return explainSemanticEligibility(goalText, description) === "eligible";
}

/** A veto only. Missing lexical frames do not approve a choice or prevent a learned interpretation. */
export function knownOperationConflict(goalText: string, description: string): boolean {
  const goal = meaning(goalText), offered = meaning(description);
  if (!goal.frames.every((frame) => intent(frame) !== undefined) || !offered.frames.every((frame) => intent(frame) !== undefined)) return false;
  return compareOperations(goal, offered) === "no";
}
