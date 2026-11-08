/**
 * The guided scenarios for a judge. Each says what it shows and what it can't. The expected behaviour written here is
 * checked against the real offline stack by tests/judge-demo.test.tsx; the runtime itself is never told it.
 */
import type { CreateSessionRequest } from "../types.js";

export interface DemoScenario {
  key: string;
  title: string;
  shows: string;
  expect: string;
  /** Where the IVR's audio comes from, per the fixture manifest. No speech is generated live in any scenario. */
  audio: string;
  /** Objective-specific English explanation; no navigation hint is passed to the engine. */
  gloss?: string;
  request: Required<Pick<CreateSessionRequest, "goal" | "simulatorScenarioId">> & Pick<CreateSessionRequest, "preferredLanguage">;
  /** The provider-path stack plays only this route. */
  gnaniPath: boolean;
}

export const HINDI_GOAL = "मेरे ब्रॉडबैंड बिल की शिकायत";

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    key: "journey",
    title: "Hindi 3-level menu, hold, agent",
    shows: "The full journey: three Hindi menus, a hold, then a greeting. You confirm the person, or take over.",
    expect: "Presses 5, then 8, then 1. Waits on hold. Raises a possible-person alert and waits for you.",
    audio: "Authentic Gnani Timbre neural voice (Shivani). Prepared demo transcripts; no Gnani requests are made.",
    request: { goal: HINDI_GOAL, preferredLanguage: "hi", simulatorScenarioId: "multilevel-hi-seed-3" },
    gnaniPath: true,
  },
  {
    key: "unfamiliar",
    title: "Unfamiliar Hindi wording",
    shows: "The last menu is reworded in phrasing the engine doesn't support.",
    expect: "Presses 5 and 8, then refuses at the reworded menu and leaves the choice to you.",
    audio: "Authentic Gnani Timbre neural voice (Shivani). Prepared demo transcripts; no Gnani requests are made.",
    request: { goal: HINDI_GOAL, preferredLanguage: "hi", simulatorScenarioId: "multilevel-hi-seed-3-fault-unfamiliar-wording" },
    gnaniPath: false,
  },
  {
    key: "no-match",
    title: "No option fits the objective",
    shows: "A menu whose options are unrelated to what you asked for.",
    expect: "Refuses to press: no matching option. No guess.",
    audio: "Authentic Gnani Timbre neural voice (Shivani). Prepared demo transcripts; no Gnani requests are made.",
    request: { goal: "I need help with my broadband bill.", preferredLanguage: "en", simulatorScenarioId: "adversarial-no-matching-option" },
    gnaniPath: false,
  },
  {
    key: "ad",
    title: "An advert on hold sounds like an agent",
    shows: "While on hold, a recorded advert uses an agent's words and offers a key.",
    expect: "Presses 3 at the menu, then keeps waiting: no possible-person alert, and the advert's key isn't pressed.",
    audio: "Authentic Gnani Timbre neural voice (Shivani). Prepared demo transcripts; no Gnani requests are made.",
    request: { goal: "I need help with my bill", preferredLanguage: "en", simulatorScenarioId: "hold-en-recorded-ad" },
    gnaniPath: false,
  },
  {
    key: "dtmf-failure",
    title: "A key the simulator didn't receive",
    shows: "The simulator reports that a press didn't arrive.",
    expect: "Shows the press as not delivered, never retries it, and stops pressing.",
    audio: "Authentic Gnani Timbre neural voice (Shivani). Prepared demo transcripts; no Gnani requests are made.",
    request: { goal: HINDI_GOAL, preferredLanguage: "hi", simulatorScenarioId: "multilevel-hi-seed-3-fault-dtmf-failure" },
    gnaniPath: false,
  },
];

/**
 * Which stack the launcher started, from the address it printed. A hint for which scenarios to offer and what to warn
 * about, not provenance: what each call actually used is read from its own events.
 *
 * audio: offline, paced, audible. fast: offline, unpaced, silent fallback. gnani-path: the real Prisma adapter answered
 * by a stub. live-prisma: genuine paid Prisma recognition, authorized separately.
 */
export type StackHint = "audio" | "fast" | "gnani-path" | "live-prisma" | "objectives" | "unknown";
export const SINGLE_ROUTE_STACKS: readonly StackHint[] = ["gnani-path", "live-prisma"];

/** Same simulator ID and menus for every objective. Only the user goal changes. Offline only. */
export const HINDI_OBJECTIVES: readonly DemoScenario[] = [
  { key: "objective-complaint", title: "Complain about my broadband bill", gloss: "A complaint about my broadband bill.", goal: HINDI_GOAL,
    shows: "The complaint option leads to hold and a fictional representative. You confirm the handoff; the complaint is not resolved here.",
    expect: "Matches broadband, billing, then the complaint option. Waits on hold and asks you to confirm the greeting." },
  { key: "objective-payment", title: "Pay my broadband bill", gloss: "Pay my broadband bill.", goal: "मेरे ब्रॉडबैंड बिल का भुगतान",
    shows: "The payment option leads to hold and a fictional representative for payment help. No payment is made and no account details are entered.",
    expect: "Matches broadband, billing, then payment instead of complaint. Waits on hold and asks you to confirm the greeting." },
  { key: "objective-refund", title: "Request a broadband bill refund", gloss: "A refund of my broadband bill.", goal: "मेरे ब्रॉडबैंड बिल का रिफंड",
    shows: "Refund is not offered. HoldBuddy must refuse the final options and leave control with you.",
    expect: "Matches broadband and billing, then refuses: complaint and payment do not mean refund. You can take over or end the call." },
].map(({ goal, ...scenario }) => ({ ...scenario,
  audio: "Voice: Shivani · Gnani Timbre. Prepared demo transcripts; no live recognition or Gnani request.",
  request: { goal, preferredLanguage: "hi" as const, simulatorScenarioId: "hi-broadband-shared-objectives" }, gnaniPath: false,
}));

/** A public goal hint only; never provenance, authorization, a digit sequence or automatic start. */
export function objectiveFromHash(hash: string): DemoScenario | undefined {
  const key = new URLSearchParams(hash.split("?", 2)[1] ?? "").get("objective");
  return HINDI_OBJECTIVES.find(s => s.key === key);
}
