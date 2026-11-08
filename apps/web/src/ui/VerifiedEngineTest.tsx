import React from "react";
import { NATIVE_ENGINE_EVIDENCE, type NativeEngineEvidence } from "../evidence/native-engine.js";
import { IconCheck, IconArrowRight } from "./icons.js";

export function VerifiedEngineTest({
  evidence = NATIVE_ENGINE_EVIDENCE,
  isDeveloperLab = false,
}: {
  evidence?: Readonly<NativeEngineEvidence> | null;
  isDeveloperLab?: boolean;
}) {
  return (
    <section
      className={`hb-engine-test ${isDeveloperLab ? "is-in-lab" : "hb-wrap"}`}
      aria-labelledby="hb-engine-title"
      data-engine-evidence={evidence ? "completed-local-test" : "pending-public-review"}
    >
      <div className="hb-engine-heading">
        <div>
          <p className="hb-kicker">
            {isDeveloperLab ? "Historical Qualification Record" : "Beyond the simulator"}
          </p>
          <h2 id="hb-engine-title" className="hb-title">
            Verified Gnani<br />Engine Benchmark
          </h2>
        </div>
        <span className={`hb-engine-stamp ${evidence ? "is-verified" : "is-pending"}`}>
          {evidence && <IconCheck />}
          {evidence ? "REAL_API × 3 · COMPLETED LOCAL TEST" : "PUBLIC EVIDENCE PENDING"}
        </span>
      </div>
      {evidence ? (
        <>
          <p className="hb-lead hb-engine-lead">HoldBuddy listened to three Hindi menus and selected 5 → 8 → 1.</p>
          <p className="hb-body hb-engine-intro">
            In a controlled local Asterisk test, HoldBuddy captured each complete menu, sent a fresh Gnani Prisma v3.0 REST request and used the returned words to choose the next option.
          </p>
          <ol className="hb-engine-turns" aria-label="Recorded backend decisions and independent receipts">
            {evidence.turns.map((turn) => (
              <li key={turn.generation}>
                <div>
                  <div className="hb-engine-turn-head">
                    <span className="hb-kicker">Menu {turn.generation}</span>
                    <span className="hb-engine-key hb-num" aria-label={`Digit ${turn.decision.digit}`}>
                      {turn.decision.digit}
                    </span>
                  </div>
                  <p className="hb-engine-choice" lang="hi">{turn.decision.label}</p>
                  <p className="hb-small">
                    Fresh Hindi recognition <IconArrowRight /> policy decision
                  </p>
                </div>
                <span className="hb-engine-receipt">Asterisk received {turn.receipt.digit}</span>
              </li>
            ))}
          </ol>
          <p className="hb-small hb-engine-outcome">
            Reached the fictional complaint-assistance branch. Media detach, separate hangup and cleanup confirmed. Recorded {evidence.recordedOn}.
          </p>
          <details className="hb-engine-details">
            <summary>Inspect the recorded evidence</summary>
            <p className="hb-small">
              Exact recognition output from this completed run. Request IDs come from Gnani's responses; the local run label is listed separately. This is REST recognition after complete capture, not streaming.
            </p>
            {evidence.turns.map((turn) => (
              <article key={turn.generation} className="hb-engine-record">
                <h3 className="hb-heading">
                  Menu {turn.generation} · digit {turn.decision.digit}
                </h3>
                <p className="hb-caption">
                  {turn.source} · HTTP {turn.httpStatus} · {turn.model} · {turn.language}
                </p>
                <blockquote lang="hi" className="hb-body">{turn.transcript}</blockquote>
                <dl>
                  <div>
                    <dt>Gnani response request ID</dt>
                    <dd><code>{turn.requestId}</code></dd>
                  </div>
                  <div>
                    <dt>Independent receipt</dt>
                    <dd>
                      IVR-leg ARI event · digit {turn.receipt.digit} · generation {turn.receipt.generation}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
            <dl className="hb-engine-source">
              <div>
                <dt>Local run label</dt>
                <dd><code>{evidence.runLabel}</code></dd>
              </div>
              <div>
                <dt>Reviewed manifest SHA-256</dt>
                <dd><code>{evidence.manifestSha256}</code></dd>
              </div>
              <div>
                <dt>Backend source commit</dt>
                <dd><code>{evidence.sourceCommit}</code></dd>
              </div>
            </dl>
            <p className="hb-small">
              One controlled complaint journey, not an accuracy or reliability benchmark. Payment and refund in the interactive demo remain simulations. The endpoint was a fictional recording; no real agent, payment or resolved complaint is claimed.
            </p>
          </details>
        </>
      ) : (
        <div className="hb-engine-pending">
          <p className="hb-lead">A completed local engine test, with its public evidence summary under review.</p>
          <p className="hb-body">
            The final verified manifest is being prepared. Recognized words, request IDs and receipt details will appear here after that review.
          </p>
        </div>
      )}
      {isDeveloperLab ? (
        <div className="hb-engine-boundary is-lab-boundary">
          <span className="hb-ev hb-ev-mock">BENCHMARK QUALIFICATION ARCHIVE</span>
          <p className="hb-small">
            These records document the independent native CLI qualification test (run <code>live-journey-three-fresh-two</code>, Nov 7, 2026).
            The interactive runner above executes independent runs against your local loopback daemon.
          </p>
        </div>
      ) : (
        <div className="hb-engine-boundary">
          <span className="hb-ev hb-ev-mock">SIMULATED · WEBSITE DEMO</span>
          <p className="hb-small">
            The interactive website is a separate offline simulator with authentic Gnani Timbre audio and prepared transcripts.
            It is not connected to this native backend. No live Gnani request, public telephone call or real human transfer occurs here.
          </p>
        </div>
      )}
    </section>
  );
}

export default VerifiedEngineTest;
