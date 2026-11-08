import type { MatchBasis, MenuOption, PreferredLanguage } from "./contracts.js";
import { findPhrase, tokenize } from "./text.js";

/**
 * A small hand-written lexicon. It relates words to words and never to digits. It is not general
 * reasoning: anything not listed is not understood, and an option containing such words can't earn a
 * press.
 */
type Facet = "product" | "topic" | "language" | "object" | "action";

const LEXICON: Record<Facet, Record<string, string[]>> = {
  product: {
    broadband: ["broadband", "ब्रॉडबैंड", "ब्राडबैंड", "internet", "इंटरनेट", "wifi", "wi fi", "वाईफाई", "वाई फाई", "fiber", "fibre", "फाइबर"],
    mobile: ["mobile", "मोबाइल", "prepaid", "postpaid", "प्रीपेड", "पोस्टपेड", "sim", "सिम"],
    tv: ["dth", "डीटीएच", "tv", "टीवी", "television", "set top box"],
    landline: ["landline", "लैंडलाइन"],
    credit_card: ["credit card", "क्रेडिट कार्ड", "card", "कार्ड"],
    loan: ["loan", "लोन", "ऋण"],
  },
  topic: {
    billing: ["bill", "bills", "billing", "बिल", "बिलों", "बिलिंग", "invoice", "charges", "शुल्क", "dues", "बकाया"],
    technical: ["technical", "tech", "तकनीकी", "टेक्निकल", "fault", "खराबी", "kharabi", "repair", "मरम्मत", "outage", "report a fault", "report fault", "not working", "isnt working", "nahi chal raha", "नहीं चल रहा", "काम नहीं कर रहा", "slow", "takniki"],
    new_connection: ["new connection", "naya connection", "नया कनेक्शन", "नए कनेक्शन", "नई सेवा"],
    plans: ["plan", "plans", "प्लान", "योजना", "योजनाओं", "recharge", "रिचार्ज"],
    agent: ["agent", "representative", "executive", "customer care", "human", "person", "प्रतिनिधि", "अधिकारी", "एजेंट", "ग्राहक सेवा", "adhikari"],
  },
  language: {
    hi: ["hindi", "हिंदी", "हिन्दी"],
    en: ["english", "अंग्रेजी", "अंग्रेज़ी", "इंग्लिश"],
  },
  /** Things an operation can act on, other than a product or topic. */
  object: {
    balance: ["balance", "बैलेंस", "शेष राशि"],
    cancellation_fee: ["cancellation charges", "cancellation charge", "cancellation fee", "cancellation fees", "रद्द करने का शुल्क", "रद्द शुल्क"],
  },
  /** Operations. Which one is primary in a clause comes from word order; see actionFrames. */
  action: {
    pay: ["pay", "paying", "payment", "payments", "भुगतान", "पेमेंट", "bhugtan"],
    dispute: ["dispute", "disputes", "overcharged", "charged twice", "wrong charge", "wrong bill", "double charge", "galat bill", "गलत बिल", "विवाद"],
    complaint: ["complaint", "complaints", "शिकायत", "shikayat"],
    refund: ["refund", "refunds", "रिफंड", "वापसी", "payment wapas", "paisa wapas", "paise wapas", "भुगतान वापस", "पैसा वापस"],
    cancel: ["cancel", "cancellation", "disconnect", "रद्द", "बंद करना", "बंद करने", "band karna"],
    upgrade: ["upgrade", "upgrades", "अपग्रेड"],
    buy: ["buy", "purchase", "खरीद", "खरीदना", "khareed", "khareedna"],
    unsubscribe: ["unsubscribe"],
    stop: ["stop", "rokna", "रोकना"],
    confirm: ["confirm", "पुष्टि"],
    repeat: ["repeat", "again", "दोबारा", "dobara", "फिर से", "phir se"],
    return: ["back", "go back", "return", "previous", "वापस", "wapas", "main menu", "मुख्य मेनू"],
    inform: ["check", "see", "view", "hear", "know", "जानने", "जानना", "जानें", "jaanna", "jaanne", "information", "details", "detail", "जानकारी", "jaankari"],
  },
};

