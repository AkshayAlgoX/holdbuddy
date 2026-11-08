/**
 * Finds what the speech offers, without judging what any description means. Unfamiliar wording is
 * still extracted, with its exact place in the transcript. A digit counts only as the object of a press
 * instruction, so a price, a date or a phone number can never become a choice.
 */
import { itemize, scanClauses, scanWithElidedVerbs, type Clause, type Item } from "./canonicalize.js";
import { LANGUAGE_NAMES, type LanguageCode } from "./packs.js";
import { analyze, goalHasStateQualifier, referencesAnInstruction, retractsAnInstruction } from "../goal-matcher.js";
import { tokenize } from "../text.js";

const CODE_BY_ENGLISH = new Map(Object.entries(LANGUAGE_NAMES).map(([code, name]) => [name.english, code as LanguageCode]));

export type CandidateKind = "choice" | "replay" | "back" | "language";

export interface ExtractedCandidate {
  /** Position in the speech. A ranker refers to this, and never sees the digit. */
  id: number;
  digit: string;
  description: string;
  /** Offsets into the original transcript. */
  descriptionSpan: [number, number] | null;
  digitSpan: [number, number];
  negated: boolean;
  kind: CandidateKind;
  language?: LanguageCode;
  /** Spoken in the same sentence as words addressed to the helper. */
  addressedToHelper: boolean;
  /** Spoken with advertising wording. */
  promotional: boolean;
}

export interface ExtractedMenu {
  candidates: ExtractedCandidate[];
  /** Spoken warnings that make the whole prompt unsafe to act on without a person. */
  retracted: boolean;
  amended: boolean;
  addressedToHelper: boolean;
  /** Described examples and advertisements cannot supply executable instructions. */
  nonActionContext: boolean;
  inputRequested: boolean;
  sequenceRequired: boolean;
  /** One press word with two digits, or a number that isn't a single key. */
  structureUnclear: boolean;
  conflicting: boolean;
}

const PRESSABLE = /^([0-9]|\*|#)$/;

function kindOf(label: readonly Item[]): { kind: CandidateKind; language?: LanguageCode } {
  const languages = new Set(label.filter(({ kind }) => kind === "language_name").map(({ value }) => value));
  const concepts = label.filter(({ kind }) => kind === "concept");
  const unknown = label.filter(({ kind }) => kind === "unknown").length;
  if (languages.size === 1 && concepts.length === 0 && unknown <= 4) {
    const language = CODE_BY_ENGLISH.get([...languages][0]!);
    if (language) return { kind: "language", language };
  }
  if (concepts.some(({ value }) => value === "repeat")) return { kind: "replay" };
  if (concepts.some(({ value }) => value === "return" || value === "main menu")) return { kind: "back" };
  return { kind: "choice" };
}

const ENGLISH_CONTROL = /\b(repeat|again|back|previous|main menu)\b/i;

export function extractOptions(transcript: string): ExtractedMenu {
  const menu: ExtractedMenu = { candidates: [], retracted: false, amended: false, addressedToHelper: false, nonActionContext: false, inputRequested: false, sequenceRequired: false, structureUnclear: false, conflicting: false };
  const sentences = [...transcript.matchAll(/[^.।॥!?;\n]+/gu)].map((sentence) => itemize(sentence[0], sentence.index));
  for (const items of sentences) {
    const hasLocalPress = scanClauses(items).clauses.length > 0;
    const { clauses, rest } = hasLocalPress ? scanWithElidedVerbs(items) : scanClauses(items);
    const hasSpoof = items.some(({ kind }) => kind === "spoof");
    menu.addressedToHelper ||= hasSpoof;
    // Advertising scope survives sentence punctuation. A following "menu" is still part of the
    // advertisement; its embedded press instructions cannot authorize navigation.
    menu.nonActionContext ||= items.some(({ kind, value }) => kind === "signal" && value === "limited time offer");
    menu.nonActionContext ||= /\b(example|sample|quoted?|advertisement|sponsored|promotion|promotional)\b/i.test(transcript.slice(items[0]?.start ?? 0, items.at(-1)?.end ?? 0));
    menu.sequenceRequired ||= clauses.length > 0 && items.some(({ kind }) => kind === "sequence");
    // Words like "enter" also mean "register", so they only count without a press instruction.
    menu.inputRequested ||= clauses.length === 0 && items.some(({ kind }) => kind === "input");
    // Retraction describes an instruction, not a problem mentioned inside an actionable label.
    // "Dispute an incorrect charge" is not "that instruction is incorrect". Warnings outside labels,
    // warnings referring to an option, and trailing invalidation words remain absolute prohibitions.
    const labelItems = new Set(clauses.flatMap(({ label }) => label));
    menu.retracted ||= items.some((item) => item.kind === "retraction" && !labelItems.has(item));
    const outside = items.filter((item) => !labelItems.has(item)).map((item) => transcript.slice(item.start, item.end)).join(" ");
    menu.retracted ||= retractsAnInstruction(tokenize(outside));
    for (const { label } of clauses) {
      if (!label.some(({ kind }) => kind === "retraction")) continue;
      const text = label.map((item) => transcript.slice(item.start, item.end)).join(" ");
      menu.retracted ||= referencesAnInstruction(tokenize(text)) || label.filter(({ kind }) => kind !== "filler").at(-1)?.kind === "retraction" || goalHasStateQualifier(analyze(text));
    }
    // "Not 9, press 0" leaves a negated digit outside the new clause. Its missing label must never
    // make the earlier mapping available to assistance. Corrections currently require clarification.
    menu.retracted ||= rest.some(({ kind }) => kind === "negation") && rest.some(({ digit }) => digit !== undefined);
    if (clauses.length === 0) {
      menu.amended ||= rest.some(({ kind }) => kind === "status");
      continue;
    }
    const promotional = items.some(({ kind, value }) => kind === "signal" && value === "limited time offer");
    for (const clause of clauses) addCandidate(menu, clause, transcript, hasSpoof, promotional);
  }
  const seen = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const candidate of menu.candidates) {
    const key = candidate.description.toLowerCase();
    const earlier = seen.get(candidate.digit);
    const instruction = `${candidate.negated}:${key}`;
    if (earlier !== undefined && earlier !== instruction) menu.conflicting = true;
    if (key !== "" && labels.has(key) && labels.get(key) !== candidate.digit) menu.conflicting = true;
    seen.set(candidate.digit, instruction);
    labels.set(key, candidate.digit);
  }
  return menu;
}

