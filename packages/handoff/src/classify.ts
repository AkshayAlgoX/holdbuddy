/**
 * What a piece of heard speech sounds like. Words can only suggest things: a recording can say anything
 * a person can. So this errs towards "automated" for clear marketing or system wording, and never
 * reports that a person is present.
 */
import { canonicalSpeech } from "../../ivr-core/src/multilingual/canonicalize.js";
import { findPhrase, tokenize } from "../../ivr-core/src/text.js";

const phrases = (list: string[]) => list.map(tokenize);

const INTRODUCTIONS = phrases([
  "my name is", "this is", "speaking", "thank you for calling this is",
  "मेरा नाम", "बोल रहा", "बोल रही",
  "mera naam", "bol raha", "bol rahi",
]);
const OFFERS_TO_HELP = phrases([
  "how can i help", "how may i help", "how may i assist", "how can i assist", "what can i do for you",
  "आपकी क्या सहायता", "आपकी क्या मदद", "कैसे मदद", "कैसे सहायता",
  "kya sahayata", "kya madad", "kaise madad", "kaise sahayata",
]);
/** Waiting messages. The core reports any unrecognised speech on hold as still on hold, so wording decides here. */
const HOLD_WORDS = phrases([
  "please hold", "on hold", "to hold", "hold on", "stay on the line", "all our agents", "all agents are busy", "please wait", "next available",
  "प्रतीक्षा", "इंतजार", "लाइन पर बने", "व्यस्त हैं",
  "line par bane", "pratiksha", "intezaar", "vyast",
]);
/** Wording from recordings and bots. One of these outweighs anything that sounds like a greeting. */
const AUTOMATED = phrases([
  "virtual assistant", "automated", "ai assistant", "chatbot", "bot", "recorded", "recording", "press", "dial",
  "offer", "offers", "discount", "limited time", "visit", "website", "download", "app", "your call is important",
  "in queue", "quality and training",
  "वर्चुअल", "स्वचालित", "रिकॉर्ड", "ऑफर", "छूट", "दबाएं", "वेबसाइट", "ऐप", "डाउनलोड", "आपकी कॉल",
  "virtual", "svachalit", "chhoot", "dabayein", "dabaye", "website", "aapki call",
]);
/** Might be someone on the line, but says too little to raise an alert on. */
const OPEN_ENDED = phrases([
  "hello", "hi", "are you there", "yes", "go ahead", "anyone there",
  "हैलो", "हेलो", "नमस्ते", "नमस्कार", "जी", "बोलिए", "कहिए",
  "helo", "namaste", "namaskar", "haan", "boliye", "kahiye",
]);

export type HeardKind =
  | "hold"
  /** Offers to help, with nothing automated about it. The only kind that can raise an alert. */
  | "greeting"
  | "automated"
  /** Could be a person, but says too little. Worth a look, not an alert. */
  | "unclear"
  | "other";

export interface Heard {
  kind: HeardKind;
  /** Only for a greeting. */
  strength?: "moderate" | "strong";
  /** The matched words, never the whole transcript. */
  evidence?: string;
}

const firstMatch = (tokens: readonly string[], list: string[][]) => list.find((phrase) => findPhrase(tokens, phrase) !== -1)?.join(" ");

export function classifyHeard(transcript: string): Heard {
  // Any supported language reaches the same phrase checks. Hindi and English pass through unchanged.
  const tokens = tokenize(canonicalSpeech(transcript));
  if (tokens.length === 0) return { kind: "other" };
  if (firstMatch(tokens, HOLD_WORDS)) return { kind: "hold" };
  if (firstMatch(tokens, AUTOMATED)) return { kind: "automated" };
  const offer = firstMatch(tokens, OFFERS_TO_HELP);
  const introduction = firstMatch(tokens, INTRODUCTIONS);
  if (offer) return { kind: "greeting", strength: introduction ? "strong" : "moderate", evidence: introduction ? `${introduction} / ${offer}` : offer };
  if (introduction || firstMatch(tokens, OPEN_ENDED)) return { kind: "unclear" };
  return { kind: "other" };
}

/** Compares two hearings of a prompt, ignoring case and punctuation. */
export const sameWords = (text: string) => tokenize(text).join(" ");
