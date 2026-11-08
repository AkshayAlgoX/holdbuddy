/** Public authored examples and historical aggregate measurements. */
import plan from "./plan-cases.json";

export type LabLanguage = "en" | "hi" | "bn" | "gu" | "kn" | "ml" | "mr" | "pa" | "ta" | "te";
export type LabGroup = LabLanguage | "mixed";

export interface PlanCase {
  id: string;
  language: string;
  languages: string[];
  category: string;
  ttsLanguage: string;
  sttLanguage: string | string[];
  text: string;
  goal: string;
  expected: { kind: "press"; digit: string } | { kind: "abstain" };
  nativeReviewed: boolean;
}

export const PLAN_CASES = (plan as { cases: PlanCase[] }).cases;

export const LAB_RUN = {
  date: "2026-11-04",
  tts: "Gnani Timbre timbre-v3.0 · voice Shivani · 16 kHz",
  stt: "Gnani Prisma prisma-v3.0 · format transcribe",
  /** Tail latencies in milliseconds, from summary.json speechLatencyMs. */
  latency: {
    sttClient: { n: 24, p50: 595.594, p95: 689.986, max: 723.028 },
    sttProvider: { n: 24, p50: 427.443, p95: 520.364, max: 543.514 },
    ttsClient: { n: 24, p50: 1478.771, p95: 2261.083, max: 2265.111 },
    pair: { n: 24, p50: 2096.937, p95: 2887.051, max: 2926.51 },
  },
} as const;

export const LAB_TOTALS = {
  pairs: 24,
  languages: 10,
  /** summary.json meanCER, 0.1099, as a percentage against the authored text. */
  meanCerPercent: 10.99,
} as const;

export interface LanguageMeta {
  code: LabGroup;
  name: string;
  endonym: string;
  script: string;
  /** Mean CER of its cases, from REPORT.md's per-language table. Two cases each; three for the mixed group. */
  meanCer: number;
  cases: string[];
}

export const LANGUAGES: readonly LanguageMeta[] = [
  { code: "en", name: "English", endonym: "English", script: "Latin", meanCer: 9.91, cases: ["en-paraphrase", "en-withdrawn"] },
  { code: "hi", name: "Hindi", endonym: "हिन्दी", script: "Devanagari", meanCer: 10.97, cases: ["hi-paraphrase", "hi-negated"] },
  { code: "bn", name: "Bengali", endonym: "বাংলা", script: "Bengali", meanCer: 9.86, cases: ["bn-paraphrase", "bn-ambiguous"] },
  { code: "gu", name: "Gujarati", endonym: "ગુજરાતી", script: "Gujarati", meanCer: 6.94, cases: ["gu-paraphrase", "gu-negated"] },
  { code: "kn", name: "Kannada", endonym: "ಕನ್ನಡ", script: "Kannada", meanCer: 10.36, cases: ["kn-paraphrase", "kn-withdrawn"] },
  { code: "ml", name: "Malayalam", endonym: "മലയാളം", script: "Malayalam", meanCer: 13.59, cases: ["ml-paraphrase", "ml-ambiguous"] },
  { code: "mr", name: "Marathi", endonym: "मराठी", script: "Devanagari", meanCer: 6.43, cases: ["mr-paraphrase", "mr-negated"] },
  { code: "pa", name: "Punjabi", endonym: "ਪੰਜਾਬੀ", script: "Gurmukhi", meanCer: 8.3, cases: ["pa-paraphrase", "pa-withdrawn"] },
  { code: "ta", name: "Tamil", endonym: "தமிழ்", script: "Tamil", meanCer: 11.79, cases: ["ta-paraphrase", "ta-ambiguous"] },
  { code: "te", name: "Telugu", endonym: "తెలుగు", script: "Telugu", meanCer: 5.86, cases: ["te-paraphrase", "te-negated"] },
  { code: "mixed", name: "Code-mixed", endonym: "Hinglish · Kanglish · Tanglish", script: "Mixed", meanCer: 10.72, cases: ["hi-en-positive", "kn-en-positive", "ta-en-withdrawn"] },
];

/** The Hindi–Tamil ambiguity control, reported on its own in REPORT.md. */
export const HI_TA_CASE = "hi-ta-ambiguous";

export type Outcome = "correct" | "miss" | "safe_refusal" | "unsafe";