const wordSet = (text: string) => new Set(tokenize(text));

/** Word forms that perform an action. In a clause, the first of these is the operation. */
const VERB_FORMS = wordSet(`pay paying cancel disconnect upgrade buy purchase stop confirm unsubscribe repeat return back check see view hear know
  dispute refund rokna`);
/** These can be nouns too. After a target, they are: "loan refund", "mobile plan upgrade". */
const VERB_OR_NOUN_FORMS = wordSet("refund upgrade dispute return repeat check");
/** Past tense is harmless in a goal ("I was charged"), but in an option it describes something old. */
const PAST_WORDS = wordSet("was were");
/** Between two action nouns, these make the first one the head: "refund of my payment". */
const HEAD_FIRST_LINKS = wordSet("of about regarding for");
/** These end an action's immediate object: in "upgrade of my plan", the object is the upgrade. */
const OBJECT_LINKS = wordSet("of for about regarding to with by");

/** These change something or move around the menu, so they must be what the user asked for. */
const RESTRICTED_ACTIONS = new Set(["cancel", "upgrade", "buy", "unsubscribe", "stop", "confirm", "repeat", "return"]);

/** Words that add no meaning to an option. Every other word must be understood or in the goal. */
const HARMLESS = wordSet(`i im my me we our you your the a an to for of in on at about regarding related and or with it this that
  is are was were be have has get some am account please want need wish question calling speaking looking require would like speak talk help support service services
  assistance customer query queries issue issues problem problems enquiry enquiries inquiry inquiries
  department section team desk line center centre menu option options existing
  मुझे मेरा मेरे मेरी चाहिए सहायता मदद के लिए का की में पर है हैं और या से को अपना अपने आपको आपका समस्या संबंधित बारे
  सेवा विभाग दर्ज बात
  mujhe mera mere meri chahiye madad sahayata ke liye ka ki mein par hai aur ya se ko samasya sambandhit baare aapko aapka apna apne
  seva vibhag baat`);

const CONNECTORS = wordSet("and or aur और ya या");
/** "An agent about billing" names two things legitimately; "about billing plans" does not. */
const AGENT_CONNECTORS = wordSet("about regarding for with");

/** Exact wording that keeps an option from counting, checked only on words the lexicon didn't claim. */
const NEGATION_WORDS = wordSet(`not dont never mat मत nahi nahin नहीं na न except excluding without than alawa अलावा छोड़कर chhodkar
  bina बिना non unrelated besides apart siwa सिवा sivay but longer`);
const CONDITION_WORDS = wordSet(`already unless after before once until paid baad बाद pehle पहले diya दिया bhar`);
const STATUS_WORDS = wordSet("closed close unavailable down suspended offline band बंद");
const AMENDMENT_WORDS = wordSet(`moved shifted used previously earlier old formerly correction sorry changed replaced now ab अब
  purana पुराना badal बदल`);
/** Existing amendment vocabulary, shared with the discourse reducer without adding surface forms. */
export const hasAmendmentCue = (tokens: readonly string[]) => tokens.some((token) => AMENDMENT_WORDS.has(token));

const GOAL_NEGATIONS = ["dont want", "do not want", "not about", "nahi chahiye", "नहीं चाहिए", "no need"].map(tokenize);

const entries: Array<{ facet: Facet; value: string; phrase: string[] }> = (Object.keys(LEXICON) as Facet[])
  .flatMap((facet) =>
    Object.entries(LEXICON[facet]).flatMap(([value, phrases]) =>
      phrases.map((phrase) => ({ facet, value, phrase: tokenize(phrase) })),
    ),
  )
  .sort((a, b) => b.phrase.length - a.phrase.length);

/**
 * One complete operation: what is done, to what, on which service. Two texts sharing a word mean
 * nothing here; a menu choice is eligible only when its whole operation fits the requested one.
 */
