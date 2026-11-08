/**
 * The Call Studio. Everything it shows comes from the runtime's own events, the session view and the handoff reducer;
 * the audio is the simulator's own prompt, replayed locally. Nothing is animated that didn't happen.
 *
 * Composition: the objective and the dial on paper; a large word for where the call stands; the call drawn as a route on a
 * charcoal canvas (the Line); then the focused prompt read in three voices: the recording, what HoldBuddy heard, and what
 * it did; then the handoff, the keys and the record.
 */
import React, { useEffect, useMemo, useState } from "react";
import { buildCallStory, type PromptStep, type StoryItem } from "../judge/story.js";
import { describeRecognizer, explainDecision, PRESS_STATE } from "../judge/explain.js";
import { DEMO_SCENARIOS, HINDI_OBJECTIVES, objectiveFromHash, SINGLE_ROUTE_STACKS, type DemoScenario, type StackHint } from "../judge/demo-scenarios.js";
import { useJudgeAudio, type ClipState } from "../judge/audio.js";
import { getPromptEnglishGloss } from "../judge/prompt-glosses.js";
import { useHandoffAttention } from "../components/HoldHandoffBanner.js";
import { withBrowserDeadlines } from "../utils/formatting.js";
import { EvidenceLabel } from "../ui/EvidenceLabel.js";
import { IconAlert, IconCheck, IconClock, IconEye, IconEyeOff, IconHand, IconInfo, IconPhone, IconPhoneOff, IconPlay, IconStop, IconVolume, IconVolumeOff } from "../ui/icons.js";
import type { SessionApi } from "../shell/types.js";
import type { Route } from "../shell/router.js";
import { Waveform } from "../studio/Waveform.js";
import { Keypad } from "../studio/Keypad.js";
import { Popover } from "../ui/Overlay.js";
import { publicError, recognitionSource, terminationWarning } from "../ui/public-copy.js";
import { PreviewTrack, RouteTrack } from "../studio/RouteTrack.js";
import { PREVIEW_ROUTE } from "../studio/preview.js";

