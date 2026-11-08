import React from "react";
import type { Route } from "../shell/router.js";
import { EvidenceLabel, EVIDENCE, type EvidenceKind } from "../ui/EvidenceLabel.js";
const STEPS = [
  ["Listen", "Hear the whole menu before deciding. The demo plays recorded audio and uses prepared transcripts."],
  ["Understand", "Match the menu choices to your customer-care goal. Recognition can miss words or button numbers."],
  ["Select or refuse", "Select a matching button, or explain why it cannot choose. An uncertain delivery is never retried automatically."],
  ["Wait", "On hold, keep listening without pressing. You can take over or end the call at any time."],
  ["Hand control back", "When someone may have answered, ask you. You decide whether it is a person; a recording can sound like one."],
];
export function TrustPage({ onNavigate: _onNavigate, onOpenSettings }: { onNavigate: (route: Route) => void; onOpenSettings?: () => void }) {
  return <div className="hb-trust">
    <header className="hb-trust-head hb-wrap"><p className="hb-kicker">How it works</p><h1 className="hb-title">The menus are its job.<br />The conversation is yours.</h1><p className="hb-lead">A customer-care goal, a few buttons and the wait in between. HoldBuddy handles the menus and keeps you in control.</p><p className="hb-small">All phone calls on this site are simulated. No real company or telephone network is involved.</p></header>
    <section className="hb-wrap hb-how-steps" aria-label="From listening to handoff"><ol className="hb-gates">{STEPS.map(([title, body], i) => <li key={title} className={`hb-gate ${i === 4 ? "is-final" : ""}`}><span className="hb-gate-node" aria-hidden="true" /><h2 className="hb-gate-q"><span className="hb-gate-n" aria-hidden="true">{i + 1}</span><span className="hb-gate-text">{title}</span></h2><p className="hb-body">{body}</p></li>)}</ol></section>
    
    <section className="hb-wrap hb-trust-arch" aria-label="System Architecture & Backend Status">
      <div className="hb-plate hb-trust-arch-card">
        <h2 className="hb-heading">Architecture &amp; Real Backend Status</h2>
        <p className="hb-body">
          HoldBuddy enforces a strict isolation boundary between the browser and speech/telephony providers. The browser never receives third-party API credentials.
        </p>
        <div className="hb-trust-arch-actions">
          {onOpenSettings && (
            <button type="button" className="hb-btn hb-btn-ink" onClick={onOpenSettings}>
              Inspect Capability Matrix &amp; Contracts
            </button>
          )}
        </div>
      </div>
    </section>
    <section className="hb-wrap hb-deeper"><details><summary>Evidence, safeguards and limitations</summary><div className="hb-disclosure-body">
      <p>The working demonstration follows a Hindi broadband-billing route: 5 → 8 → 1, then hold and a possible person. A successful demo is evidence for that route, rather than every phone menu.</p>
      <h2 className="hb-heading">What the labels mean</h2><dl className="hb-r-labels">{(Object.keys(EVIDENCE) as EvidenceKind[]).map(kind => <div key={kind}><dt><EvidenceLabel kind={kind} /></dt><dd>{EVIDENCE[kind].long}</dd></div>)}</dl>
      <h2 className="hb-heading">Control stays with you</h2><p>Every button needs authorization for the current menu and confirmation that it arrived. New speech can withdraw an earlier decision. If delivery is uncertain, HoldBuddy stops pressing rather than risk a duplicate.</p><p>Ending or taking over a call closes automation. The simulated line must separately confirm that it stopped. If it cannot, a warning remains visible; an ended screen alone is not proof of termination.</p>
      <h2 className="hb-heading">Past Hindi recognition runs</h2><p>Earlier genuine Gnani trials exercised a fictional Hindi billing route. These are historical findings; this public call uses prepared transcripts and makes no recognition requests.</p>
      <div className="hb-table-scroll"><table className="hb-table"><caption>Historical aggregate findings</caption><thead><tr><th scope="col">Measure</th><th scope="col">Historical result</th></tr></thead><tbody><tr><th scope="row">Trials summarized</th><td>4</td></tr><tr><th scope="row">Recognition requests across those trials</th><td>19</td></tr><tr><th scope="row">Trial that missed its completion check</th><td>1: a hold prompt was not recognized in time</td></tr></tbody></table></div>
      <p>Receipts, private recognized words, protected recordings and identifying run metadata are not published. These past observations do not establish completion or accuracy of a new call.</p>
      <p>Recognition can omit a competing choice. Familiar words can describe an advertisement, correction or withdrawn option. A short, successful route cannot establish general safety. Multilingual understanding remains experimental and is not enabled for autonomous calls.</p>
      <p>Private recognized words, protected recordings and identifying evidence stay out of this visitor experience. Only authored examples and aggregate historical findings are shared here.</p>
    </div></details></section>
  </div>;
}