export interface OperationFrame {
  /** Undefined for a plain department, such as "billing". */
  action?: string;
  /** True when the action came from a verb ("to pay"), not a department noun ("payments"). */
  actionIsVerb: boolean;
  /** Other operations this one is about, in spoken order: "cancel my upgrade" cancels, and acts on an upgrade. */
  actedOn: Set<string>;
  /** What the action directly affects. "Confirm cancellation of a payment" confirms the cancellation. */
  object?: string;
  services: Set<string>;
  subjects: Set<string>;
}

export interface Meaning {
  facets: Record<Facet, Set<string>>;
  frames: OperationFrame[];
  /** Words the lexicon didn't claim, in order. Function words are still included. */
  residual: string[];
  /** Residual words that carry meaning. */
  literal: Set<string>;
}

interface Mention {
  facet: Facet;
  value: string;
  start: number;
  length: number;
}

/**
 * The thing directly after the action, up to the first link word, using the last word of a compound:
 * "cancel my mobile plan upgrade" cancels an upgrade, and "cancel my mobile plan for an upgrade" cancels a
 * plan. With nothing after the action, the words before it: "bill payment" pays a bill.
 */
function immediateObject(tokens: readonly string[], items: readonly Mention[], head: Mention): string | undefined {
  const candidates = items.filter((item) => item !== head && item.facet !== "language" && item.value !== head.value);
  const after = candidates.filter(({ start }) => start > head.start);
  if (after.length === 0) return candidates.filter(({ start }) => start < head.start).at(-1)?.value;
  const linksBefore = (mention: Mention) =>
    tokens.slice(head.start + head.length, mention.start).filter((token) => OBJECT_LINKS.has(token)).length;
  const nearest = Math.min(...after.map(linksBefore));
  return after.filter((mention) => linksBefore(mention) === nearest).at(-1)?.value;
}

/** Clauses split on and/or. A clause with no action of its own widens the scope of its neighbour. */
function buildFrames(tokens: readonly string[], mentions: Mention[]): OperationFrame[] {
  const clauseOf = (start: number) => tokens.slice(0, start).filter((token) => CONNECTORS.has(token)).length;
  const clauses = new Map<number, Mention[]>();
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    const clause = clauseOf(mention.start);
    clauses.set(clause, [...(clauses.get(clause) ?? []), mention]);
  }
  const frames: OperationFrame[] = [];
  let carried: Mention[] = [];
  const addTargets = (frame: OperationFrame, items: Mention[]) => {
    for (const { facet, value } of items) {
      if (facet === "product") frame.services.add(value);
      if (facet === "topic" || facet === "object") frame.subjects.add(value);
    }
  };
  for (const [, items] of [...clauses].sort((a, b) => a[0] - b[0])) {
    const actions = items.filter(({ facet }) => facet === "action");
    if (actions.length === 0) {
      if (frames.length > 0) addTargets(frames.at(-1)!, items);
      else carried.push(...items);
      continue;
    }
    const isVerb = (mention: Mention) => {
      const words = tokens.slice(mention.start, mention.start + mention.length);
      if (!words.some((token) => VERB_FORMS.has(token))) return false;
      const afterTarget = items.some(({ facet, start }) => facet !== "action" && start < mention.start);
      return !(afterTarget && words.some((token) => VERB_OR_NOUN_FORMS.has(token)));
    };
    const verb = actions.find(isVerb);
    let head = verb;
    if (!head) {
      // Among nouns, the last is the head ("payment complaint") unless linked ("refund of my payment").
      const [first, last] = [actions[0]!, actions.at(-1)!];
      const between = tokens.slice(first.start + first.length, last.start);
      head = between.some((token) => HEAD_FIRST_LINKS.has(token)) ? first : last;
    }
    const frame: OperationFrame = {
      action: head.value,
      actionIsVerb: verb !== undefined,
      actedOn: new Set(actions.filter((mention) => mention !== head && mention.value !== head!.value).map(({ value }) => value)),
      services: new Set(),
      subjects: new Set(),
    };
    const object = immediateObject(tokens, [...carried, ...items], head);
    if (object !== undefined) frame.object = object;
    addTargets(frame, [...carried, ...items]);
    carried = [];
    frames.push(frame);
  }
  if (frames.length === 0) {
    const frame: OperationFrame = { actionIsVerb: false, actedOn: new Set(), services: new Set(), subjects: new Set() };
    addTargets(frame, carried);
    frames.push(frame);
  }
  // "Check and pay my bill", "check your bill and pay it": a frame with no target shares its neighbour's.
  const hasTarget = (frame: OperationFrame) => frame.services.size + frame.subjects.size + frame.actedOn.size > 0;
  frames.forEach((frame, i) => {
    if (hasTarget(frame)) return;
    const neighbour = frames[i + 1] && hasTarget(frames[i + 1]!) ? frames[i + 1]! : frames[i - 1];
    if (neighbour) {
      frame.services = new Set(neighbour.services);
      frame.subjects = new Set(neighbour.subjects);
      if (neighbour.object !== undefined) frame.object = neighbour.object;
    }
  });
  return frames;
}

