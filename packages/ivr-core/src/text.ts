import type { DtmfDigit } from "./contracts.js";

/** Lowercases and unifies spelling so that Devanagari and Latin forms tokenize predictably. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "")
    .replace(/ँ/g, "ं") // Chandrabindu and anusvara: दबाएँ and दबाएं.
    .replace(/़/g, "") // Nukta: spelled inconsistently by STT.
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/['’`]/g, "");
}

/** Splits into sentences on strong punctuation only; commas often separate a digit from its label. */
export function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/[.।॥!?;\n]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/([a-zऀ-ॿ])(\d)/gu, "$1 $2")
    .replace(/([#*])/g, " $1 ")
    .split(/[^\p{L}\p{M}\p{N}#*]+/u)
    .filter(Boolean);
}

const DIGIT_WORDS: Record<string, DtmfDigit> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  star: "*", hash: "#", pound: "#",
  shunya: "0", sunya: "0", ek: "1", do: "2", teen: "3", tin: "3", char: "4", chaar: "4", paanch: "5", panch: "5",
  chhe: "6", chhah: "6", cheh: "6", che: "6", chah: "6", saat: "7", sat: "7", aath: "8", ath: "8", nau: "9", no: "9",
  "शून्य": "0", "ज़ीरो": "0", "जीरो": "0", "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पांच": "5", "पाँच": "5",
  "छह": "6", "छः": "6", "छ": "6", "छे": "6", "सात": "7", "आठ": "8", "नौ": "9", "स्टार": "*", "हैश": "#",
};
// "no" and "sat" are ordinary English words, so they are not accepted as digits.
delete DIGIT_WORDS.no;
delete DIGIT_WORDS.sat;

export function digitFromToken(token: string): DtmfDigit | undefined {
  if (/^\d$/.test(token) || token === "*" || token === "#") return token as DtmfDigit;
  return DIGIT_WORDS[token];
}

export function isMultiDigitNumber(token: string): boolean {
  return /^\d{2,}$/.test(token);
}

/** True when `phrase` appears as whole consecutive tokens. Returns the start index, or -1. */
export function findPhrase(tokens: readonly string[], phrase: readonly string[], from = 0): number {
  for (let start = from; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((word, offset) => tokens[start + offset] === word)) return start;
  }
  return -1;
}
