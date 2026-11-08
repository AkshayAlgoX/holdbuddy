/**
 * Turns speech in any supported language or mix into plain concept words, in the order they were said.
 * The core's parser and matcher then judge that text, so negation, action and object rules live in one
 * place. Words it doesn't recognise are kept, so the matcher can refuse them. Nothing here picks a digit.
 */
import { CONCEPTS, HASTE_WORDS, LANGUAGE_CODES, LANGUAGE_NAMES, LIST_JOINERS, PACKS, PRESS_STEMS, RETRACTION_STEMS, SIGNALS, SPOOF_WORDS, type LanguageCode } from "./packs.js";

const NATIVE_DIGIT_BLOCKS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

/** Spellings STT varies on: nuktas, nasal marks, joiners and native numerals. */
export function normalizeForLookup(text: string): string {
  let out = text.normalize("NFKC").toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\u0901/g, "\u0902").replace(/[\u093c\u09bc\u0a3c\u0abc\u0cbc]/g, "").replace(/['’`]/g, "");
  for (const block of NATIVE_DIGIT_BLOCKS) {
    out = out.replace(new RegExp(`[\\u${block.toString(16).padStart(4, "0")}-\\u${(block + 9).toString(16).padStart(4, "0")}]`, "g"), (d) => String(d.charCodeAt(0) - block));
  }
  return out;
}

type Kind = "digit" | "press" | "negated_press" | "negation" | "retraction" | "status" | "condition" | "input" | "sequence" | "concept" | "signal" | "filler" | "language_name" | "spoof";
interface Entry { kind: Kind; value: string; language: LanguageCode; }

export interface SpanToken { text: string; start: number; end: number; }

/** Words with their offsets in the original speech. A number or Latin word glued to another script is two words. */
export function spannedTokens(raw: string, base = 0): SpanToken[] {
  const out: SpanToken[] = [];
  for (const word of raw.matchAll(/[\p{L}\p{M}\p{N}\u200b-\u200d'’`]+|[#*]/gu)) {
    for (const piece of word[0].matchAll(/\p{Nd}+|[a-zA-Z'’`]+|[#*]|[^\p{Nd}a-zA-Z#*]+/gu)) {
      const text = normalizeForLookup(piece[0]);
      if (text === "") continue;
      const start = base + word.index + piece.index;
      out.push({ text, start, end: start + piece[0].length });
    }
  }
  return out;
}

const tokensOf = (text: string) => spannedTokens(text).map(({ text: token }) => token);

/** Earlier entries win, so a word that's a concept in one language isn't filler from another. */
const LEXICON = new Map<string, Entry[]>();
const ENDINGS = new Set<string>();
let LONGEST = 1;

function add(phrase: string, kind: Kind, value: string, language: LanguageCode): void {
  const key = tokensOf(phrase).join(" ");
  if (!key) return;
  LONGEST = Math.max(LONGEST, key.split(" ").length);
  LEXICON.set(key, [...(LEXICON.get(key) ?? []), { kind, value, language }]);
}
for (const code of LANGUAGE_CODES) {
  const pack = PACKS[code];
  pack.digits.forEach((forms, digit) => forms.forEach((form) => add(form, "digit", String(digit), code)));
  (pack.star ?? []).forEach((form) => add(form, "digit", "*", code));
  (pack.hash ?? []).forEach((form) => add(form, "digit", "#", code));
  pack.press.forEach((form) => add(form, "press", "press", code));
  (pack.negatedPress ?? []).forEach((form) => add(form, "negated_press", "press", code));
  pack.negation.forEach((form) => add(form, "negation", "not", code));
  pack.retraction.forEach((form) => add(form, "retraction", "invalid", code));
  pack.status.forEach((form) => add(form, "status", "moved", code));
  pack.condition.forEach((form) => add(form, "condition", "already", code));
  pack.input.forEach((form) => add(form, "input", "enter", code));
  pack.sequence.forEach((form) => add(form, "sequence", "twice", code));
  for (const [concept, forms] of Object.entries(pack.concepts)) (forms ?? []).forEach((form) => add(form, "concept", CONCEPTS[concept as keyof typeof CONCEPTS], code));
  for (const [signal, forms] of Object.entries(pack.signals)) (forms ?? []).forEach((form) => add(form, "signal", SIGNALS[signal as keyof typeof SIGNALS], code));
  pack.filler.forEach((form) => add(form, "filler", "", code));
  pack.endings.forEach((form) => ENDINGS.add(normalizeForLookup(form)));
}
for (const [code, name] of Object.entries(LANGUAGE_NAMES)) name.forms.forEach((form) => add(form, "language_name", name.english, code as LanguageCode));
SPOOF_WORDS.forEach((form) => add(form, "spoof", "assistant", "en"));
HASTE_WORDS.forEach((form) => add(form, "filler", "", "en"));
const PRESS_PREFIXES = PRESS_STEMS.map(normalizeForLookup);
const RETRACTION_PREFIXES = RETRACTION_STEMS.map(normalizeForLookup);
const JOINERS = new Set(LIST_JOINERS.map(normalizeForLookup));
const SORTED_ENDINGS = [...ENDINGS].sort((a, b) => b.length - a.length);
const ORDER: readonly Kind[] = ["spoof", "language_name", "negated_press", "press", "negation", "retraction", "status", "input", "sequence", "condition", "signal", "concept", "digit", "filler"];

/** A word means one thing here, or it isn't trusted. Digits are only used next to a press word. */
function pick(entries: readonly Entry[]): Entry | undefined {
  const digits = new Set(entries.filter(({ kind }) => kind === "digit").map(({ value }) => value));
  if (digits.size > 1) return undefined;
  return [...entries].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))[0];
}

export interface Item { kind: Kind | "unknown" | "number"; value: string; digit?: string | undefined; start: number; end: number; /** Comes after a comma or colon. */ afterBreak?: boolean; }

function lookup(token: SpanToken): Item | undefined {
  const { text, start, end } = token;
  const direct = LEXICON.get(text);
  // Consonant-final stems lose their virama before an ending: புகார் + ுக்கு is written புகாருக்கு.
  const stems = (ending: string) => {
    const stem = text.slice(0, -ending.length);
    return [stem, ...["\u0bcd", "\u0c4d", "\u0ccd", "\u0d4d"].map((virama) => stem + virama)];
  };
  const entries = direct ?? SORTED_ENDINGS.flatMap((ending) => (text.length > ending.length && text.endsWith(ending) ? stems(ending).flatMap((stem) => LEXICON.get(stem) ?? []) : [])).filter((entry) => entry.kind === "concept" || entry.kind === "digit" || entry.kind === "language_name");
  if (!entries.length) return undefined;
  const chosen = pick(entries);
  if (!chosen) return undefined;
  const digit = entries.find(({ kind }) => kind === "digit")?.value;
  return { kind: chosen.kind, value: chosen.value, digit, start, end };
}

export function itemize(sentence: string, base = 0): Item[] {
  const tokens = spannedTokens(sentence, base);
  const items: Item[] = [];
  for (let i = 0; i < tokens.length; ) {
    let matched = false;
    for (let length = Math.min(LONGEST, tokens.length - i); length >= 2 && !matched; length -= 1) {
      const entries = LEXICON.get(tokens.slice(i, i + length).map(({ text }) => text).join(" "));
      const chosen = entries && pick(entries);
      if (chosen) {
        items.push({ kind: chosen.kind, value: chosen.value, start: tokens[i]!.start, end: tokens[i + length - 1]!.end });
        i += length;
        matched = true;
      }
    }
    if (matched) continue;
    const token = tokens[i]!;
    i += 1;
    if (/^(\d+|[#*])$/.test(token.text)) items.push({ kind: "number", value: token.text, digit: token.text.length === 1 ? token.text : undefined, start: token.start, end: token.end });
    else if (lookup(token)) items.push(lookup(token)!);
    else if (PRESS_PREFIXES.some((stem) => token.text.startsWith(stem))) items.push({ kind: "press", value: "press", start: token.start, end: token.end });
    else if (RETRACTION_PREFIXES.some((stem) => token.text.startsWith(stem))) items.push({ kind: "retraction", value: "invalid", start: token.start, end: token.end });
    else items.push({ kind: "unknown", value: token.text, start: token.start, end: token.end });
  }
  items.forEach((item, index) => {
    if (index === 0) return;
    const previous = items[index - 1]!;
    if (/[,:،]/.test(sentence.slice(previous.end - base, item.start - base))) item.afterBreak = true;
    // "X के लिए 5 और Y के लिए 6": a joining word right after a number starts the next option.
    if (previous.digit !== undefined && JOINERS.has(normalizeForLookup(sentence.slice(item.start - base, item.end - base)))) item.afterBreak = true;
  });
  return items;
}

const isIgnorable = (item: Item) => item.kind === "filler";
const asLabelWord = (item: Item): string[] => {
  if (item.kind === "filler" || item.kind === "press" || item.kind === "negated_press") return [];
  // A digit word away from a press word is an ordinary word in a label, not a digit.
  if (item.kind === "digit") return [`num${item.value === "*" ? "star" : item.value === "#" ? "hash" : item.value}`];
  return [item.value];
};

/** Finds the digit for a press word, looking through filler only. Refuses to pick between two. */
function digitNear(items: readonly Item[], at: number, step: 1 | -1): number | undefined {
  for (let i = at + step, skipped = 0; i >= 0 && i < items.length && skipped <= 2; i += step, skipped += 1) {
    const item = items[i]!;
    // A word can be a number and something else: Bengali "নয়" is both nine and "not".
    if (item.digit !== undefined) return i;
    if (item.kind === "number") return i;
    if (!isIgnorable(item)) return undefined;
  }
  return undefined;
}

export interface Clause {
  /** A digit, or a longer number that can't be pressed as one. */
  digit: string;
  digitItem: Item;
  label: Item[];
  negated: boolean;
  ambiguousWith?: string;
}

/** Finds press instructions without looking at what their descriptions mean. */
export function scanClauses(items: readonly Item[]): { clauses: Clause[]; rest: Item[] } {
  const clauses: Clause[] = [];
  let start = 0;
  let index = 0;
  while (index < items.length) {
    const item = items[index]!;
    if (item.kind !== "press" && item.kind !== "negated_press") {
      index += 1;
      continue;
    }
    const before = digitNear(items, index, -1);
    const after = digitNear(items, index, 1);
    if (before !== undefined && after !== undefined && before >= start) {
      // "1 press 2" has no single reading. Both digits are kept, and it counts as ambiguous.
      const digitItem = items[before]!;
      clauses.push({ digit: digitItem.digit ?? digitItem.value, digitItem, label: [], negated: false, ambiguousWith: items[after]!.digit ?? items[after]!.value });
      start = after + 1;
      index = start;
      continue;
    }
    const digitAt = before !== undefined && before >= start ? before : after;
    if (digitAt === undefined) {
      index += 1;
      continue;
    }
    const digitItem = items[digitAt]!;
    const verbFirst = digitAt > index;
    const firstOfClause = Math.min(digitAt, index);
    let lastOfClause = Math.max(digitAt, index);
    let negated = item.kind === "negated_press";
    // Negation commonly follows the verb: "அழுத்த வேண்டாம்", "दाबू नका".
    while (items[lastOfClause + 1]?.kind === "negation") {
      negated = true;
      lastOfClause += 1;
    }
    let label = items.slice(start, firstOfClause);
    const lastBreak = label.findLastIndex((word) => word.afterBreak);
    if (lastBreak > 0 && label.slice(lastBreak).some((word) => asLabelWord(word).length > 0)) label = label.slice(lastBreak);
    if (label.at(-1)?.kind === "negation") {
      negated = true;
      label = label.slice(0, -1);
    }
    let nextStart = lastOfClause + 1;
    if (!label.some((word) => asLabelWord(word).length > 0)) {
      // "Press 3 for billing", "೧ ಒತ್ತಿದರೆ ಬ್ಯಾಲೆನ್ಸ್": the label runs up to the next break or instruction.
      let end = items.length;
      for (let scan = lastOfClause + 1; scan < items.length; scan += 1) {
        const word = items[scan]!;
        const nextIsPress = items[scan + 1]?.kind === "press" || items[scan + 1]?.kind === "negated_press";
        if (word.kind === "press" || word.kind === "negated_press" || (!verbFirst && word.digit !== undefined && nextIsPress) || (word.afterBreak && scan > lastOfClause + 1)) {
          end = scan;
          break;
        }
      }
      label = items.slice(lastOfClause + 1, end);
      nextStart = end;
    }
    clauses.push({ digit: digitItem.digit ?? digitItem.value, digitItem, label, negated });
    start = nextStart;
    index = nextStart;
  }
  return { clauses, rest: items.slice(start) };
}

/**
 * A comma list can share a verb: "X के लिए 1, Y के लिए 2, Z के लिए 3 दबाएँ". Require a real press
 * instruction in THIS sentence and a relation such as "for" on each elided option. Do not extend the
 * verb to a standalone sentence ending in a digit; that could be an announcement or advertisement.
 */
export function scanWithElidedVerbs(items: readonly Item[]): { clauses: Clause[]; rest: Item[] } {
  const explicit = scanClauses(items);
  if (explicit.clauses.length === 0) return explicit;
  const segments: Item[][] = [];
  for (const item of items) {
    if (item.afterBreak || segments.length === 0) segments.push([]);
    segments.at(-1)!.push(item);
  }
  // Parse explicit instructions before interpreting commas as list boundaries. In "For X, press 3"
  // the comma joins a label to its verb; splitting first would erase the label and invent an empty one.
  const clauses: Clause[] = [...explicit.clauses];
  const used = new Set<Item>();
  for (const segment of segments) {
    if (segment.some(({ kind }) => kind === "press" || kind === "negated_press")) continue;
    const tail = segment;
    const last = tail.at(-1);
    const words = tail.slice(0, -1).filter((word) => asLabelWord(word).length > 0);
    const label = tail.slice(0, -1);
    const relation = label.some((word) => word.value === "for") || (label.length > 1 && label.at(-1)?.kind === "filler");
    if (segments.length > 1 && relation && last?.digit !== undefined && !clauses.some(({ digitItem }) => digitItem === last) && words.length > 0 && !words.some((word) => word.digit !== undefined)) {
      clauses.push({ digit: last.digit, digitItem: last, label: tail.slice(0, -1), negated: tail.some((word) => word.kind === "negation") });
      tail.forEach((item) => used.add(item));
    }
  }
  return { clauses: clauses.sort((a, b) => a.digitItem.start - b.digitItem.start), rest: explicit.rest.filter((item) => !used.has(item)) };
}

function renderSentence(sentence: string): string {
  const items = itemize(sentence);
  // Elision is local to a comma list containing its own instruction. A verb elsewhere in the prompt
  // cannot turn an announcement ending in a price, date or digit into a new instruction.
  const hasLocalPress = scanClauses(items).clauses.length > 0;
  const { clauses, rest } = hasLocalPress ? scanWithElidedVerbs(items) : scanClauses(items);
  const rendered = clauses.map((clause) =>
    clause.ambiguousWith !== undefined ? `press ${clause.digit} press ${clause.ambiguousWith}` : `For ${clause.label.flatMap(asLabelWord).join(" ")} ${clause.negated ? "do not " : ""}press ${clause.digit}`,
  );
  const leftover = rest.flatMap(asLabelWord).join(" ");
  return [...rendered, ...(leftover ? [leftover] : [])].join(". ");
}

export const SENTENCE_BREAK = /[.।॥!?;\n]+/u;

/** What the core reads as a remark about an option that doesn't say which, so it abstains with mixed_clause. */
const IN_DOUBT = "This option is closed";
const KANNADA_SCRIPT = /\p{Script=Kannada}/u;
const CAN_CHANGE_MEANING: ReadonlySet<Item["kind"]> = new Set(["unknown", "negation", "negated_press", "retraction", "status", "condition", "number", "digit"]);
const NEGATIVE: ReadonlySet<Item["kind"]> = new Set(["negation", "negated_press", "retraction", "status"]);
/**
 * Ahead of a menu, these say nothing about one option: a welcome or thanks, "your call is important to us", and "our
 * menu options have changed", which is plural and speaks of the options together.
 */
const HARMLESS_OPENING = /(ಸ್ವಾಗತ|ಧನ್ಯವಾದ|ನಮಸ್ಕಾರ|welcome|thank)|(ಕರೆ|call).*ಮುಖ್ಯ|(ಆಯ್ಕೆಗಳು|options).*ಬದಲಾಗಿವೆ/u;
/** A real option says what it is for: "ಬಿಲ್‌ಗಾಗಿ", "ದೂರು ನೀಡಲು". "ಹಾಗಲ್ಲ, 4 ಒತ್ತಿ" doesn't, so it may be a correction. */
const PURPOSE_ENDING = /(ಗಾಗಿ|ಕ್ಕಾಗಿ|ಗೆ|ಕ್ಕೆ|ಲು)$/u;

/**
 * Words this layer can't read are kept for the matcher, but one sentence's leftovers don't reach another sentence's
 * instruction. So in Kannada, whose unknown endings and nearby sentences often carry the negation ("press 2. this
 * option isn't available", "this service is suspended. press 2"), an instruction with unread speech around it isn't
 * trusted. Being wrong here costs a press, never a wrong digit. Kannada only for now, so other languages' measured
 * baselines stay exact.
 */
function instructionInDoubt(sentences: readonly string[]): boolean {
  const scans = sentences.map((sentence) => {
    const items = itemize(sentence);
    return { sentence, items, ...(scanClauses(items).clauses.length > 0 ? scanWithElidedVerbs(items) : scanClauses(items)) };
  });
  const firstMenu = scans.findIndex(({ clauses }) => clauses.length > 0);
  if (firstMenu === -1) return false;
  return scans.some(({ sentence, items, clauses, rest }, index) => {
    const wordOf = ({ start, end }: Item) => normalizeForLookup(sentence.slice(start, end));
    if (clauses.length > 0) {
      const unexplainedLabel = clauses.some(({ label }) => label.some(({ kind }) => kind === "unknown") && !label.some(({ kind }) => kind === "concept") && !label.some((item) => PURPOSE_ENDING.test(wordOf(item))));
      return unexplainedLabel || rest.some(({ kind }) => CAN_CHANGE_MEANING.has(kind));
    }
    if (index > firstMenu) return items.some(({ kind }) => CAN_CHANGE_MEANING.has(kind));
    if (items.some(({ kind }) => NEGATIVE.has(kind))) return true;
    return items.some(({ kind }) => kind === "unknown") && !HARMLESS_OPENING.test(normalizeForLookup(sentence));
  });
}

const LEGACY_SCRIPT = /^[\p{Script=Latin}\p{Script=Devanagari}\p{N}\p{P}\p{S}\p{Z}\p{M}\u200b-\u200d\ufeff]*$/u;
const LEGACY_LANGUAGES: ReadonlySet<LanguageCode> = new Set(["hi", "en"]);

/** Words, other than numbers, that only exist outside the Hindi and English the core reads natively. */
function hasForeignGrammar(text: string): boolean {
  return tokensOf(text).some((token) => {
    const entries = LEXICON.get(token);
    if (!entries || entries.some(({ language }) => LEGACY_LANGUAGES.has(language))) return false;
    return entries.some(({ kind }) => kind !== "digit");
  });
}

/** Hindi and English speech goes to the core unchanged, which keeps its regression baseline exact. */
export function needsCanonicalForm(text: string): boolean {
  return !LEGACY_SCRIPT.test(text) || hasForeignGrammar(text);
}

export function canonicalSpeech(text: string): string {
  if (!needsCanonicalForm(text)) return text;
  const sentences = text.split(SENTENCE_BREAK).map((sentence) => sentence.trim()).filter(Boolean);
  const rendered = sentences.map(renderSentence).filter(Boolean);
  return (KANNADA_SCRIPT.test(text) && instructionInDoubt(sentences) ? [...rendered, IN_DOUBT] : rendered).join(". ");
}

export function canonicalGoal(text: string): string {
  if (!needsCanonicalForm(text)) return text;
  const items = text.split(SENTENCE_BREAK).flatMap((sentence) => itemize(sentence));
  const negated = items.some(({ kind }) => kind === "negation" || kind === "negated_press");
  const words = items.flatMap(asLabelWord).filter((word) => word !== "not");
  return `${negated ? "do not want " : ""}${words.join(" ")}`.trim();
}

/** What a reasoner must provide. Replaceable, and it can only supply text: the core still decides. */
export interface MenuReasoner {
  speech(text: string): string;
  goal(text: string): string;
}

export const multilingualReasoner: MenuReasoner = { speech: canonicalSpeech, goal: canonicalGoal };
/** Hindi and English only, exactly as before this layer existed. */
export const legacyReasoner: MenuReasoner = { speech: (text) => text, goal: (text) => text };