export function analyze(text: string): Meaning {
  const tokens = tokenize(text);
  const consumed = new Set<number>();
  const facets: Meaning["facets"] = { product: new Set(), topic: new Set(), language: new Set(), object: new Set(), action: new Set() };
  const mentions: Mention[] = [];
  for (const { facet, value, phrase } of entries) {
    for (let start = findPhrase(tokens, phrase); start !== -1; start = findPhrase(tokens, phrase, start + 1)) {
      if (phrase.some((_, offset) => consumed.has(start + offset))) continue;
      phrase.forEach((_, offset) => consumed.add(start + offset));
      facets[facet].add(value);
      mentions.push({ facet, value, start, length: phrase.length });
    }
  }
  const residual = tokens.filter((_, i) => !consumed.has(i));
  const literal = new Set(residual.filter((token) => !HARMLESS.has(token) && token.length >= 3 && !/^\d+$/.test(token)));
  return { facets, frames: buildFrames(tokens, mentions), residual, literal };
}

const hasConcepts = (meaning: Meaning) => Object.values(meaning.facets).some((values) => values.size > 0);

export function goalHasNegation(goal: string): boolean {
  const tokens = tokenize(goal);
  return GOAL_NEGATIONS.some((phrase) => findPhrase(tokens, phrase) !== -1);
}

/**
 * A goal stating a condition or status ("I already paid...") is more than the supported vocabulary can
 * match safely, because the option would have to account for that state too.
 */
export function goalHasStateQualifier(goal: Meaning): boolean {
  return goal.residual.some(qualifiesOption);
}

export function isGoalUnderstood(goal: Meaning): boolean {
  return hasConcepts(goal) || goal.literal.size > 0;
}

export function goalMeaning(goalTexts: readonly string[], preferredLanguage?: PreferredLanguage): Meaning {
  // Goal-only, bounded phrases: do not make unknown option words harmless or infer a phone product.
  const goals = goalTexts.map(text => text
    .replace(/\bmonthly\s+(bills?)\b/gi, "$1")
    .replace(/(^|[\s।.,!?])बिल\s+भरना(?=$|[\s।.,!?])/gu, "$1बिल भुगतान"));
  const meaning = analyze(goals.join(" . "));
  if (preferredLanguage) meaning.facets.language.add(preferredLanguage);
  return meaning;
}

/** True for words a menu may place before its first option: greetings, not information. */
export function isCourtesyOnly(tokens: readonly string[]): boolean {
  const meaning = analyze(tokens.join(" "));
  return !hasConcepts(meaning) && meaning.residual.every((token) => HARMLESS.has(token) || COURTESY.has(token));
}
const COURTESY = wordSet("welcome hello hi namaste namaskar swagat स्वागत नमस्ते नमस्कार thanks thank");

