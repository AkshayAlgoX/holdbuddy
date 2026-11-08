import type { DtmfDigit, MenuOption } from "./contracts.js";
import { amendmentSubject, announcesOptionsChanged, isCourtesyOnly, isUnattributedQualifier, retractsAnInstruction, type Meaning } from "./goal-matcher.js";
import { digitFromToken, findPhrase, isMultiDigitNumber, splitSentences, tokenize } from "./text.js";

export type MenuIssue =
  | "unlabeled_option"
  | "ambiguous_structure"
  | "mixed_clause"
  | "retracted_instruction"
  | "sequence_required"
  | "non_instruction"
  | "multi_digit_prompt"
  | "conflicting_digit"
  | "conflicting_label";

export interface ParsedMenu {
  options: MenuOption[];
  issues: MenuIssue[];
  inputRequested: boolean;
  /** Topics that a sentence with no instruction said have changed. */
  amendments: Meaning[];
}

const words = (text: string) => new Set(tokenize(text));

/** Verbs that usually follow the digit in Hindi: "तीन दबाएं", "3 dabayein". */
const DIGIT_FIRST = words(`दबाएं दबाए दबाये दबायें दबाइए दबाइये दबाओ dabaye dabayein dabayen dabaen dabaein dabaiye
  dabaaiye dabao प्रेस डायल चुनें chunein chune chuniye`);
/** Words that usually precede the digit: "press 3", but Hinglish also says "3 press karein". */
const DIGIT_AFTER_OR_BEFORE = words("press dial select choose");
/** Words that are always followed by the digit: "option 3". */
const DIGIT_ALWAYS_AFTER = words("option विकल्प vikalp ऑप्शन");
const FILLERS = words(`karein karen karo kare kijiye करें करे करो कीजिए कृपया please kripya the key button बटन number नंबर
  ka का ki की par पर on digit डिजिट`);
const NEGATIONS = words(`not dont never mat मत nahi nahin नहीं na न except excluding without than alawa अलावा छोड़कर chhodkar
  bina बिना`);
/** Fixed phrases describing a fault, in which the negative word does not negate the option. */
const FAULT_PHRASES = ["not working", "isnt working", "nahi chal raha", "नहीं चल रहा", "काम नहीं कर रहा"].map(tokenize);
/** Digit words that are also everyday words, so they may begin a label: "ek naya connection". */
const COMMON_WORD_DIGITS = new Set(["do", "ek", "एक"]);
const INPUT_WORDS = words("enter type दर्ज darj डालें daalein dalein टाइप");
/** A single digit can't satisfy these, so any instruction in the sentence is refused. */
const SEQUENCE_WORDS = words("followed twice thrice times baar बार then phir फिर");
/** These describe an instruction instead of giving one. */
const NON_INSTRUCTION_WORDS = words(`example instance sample recording quote says said ignore instructions override simulator system
  assistant answer उदाहरण udaharan`);
/**
 * "The following two sentences are a sample." may describe any number of later sentences, so
 * everything after it in the prompt is treated as a description.
 */
const INTRODUCES_NON_INSTRUCTION = words("example sample samples following advertisement sponsored उदाहरण udaharan");
/** Reuse existing source-authority cues in the ordered discourse pass. */
export const describesInstructions = (tokens: readonly string[]) => tokens.some((t) => NON_INSTRUCTION_WORDS.has(t) || INTRODUCES_NON_INSTRUCTION.has(t));
const AFTER_MARKERS = words("for to if agar अगर when जब");
/** Only function words. Anything carrying meaning stays in the label, to be judged. */
const LABEL_NOISE = words(`for to if agar अगर to तो when जब ke के liye लिए vaste वास्ते hetu हेतु the a an you your want wish would
  like please kripya कृपया ko को se से aap आप apne अपने chahte चाहते chahti चाहती hain हैं hai है ho हो is are
  thanks thankyou thank dhanyavaad dhanyawad धन्यवाद`);
const EDGE_CONNECTORS = words("and aur और or ya या");
/** Inside a label these carry meaning: "plan for an upgrade" isn't "plan upgrade". */
const RELATION_WORDS = words("for to");

interface Anchor {
  digit: DtmfDigit;
  start: number;
  end: number;
  negated: boolean;
}

/** A copy of the tokens in which fault phrases can't be mistaken for negation. */
function withoutFaultPhrases(tokens: string[]): string[] {
  const masked = [...tokens];
  for (const phrase of FAULT_PHRASES) {
    for (let at = findPhrase(masked, phrase); at !== -1; at = findPhrase(masked, phrase, at + 1)) {
      phrase.forEach((_, offset) => (masked[at + offset] = ""));
    }
  }
  return masked;
}

