import type { AbstainReason, MenuDecision, MenuOption, PreferredLanguage } from "./contracts.js";
import { evaluateOption, goalHasNegation, goalHasStateQualifier, goalMeaning, isGoalUnderstood, type Meaning, type OptionEvaluation } from "./goal-matcher.js";
import type { MenuIssue, ParsedMenu } from "./menu-parser.js";

export interface PolicyInput {
  goalTexts: readonly string[];
  preferredLanguage?: PreferredLanguage;
}

/** Decides from extracted options only. A press needs one clear winner that earned it. */
export function decideFromOptions(
  input: PolicyInput,
  options: readonly MenuOption[],
  amendments: readonly Meaning[] = [],
): MenuDecision {
  if (input.goalTexts.some(goalHasNegation)) {
    return { kind: "clarify", reason: "goal_contains_negation", candidates: [...options] };
  }
  const goal = goalMeaning(input.goalTexts, input.preferredLanguage);
  if (!isGoalUnderstood(goalMeaning(input.goalTexts))) {
    const languageMenu = input.preferredLanguage && isGoalUnderstood(goal);
    if (!languageMenu) return { kind: "clarify", reason: "goal_not_understood", candidates: [...options] };
  }

  // Outside the supported vocabulary: refuse rather than match part of what was asked.
  if (goalHasStateQualifier(goalMeaning(input.goalTexts))) {
    return { kind: "clarify", reason: "goal_not_understood", candidates: [...options] };
  }

  const evaluations: OptionEvaluation[] = options.map((option) => evaluateOption(goal, option, amendments));
  const blocked = evaluations.find((evaluation) => evaluation.kind === "blocked");
  if (blocked?.kind === "blocked") return { kind: "abstain", reason: blocked.reason };

  const matches = evaluations
    .filter((evaluation) => evaluation.kind === "match")
    .sort((a, b) => b.score - a.score);
  const [top, second] = matches;
  if (!top) {
    const mismatches = evaluations.filter((evaluation) => evaluation.kind === "action_mismatch");
    if (mismatches.some((evaluation) => evaluation.combined)) return { kind: "abstain", reason: "combined_actions" };
    return { kind: "abstain", reason: mismatches.length > 0 ? "action_mismatch" : "no_matching_option" };
  }
  if (second && second.score === top.score) {
    return {
      kind: "clarify",
      reason: "ambiguous_options",
      candidates: matches.filter(({ score }) => score === top.score).map(({ option }) => option),
    };
  }
  if (top.actionFit === "unspecified") {
    // The option does something specific, and the user hasn't said they want that.
    return { kind: "clarify", reason: "action_unclear", candidates: [top.option] };
  }
  return {
    kind: "press",
    digit: top.option.digit,
    label: top.option.label,
    score: top.score,
    basis: top.basis,
    alternatives: matches.length - 1,
  };
}

const ISSUE_REASONS: Array<[MenuIssue, AbstainReason]> = [
  ["conflicting_digit", "conflicting_options"],
  ["conflicting_label", "conflicting_options"],
  ["sequence_required", "sequence_required"],
  ["non_instruction", "non_instruction"],
  ["retracted_instruction", "retracted_instruction"],
  ["mixed_clause", "mixed_clause"],
  ["unlabeled_option", "menu_structure_unclear"],
  ["ambiguous_structure", "menu_structure_unclear"],
  ["multi_digit_prompt", "menu_structure_unclear"],
];

export function decideFromMenu(input: PolicyInput, menu: ParsedMenu): MenuDecision {
  if (menu.inputRequested) return { kind: "abstain", reason: "input_requested" };
  for (const [issue, reason] of ISSUE_REASONS) {
    if (menu.issues.includes(issue)) return { kind: "abstain", reason };
  }
  const decision = decideFromOptions(input, menu.options, menu.amendments);
  // A clarification answer is judged later from the options alone, without these amendments.
  if (decision.kind === "clarify" && menu.amendments.length > 0) return { kind: "abstain", reason: "amended_option" };
  return decision;
}