/** Words that change what a nearby option means, when found in a sentence of their own. */
const qualifiesOption = (word: string) =>
  AMENDMENT_WORDS.has(word) || STATUS_WORDS.has(word) || NEGATION_WORDS.has(word) || CONDITION_WORDS.has(word);
const OPTION_REFERENCES = wordSet("option selection this that line service department seva सेवा विभाग विकल्प चयन यह वह");
/** References already understood by the core, used to scope a warning to an instruction. */
export const referencesAnInstruction = (tokens: readonly string[]) => tokens.some((token) => OPTION_REFERENCES.has(token));

/** A sentence with no digit that says a topic has changed, closed or doesn't apply. */
export function amendmentSubject(tokens: readonly string[]): Meaning | undefined {
  const meaning = analyze(tokens.join(" "));
  if (!meaning.residual.some(qualifiesOption)) return undefined;
  return hasConcepts(meaning) ? meaning : undefined;
}

/** "This option is closed": it says something about an option without saying which. */
export function isUnattributedQualifier(tokens: readonly string[]): boolean {
  const meaning = analyze(tokens.join(" "));
  return !hasConcepts(meaning) && meaning.residual.some(qualifiesOption) && meaning.residual.some((token) => OPTION_REFERENCES.has(token));
}

const PLURAL_PAST = wordSet("गए गये");
const DEMONSTRATIVES = wordSet("यह वह ये वे इस उस इन उन");

/**
 * "हमारे विकल्प बदल गए हैं" is "our options have changed". विकल्प doesn't mark number, so the verb carries
 * the plural. Like English "options", this speaks of the options together, rather than saying something
 * about one option without naming it. It says nothing else: any other qualifier or a pointing word means
 * it isn't this notice. The caller must honour it only ahead of a menu's first option, because after an
 * option the same words put what was already said in doubt.
 */
export function announcesOptionsChanged(tokens: readonly string[]): boolean {
  const qualifiers = analyze(tokens.join(" ")).residual.filter(qualifiesOption);
  return tokens.includes("विकल्प") && tokens.some((token) => PLURAL_PAST.has(token)) &&
    qualifiers.length > 0 && qualifiers.every((token) => token === "बदल") && !tokens.some((token) => DEMONSTRATIVES.has(token));
}

const RETRACTION_WORDS = wordSet(`incorrect wrong invalid disregard ignore instead mistake mistaken discard expired expire expires obsolete outdated
  discontinued withdrawn void longer galat गलत jagah जगह badle बदले samapt समाप्त khatam खत्म amanya अमान्य`);

/** "That option has expired", "use that digit for X instead": earlier instructions can't be trusted. */
export function retractsAnInstruction(tokens: readonly string[]): boolean {
  const negatedValidity = tokens.some((token) => token === "valid" || token === "मान्य" || token === "वैध") &&
    tokens.some((token) => NEGATION_WORDS.has(token)) && tokens.some((token) => OPTION_REFERENCES.has(token));
  return negatedValidity || analyze(tokens.join(" ")).residual.some((token) => RETRACTION_WORDS.has(token));
}

/** A stable key for what an option means, so that rewordings of it compare equal. */
export function optionMeaningKey(option: MenuOption): string {
  const meaning = analyze(option.label);
  const concepts = (Object.keys(meaning.facets) as Facet[]).flatMap((facet) =>
    [...meaning.facets[facet]].map((value) => `${facet}.${value}`),
  );
  return `${option.digit}:${[...concepts, ...meaning.literal].sort().join(",")}`;
}

export type BlockReason =
  | "negated_option"
  | "conditional_option"
  | "service_unavailable"
  | "amended_option"
  | "mixed_clause"
  | "unsupported_option_wording";

export type OptionEvaluation =
  | { kind: "not_relevant" }
  /** It relates to the goal but does something else. It can't be pressed, and it isn't a reason to stop. */
  | { kind: "action_mismatch"; combined?: true }
  /** It relates to the goal but isn't trustworthy, so the whole decision abstains. */
  | { kind: "blocked"; reason: BlockReason }
  | { kind: "match"; option: MenuOption; score: number; basis: MatchBasis; actionFit: "exact" | "unspecified" };