/** "फिर से" means "again", not a following step. */
const findRepeatPhrase = (tokens: string[]) => [["फिर", "से"], ["phir", "se"]].some((phrase) => findPhrase(tokens, phrase) !== -1);

function searchDigit(tokens: string[], from: number, step: 1 | -1, used: Set<number>) {
  for (let i = from, skipped = 0; i >= 0 && i < tokens.length && skipped <= 3; i += step, skipped += 1) {
    const token = tokens[i]!;
    const digit = digitFromToken(token);
    if (digit && !used.has(i)) return { digit, index: i, multiDigit: false };
    if (isMultiDigitNumber(token)) return { multiDigit: true as const };
    if (!FILLERS.has(token) && !DIGIT_ALWAYS_AFTER.has(token) && !NEGATIONS.has(token)) break;
  }
  return undefined;
}

function isNegated(tokens: string[], first: number, last: number): boolean {
  const masked = withoutFaultPhrases(tokens);
  const window = masked.slice(Math.max(0, first - 3), last + 4);
  return window.some((token) => NEGATIONS.has(token));
}

function findAnchors(tokens: string[], issues: Set<MenuIssue>): Anchor[] {
  const anchors: Anchor[] = [];
  const used = new Set<number>();

  const add = (digit: DtmfDigit, a: number, b: number) => {
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    anchors.push({ digit, start, end, negated: isNegated(tokens, start, end) });
  };

  tokens.forEach((token, i) => {
    const digitFirst = DIGIT_FIRST.has(token);
    const either = DIGIT_AFTER_OR_BEFORE.has(token);
    const alwaysAfter = DIGIT_ALWAYS_AFTER.has(token);
    if (!digitFirst && !either && !alwaysAfter) return;

    const after = searchDigit(tokens, i + 1, 1, used);
    const before = alwaysAfter ? undefined : searchDigit(tokens, i - 1, -1, used);
    const chosen = digitFirst ? (before ?? after) : (after ?? before);
    if (chosen?.multiDigit) {
      issues.add("multi_digit_prompt");
      return;
    }
    let plainWordBefore: number | undefined;
    if (either && after && before && !after.multiDigit && !before.multiDigit) {
      // "do press 1" is ordinary English; "1 press 2" has no single reading.
      const beforeIsPlainWord = tokens[before.index!] === "do" || tokens[before.index!] === "ek";
      if (beforeIsPlainWord) plainWordBefore = before.index!;
      else issues.add("ambiguous_structure");
    }
    if (!chosen) return;
    used.add(chosen.index!);
    add(chosen.digit!, chosen.index!, plainWordBefore ?? i);
    if (plainWordBefore !== undefined) anchors.at(-1)!.end = Math.max(anchors.at(-1)!.end, i);
  });

  // "1 for billing", with no verb.
  tokens.forEach((token, i) => {
    const digit = digitFromToken(token);
    if (digit && !used.has(i) && tokens[i + 1] === "for" && token !== "do" && token !== "ek") {
      used.add(i);
      add(digit, i, i);
    }
  });
  return anchors.sort((a, b) => a.start - b.start);
}

/** A digit touching a label, as in "दो या तीन दबाएं", means the prompt names more than one digit. */
function hasStrayDigit(label: string): boolean {
  const tokens = label.split(" ").filter(Boolean);
  const first = tokens[0];
  const last = tokens.at(-1);
  if (last !== undefined && digitFromToken(last)) return true;
  return first !== undefined && digitFromToken(first) !== undefined && !COMMON_WORD_DIGITS.has(first);
}

function cleanLabel(tokens: string[]): string {
  const kept = tokens.filter(
    (token) =>
      (RELATION_WORDS.has(token) || !LABEL_NOISE.has(token)) && !FILLERS.has(token) && !DIGIT_FIRST.has(token) &&
      !DIGIT_AFTER_OR_BEFORE.has(token) && !DIGIT_ALWAYS_AFTER.has(token),
  );
  const isEdgeWord = (token: string) => EDGE_CONNECTORS.has(token) || RELATION_WORDS.has(token);
  while (kept.length > 0 && isEdgeWord(kept[0]!)) kept.shift();
  while (kept.length > 0 && isEdgeWord(kept.at(-1)!)) kept.pop();
  return kept.join(" ");
}

function startsWithAfterMarker(tokens: string[]): boolean {
  const first = tokens.find((token) => !["and", "aur", "और", "or", "ya", "या", "then"].includes(token));
  return first !== undefined && AFTER_MARKERS.has(first);
}

