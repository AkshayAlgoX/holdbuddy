import React from "react";
import { ROUTE_PATHS, type Route } from "../shell/router.js";
import { LAB_TOTALS } from "../lab/voice-lab-data.js";
import { IconArrowRight, IconCheck, IconPhone, IconHand, IconVolume, IconShield } from "../ui/icons.js";

/** The real demo route, quoted along the chapters. Words are the scenario's own; nothing here is live. */
export const ROUTE_ILLUSTRATION: Array<{ said: string; gloss: string; act: string; kind: "key" | "wait" | "human"; action: string; keyDigit?: string }> = [
  { said: "ब्रॉडबैंड के लिए पाँच दबाएँ।", gloss: "“For broadband, press five.”", act: "5", kind: "key", action: "Selects option", keyDigit: "5" },
  { said: "बिल के लिए कृपया 8 दबाएँ।", gloss: "“For billing, please press 8.”", act: "8", kind: "key", action: "Selects option", keyDigit: "8" },
  { said: "बिल की शिकायत के लिए कृपया 1 दबाएँ।", gloss: "“For a bill complaint, press 1.”", act: "1", kind: "key", action: "Selects option", keyDigit: "1" },
  { said: "कृपया लाइन पर बने रहें।", gloss: "“Please stay on the line.”", act: "Holds", kind: "wait", action: "Waits on hold" },
  { said: "नमस्ते, मेरा नाम आशा है।", gloss: "“Hello, my name is Asha.”", act: "Your turn", kind: "human", action: "Handoff to caller" },
];

