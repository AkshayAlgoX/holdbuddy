/**
 * The scripted Hindi route, for the Studio's preview before a call. Words, order, keys and clip lengths are the scenario's
 * and the manifest's own (tests/studio-preview.test.ts checks them). It is a preview of what the script would do, shown as
 * such; nothing in it is played, recognised or pressed.
 */
export interface PreviewStop {
  kind: "menu" | "announcement" | "hold" | "agent";
  said: string;
  gloss: string;
  /** The key the route expects HoldBuddy to press, if this stop is a menu. */
  key?: string;
  /** The accepted recording's length, from the manifest. */
  durationMs: number;
}

export const PREVIEW_ROUTE: readonly PreviewStop[] = [
  { kind: "menu", said: "मोबाइल के लिए कृपया 3 दबाएँ। लैंडलाइन के लिए छह दबाएँ। रोमिंग के लिए कृपया 1 दबाएँ। ब्रॉडबैंड के लिए पाँच दबाएँ।", gloss: "Mobile 3, landline 6, roaming 1, broadband 5.", key: "5", durationMs: 8880 },
  { kind: "menu", said: "दोबारा सुनने के लिए तीन दबाएँ। बिल के लिए कृपया 8 दबाएँ। प्लान के लिए दो दबाएँ। नया कनेक्शन के लिए कृपया 6 दबाएँ। तकनीकी सहायता के लिए सात दबाएँ। स्टोर की जानकारी के लिए कृपया 1 दबाएँ। मुख्य मेनू पर वापस जाने के लिए नौ दबाएँ।", gloss: "Repeat 3, billing 8, plans 2, new connection 6, technical help 7, stores 1, main menu 9.", key: "8", durationMs: 16640 },
  { kind: "announcement", said: "धन्यवाद।", gloss: "Thank you.", durationMs: 1360 },
  { kind: "menu", said: "बिल की शिकायत के लिए कृपया 1 दबाएँ। रोमिंग के लिए सात दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएँ। बिल के भुगतान के लिए दो दबाएँ। मुख्य मेनू पर वापस जाने के लिए कृपया 5 दबाएँ।", gloss: "Bill complaint 1, roaming 7, repeat 4, bill payment 2, main menu 5.", key: "1", durationMs: 12080 },
  { kind: "hold", said: "कृपया लाइन पर बने रहें। हमारे सभी प्रतिनिधि व्यस्त हैं।", gloss: "Please stay on the line. All our representatives are busy.", durationMs: 4080 },
  { kind: "agent", said: "नमस्ते, मेरा नाम आशा है। मैं आपकी क्या सहायता कर सकती हूँ?", gloss: "Hello, my name is Asha. How can I help you?", durationMs: 4720 },
];