function addCandidate(menu: ExtractedMenu, clause: Clause, transcript: string, addressedToHelper: boolean, promotional: boolean): void {
  if (clause.ambiguousWith !== undefined || !PRESSABLE.test(clause.digit)) {
    menu.structureUnclear = true;
    return;
  }
  // A number inside a description means two digits were named for one thing: "৯ নয়, ০ চাপুন".
  if (clause.label.some((word) => word.kind === "number" && word.digit !== undefined)) menu.structureUnclear = true;
  // With only filler, such as "now", nothing says what the option is.
  const hasContent = clause.label.some(({ kind }) => kind !== "filler" && kind !== "press" && kind !== "negated_press" && kind !== "negation");
  const span: [number, number] | null = clause.label.length && hasContent ? [clause.label[0]!.start, clause.label.at(-1)!.end] : null;
  const description = span ? transcript.slice(span[0], span[1]).trim() : "";
  const typed = kindOf(clause.label);
  const kind = typed.kind === "choice" && ENGLISH_CONTROL.test(description) ? (/repeat|again/i.test(description) ? "replay" : "back") : typed.kind;
  menu.candidates.push({
    id: menu.candidates.length,
    digit: clause.digit,
    description,
    descriptionSpan: span,
    digitSpan: [clause.digitItem.start, clause.digitItem.end],
    negated: clause.negated,
    kind,
    ...(typed.language ? { language: typed.language } : {}),
    addressedToHelper,
    promotional,
  });
}

export type LanguageMenuDecision = { kind: "press"; digit: string; label: string } | { kind: "abstain"; reason: "language_preference_unknown" | "language_not_offered" | "language_option_negated" };

/**
 * A menu that only offers languages. The answer comes from the user's stated preference alone. The
 * language of the goal and the language the IVR is speaking don't count as a preference.
 */
export function decideLanguageMenu(menu: ExtractedMenu, preferred: LanguageCode | undefined): LanguageMenuDecision | undefined {
  const offers = menu.candidates.filter(({ kind }) => kind !== "replay" && kind !== "back");
  if (offers.length === 0 || offers.some(({ kind }) => kind !== "language")) return undefined;
  if (menu.retracted || menu.amended || menu.addressedToHelper || menu.nonActionContext || menu.conflicting || menu.structureUnclear || menu.sequenceRequired || menu.inputRequested) return { kind: "abstain", reason: "language_option_negated" };
  if (preferred === undefined) return { kind: "abstain", reason: "language_preference_unknown" };
  const matching = offers.filter(({ language }) => language === preferred);
  if (matching.length === 0) return { kind: "abstain", reason: "language_not_offered" };
  const digits = new Set(matching.map(({ digit }) => digit));
  const chosen = matching[0]!;
  if (matching.some(({ negated }) => negated)) return { kind: "abstain", reason: "language_option_negated" };
  if (digits.size !== 1) return { kind: "abstain", reason: "language_not_offered" };
  return { kind: "press", digit: chosen.digit, label: LANGUAGE_NAMES[preferred].english };
}