const DEVANAGARI = /[ऀ-ॿ]/;
const langOf = (text: string) => (DEVANAGARI.test(text) ? "hi" : /[ಀ-೿]/.test(text) ? "kn" : undefined);
const secs = (ms: number | undefined) => (ms === undefined ? "" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
const isPrompt = (item: StoryItem): item is PromptStep => item.kind === "prompt";

/** Why a call ended on a failure, in plain words. Codes not listed are shown as themselves. */
const FAILURE_WORDS: Record<string, string> = {
  "runtime:stt_budget_exhausted": "The recognition request budget ran out, so HoldBuddy stopped rather than act on speech it couldn't hear.",
  "runtime:stt_fatal": "Speech recognition failed in a way that can't be retried, so HoldBuddy stopped without pressing.",
  "runtime:stt_repeated_failure": "Speech recognition kept failing, so HoldBuddy stopped without pressing.",
  "runtime:stt_provenance_mismatch": "A recognition result didn't carry the provenance it should, so it was refused.",
  "runtime:audio_rejection_limit": "Too much of the line's audio was unusable, so HoldBuddy stopped.",
  "runtime:simulator_start_failed": "The fictional line didn't start.",
  "runtime:source_silent": "The line went silent for too long.",
  "runtime:call_time_limit": "The call reached its time limit.",
  "runtime:stale_decision": "New audio kept overtaking HoldBuddy's decisions, so it stopped instead of pressing on stale information.",
  "runtime:internal_error": "The demo could not continue, so automation ended.",
  "core:dtmf_ack_timeout": "HoldBuddy couldn't tell whether its last key arrived, so it stopped instead of risking a double press.",
  "core:dtmf_limit": "The call reached its limit of key presses.",
  "core:no_progress": "The menus weren't leading anywhere, so HoldBuddy stopped.",
  "core:hold_limit": "The hold went on longer than HoldBuddy's limit.",
  "core:observation_limit": "The call reached its limit of prompts.",
  "core:rejected_event_limit": "Too many events were rejected as invalid, so HoldBuddy stopped.",
};

const STT_FAILURE_WORDS: Record<string, string> = {
  budget_exhausted: "The recognition allowance was used up",
  timeout: "Recognition timed out",
  network: "Could not reach speech recognition",
  auth: "Speech recognition could not connect",
  insufficient_credit: "Speech recognition is unavailable",
  rate_limited: "Speech recognition is busy",
  server: "The provider had a server error",
  invalid_response: "The provider's reply was invalid",
  provenance_mismatch: "The recognition source could not be verified",
  unsafe_provider_response: "The provider's reply was refused as unsafe",
};

const CLIP_WORDS: Record<ClipState["status"], string> = {
  loading: "Fetching the prompt's audio",
  playing: "Playing now",
  played: "Played",
  muted: "Sound is off",
  blocked: "Your browser blocked autoplay. Press play to hear it.",
  unavailable: "No audio was served for this prompt",
};

const OUTCOME_TITLE: Record<string, string> = { handoff: "Handed over to you", manual_takeover: "You took over", stopped: "Call ended", failed: "Ended on a failure" };
const OUTCOME_DETAIL: Record<string, string> = {
  handoff: "You confirmed the fictional greeting. The simulator stopped; no telephone call was transferred.",
  manual_takeover: "Automation stopped in this simulation. No telephone call was transferred.",
  stopped: "The call was stopped. HoldBuddy pressed nothing after that.",
  failed: "Automation ended. Check below whether the line also stopped.",
};

interface StudioPageProps {
  session: SessionApi;
  stack: StackHint;
  scenario?: DemoScenario;
  initialObjective?: DemoScenario;
  onStartScenario: (scenario: DemoScenario) => void;
  onReset: () => void;
  onOpenSettings: () => void;
  onNavigate: (route: Route) => void;
}

export function StudioPage({ session, stack, scenario, initialObjective, onStartScenario, onReset, onOpenSettings, onNavigate }: StudioPageProps) {
  const { config, currentSession, events, handoff, isLoading, error, health, connectionState, stopCall, takeOver, decideHuman, answerClarification } = session;
  const shown = useMemo(() => (currentSession ? withBrowserDeadlines(currentSession, events.at(-1)) : null), [currentSession, events]);
  const story = useMemo(() => buildCallStory(events, shown), [events, shown]);
  const closed = Boolean(shown?.closed);
  const active = Boolean(shown) && !closed;
  const audio = useJudgeAudio(story, config, closed, stack);
  useHandoffAttention(handoff);

  const singleRoute = SINGLE_ROUTE_STACKS.includes(stack);
  const offered = stack === "objectives" ? HINDI_OBJECTIVES : singleRoute ? DEMO_SCENARIOS.filter((s) => s.gnaniPath) : DEMO_SCENARIOS;
  const [choice, setChoice] = useState<DemoScenario>(scenario ?? (stack === "objectives" ? initialObjective ?? objectiveFromHash(typeof window === "undefined" ? "" : window.location.hash) : undefined) ?? offered[0]!);
  // A restored call can have no local scenario selection. Its runtime goal still owns the trace and repeat action.
  const selected = scenario && (active || (stack === "objectives" && isLoading)) ? scenario : choice;
  const recordedChoice = stack === "objectives" && shown
    ? offered.find(s => s.request.goal === shown.goal) ?? {
      ...selected, title: "Recorded objective", gloss: shown.goal, shows: "The objective recorded for this call.",
      request: { ...selected.request, goal: shown.goal },
    }
    : undefined;
  const running = recordedChoice ?? selected;
  const dialChoice = recordedChoice ?? choice;
  const [pinned, setPinned] = useState<string | undefined>(undefined);
  const [previewStop, setPreviewStop] = useState(0);
  const [showRealText, setShowRealText] = useState(true);
  useEffect(() => setPinned(undefined), [story.sessionId]);

  const prompts = story.items.filter(isPrompt);
  const focusId = pinned ?? audio.playingPromptId ?? prompts.at(-1)?.promptId;
  const focusIndex = prompts.findIndex((p) => p.promptId === focusId);
  const focus = focusIndex >= 0 ? prompts[focusIndex] : undefined;
  const terminationUnconfirmed = closed && shown?.simulatorStop !== "confirmed";
  const hasReal = (story.outcome.recognitions.bySource.REAL_API ?? 0) > 0;
  const connected = Boolean(config.userToken) && Boolean(health);
  const presses = prompts.flatMap((p) => p.presses);
  const clarification = shown?.pendingRequest?.kind === "clarification" ? shown.pendingRequest : undefined;
  const clarificationEvent = [...events].reverse().find((e) => e.type === "clarification.requested");
  const outcome = story.outcome.outcome as "handoff" | "manual_takeover" | "stopped" | "failed" | undefined;
  const pending = presses.find((p) => p.state === "requested");
  const lastDecision = prompts.at(-1)?.decision;

  // One word for where the call stands, from the session and the handoff reducer only.
  const stage = !shown
    ? { word: isLoading ? "Dialling." : "Ready.", line: connected ? "Press the dial to start the call. You'll hear every prompt as the line speaks it." : "Connect to the demo line to begin." }
    : closed
      ? { word: terminationUnconfirmed ? "Automation ended." : `${OUTCOME_TITLE[outcome ?? ""] ?? "Call ended"}.`, line: terminationUnconfirmed ? terminationWarning : OUTCOME_DETAIL[outcome ?? ""] ?? "" }
      : handoff.phase === "possible_human"
        ? { word: "Someone may have answered.", line: "HoldBuddy can't tell a person from a recording. It's your call." }
        : handoff.phase === "on_hold"
          ? { word: "On hold.", line: "Waiting. HoldBuddy presses nothing while on hold, and keeps listening." }
          : pending
            ? { word: `Pressing ${pending.digit}.`, line: "Sent to the line, waiting for its acknowledgement." }
            : stack === "objectives" && lastDecision?.kind === "abstain"
              ? { word: "Your turn.", line: "HoldBuddy refused the offered actions. Take over or end the call; no further key was selected." }
            : prompts.length === 0
              ? { word: "Dialling.", line: "The first prompt appears the moment the fictional line begins it." }
              : audio.playingPromptId
                ? { word: "Listening.", line: "The line is speaking. HoldBuddy can't decide before it has heard the prompt." }
                : { word: "Deciding.", line: "Matching what was heard against what you asked for." };

  return (
    <div className={`hb-studio is-${!shown ? "idle" : closed ? "closed" : handoff.phase}`}>
      <section className="hb-studio-top hb-wrap" aria-labelledby="hb-objective-title">
        <div className="hb-objective">
          <p className="hb-kicker" id="hb-objective-title">Your goal · a simulated customer-care call</p>
          <h1 className="hb-objective-goal" lang={langOf(running.request.goal)}>{running.request.goal}</h1>
          <p className="hb-objective-gloss">
            {running.request.preferredLanguage === "hi" ? <span className="hb-em">“{running.gloss ?? "A complaint about my broadband bill."}” </span> : null}
            {" "}{running.shows}
          </p>
          {stack === "objectives" && !shown && !isLoading && (
            <div className="hb-goal-switcher" role="radiogroup" aria-label="Choose demonstration goal" onKeyDown={event => {
              const at = HINDI_OBJECTIVES.findIndex(o => o.key === choice.key), step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!step && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? HINDI_OBJECTIVES.length - 1 : (at + step + HINDI_OBJECTIVES.length) % HINDI_OBJECTIVES.length;
              setChoice(HINDI_OBJECTIVES[next]!); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
            }}>
              <span className="hb-switcher-kicker">Choose your objective · Same Hindi IVR phone tree:</span>
              <div className="hb-switcher-cards">
                {HINDI_OBJECTIVES.map((obj, i) => {
                  const isSelected = choice.key === obj.key;
                  const tag = i === 0 ? "Complaint" : i === 1 ? "Payment Help" : "Refund";
                  const routeSummary = i === 0 ? "5 → 8 → 1 · Handoff" : i === 1 ? "5 → 8 → 2 · Handoff" : "5 → 8 → Refusal";
                  return (
                    <button
                      key={obj.key}
                      type="button"
                      role="radio"
                      aria-label={obj.title}
                      tabIndex={isSelected ? 0 : -1}
                      aria-checked={isSelected}
                      className={`hb-goal-card ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setChoice(obj)}
                    >
                      <div className="hb-goal-card-top">
                        <span className="hb-goal-index">0{i + 1}</span>
                        <span className="hb-goal-badge">{tag}</span>
                        <span className="hb-goal-route-tag">{routeSummary}</span>
                      </div>
                      <p className="hb-goal-title" lang="hi">{obj.request.goal}</p>
                      <p className="hb-goal-gloss">“{obj.gloss}”</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!active && offered.length > 1 && stack !== "objectives" && <details className="hb-other-calls" onKeyDown={event => {
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
            if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
            else if (at >= 0 && (step || event.key === "Home" || event.key === "End")) {
              event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (at + step + buttons.length) % buttons.length;
              setChoice(offered[next]!); buttons[next]?.focus();
            }
          }}>
            <summary>Explore other demo calls</summary>
            <div className="hb-call-index" role="radiogroup" aria-label="Choose a call">{offered.map((s, i) => <button key={s.key} type="button" role="radio" data-value={s.key} aria-checked={choice.key === s.key} tabIndex={choice.key === s.key ? 0 : -1} onClick={event => {
              setChoice(s); const details = event.currentTarget.closest("details")!; details.open = false; details.querySelector("summary")?.focus();
            }}><span className="hb-call-index-n" aria-hidden="true">0{i + 1}</span><span>{s.key === "journey" ? "Broadband billing · Hindi" : s.key === "dtmf-failure" ? "A button that doesn't arrive" : s.title}</span><span className="hb-call-index-mark" aria-hidden="true" /></button>)}</div>
            <p className="hb-caption"><a className="hb-link" href="?#/studio">Choose an objective</a></p>
          </details>}
          {stack === "objectives" && (
            <p className="hb-caption">
              {running.audio} The same menu serves all three objectives. A handoff does not mean a payment or complaint was completed.{" "}
              <button type="button" className="hb-link" onClick={onOpenSettings}>Backend status &amp; contracts</button>
            </p>
          )}

        </div>

        <div className="hb-dial-zone">
          {!active ? (
            <button
              type="button"
              className="hb-dial"
              disabled={!connected || isLoading || terminationUnconfirmed}
              onClick={() => {
                audio.unlock();
                setPinned(undefined);
                onStartScenario(dialChoice);
              }}
              aria-label={`Start call: ${dialChoice.key === "dtmf-failure" ? "A button that does not arrive" : dialChoice.title}`}
            >
              <span className="hb-dial-disc" aria-hidden="true"><IconPhone /></span>
              <span className="hb-dial-label">{isLoading ? "Starting…" : closed ? "Call again" : "Start the call"}</span>
            </button>
          ) : (
            <div className="hb-call-actions">
              <button type="button" className="hb-btn hb-btn-ink hb-btn-lg" onClick={() => void takeOver()} disabled={isLoading}>
                <IconHand /> Take over the call
              </button>
              <button type="button" className="hb-btn hb-btn-quiet" onClick={() => void stopCall()} disabled={isLoading}>
                <IconPhoneOff /> End call
              </button>
            </div>
          )}
          {closed && !terminationUnconfirmed && (
            <button type="button" className="hb-link" onClick={onReset}>
              {stack === "objectives" ? "Choose another objective" : "Clear"}
            </button>
          )}
          <div className="hb-dial-tools">
            {audio.audioEnabled ? (
              <button type="button" className="hb-switch" aria-pressed={audio.soundOn} onClick={() => audio.setSoundOn(!audio.soundOn)}>
                {audio.soundOn ? <IconVolume className="hb-switch-icon" /> : <IconVolumeOff className="hb-switch-icon" />}
                <span className="hb-switch-track" aria-hidden="true" />
                <span>{audio.soundOn ? "Sound on" : "Sound off"}</span>
              </button>
            ) : (
              <span className="hb-caption">{stack === "fast" ? "Silent mode" : "No audio on this connection"}</span>
            )}
            <Legend live={hasReal} />
          </div>
          {!connected && (
            <p className="hb-small hb-connect-hint">
              The demo couldn't connect. Please try reconnecting in a moment.{" "}
              <button type="button" className="hb-link" onClick={onOpenSettings}>Reconnect</button>
            </p>
          )}
          {hasReal && (
            <p className="hb-note hb-note-cobalt hb-live-note">
              <IconInfo />
              <span><strong className="hb-strong">Genuine recognition.</strong> This session reports Gnani results from its authenticated runtime. Provider use is controlled server-side.</span>
            </p>
          )}
        </div>
      </section>

      {error && (
        <div className="hb-wrap">
          <p className="hb-note hb-note-danger hb-studio-error" role="status">
            <IconAlert />
            <span>
              {publicError(error.code)}{" "}<button className="hb-link" onClick={onOpenSettings}>Check connection</button>
            </span>
          </p>
        </div>
      )}

      {terminationUnconfirmed && <div className="hb-wrap"><p className="hb-note hb-note-danger" role="alert">{terminationWarning} <button className="hb-link" onClick={onOpenSettings}>Check call status</button></p></div>}

      <section className="hb-stageline hb-wrap" aria-live="polite">
        <div>
          <p className="hb-stage-word" key={stage.word}>{stage.word}</p>
          <p className="hb-stage-sub">{stage.line}</p>
        </div>
      </section>

      {handoff.phase === "possible_human" && !closed && (
        <section className="hb-human" aria-labelledby="hb-human-title">
          <div className="hb-wrap hb-human-inner">
            <div className="hb-human-text">
              <h2 id="hb-human-title" className="hb-title">Is it a person?</h2>
              <p className="hb-lead">
                HoldBuddy can't tell a person from a recording, so it's asking you.
                {handoff.alert?.evidence && (
                  <>
                    {" "}Words heard: <span lang={langOf(handoff.alert.evidence)} className="hb-strong">“{handoff.alert.evidence}”</span>
                  </>
                )}
              </p>
            </div>
            <div className="hb-human-actions">
              {handoff.alert?.requestId ? (
                <>
                  <button type="button" className="hb-btn hb-btn-primary hb-btn-lg" disabled={isLoading} onClick={() => void decideHuman(handoff.alert!.requestId!, "confirmed")}>
                    <IconCheck /> It's a person: hand me the call
                  </button>
                  <button type="button" className="hb-btn hb-btn-quiet" disabled={isLoading} onClick={() => void decideHuman(handoff.alert!.requestId!, "rejected")}>
                    Not a person, keep waiting
                  </button>
                </>
              ) : (
                <span className="hb-small">The confirmation window has lapsed; you can still take over.</span>
              )}
            </div>
          </div>
        </section>
      )}

      {clarification && clarificationEvent?.type === "clarification.requested" && (
        <ClarificationBand requestId={clarification.requestId} candidates={clarificationEvent.candidates.map((c) => `${c.digit}: ${c.label}`)} disabled={isLoading} onAnswer={answerClarification} />
      )}

      <section className={`hb-canvas hb-dark ${shown ? "is-live" : "is-preview"}`} aria-label="The call as a route">
        <div className="hb-canvas-head hb-wrap">
          <p className="hb-canvas-title">{shown ? "The call, as it happened" : running.key === "journey" ? "Your route preview" : "A different call"}</p>
          <p className="hb-canvas-note">
            {shown
              ? "Select a stop to inspect it. The route advances only when a button is received."
              : running.key === "journey"
                ? "Choose a stop to read it. Nothing is playing yet."
                : running.expect}
          </p>
        </div>
        <div className="hb-canvas-body">
          {shown ? (
            prompts.length > 0 ? (
              <RouteTrack
                items={story.items}
                clips={audio.clips}
                {...(audio.playingPromptId ? { playingId: audio.playingPromptId } : {})}
                {...(focus ? { focusId: focus.promptId } : {})}
                onFocus={(id) => setPinned(id)}
                getPlayer={audio.getPlayer}
                callClosed={closed}
                terminationConfirmed={shown?.simulatorStop === "confirmed"}
                {...(outcome ? { ending: outcome } : {})}
              />
            ) : (
              <div className="hb-canvas-waiting hb-wrap"><span className="hb-listening" aria-hidden="true" /> Dialling the fictional line…</div>
            )
          ) : running.key === "journey" ? (
            <PreviewTrack selected={previewStop} onSelect={setPreviewStop} />
          ) : (
            <div className="hb-canvas-waiting hb-wrap">{running.shows}</div>
          )}
        </div>
      </section>

      <section className="hb-now hb-wrap" aria-label="Current prompt">
        {focus ? (
          <Now
            focus={focus}
            index={focusIndex}
            count={prompts.length}
            clip={audio.clips[focus.promptId]}
            playing={audio.playingPromptId === focus.promptId}
            getPlayer={audio.getPlayer}
            onReplay={() => audio.playingPromptId === focus.promptId ? audio.stop() : audio.replay(focus.promptId)}
            showRealText={showRealText}
            onToggleRealText={hasReal ? () => setShowRealText(!showRealText) : undefined}
            live={pinned === undefined}
            onBackToLive={() => setPinned(undefined)}
            callClosed={closed}
          />
        ) : !shown && running.key === "journey" ? (
          <PreviewNow index={previewStop} />
        ) : (
          <div className="hb-now-empty">
            <p className="hb-heading">{shown ? "Waiting for the first prompt." : "Nothing has been said yet."}</p>
            <p className="hb-body">When the line speaks, you'll read it here three ways: what the recording says, what HoldBuddy heard, and what it did about it.</p>
          </div>
        )}
      </section>

      {closed && !terminationUnconfirmed && (outcome === "handoff" || outcome === "manual_takeover") && (
        <section className="hb-handoff hb-dark" aria-label="Handoff">
          <div className="hb-wrap hb-handoff-inner">
            <p className="hb-handoff-word">
              The line is <span className="hb-em">yours.</span>
            </p>
            <p className="hb-handoff-route" aria-label={`Keys delivered: ${story.outcome.delivered.join(", ") || "none"}`}>
              {story.outcome.delivered.map((d, i) => (
                <React.Fragment key={i}>
                  <span className="hb-handoff-key">{d}</span>
                  <span className="hb-handoff-rail" aria-hidden="true" />
                </React.Fragment>
              ))}
              <span className="hb-handoff-you">You</span>
            </p>
          </div>
        </section>
      )}

      {shown && <details className="hb-call-record hb-wrap"><summary>Call details</summary>
      <section className="hb-ledger" aria-label="Buttons and call record">
        <div className="hb-ledger-keys"><h2 className="hb-heading">Buttons received</h2><p className="hb-caption">A record of what arrived. This is not a dial pad.</p><Keypad presses={presses} /></div>
        {closed ? <Outcome story={story} simulatorStop={shown?.simulatorStop} /> : <LiveRecord story={story} connectionState={connectionState} active={active} handoffPhase={handoff.phase} onNavigate={onNavigate} />}
        <Notes items={story.items} />
      </section></details>}

    </div>
  );
}

function Legend({ live }: { live: boolean }) {
  return (
    <Popover className="hb-legend" label="Evidence labels">
      <dl>
        <div><dt><EvidenceLabel kind="LOCAL_REPLAY" /></dt><dd>Previously recorded audio played here. No real phone line or newly generated speech.</dd></div>
        <div><dt><EvidenceLabel kind="MOCK" /></dt><dd>A prepared transcript. No speech recognition happened during this demo call.</dd></div>
        {live && <div><dt><EvidenceLabel kind="REAL_API" /></dt><dd>Gnani Prisma recognized the audio during this call, in a separately authorized run.</dd></div>}
        <div><dt><EvidenceLabel kind="GENUINE_PAST_RUN" /></dt><dd>Measurements from an earlier genuine Gnani experiment. Read more in How it works.</dd></div>
      </dl>
    </Popover>
  );
}

function PreviewNow({ index }: { index: number }) {
  const stop = PREVIEW_ROUTE[index]!;
  return (
    <div className="hb-now-grid is-preview" id="hb-preview-detail">
      <div className="hb-voice">
        <p className="hb-voice-label">Stop {index + 1}: the recording will say</p>
        <p className="hb-voice-said" lang="hi">{stop.said}</p>
        <p className="hb-caption">{stop.gloss}</p>
      </div>
      <div className="hb-voice">
        <p className="hb-voice-label">What the script expects</p>
        <p className="hb-voice-verdict">{stop.key ? `Press ${stop.key}` : stop.kind === "hold" ? "Wait" : stop.kind === "agent" ? "Ask you" : "Listen"}</p>
        <p className="hb-body">
          {stop.key
            ? `If what HoldBuddy hears matches the script, option ${stop.key} matches your objective.`
            : stop.kind === "hold"
              ? "A hold message: nothing to press. HoldBuddy keeps listening."
              : stop.kind === "agent"
                ? "A greeting. HoldBuddy can't tell a person from a recording, so it will ask you."
                : "An announcement with nothing to press."}
        </p>
        <p className="hb-caption">A preview of the script, not a result. The call decides only from what it actually hears.</p>
      </div>
    </div>
  );
}

interface NowProps {
  focus: PromptStep;
  index: number;
  count: number;
  clip?: ClipState;
  playing: boolean;
  getPlayer: () => HTMLAudioElement | null;
  onReplay: () => void;
  showRealText: boolean;
  onToggleRealText?: () => void;
  live: boolean;
  onBackToLive: () => void;
  callClosed: boolean;
}

/** The focused prompt in three voices: the recording, what HoldBuddy heard, what it did. */
function Now({ focus, index, count, clip, playing, getPlayer, onReplay, showRealText, onToggleRealText, live, onBackToLive, callClosed }: NowProps) {
  const rec = focus.recognition;
  const who = rec ? describeRecognizer(rec.providerId, rec.dataSource) : undefined;
  const explained = explainDecision(focus.decision, focus.abstained);
  const hide = rec?.dataSource === "REAL_API" && !showRealText;
  const scriptGloss = getPromptEnglishGloss(clip?.script);
  const heardGloss = getPromptEnglishGloss(rec?.transcript);
  // Once the call has closed, a prompt with no recognition will never get one: say so, never "recognising".
  const status = focus.audioRejected ? "unusable" : focus.sttFailure ? "failed" : rec ? "heard" : callClosed ? "unheard" : playing ? "speaking" : focus.audioMs !== undefined ? "recognising" : "speaking";
  const STATUS_TEXT = { unusable: "Audio unavailable", speaking: "IVR speaking", recognising: "Recognising", heard: "Heard", failed: "Recognition failed", unheard: "Not recognised" } as const;
  const scriptMatches = rec && clip?.script !== undefined ? rec.transcript.trim() === clip.script.trim() : undefined;

  return (
    <div id="hb-current-prompt" className={`hb-stage hb-now-grid is-${status}`} data-stage-status={status}>
      <div className="hb-now-head">
        <p className="hb-now-index hb-num">
          Prompt {index + 1}<span className="hb-caption"> of {count}</span>
        </p>
        <span className={`hb-now-status is-${status}`}>{STATUS_TEXT[status]}</span>
        {!live && (
          <button type="button" className="hb-link" onClick={onBackToLive}>
            Follow the current demo
          </button>
        )}
        {onToggleRealText && (
          <button type="button" className="hb-link" aria-pressed={showRealText} onClick={onToggleRealText}>
            {showRealText ? <IconEye /> : <IconEyeOff />}
            {showRealText ? "Genuine transcript text shown" : "Genuine transcript text hidden"}
          </button>
        )}
      </div>

      <div className="hb-voice is-recording">
        <p className="hb-voice-label">The recording says</p>
        <div className="hb-voice-audio">
          <button type="button" className="hb-play" onClick={onReplay} disabled={!clip || clip.status === "loading" || clip.status === "unavailable"} aria-label={playing ? `Stop menu recording ${index + 1}` : `Play menu recording ${index + 1}`}>
            {playing ? <IconStop /> : <IconPlay />}
          </button>
          <Waveform peaks={clip?.peaks} durationMs={clip?.durationMs} playing={playing} played={clip?.status === "played"} loading={clip?.status === "loading" && !clip.peaks} getPlayer={getPlayer} />
        </div>
        <p className="hb-voice-source">
          <EvidenceLabel kind="LOCAL_REPLAY" />
          <span>
            {clip?.origin === "public_synthetic" ? "Voice: Shivani · Gnani Timbre" : clip?.origin === "local_unverified" ? "Demo audio, not verified as intelligible speech" : clip ? "" : "No audio on this connection"}
          </span>
          {clip && clip.status !== "unavailable" && <span className={`hb-clip-state is-${clip.status}`}>{CLIP_WORDS[clip.status]}</span>}
        </p>
        {clip?.script ? <p className="hb-voice-said" lang={langOf(clip.script)}>{clip.script}</p> : <p className="hb-caption">The audio could not be loaded. Try reconnecting.</p>}
        {clip?.script && scriptGloss && langOf(clip.script) === "hi" && (
          <p className="hb-voice-gloss" aria-label={`Prepared English guide: ${scriptGloss}`}>
            <span className="hb-gloss-tag">Prepared English guide</span>
            <span className="hb-gloss-text">“{scriptGloss}”</span>
          </p>
        )}
      </div>

      <div className="hb-voice is-heard">
        <p className="hb-voice-label">HoldBuddy heard</p>
        {rec ? (
          <>
            {hide ? <p className="hb-small">Genuine transcript hidden ({rec.transcript.length} characters).</p> : <p className="hb-voice-said is-heard" lang={langOf(rec.transcript)}>{rec.transcript || <em>(no speech)</em>}</p>}
            {rec.transcript && !hide && heardGloss && langOf(rec.transcript) === "hi" && (
              <p className="hb-voice-gloss is-heard" aria-label={`Prepared transcript guide: ${heardGloss}`}>
                <span className="hb-gloss-tag">Prepared transcript guide</span>
                <span className="hb-gloss-text">“{heardGloss}”</span>
              </p>
            )}
            <p className="hb-voice-meta">
              <EvidenceLabel kind={rec.dataSource === "REAL_API" ? "REAL_API" : "MOCK"} />
              <span>{who?.label}</span>
              {rec.latencyMs !== undefined && <span className="hb-num"><IconClock /> {secs(rec.latencyMs)}</span>}
              {rec.status !== "transcribed" && <span>Recognition incomplete</span>}
              {rec.dataSource === "REAL_API" && scriptMatches !== undefined && <span>Same as the recording's script: <strong className="hb-strong">{scriptMatches ? "yes" : "no"}</strong></span>}
            </p>
            {who && <p className="hb-caption">{who.detail}</p>}
          </>
        ) : focus.sttFailure ? (
          <p className="hb-voice-fail"><IconAlert /> {STT_FAILURE_WORDS[focus.sttFailure.code] ?? "Recognition could not complete"}{focus.sttFailure.fatal ? ", and the call ends." : "."} Nothing was pressed on it.</p>
        ) : focus.audioRejected ? (
          <p className="hb-voice-fail"><IconAlert /> The audio could not be used. Nothing was selected from it.</p>
        ) : callClosed ? (
          <p className="hb-voice-wait">Not recognised: the call ended first. Nothing was decided on this prompt.</p>
        ) : (
          <p className="hb-voice-wait"><span className="hb-listening" aria-hidden="true" />{playing ? "Listening while the IVR speaks…" : "Recognising…"}</p>
        )}
      </div>

      <div className={`hb-voice is-did tone-${explained?.tone ?? "none"}`}>
        <p className="hb-voice-label">HoldBuddy did</p>
        {explained ? (
          <>
            <p className="hb-voice-verdict">{explained.headline}</p>
            <p className="hb-body">{explained.why}</p>
          </>
        ) : (
          <p className="hb-voice-wait">{rec || callClosed ? "Nothing yet." : "Deciding only after hearing the whole prompt."}</p>
        )}
        {focus.abstained && focus.decision && <p className="hb-small"><strong className="hb-strong">Then refused:</strong> {explainDecision(undefined, focus.abstained)?.why}</p>}
        {focus.requestEnded && <p className="hb-small">The open question to you lapsed: newer audio replaced it.</p>}
        {focus.presses.map((press) => (
          <div key={press.actionId} className={`hb-press is-${press.state}`}>
            <span className="hb-press-key hb-num" aria-hidden="true">{press.digit}</span>
            <div>
              <p className="hb-strong">Key {press.digit}: {PRESS_STATE[press.state]?.label ?? "Button status unavailable"}</p>
              <p className="hb-caption">
                {PRESS_STATE[press.state]?.detail}
                {press.state === "delivered" && press.settledAtMs !== undefined && ` Received ${secs(press.settledAtMs - press.requestedAtMs)} after sending.`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClarificationBand({ requestId, candidates, disabled, onAnswer }: { requestId: string; candidates: string[]; disabled: boolean; onAnswer: (requestId: string, text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  return (
    <section className="hb-human is-question" aria-labelledby="hb-question-title">
      <form
        className="hb-wrap hb-human-inner"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) void onAnswer(requestId, text.trim());
        }}
      >
        <div className="hb-human-text">
          <h2 id="hb-question-title" className="hb-title">HoldBuddy needs your answer</h2>
          <p className="hb-lead">More than one option could fit. It won't pick for you. Options heard: {candidates.join(" · ")}</p>
        </div>
        <div className="hb-human-actions">
          <label className="hb-visually-hidden" htmlFor="hb-answer">Your answer</label>
          <input id="hb-answer" className="hb-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Say which you meant" disabled={disabled} />
          <button type="submit" className="hb-btn hb-btn-ink" disabled={disabled || !text.trim()}>Send answer</button>
        </div>
      </form>
    </section>
  );
}

const PHASE_WORDS: Record<string, string> = { navigating: "Listening to the menus", on_hold: "On hold: waiting, pressing nothing", possible_human: "Waiting for your decision" };

function LiveRecord({ story, connectionState, active, handoffPhase, onNavigate }: { story: ReturnType<typeof buildCallStory>; connectionState: string; active: boolean; handoffPhase: string; onNavigate: (route: Route) => void }) {
  const { recognitions, budget, refusals } = story.outcome;
  return (
    <div className="hb-ledger-record">
      <h2 className="hb-heading">{active ? "Live" : "How to read this"}</h2>
      {active ? (
        <dl className="hb-facts">
          <div><dt>Events</dt><dd>{connectionState === "connected" ? "Streaming" : connectionState === "reconnecting" ? "Reconnecting" : "Disconnected"}</dd></div>
          <div><dt>Line</dt><dd>{PHASE_WORDS[handoffPhase] ?? "Checking the call"}</dd></div>
          <div><dt>Recognitions</dt><dd className="hb-num">{recognitions.total}{Object.entries(recognitions.bySource).map(([source, n]) => ` · ${n} ${recognitionSource(source)}`).join("")}</dd></div>
          {budget && <div><dt>Request budget</dt><dd className="hb-num">{budget.used} of {budget.limit} used</dd></div>}
          <div><dt>Refusals</dt><dd className="hb-num">{refusals}</dd></div>
        </dl>
      ) : (
        <ul className="hb-howto">
          <li><span className="hb-howto-mark is-line" aria-hidden="true" />The vermilion line is HoldBuddy's path through the call.</li>
          <li><span className="hb-howto-mark is-key" aria-hidden="true" />A key is stamped on it only when the line acknowledges it.</li>
          <li><span className="hb-howto-mark is-hold" aria-hidden="true" />A double rail is hold: waiting, pressing nothing.</li>
          <li><span className="hb-howto-mark is-person" aria-hidden="true" />An open circle is a possible person. Only you can close it.</li>
          <li className="hb-howto-more"><button type="button" className="hb-link" onClick={() => onNavigate("trust")}>How it decides, step by step</button></li>
        </ul>
      )}
    </div>
  );
}

function Outcome({ story, simulatorStop }: { story: ReturnType<typeof buildCallStory>; simulatorStop?: string }) {
  const o = story.outcome;
  const tone = simulatorStop !== "confirmed" ? "danger" : o.outcome === "failed" ? "danger" : o.outcome === "handoff" || o.outcome === "manual_takeover" ? "ok" : "neutral";
  return (
    <div className={`hb-ledger-record hb-outcome is-${tone}`} data-outcome={o.outcome}>
      <h2 className="hb-heading">{simulatorStop !== "confirmed" ? "Termination unconfirmed" : OUTCOME_TITLE[o.outcome ?? ""] ?? "Call ended"}</h2>
      <p className="hb-body">{simulatorStop !== "confirmed" ? terminationWarning : OUTCOME_DETAIL[o.outcome ?? ""] ?? ""}</p>
      {o.failure && <p className="hb-note hb-note-danger"><IconAlert /><span>{FAILURE_WORDS[o.failure] ?? "The call could not continue. Check its status below."}</span></p>}
      <dl className="hb-facts">
        <div><dt>Keys delivered</dt><dd className="hb-num">{o.delivered.length ? o.delivered.join(" → ") : "none"}</dd></div>
        {o.notDelivered.length > 0 && <div><dt>Not delivered</dt><dd>{o.notDelivered.join(", ")}</dd></div>}
        {o.unknownDelivery.length > 0 && <div><dt>Delivery unknown</dt><dd>{o.unknownDelivery.join(", ")}</dd></div>}
        {o.dtmfInFlight && <div><dt>In flight at close</dt><dd>Key {o.dtmfInFlight}: delivery unknown</dd></div>}
        <div><dt>Refusals</dt><dd className="hb-num">{o.refusals}</dd></div>
        <div><dt>Recognitions</dt><dd className="hb-num">{o.recognitions.total}{Object.entries(o.recognitions.bySource).map(([s, n]) => ` · ${n} ${recognitionSource(s)}`).join("")}</dd></div>
        {o.budget && <div><dt>Request budget</dt><dd className="hb-num">{o.budget.used} of {o.budget.limit} used</dd></div>}
        {o.callMs !== undefined && <div><dt>Call length</dt><dd className="hb-num">{secs(o.callMs)}</dd></div>}
        <div>
          <dt>Line closed</dt>
          <dd className={`hb-term is-${simulatorStop ?? "pending"}`}>
            {simulatorStop === "confirmed" ? "Confirmed by the simulator" : simulatorStop === "failed" ? "NOT confirmed: the simulator may still be running" : "Waiting for the simulator to confirm…"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const MILESTONE_WORDS: Record<string, (alerted?: boolean, detail?: string, by?: string) => string | undefined> = {
  hold_started: () => "On hold. HoldBuddy waits and presses nothing.",
  possible_human: (alerted, detail) => (alerted ? `Someone may have answered${detail ? `: “${detail}”` : ""}. HoldBuddy asked you.` : `Flagged “${detail ?? ""}” as a possible person, but the handoff check rejected it as automated or repeated. No alert.`),
  handoff_confirmed: (_a, _d, by) => `You confirmed a possible person. Automation ended.`,
  handoff_rejected: () => "Not a person, you said. Back to waiting.",
  handoff_expired: () => "The confirmation window lapsed. You can still take over.",
  alert_withdrawn: () => "The speech changed, so the earlier alert was withdrawn. Still waiting.",
  closed: () => "Automation ended. See the separate line-closure status.",
};

/** The record of moments that aren't prompts, in order. */
function Notes({ items }: { items: StoryItem[] }) {
  let n = 0;
  const notes = items.flatMap((item) => {
    if (item.kind === "prompt") {
      n += 1;
      return [];
    }
    const text = MILESTONE_WORDS[item.milestone]?.(item.alerted, item.detail, item.by);
    return text ? [{ key: item.firstSeq, after: n, kind: item.milestone, ignored: item.milestone === "possible_human" && !item.alerted, text }] : [];
  });
  return (
    <div className="hb-ledger-notes">
      <h2 className="hb-heading">Moments</h2>
      {notes.length === 0 ? (
        <p className="hb-caption">Hold, a possible person, your decision and the close appear here as they happen.</p>
      ) : (
        <ol className="hb-notes">
          {notes.map((note) => (
            <li key={note.key} className={`hb-note-item is-${note.kind} ${note.ignored ? "is-ignored" : ""}`}>
              <span className="hb-note-after hb-num">after {note.after}</span>
              <span lang={langOf(note.text)}>{note.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
