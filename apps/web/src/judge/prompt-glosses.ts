/**
 * Accurate English translations and glosses for HoldBuddy's IVR prompts.
 * Provides instant semantic comprehension for evaluators and non-Hindi speakers.
 * Purely presentational; no effect on the underlying decision engine or audio queue.
 */

export interface PromptGloss {
  script: string;
  gloss: string;
  language: "hi" | "en";
  purpose: string;
}

export const PROMPT_GLOSSES: Record<string, PromptGloss> = {
  "prompt-01.wav": {
    script: "यह लाइन आपका अनुरोध नहीं ले सकती। अलविदा।",
    gloss: "This line cannot take your request. Goodbye.",
    language: "hi",
    purpose: "Termination / refusal",
  },
  "prompt-02.wav": {
    script: "कृपया लाइन पर बने रहें। हमारे सभी प्रतिनिधि व्यस्त हैं।",
    gloss: "Please stay on the line. All our representatives are busy.",
    language: "hi",
    purpose: "Hold announcement",
  },
  "prompt-03.wav": {
    script: "नमस्ते, मेरा नाम आशा है। मैं आपकी क्या सहायता कर सकती हूँ?",
    gloss: "Hello, my name is Asha. How may I assist you?",
    language: "hi",
    purpose: "Human representative greeting",
  },
  "prompt-04.wav": {
    script: "मोबाइल के लिए कृपया 3 दबाएँ। लैंडलाइन के लिए छह दबाएँ। रोमिंग के लिए कृपया 1 दबाएँ। ब्रॉडबैंड के लिए पाँच दबाएँ।",
    gloss: "For mobile press 3. For landline press 6. For roaming press 1. For broadband press 5.",
    language: "hi",
    purpose: "Level 1 menu: service selection (Broadband = 5)",
  },
  "prompt-05.wav": {
    script: "दोबारा सुनने के लिए तीन दबाएँ। बिल के लिए कृपया 8 दबाएँ। प्लान के लिए दो दबाएँ। नया कनेक्शन के लिए कृपया 6 दबाएँ। तकनीकी सहायता के लिए सात दबाएँ। स्टोर की जानकारी के लिए कृपया 1 दबाएँ। मुख्य मेनू पर वापस जाने के लिए नौ दबाएँ।",
    gloss: "To repeat press 3. For billing please press 8. For plans press 2. For new connection press 6. For technical support press 7. For store info press 1. Return to main menu press 9.",
    language: "hi",
    purpose: "Level 2 menu: department selection (Billing = 8)",
  },
  "prompt-06.wav": {
    script: "धन्यवाद।",
    gloss: "Thank you.",
    language: "hi",
    purpose: "Key acknowledgment / transition",
  },
  "prompt-07.wav": {
    script: "बिल की शिकायत के लिए कृपया 1 दबाएँ। रोमिंग के लिए सात दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएँ। बिल के भुगतान के लिए दो दबाएँ। मुख्य मेनू पर वापस जाने के लिए कृपया 5 दबाएँ।",
    gloss: "For bill complaint please press 1. For roaming press 7. To repeat press 4. For bill payment press 2. Return to main menu press 5.",
    language: "hi",
    purpose: "Level 3 menu: complaint (1) vs payment assistance (2). Note: No refund option offered.",
  },
  "prompt-08.wav": {
    script: "मासिक विवरण के लिए कृपया 1 दबाएँ। रोमिंग के लिए सात दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएँ। बिल के भुगतान के लिए दो दबाएँ। मुख्य मेनू पर वापस जाने के लिए कृपया 5 दबाएँ।",
    gloss: "For monthly statement please press 1. For roaming press 7. To repeat press 4. For bill payment press 2. Return to main menu press 5.",
    language: "hi",
    purpose: "Alternative wording: statement (1) vs payment (2)",
  },
  "prompt-09.wav": {
    script: "For retail store timings press 1. For corporate careers press 2.",
    gloss: "For retail store timings press 1. For corporate careers press 2.",
    language: "en",
    purpose: "Adversarial test: unrelated options (refusal expected)",
  },
  "prompt-10.wav": {
    script: "No option selected.",
    gloss: "No option selected.",
    language: "en",
    purpose: "Timeout notice",
  },
  "prompt-11.wav": {
    script: "For billing press 3. For technical support press 1.",
    gloss: "For billing press 3. For technical support press 1.",
    language: "en",
    purpose: "English billing menu (Billing = 3)",
  },
  "prompt-12.wav": {
    script: "Goodbye.",
    gloss: "Goodbye.",
    language: "en",
    purpose: "Line termination",
  },
  "prompt-13.wav": {
    script: "Please hold. All our agents are busy.",
    gloss: "Please hold. All our agents are busy.",
    language: "en",
    purpose: "English hold prompt",
  },
  "prompt-14.wav": {
    script: "Hello, my name is Asha, and we have a limited time offer for you.",
    gloss: "Hello, my name is Asha, and we have a limited time offer for you.",
    language: "en",
    purpose: "Adversarial test: promotional recording during hold",
  },
};

/** Normalize Devanagari text for robust lookup against prepared scripts or recognition transcripts. */
function normalizeScript(text: string): string {
  return text
    .replace(/[।.,;?!"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_LOOKUP: Map<string, string> = new Map();
for (const entry of Object.values(PROMPT_GLOSSES)) {
  NORMALIZED_LOOKUP.set(normalizeScript(entry.script), entry.gloss);
}

/**
 * Returns an accurate English translation gloss for a spoken or recognized prompt.
 * If the prompt is already in English or no match is found, returns undefined or the existing text.
 */
export function getPromptEnglishGloss(scriptOrTranscript?: string): string | undefined {
  if (!scriptOrTranscript) return undefined;
  const clean = scriptOrTranscript.trim();
  if (!clean) return undefined;

  // Direct lookup
  for (const entry of Object.values(PROMPT_GLOSSES)) {
    if (entry.script === clean) {
      return entry.gloss;
    }
  }

  // Normalized lookup
  const norm = normalizeScript(clean);
  const found = NORMALIZED_LOOKUP.get(norm);
  if (found) return found;

  // Unknown or incomplete text has no authored guide; never fill in unheard menu options.
  return undefined;
}