const overlapCount = (a: Set<string>, b: Set<string>) => [...a].filter((value) => b.has(value)).length;

type FrameFit = "exact" | "unspecified" | "no";

const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((value) => b.has(value));

/** Does this offered operation fit this requested one, in action, what it acts on, and scope? */
function compareFrames(wanted: OperationFrame, offered: OperationFrame): FrameFit {
  // A bare "balance" line reports a balance.
  const offeredAction = offered.action ?? (offered.subjects.has("balance") ? "inform" : undefined);
  const wantedAction = wanted.action ?? (wanted.subjects.has("balance") ? "inform" : undefined);
  const changes = (action: string | undefined) => action !== undefined && RESTRICTED_ACTIONS.has(action);

  let fit: FrameFit = "exact";
  if (offeredAction && wantedAction && offeredAction !== wantedAction) return "no";
  if (offeredAction && !wantedAction) {
    if (changes(offeredAction)) return "no";
    if (offeredAction !== "inform") fit = "unspecified";
  }
  if (!offeredAction && changes(wantedAction)) fit = "unspecified";

  // The same words in a different relationship are a different operation.
  if (wanted.object !== undefined && offered.object !== undefined && wanted.object !== offered.object) return "no";
  const sharedOrder = (from: Set<string>, other: Set<string>) => [...from].filter((action) => other.has(action)).join(",");
  if (sharedOrder(wanted.actedOn, offered.actedOn) !== sharedOrder(offered.actedOn, wanted.actedOn)) return "no";

  // Nothing extra may be affected: an option's scope has to fit inside the request.
  if (!isSubset(offered.actedOn, wanted.actedOn)) return "no";
  if (wanted.services.size > 0 && !isSubset(offered.services, wanted.services)) return "no";
  if (wanted.subjects.size > 0 && !isSubset(offered.subjects, wanted.subjects)) return "no";
  // "Details about a refund" is about the refund: another subject, or none, doesn't answer it.
  if (wanted.actedOn.size > 0 && wanted.subjects.size === 0 && offered.subjects.size > 0) return "no";
  if (offeredAction === "inform" && !isSubset(wanted.actedOn, offered.actedOn)) return "no";
  if (wanted.services.size === 0 && offered.services.size > 0) fit = "unspecified";
  if (wanted.subjects.size === 0 && offered.subjects.size > 0 && offeredAction !== "inform") fit = "unspecified";

  // A change must also cover everything the request names: "cancel my plan" isn't "cancel my upgrade".
  if (changes(offeredAction) && offeredAction === wantedAction) {
    if (!isSubset(wanted.actedOn, offered.actedOn) || !isSubset(wanted.services, offered.services) || !isSubset(wanted.subjects, offered.subjects)) return "no";
  }
  // An instruction to do something needs a stated target: "to pay" alone doesn't say pay what.
  const offeredHasTarget = offered.services.size + offered.subjects.size + offered.actedOn.size > 0;
  const wantedHasTarget = wanted.services.size + wanted.subjects.size + wanted.actedOn.size > 0;
  const executes = changes(offeredAction) || offeredAction === "pay";
  if (offered.actionIsVerb && executes && wantedHasTarget && !offeredHasTarget) return "no";
  // "To pay" something must name what the request names: "pay your mobile payment" isn't "pay my mobile bill".
  if (offered.actionIsVerb && executes && !isSubset(wanted.subjects, offered.subjects)) return "no";

  // Sharing nothing but a kind of action isn't support: "know my refund" and "know your plans".
  const sharedTarget =
    overlapCount(wanted.services, offered.services) + overlapCount(wanted.subjects, offered.subjects) + overlapCount(wanted.actedOn, offered.actedOn) > 0;
  if (wantedHasTarget && offeredHasTarget && !sharedTarget) return "no";
  return fit;
}

