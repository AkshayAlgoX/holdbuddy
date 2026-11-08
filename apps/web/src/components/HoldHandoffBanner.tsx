import React, { useEffect, useRef } from "react";
import { availableActions, type HandoffState } from "../../../../packages/handoff/src/index.js";

const BASE_TITLE = typeof document !== "undefined" ? document.title : "HoldBuddy";

const WHY_IT_FAILED: Record<string, string> = {
  source_silent: "The line went silent for too long, so HoldBuddy closed the call.",
  call_time_limit: "The call reached its time limit, so HoldBuddy closed it.",
  stale_decision: "New audio kept arriving just before HoldBuddy could press, so it stopped without pressing instead of guessing.",
  dtmf_ack_timeout: "HoldBuddy can't tell whether its last digit arrived, so it stopped instead of guessing.",
};

/** The wording shown to the user. It never says a person is definitely there. */
export function holdHandoffView(state: HandoffState): { headline: string; detail: string; urgent: boolean } | undefined {
  const notice = state.notifications.at(-1);
  switch (state.phase) {
    case "navigating":
      return notice?.kind === "CHECK_LINE" ? { headline: "Check the line", detail: notice.message, urgent: false } : undefined;
    case "on_hold": {
      const detail = notice && notice.kind !== "HOLD_STARTED" ? notice.message : "HoldBuddy is waiting and will alert you if someone may have answered.";
      return { headline: "On hold", detail, urgent: false };
    }
    case "possible_human":
      return { headline: "Someone may have answered", detail: "Listen, then take over. This could still be a recording.", urgent: true };
    case "user_takeover":
      return { headline: "You took over", detail: "HoldBuddy has stopped and won't press anything else.", urgent: false };
    case "handoff_confirmed":
      return { headline: "Handed over to you", detail: "HoldBuddy has stopped and won't press anything else.", urgent: false };
    case "stopped":
      return { headline: "Call stopped", detail: "HoldBuddy has stopped.", urgent: false };
    case "failed":
      return { headline: "Call failed", detail: WHY_IT_FAILED[state.failureReason ?? ""] ?? "HoldBuddy has stopped. See the timeline for why.", urgent: false };
  }
}

/** A short tone, because someone on hold has often looked away. Browsers may block it, which is harmless. */
function chime(): void {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.08;
    tone.frequency.value = 880;
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.35);
    tone.onended = () => void audio.close();
  } catch {
    // The banner and tab title still show the alert.
  }
}

interface HoldHandoffBannerProps {
  state: HandoffState;
  isLoading: boolean;
  onTakeOver: () => Promise<void>;
  onStop: () => Promise<void>;
}

/** The tab title, and one chime per new alert. Shared by the console banner and the Call Studio. */
export function useHandoffAttention(state: HandoffState): void {
  const urgent = holdHandoffView(state)?.urgent === true;
  const lastChimed = useRef<number | undefined>(undefined);
  useEffect(() => {
    document.title = urgent ? "Someone may have answered - HoldBuddy" : state.phase === "on_hold" ? "On hold - HoldBuddy" : BASE_TITLE;
    if (urgent && state.alert && lastChimed.current !== state.alert.seq) {
      lastChimed.current = state.alert.seq;
      chime();
    }
    return () => {
      document.title = BASE_TITLE;
    };
  }, [urgent, state.phase, state.alert]);
}

export function HoldHandoffBanner({ state, isLoading, onTakeOver, onStop }: HoldHandoffBannerProps) {
  const view = holdHandoffView(state);
  const urgent = view?.urgent === true;
  useHandoffAttention(state);

  if (!view) return null;
  const actions = availableActions(state);
  return (
    <section
      role={urgent ? "alert" : "status"}
      data-testid="hold-handoff-banner"
      // Stays below the sticky header, because the timeline's auto-scroll can move the page while someone waits.
      style={urgent ? { position: "sticky", top: 104, zIndex: 30, backgroundColor: "#451a03", borderColor: "#d97706", color: "#fef3c7" } : undefined}
      className={`p-4 mb-6 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${urgent ? "" : "bg-zinc-900/70 border-zinc-800 text-zinc-200"}`}
    >
      <div className="flex-1">
        <div className="font-semibold text-sm">{view.headline}</div>
        <p className="text-xs mt-0.5 opacity-90">{view.detail}</p>
        {state.alert && (
          <p className="text-[11px] mt-1 font-mono opacity-80">
            Matched: "{state.alert.evidence}" | {state.alert.strength} match | transcript {state.alert.evidenceSource} | fictional line
          </p>
        )}
      </div>
      {actions.includes("take_over") && (
        <div className="flex gap-2 shrink-0">
          <button type="button" disabled={isLoading} onClick={() => void onTakeOver()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50">
            Take over now
          </button>
          <button type="button" disabled={isLoading} onClick={() => void onStop()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50">
            Stop
          </button>
        </div>
      )}
    </section>
  );
}