/**
 * Assigns the text between digits to digits. The direction must be clear from the sentence: a wrong
 * guess would shift every label by one and press a confidently wrong digit, so doubtful sentences are
 * reported as unclear and never parsed by best effort.
 */
function assignLabels(tokens: string[], anchors: Anchor[], issues: Set<MenuIssue>): MenuOption[] {
  const gaps: string[][] = [];
  let cursor = 0;
  for (const anchor of anchors) {
    gaps.push(tokens.slice(cursor, anchor.start));
    cursor = anchor.end + 1;
  }
  gaps.push(tokens.slice(cursor));

  const labels = gaps.map(cleanLabel);
  const firstEmpty = labels[0] === "";
  const lastEmpty = labels.at(-1) === "";
  let direction: "before" | "after" | undefined;
  if (firstEmpty && !lastEmpty) direction = "after";
  else if (!firstEmpty && lastEmpty) direction = "before";
  else if (!firstEmpty && !lastEmpty && !startsWithAfterMarker(gaps[0]!) && gaps.slice(1).every(startsWithAfterMarker)) {
    // The first gap is an introduction: "welcome, press 1 for billing". It must carry no information.
    if (!isCourtesyOnly(gaps[0]!)) {
      issues.add("mixed_clause");
      return [];
    }
    direction = "after";
  }

  if (!direction) {
    issues.add(firstEmpty && lastEmpty ? "unlabeled_option" : "ambiguous_structure");
    return [];
  }
  const options: MenuOption[] = [];
  anchors.forEach((anchor, i) => {
    const label = labels[direction === "before" ? i : i + 1]!;
    if (label === "") issues.add("unlabeled_option");
    else if (hasStrayDigit(label)) issues.add("ambiguous_structure");
    else options.push({ digit: anchor.digit, label, excluded: anchor.negated });
  });
  return options;
}

/** Extracts what the speech announced. It knows no menus; everything comes from the transcript. */
export function parseMenu(transcript: string): ParsedMenu {
  const issues = new Set<MenuIssue>();
  const found: MenuOption[] = [];
  const amendments: Meaning[] = [];
  let inputRequested = false;
  let inDescribedSection = false;

  // A punctuated opening courtesy is separate from the first Hindi label. Keep all other context.
  const withoutGreeting = transcript.replace(/^\s*(?:namaste|नमस्ते)\s*,\s*/iu, "");
  for (const sentence of splitSentences(withoutGreeting)) {
    const tokens = tokenize(sentence);
    if (tokens.some((token) => INPUT_WORDS.has(token))) {
      inputRequested = true;
      continue;
    }
    const anchors = findAnchors(tokens, issues);
    if (anchors.length === 0) {
      // "2 बार दबाएं": a press instruction that needs more than one press, whatever the wording around it.
      const isPressInstruction = tokens.some((token) => DIGIT_FIRST.has(token) || DIGIT_AFTER_OR_BEFORE.has(token));
      if (isPressInstruction && tokens.some((token) => SEQUENCE_WORDS.has(token)) && !findRepeatPhrase(tokens)) {
        issues.add("sequence_required");
        continue;
      }
      inDescribedSection ||= tokens.some((token) => INTRODUCES_NON_INSTRUCTION.has(token));
      if (retractsAnInstruction(tokens)) issues.add("retracted_instruction");
      const amendment = amendmentSubject(tokens);
      if (amendment) amendments.push(amendment);
      else if (isUnattributedQualifier(tokens) && !(found.length === 0 && announcesOptionsChanged(tokens))) issues.add("mixed_clause");
      continue;
    }
    if (inDescribedSection || tokens.some((token) => NON_INSTRUCTION_WORDS.has(token))) {
      issues.add("non_instruction");
      continue;
    }
    if (tokens.some((token) => SEQUENCE_WORDS.has(token)) && !findRepeatPhrase(tokens)) {
      issues.add("sequence_required");
      continue;
    }
    found.push(...assignLabels(tokens, anchors, issues));
  }

  const options: MenuOption[] = [];
  for (const option of found) {
    const sameDigit = options.find((other) => other.digit === option.digit);
    const sameLabel = options.find((other) => other.label === option.label);
    // Only an identical instruction is a repeat. "Press 4" and "do not press 4" contradict each other.
    if (sameDigit && sameDigit.label === option.label && sameDigit.excluded === option.excluded) continue;
    if (sameDigit) issues.add("conflicting_digit");
    if (sameLabel) issues.add("conflicting_label");
    options.push(option);
  }
  return { options, issues: [...issues], inputRequested, amendments };
}
