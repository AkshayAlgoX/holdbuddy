/** Only approved authored examples and sanitized measurements. Genuine transcripts and recordings remain private. */
import React, { useState } from "react";
import type { Route } from "../shell/router.js";
import { CASE_EVIDENCE, CONDITIONS, HI_TA_CASE, LAB_RUN, LAB_TOTALS, LANGUAGES, PLAN_CASES, casesFor, type LabGroup } from "../lab/voice-lab-data.js";

const KIND: Record<string, string> = {
  paraphrase: "A menu choice",
  negated: "An option you must not select",
  withdrawn: "A withdrawn option",
  ambiguous: "An unclear choice",
  positive: "A menu choice",
  "code-mixed-positive": "A menu in mixed languages",
  "code-mixed-withdrawn": "A withdrawn option",
};

export function VoiceLabPage({ onNavigate: _onNavigate }: { onNavigate: (route: Route) => void }) {
  const [group, setGroup] = useState<LabGroup>("hi");
  const [index, setIndex] = useState(0);
  const language = LANGUAGES.find((l) => l.code === group)!;
  const examples = [
    ...casesFor(group),
    ...(group === "mixed" ? PLAN_CASES.filter((c) => c.id === HI_TA_CASE) : []),
  ];
  const example = examples[index] ?? examples[0]!;
  const evidence = CASE_EVIDENCE[example.id]!;

  return (
    <div className="hb-lab">
      {/* 1. Header: Warm visual identity */}
      <header className="hb-lab-head hb-wrap">
        <p className="hb-kicker">Languages · Multilingual IVR Showcase</p>
        <h1 className="hb-title hb-lab-title">Every language deserves a good listener.</h1>
        <p className="hb-lead">
          Explore how HoldBuddy handles phone menu prompts across ten Indian languages and code-mixed speech.
        </p>
        <p className="hb-caption hb-lab-note">
          Authored IVR prompt examples with authentic regional script typography. No live calls or bill modifications.
        </p>
      </header>

      {/* 2. Language Selector: Directly beneath introduction */}
      <div className="hb-language-index hb-wrap">
        <p className="hb-caption">Choose a language · click or scroll to explore</p>
        <div
          className="hb-ribbon"
          role="radiogroup"
          aria-label="Choose a language"
          onKeyDown={(event) => {
            const at = LANGUAGES.findIndex((l) => l.code === group);
            const step =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : 0;
            if (!step && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                ? LANGUAGES.length - 1
                : (at + step + LANGUAGES.length) % LANGUAGES.length;
            setGroup(LANGUAGES[next]!.code);
            setIndex(0);
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
          }}
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={`hb-ribbon-item ${group === l.code ? "is-on" : ""}`}
              type="button"
              role="radio"
              data-language={l.code}
              aria-label={l.name}
              aria-checked={group === l.code}
              tabIndex={group === l.code ? 0 : -1}
              onClick={() => {
                setGroup(l.code);
                setIndex(0);
              }}
            >
              <span className="hb-ribbon-endonym" lang={l.code === "mixed" ? "en" : l.code}>
                {l.code === "mixed" ? "Mixed" : l.endonym}
              </span>
              <span className="hb-ribbon-name">{l.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Interactive Exhibit: Primary focus */}
      <section className="hb-exhibit hb-wrap hb-lab-detail" aria-label="Explore a language">
        <div className="hb-exhibit-plate">
          <span
            className="hb-exhibit-endonym"
            lang={group === "mixed" ? "en" : group}
            aria-hidden="true"
          >
            {group === "mixed" ? "Mixed voices" : language.endonym}
          </span>
          <div className="hb-exhibit-caption">
            <h2 className="hb-heading">{language.name}</h2>
            <p className="hb-small">
              {group === "mixed"
                ? "Three mixed-language examples, plus a separate Hindi–Tamil example."
                : "Two examples: one menu choice and one that should be refused."}
            </p>
          </div>
        </div>

        <div className="hb-exhibit-cases">
          <article className="hb-plate" aria-labelledby="hb-example-title">
            <div className="hb-example-pager">
              <p className="hb-kicker" role="status">
                Example {index + 1} of {examples.length} ·{" "}
                {example.id === HI_TA_CASE ? "Hindi–Tamil · " : ""}
                {KIND[example.category] ??
                  (example.expected.kind === "press" ? "A menu choice" : "A choice to refuse")}
              </p>
              <div>
                <button
                  className="hb-icon-btn"
                  type="button"
                  aria-label="Previous example"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  ←
                </button>
                <button
                  className="hb-icon-btn"
                  type="button"
                  aria-label="Next example"
                  disabled={index >= examples.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  →
                </button>
              </div>
            </div>

            <div className="hb-plate-said">
              <h3 className="hb-plate-label" id="hb-example-title">Spoken Menu Prompt</h3>
              <blockquote lang={example.language.includes("-") ? undefined : example.language}>
                {example.text}
              </blockquote>
              <p className="hb-caption">
                Authored prompt text in {language.name} ({language.script} script).
              </p>
            </div>

            <div className="hb-plate-intent-grid">
              <p className="hb-body">
                <strong className="hb-strong">Caller goal:</strong> {example.goal}
              </p>
              <p className="hb-body">
                <strong className="hb-strong">Expected decision:</strong>{" "}
                {example.expected.kind === "press"
                  ? `Select Option ${example.expected.digit}`
                  : "Refuse selection (Safe Refusal)"}
              </p>
            </div>

            <div className="hb-plate-heard">
              <h3 className="hb-plate-label">Acoustic Fidelity &amp; Recognition Assessment</h3>
              <p className="hb-body">
                {evidence.cer !== undefined ? (
                  <>
                    <strong className="hb-ruler-fig hb-num">{evidence.cer.toFixed(2)}%</strong>{" "}
                    character error rate for this prompt.
                  </>
                ) : (
                  <>
                    Language average: <strong>{language.meanCer.toFixed(2)}%</strong> character
                    error rate.
                  </>
                )}
              </p>
              <p className="hb-caption">
                Evaluated with Gnani Prisma v3.0 regional acoustic models. Genuine recognized transcripts and audio recordings remain private.
              </p>
            </div>

            {example.id === "gu-paraphrase" && (
              <p className="hb-plate-finding">
                The target button number was missing after recognition. A low text error rate did not preserve the choice.
              </p>
            )}
            {example.id === "bn-ambiguous" && (
              <p className="hb-plate-finding">
                A choice between two buttons was misread as separate options. The experimental model selected unsafely; the product rules refused.
              </p>
            )}
            {example.id === HI_TA_CASE && (
              <p className="hb-plate-finding">
                Reported separately: the competing Tamil option disappeared from recognition. The experimental model then selected unsafely. Whether speech generation or recognition lost it is unverified.
              </p>
            )}
          </article>
        </div>
      </section>

      {/* 4. Product Takeaway */}
      <section className="hb-lab-summary hb-wrap" aria-label="What the experiment tells us">
        <div>
          <p className="hb-kicker">Multilingual Nuance</p>
          <h2 className="hb-title">Hearing words is only the beginning.</h2>
        </div>
        <div className="hb-simple-copy">
          <p className="hb-body">
            Accurate character recognition alone does not ensure a correct menu decision. Phone trees require understanding conversational negation, retracted options, and language mixing.
          </p>
          <p className="hb-body">
            HoldBuddy pairs Indian language speech models with deterministic safety guards: when an option is ambiguous, negated, or unconfirmed, it refuses rather than making arbitrary guesses.
          </p>
          <p className="hb-small">
            Tested across ten Indian languages and code-mixed IVR prompts. Full technical measurements and methodology are documented below.
          </p>
        </div>
      </section>

      {/* 5. Compact, collapsed-by-default "About the experiment" section at the bottom */}
      <section className="hb-wrap hb-lab-experiment-section" aria-label="About the experiment">
        <details className="hb-experiment-details">
          <summary className="hb-experiment-summary">
            <span className="hb-experiment-summary-title">About the experiment</span>
            <span className="hb-caption">November 4, 2026 diagnostic data &amp; methodology</span>
          </summary>
          <div className="hb-experiment-body">
            <div className="hb-experiment-overview">
              <p className="hb-body">
                <strong>Historical Context (November 4, 2026):</strong> The measurements below document 24 historical speech-generation and recognition pairs across ten languages and mixed speech, evaluated using Gnani Timbre v3.0 and Prisma v3.0. These represent controlled offline diagnostic evaluations, not an ongoing live test or general safety guarantee.
              </p>
              <div className="hb-lab-metrics-strip">
                <div className="hb-metric-item">
                  <span className="hb-metric-num">{LAB_TOTALS.meanCerPercent}%</span>
                  <span className="hb-metric-label">Mean Character Error (CER)</span>
                </div>
                <div className="hb-metric-item">
                  <span className="hb-metric-num">24 / 10</span>
                  <span className="hb-metric-label">Examples / Languages</span>
                </div>
                <div className="hb-metric-item">
                  <span className="hb-metric-num">
                    {(LAB_RUN.latency.sttClient.p50 / 1000).toFixed(2)}s /{" "}
                    {(LAB_RUN.latency.ttsClient.p50 / 1000).toFixed(2)}s
                  </span>
                  <span className="hb-metric-label">Median Latency (STT / TTS)</span>
                </div>
                <div className="hb-metric-item">
                  <span className="hb-metric-num">{CONDITIONS[1].refusals} / 12</span>
                  <span className="hb-metric-label">Rule Refusals · Historical Suite</span>
                </div>
              </div>
              <p className="hb-small hb-lab-callout-foot">
                Scope: 12 refusal examples in this small authored suite. The same rules completed none of the 12 intended selections. These are historical diagnostic results, not an independent benchmark.
              </p>
            </div>

            <div className="hb-disclosure-body">
              <p>
                24 speech-generation requests and 24 recognition requests. All 24 produced text. No phone calls or button presses were executed.
              </p>
              <p>
                Gnani Timbre v3 and Prisma v3. Recognition is measured against the written example, separately from whether a decision was correct.
              </p>
              <div className="hb-table-scroll">
                <table className="hb-table">
                  <caption>Average character error by language</caption>
                  <thead>
                    <tr>
                      <th scope="col">Language</th>
                      <th scope="col">Examples</th>
                      <th scope="col">Character error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LANGUAGES.map((l) => (
                      <tr key={l.code}>
                        <th scope="row">{l.name}</th>
                        <td>{l.cases.length}</td>
                        <td>{l.meanCer.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                The mixed-language average excludes the separately reported Hindi–Tamil example (43.55%). Character error for the entire experiment includes it.
              </p>
              <div className="hb-table-scroll">
                <table className="hb-table">
                  <caption>Decisions in the original experiment</caption>
                  <thead>
                    <tr>
                      <th scope="col">Method</th>
                      <th scope="col">Input</th>
                      <th scope="col">Correct selections / 12</th>
                      <th scope="col">Unsafe choices / 12</th>
                      <th scope="col">Correct refusals / 12</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONDITIONS.map((c) => (
                      <tr key={c.key}>
                        <th scope="row">
                          {c.inProduct ? "Navigation rules" : "Offline experimental model with safety checks"}
                        </th>
                        <td>{c.text === "Authored text" ? "Written example" : "Gnani recognized words"}</td>
                        <td>{c.correct}</td>
                        <td>{c.unsafe}</td>
                        <td>{c.refusals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                These are diagnostic examples examined during development, not a new independent evaluation. Historical measurements do not describe later code changes.
              </p>
              <dl className="hb-facts">
                <div>
                  <dt>Typical speech generation</dt>
                  <dd>{(LAB_RUN.latency.ttsClient.p50 / 1000).toFixed(2)} seconds</dd>
                </div>
                <div>
                  <dt>Typical recognition</dt>
                  <dd>{(LAB_RUN.latency.sttClient.p50 / 1000).toFixed(2)} seconds</dd>
                </div>
                <div>
                  <dt>Typical combined time</dt>
                  <dd>{(LAB_RUN.latency.pair.p50 / 1000).toFixed(2)} seconds</dd>
                </div>
              </dl>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}

export default VoiceLabPage;