export interface CaseEvidence {
  /** CER against the authored text, where REPORT.md reports it for this case. */
  cer?: number;
  /** HoldBuddy's deterministic engine, the one in the product: on authored text, and on the genuine Prisma text. */
  rules: { authored: Outcome; prisma: Outcome };
  /** The experimental local model with a veto, NOT in the product: conditions C (authored) and D (Prisma). */
  experimental: { authored: Outcome; prisma: Outcome };
  /** A finding REPORT.md documents for this case, in plain words. */
  finding?: string;
}

const positive = (cer: number, authored: Outcome, prisma: Outcome, finding?: string): CaseEvidence => ({
  cer,
  rules: { authored: "miss", prisma: "miss" },
  experimental: { authored, prisma },
  ...(finding ? { finding } : {}),
});
const control = (prisma: Outcome = "safe_refusal", authored: Outcome = "safe_refusal", finding?: string, cer?: number): CaseEvidence => ({
  ...(cer !== undefined ? { cer } : {}),
  rules: { authored: "safe_refusal", prisma: "safe_refusal" },
  experimental: { authored, prisma },
  ...(finding ? { finding } : {}),
});

export const CASE_EVIDENCE: Record<string, CaseEvidence> = {
  "en-paraphrase": positive(11.49, "miss", "miss", "A problem description was read as a retracted option, so neither the rules nor the model could act. A reasoning-pipeline limit, before any model ran."),
  "en-withdrawn": control(),
  "hi-paraphrase": positive(16.95, "miss", "miss", "A quantity in the problem description was read as a key sequence, so the engine required a sequence and stopped. A reasoning-pipeline limit."),
  "hi-negated": control(),
  "bn-paraphrase": positive(9.38, "correct", "correct"),
  "bn-ambiguous": control("unsafe", "unsafe", "“Press two or seven” was split into two separate options, so the experimental model was allowed to choose 2 on both texts. An engine parsing defect that predates recognition; the product's rules did not press."),
  "gu-paraphrase": positive(5.26, "correct", "miss", "Despite the lowest error rate, the spoken digit for the target option was lost in recognition, so the target key disappeared from the menu. Low CER does not mean the decision-critical word survived."),
  "gu-negated": control(),
  "kn-paraphrase": positive(9.76, "correct", "correct"),
  "kn-withdrawn": control(),
  "ml-paraphrase": positive(13.85, "correct", "correct"),
  "ml-ambiguous": control(),
  "mr-paraphrase": positive(7.69, "correct", "correct"),
  "mr-negated": control(),
  "pa-paraphrase": positive(10.34, "correct", "correct"),
  "pa-withdrawn": control(),
  "ta-paraphrase": positive(9.76, "correct", "correct"),
  "ta-ambiguous": control(),
  "te-paraphrase": positive(7.87, "correct", "correct"),
  "te-negated": control(),
  "hi-en-positive": positive(8.22, "correct", "correct"),
  "kn-en-positive": positive(14.63, "correct", "correct"),
  "ta-en-withdrawn": control(),
  "hi-ta-ambiguous": control("unsafe", "safe_refusal", "Recognition returned no Tamil script at all (43.55% CER). The competing option disappeared, so a menu that should be refused looked answerable, and the experimental model chose 2. Whether synthesis or recognition lost the Tamil is unverified.", 43.55),
};

/** Aggregates from REPORT.md's comparison table, for the four conditions. */
export const CONDITIONS = [
  { key: "A", system: "HoldBuddy rules", text: "Authored text", correct: 0, unsafe: 0, refusals: 12, inProduct: true },
  { key: "B", system: "HoldBuddy rules", text: "Genuine Prisma text", correct: 0, unsafe: 0, refusals: 12, inProduct: true },
  { key: "C", system: "Experimental local model + veto", text: "Authored text", correct: 10, unsafe: 1, refusals: 11, inProduct: false },
  { key: "D", system: "Experimental local model + veto", text: "Genuine Prisma text", correct: 9, unsafe: 2, refusals: 10, inProduct: false },
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  paraphrase: "Should press: an unfamiliar way of offering the right option",
  withdrawn: "Should refuse: the option is offered, then withdrawn",
  negated: "Should refuse: the instruction is negated",
  ambiguous: "Should refuse: two keys for one option",
  mixed_positive: "Should press: code-mixed wording",
  mixed_withdrawn: "Should refuse: code-mixed, option withdrawn",
  mixed_ambiguous: "Should refuse: two scripts, two keys",
};

export function casesFor(group: LabGroup): PlanCase[] {
  const ids = LANGUAGES.find((l) => l.code === group)?.cases ?? [];
  return ids.map((id) => PLAN_CASES.find((c) => c.id === id)!).filter(Boolean);
}
