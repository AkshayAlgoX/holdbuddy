import { findPhrase, tokenize } from "./text.js";

const toPhrases = (phrases: string[]) => phrases.map(tokenize);

const HOLD = toPhrases([
  "please hold", "on hold", "stay on the line", "all our agents are busy", "all agents are busy", "please wait",
  "प्रतीक्षा", "इंतजार", "लाइन पर बने", "व्यस्त हैं", "line par bane", "pratiksha", "intezaar", "vyast hain",
]);

const POSSIBLE_HUMAN = toPhrases([
  "how can i help", "how may i help", "how may i assist", "my name is", "thank you for calling this is",
  "मेरा नाम", "आपकी क्या सहायता", "आपकी क्या मदद", "कैसे मदद कर", "कैसे सहायता कर", "बोल रहा हूं", "बोल रही हूं",
  "mera naam", "kya sahayata", "kaise madad", "bol raha hoon", "bol rahi hoon",
]);

function firstMatch(transcript: string, phrases: string[][]): string | undefined {
  const tokens = tokenize(transcript);
  return phrases.find((phrase) => findPhrase(tokens, phrase) !== -1)?.join(" ");
}

export const detectHold = (transcript: string) => firstMatch(transcript, HOLD);

/** A phrase a person might say. A recording can say it too, so this only ever raises a candidate. */
export const detectPossibleHuman = (transcript: string) => firstMatch(transcript, POSSIBLE_HUMAN);
