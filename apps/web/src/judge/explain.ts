/**
 * Plain-language wording for the runtime's codes. Each entry explains a code; none adds a fact the code doesn't carry.
 * Unknown codes have a neutral explanation; precise diagnostics remain in the developer entry.
 */
import type { DataSource, MenuDecision } from "../types.js";

const ABSTAIN: Record<string, string> = {
  no_matching_option: "None of the options offered matches your objective, so nothing was pressed.",
  language_preference_unknown: "This is a language menu and no preferred language was given.",
  language_not_offered: "Your preferred language isn't one of the options.",
  language_option_negated: "The language option was negated.",
  action_mismatch: "An option matched the topic but not what you want done.",
  conflicting_options: "Two options claimed the same key or the same topic.",
  menu_structure_unclear: "The menu's structure couldn't be read safely, so the key-to-option mapping is not trusted.",
  mixed_clause: "Options and other instructions were mixed in one sentence.",
  unsupported_option_wording: "The options are worded in a way HoldBuddy doesn't understand yet. It refuses rather than guesses.",
  negated_option: "The matching option was negated (\"don't press …\").",
  conditional_option: "The matching option depends on a condition HoldBuddy can't check.",
  service_unavailable: "The menu said the matching service is unavailable.",
  amended_option: "The menu corrected an option, so the earlier wording isn't trusted.",
  sequence_required: "The menu wants a sequence of keys, which HoldBuddy doesn't send.",
  non_instruction: "A digit was spoken but not as an instruction (a time, a number).",
  retracted_instruction: "The menu withdrew an instruction.",
  combined_actions: "One key did several things at once.",
  input_requested: "The menu asked for typed input (an account number, a PIN). HoldBuddy never enters personal data.",
  repeated_menu: "The same menu came back after a press, so pressing again could loop.",
  incomplete_transcript: "The recognition was incomplete, so the menu may be cut off.",
  prompt_interrupted: "The prompt was interrupted before it finished.",
  prompt_too_long: "The prompt was longer than HoldBuddy can process.",
  clarification_limit: "Too many questions to you already.",
  clarification_timeout: "Your answer to the question didn't arrive in time.",
  request_superseded: "A newer prompt replaced the one being asked about.",
  dtmf_limit: "The call reached its limit of presses.",
  dtmf_not_sent: "An earlier press wasn't delivered, so HoldBuddy stops pressing.",
  decision_superseded: "Newer speech overtook the decision before it was sent; the press was withdrawn unsent.",
};

const LISTEN: Record<string, string> = {
  no_speech: "No speech was recognised.",
  no_menu_detected: "Speech with no menu in it (an announcement, a greeting). Nothing to press.",
  prompt_incomplete: "The prompt hasn't finished yet. Waiting for the rest before deciding.",
  on_hold: "Hold music or a hold message. Waiting.",
};

const CLARIFY: Record<string, string> = {
  ambiguous_options: "More than one option could fit. HoldBuddy asks you instead of picking.",
  action_unclear: "It isn't clear what the options do.",
  goal_not_understood: "Your objective couldn't be matched to anything.",
  goal_contains_negation: "Your objective says what you don't want, which HoldBuddy cannot safely interpret.",
};

const BASIS: Record<string, string> = {
  concept: "matched by meaning (same concept as your objective)",
  literal: "matched by the same words as your objective",
  concept_and_literal: "matched by meaning and by the same words",
  language_preference: "matched your preferred language",
  semantic_ranker: "matched by an experimental method",
};

export function explainDecision(decision: MenuDecision | undefined, abstained?: string): { headline: string; why: string; tone: "press" | "refuse" | "listen" | "ask" } | undefined {
  if (!decision && abstained) return { headline: "Refused to press", why: ABSTAIN[abstained] ?? "HoldBuddy could not establish a safe choice, so nothing was pressed.", tone: "refuse" };
  if (!decision) return undefined;
  switch (decision.kind) {
    case "press":
      return {
        headline: `Press ${decision.digit}`,
        why: `Option ${decision.digit} ("${decision.label}") ${BASIS[decision.basis] ?? "matched your objective"}${decision.alternatives > 0 ? `; ${decision.alternatives} weaker alternative${decision.alternatives === 1 ? "" : "s"} set aside` : "; no competing option"}.`,
        tone: "press",
      };
    case "abstain":
      return { headline: "Refused to press", why: ABSTAIN[decision.reason] ?? "HoldBuddy could not establish a safe choice, so nothing was pressed.", tone: "refuse" };
    case "clarify":
      return { headline: "Asked you to choose", why: CLARIFY[decision.reason] ?? "HoldBuddy needs your help to choose.", tone: "ask" };
    case "listen":
      return { headline: "Listened, no press", why: LISTEN[decision.reason] ?? "HoldBuddy is listening without pressing.", tone: "listen" };
  }
}

export function reasonCode(decision: MenuDecision | undefined, abstained?: string): string | undefined {
  if (!decision) return abstained;
  return decision.kind === "press" ? `${decision.basis}, score ${decision.score.toFixed(2)}` : decision.reason;
}

/** What a recogniser id means. Unknown ids are shown verbatim as unknown, never promoted. */
export function describeRecognizer(providerId: string | undefined, dataSource: DataSource): { label: string; detail: string; real: boolean } {
  if (dataSource === "REAL_API") {
    return { label: "Gnani Prisma (live)", detail: "Genuine recognition by Gnani's Prisma API during this call. Paid request.", real: true };
  }
  switch (providerId) {
    case "STUB-prisma-adapter-not-recognition":
      return {
        label: "Demo transcript",
        detail: "A prepared transcript was used in place of speech recognition. Gnani did not recognize this audio during the call.",
        real: false,
      };
    case "offline-mock-by-audio-hash":
      return {
        label: "Demo transcript",
        detail: "A prepared transcript matched to this recording. No speech recognition happened during this call.",
        real: false,
      };
    default:
      return { label: "Unverified recognition source", detail: "The source has not been verified as genuine speech recognition.", real: false };
  }
}

export const PRESS_STATE: Record<string, { label: string; detail: string }> = {
  requested: { label: "Sent, awaiting receipt", detail: "Sent to the simulated line; not yet confirmed received." },
  delivered: { label: "Button received", detail: "The fictional simulator acknowledged receiving this key." },
  not_delivered: { label: "Not delivered", detail: "The simulator reported the key did not arrive. HoldBuddy stops pressing." },
  unknown: { label: "Delivery unknown", detail: "No acknowledgement before the deadline. Pressing again could double-press, so the call stops." },
  refused: { label: "Not sent", detail: "The demo refused to send it." },
  withdrawn: { label: "Withdrawn unsent", detail: "Newer audio overtook it before it was sent." },
};

export const OUTCOME: Record<string, string> = {
  handoff: "Handed over to you after you confirmed the person.",
  manual_takeover: "You took over. Automation ended and no further key can be sent.",
  stopped: "Stopped.",
  failed: "Automation ended after a problem. Check the line-closure status.",
};

export const SIMULATOR_STOP: Record<string, string> = {
  confirmed: "Simulator confirmed it stopped.",
  pending: "Stop requested; simulator hasn't confirmed yet.",
  failed: "Simulator did not confirm stopping. It may still be running.",
};