/** Each offered operation must fit its own requested operation, and every request must be covered. */
export function compareOperations(goal: Meaning, offered: Meaning): FrameFit {
  if (goal.frames.length !== offered.frames.length) return "no";
  const remaining = [...goal.frames];
  let fit: FrameFit = "exact";
  for (const frame of offered.frames) {
    const index = remaining.findIndex((wanted) => compareFrames(wanted, frame) !== "no");
    if (index === -1) return "no";
    if (compareFrames(remaining[index]!, frame) === "unspecified") fit = "unspecified";
    remaining.splice(index, 1);
  }
  return fit;
}

/** Decides whether one option has earned the right to be pressed for this goal. */
export function evaluateOption(goal: Meaning, option: MenuOption, amendments: readonly Meaning[] = []): OptionEvaluation {
  const offered = analyze(option.label);

  const conflicts = (["product", "topic", "language", "object"] as const).some(
    (facet) => goal.facets[facet].size > 0 && offered.facets[facet].size > 0 && overlapCount(goal.facets[facet], offered.facets[facet]) === 0,
  );
  const topicOverlap = overlapCount(goal.facets.topic, offered.facets.topic);
  const productOverlap = overlapCount(goal.facets.product, offered.facets.product);
  const objectOverlap = overlapCount(goal.facets.object, offered.facets.object);
  const actionOverlap = overlapCount(goal.facets.action, offered.facets.action);
  const literalOverlap = overlapCount(goal.literal, offered.literal);
  const unexplained = offered.residual.filter((token) => !HARMLESS.has(token) && !goal.literal.has(token));
  const languageOnly =
    offered.facets.language.size > 0 && offered.facets.topic.size + offered.facets.product.size + offered.facets.object.size + offered.facets.action.size === 0 && unexplained.length === 0;
  const languageOverlap = languageOnly ? overlapCount(goal.facets.language, offered.facets.language) : 0;

  const relevant = topicOverlap + productOverlap + objectOverlap + actionOverlap + literalOverlap + languageOverlap > 0;
  if (!relevant || conflicts) return { kind: "not_relevant" };

  // What the option says about itself comes first: it can rule out an otherwise good match.
  // These use all residual words: a goal mentioning "closed" must not vouch for "billing is closed".
  const said = offered.residual;
  if (option.excluded || said.some((token) => NEGATION_WORDS.has(token))) return { kind: "blocked", reason: "negated_option" };
  if (said.some((token) => CONDITION_WORDS.has(token))) return { kind: "blocked", reason: "conditional_option" };
  if (said.some((token) => STATUS_WORDS.has(token))) return { kind: "blocked", reason: "service_unavailable" };
  if (said.some((token) => AMENDMENT_WORDS.has(token) || PAST_WORDS.has(token))) return { kind: "blocked", reason: "amended_option" };

  const amended = amendments.some((subject) =>
    (["topic", "product", "object", "action", "language"] as const).some((facet) => overlapCount(subject.facets[facet], offered.facets[facet]) > 0),
  );
  if (amended) return { kind: "blocked", reason: "amended_option" };

  if (languageOverlap > 0) return { kind: "match", option, score: 2, basis: "concept", actionFit: "exact" };

  // Every word the goal needs must be accounted for; an unknown word might change everything.
  if (![...goal.literal].every((word) => offered.literal.has(word))) return { kind: "not_relevant" };

  const fit = compareOperations(goal, offered);
  if (fit === "no") return offered.frames.length > 1 ? { kind: "action_mismatch", combined: true } : { kind: "action_mismatch" };

  if (unexplained.length > 0) return { kind: "blocked", reason: "unsupported_option_wording" };

  const concepts = topicOverlap + productOverlap + objectOverlap + actionOverlap;
  return {
    kind: "match",
    option,
    score: concepts * 2 + literalOverlap,
    basis: concepts && literalOverlap ? "concept_and_literal" : concepts ? "concept" : "literal",
    actionFit: fit,
  };
}