export function HomePage({ onNavigate, onChooseObjective }: { onNavigate: (route: Route) => void; onChooseObjective: (key: string) => void }) {
  const go = (route: Route) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(route);
  };

  const chooseGoal = (key: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onChooseObjective(key);
  };

  return (
    <div className="hb-home">
      {/* 1. Hero Section */}
      <section className="hb-hero hb-wrap" aria-labelledby="hb-hero-title">
        <p className="hb-kicker">HoldBuddy · Phone Menu Assistant</p>
        <h1 id="hb-hero-title" className="hb-hero-type">
          It takes the menu.
          <br />
          <span className="hb-hero-turn">You take the call.</span>
        </h1>
        <div className="hb-hero-foot">
          <p className="hb-lead hb-hero-lead">
            Tell it what you need. HoldBuddy listens to the phone menus in Hindi, selects the matching options and waits on hold. When someone answers, you take over.
          </p>
          <div className="hb-hero-cta">
            <a href={ROUTE_PATHS.studio} onClick={go("studio")} className="hb-btn hb-btn-primary hb-btn-lg hb-hero-go">
              Try HoldBuddy Demo <IconArrowRight />
            </a>
            <p className="hb-hero-fiction">
              <span className="hb-ev hb-ev-mock">Interactive Demo</span>
              <span>Simulated Hindi line with authentic Gnani Timbre audio. No real phone call.</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. Interactive Demo: Choose Your Goal */}
      <section className="hb-home-demo-section hb-wrap" aria-labelledby="hb-demo-title">
        <div className="hb-demo-section-head">
          <p className="hb-kicker">Interactive Demo</p>
          <h2 id="hb-demo-title" className="hb-title">
            Choose your goal to test
          </h2>
          <p className="hb-lead">
            Experience how HoldBuddy handles real-world customer service situations on an authentic Hindi IVR menu:
          </p>
        </div>

        <div className="hb-consumer-goals-grid">
          <a
            href="#/studio?objective=objective-complaint"
            onClick={chooseGoal("objective-complaint")}
            className="hb-goal-card"
          >
            <div className="hb-goal-card-top">
              <span className="hb-goal-card-pill">Route 5 → 8 → 1</span>
              <span className="hb-goal-card-num">01</span>
            </div>
            <h3 className="hb-goal-card-title">Broadband Bill Complaint</h3>
            <p className="hb-goal-card-intent">“I need help with my broadband bill.”</p>
            <p className="hb-goal-card-desc">
              HoldBuddy listens across three menus and selects broadband (5), billing (8), and complaint help (1).
            </p>
            <span className="hb-goal-card-btn">
              Launch Complaint Demo <IconArrowRight size={14} />
            </span>
          </a>

          <a
            href="#/studio?objective=objective-payment"
            onClick={chooseGoal("objective-payment")}
            className="hb-goal-card"
          >
            <div className="hb-goal-card-top">
              <span className="hb-goal-card-pill">Route 5 → 8 → 2</span>
              <span className="hb-goal-card-num">02</span>
            </div>
            <h3 className="hb-goal-card-title">Payment Assistance</h3>
            <p className="hb-goal-card-intent">“I want to pay my monthly broadband bill.”</p>
            <p className="hb-goal-card-desc">
              Navigates from broadband (5) to billing (8) and reaches immediate bill payment assistance.
            </p>
            <span className="hb-goal-card-btn">
              Launch Payment Demo <IconArrowRight size={14} />
            </span>
          </a>

          <a
            href="#/studio?objective=objective-refund"
            onClick={chooseGoal("objective-refund")}
            className="hb-goal-card is-refusal"
          >
            <div className="hb-goal-card-top">
              <span className="hb-goal-card-pill is-refusal">5 → 8 → Safe Refusal</span>
              <span className="hb-goal-card-num">03</span>
            </div>
            <h3 className="hb-goal-card-title">Unsupported Refund</h3>
            <p className="hb-goal-card-intent">“I want an unsupported refund on my plan.”</p>
            <p className="hb-goal-card-desc">
              When an option is not offered by the phone menu, HoldBuddy safely refuses rather than pressing arbitrary keys.
            </p>
            <span className="hb-goal-card-btn">
              Launch Refund Demo <IconArrowRight size={14} />
            </span>
          </a>
        </div>
      </section>

      {/* 3. How It Works: Listen, Understand, Navigate */}
      <section className="hb-home-how hb-wrap" aria-labelledby="hb-how-title">
        <div className="hb-how-head">
          <p className="hb-kicker">How It Works</p>
          <h2 id="hb-how-title" className="hb-title">
            Listen. Understand. Navigate.
          </h2>
          <p className="hb-lead">
            Leave the phone tree routine to HoldBuddy. Keep your time for the actual conversation.
          </p>
        </div>

        <div className="hb-how-pillars">
          <div className="hb-how-pillar">
            <div className="hb-pillar-icon"><IconVolume size={20} /></div>
            <h3 className="hb-pillar-title">1. Listen to the Menu</h3>
            <p className="hb-pillar-body">
              Captures Indian-accented Hindi prompts, distinguishing spoken options through real-world telephony noise.
            </p>
          </div>

          <div className="hb-how-pillar">
            <div className="hb-pillar-icon"><IconCheck size={20} /></div>
            <h3 className="hb-pillar-title">2. Understand Intent</h3>
            <p className="hb-pillar-body">
              Maps customer goals into precise menu decisions. If an option is missing or unsafe, it stops cleanly.
            </p>
          </div>

          <div className="hb-how-pillar">
            <div className="hb-pillar-icon"><IconHand size={20} /></div>
            <h3 className="hb-pillar-title">3. Navigate & Hand Over</h3>
            <p className="hb-pillar-body">
              Selects the matching key, waits through hold music, and chimes the second a representative answers.
            </p>
          </div>
        </div>

        {/* Clean Conversation Journey Walkthrough */}
        <div className="hb-journey-walkthrough">
          <div className="hb-journey-walk-header">
            <span className="hb-kicker">Sample Hindi Journey (Broadband Complaint)</span>
            <span className="hb-caption">Verified Gnani Timbre demo recordings · 5 → 8 → 1 navigation</span>
          </div>
          <ol className="hb-journey-walk-list">
            {ROUTE_ILLUSTRATION.map((item, idx) => (
              <li key={idx} className="hb-journey-walk-item">
                <div className="hb-walk-num">{String(idx + 1).padStart(2, "0")}</div>
                <div className="hb-walk-content">
                  <p className="hb-walk-said" lang="hi">{item.said}</p>
                  <p className="hb-walk-gloss">{item.gloss}</p>
                </div>
                <div className="hb-walk-action">
                  <span className="hb-walk-badge">
                    <span>{item.action}</span>
                    {item.keyDigit && <strong className="hb-walk-key-digit">{item.keyDigit}</strong>}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. Built with Gnani: Proven Hindi Menu Understanding */}
      <section className="hb-home-gnani-section hb-wrap" aria-labelledby="hb-gnani-title">
        <div className="hb-gnani-card">
          <div className="hb-gnani-header">
            <p className="hb-kicker">Built with Gnani</p>
            <h2 id="hb-gnani-title" className="hb-title">
              HoldBuddy understands the menu.
            </h2>
            <p className="hb-lead hb-gnani-statement">
              Successfully tested across three Hindi phone menus using genuine Gnani speech recognition.
            </p>
          </div>

          <div className="hb-gnani-clean-route">
            <div className="hb-gnani-step">
              <span className="hb-gnani-step-tag">Turn 1</span>
              <span className="hb-gnani-step-name">Broadband</span>
              <span className="hb-gnani-step-key">Key 5</span>
            </div>
            <span className="hb-gnani-route-arrow"><IconArrowRight size={16} /></span>
            <div className="hb-gnani-step">
              <span className="hb-gnani-step-tag">Turn 2</span>
              <span className="hb-gnani-step-name">Billing</span>
              <span className="hb-gnani-step-key">Key 8</span>
            </div>
            <span className="hb-gnani-route-arrow"><IconArrowRight size={16} /></span>
            <div className="hb-gnani-step">
              <span className="hb-gnani-step-tag">Turn 3</span>
              <span className="hb-gnani-step-name">Complaint</span>
              <span className="hb-gnani-step-key">Key 1</span>
            </div>
          </div>

          <div className="hb-gnani-disclosure-row">
            <p className="hb-small hb-gnani-disclosure">
              Verified in controlled local telephony testing with authentic Indian-accented Hindi prompts. Not a public carrier call.
            </p>
            <a href={ROUTE_PATHS.developer} onClick={go("developer")} className="hb-btn hb-btn-secondary hb-btn-sm hb-dev-lab-link">
              Developer Telephony Lab <IconArrowRight size={13} />
            </a>
          </div>
        </div>
      </section>

      {/* 5. Further Exploration: Languages & How It Works */}
      <section className="hb-home-further hb-wrap" aria-label="Explore HoldBuddy">
        <a href={ROUTE_PATHS.lab} onClick={go("lab")}>
          <span className="hb-kicker">Languages</span>
          <span className="hb-heading">Ten Indian languages. An honest first listen.</span>
          <span className="hb-small">{LAB_TOTALS.pairs} genuine Gnani speech examples across ten languages.</span>
          <IconArrowRight />
        </a>
        <a href={ROUTE_PATHS.trust} onClick={go("trust")}>
          <span className="hb-kicker">Trust & Boundaries</span>
          <span className="hb-heading">From menu to your moment.</span>
          <span className="hb-small">How HoldBuddy handles privacy, safety, and human takeover.</span>
          <IconArrowRight />
        </a>
      </section>
    </div>
  );
}

export default HomePage;
