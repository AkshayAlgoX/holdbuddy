import React, { useEffect, useState } from "react";
import { ROUTE_PATHS, type Route } from "../shell/router.js";
import { IconCheck, IconLock } from "../ui/icons.js";
import { NativeEngineRunner } from "../ui/NativeEngineRunner.js";
import { VerifiedEngineTest } from "../ui/VerifiedEngineTest.js";

interface DeveloperLabPageProps {
  onNavigate: (route: Route) => void;
}

export function DeveloperLabPage({ onNavigate }: DeveloperLabPageProps) {
  const [isLoopback, setIsLoopback] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      const local = host === "127.0.0.1" || host === "localhost";
      setIsLoopback(local);
    }
  }, []);

  const go = (target: Route) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <div className="hb-dev-lab">
      <div className="hb-dev-container">
        <section className="hb-dev-hero" aria-labelledby="hb-dev-title">
          <div className="hb-dev-back-nav">
            <a href={ROUTE_PATHS.home} onClick={go("home")} className="hb-dev-back-link">
              ← Return to Consumer Website
            </a>
          </div>

          <div className="hb-dev-header">
            <div className="hb-dev-header-text">
              <p className="hb-kicker">Engineering Laboratory · Local Telephony &amp; Provider Qualification</p>
              <h1 id="hb-dev-title" className="hb-title">
                Developer Telephony Lab
              </h1>
              <p className="hb-lead hb-dev-lead">
                Restricted engineering workspace for running and inspecting multi-turn telephony tests
                against local Asterisk PBX 20 ARI and Gnani Prisma STT adapters.
              </p>
            </div>
            <div className="hb-dev-badge-col">
              <span className={`hb-dev-gate-badge ${isLoopback ? "is-local" : "is-remote"}`}>
                {isLoopback ? <IconCheck size={14} /> : <IconLock size={14} />}
                <span>{isLoopback ? "LOCAL LOOPBACK (127.0.0.1)" : "NON-LOCAL ACCESS RESTRICTED"}</span>
              </span>
              <span className="hb-dev-sub-badge">SOFTWARE TELEPHONY QUALIFICATION</span>
            </div>
          </div>

          <div className="hb-dev-notice-banner">
            <div className="hb-dev-notice-tag">RESTRICTED TESTING ENVIRONMENT</div>
            <p className="hb-small">
              This laboratory is designed for evaluators, security auditors, and backend engineers. Telephony execution
              operates in local loopback mode with strict single-session concurrency mutexes. Live Gnani Prisma requests
              require server credentials and an explicit authorization passphrase. Hardware Asterisk PBX 20 ARI execution
              was independently qualified in the native CLI test suite (live-journey-three-fresh-two).
            </p>
          </div>
        </section>

        {/* Mounting Native Telephony Runner with offline replay & genuine live modes */}
        <NativeEngineRunner />

        {/* Collapsible Historical Qualification Records & ARI receipts */}
        <section className="hb-dev-past-evidence-section" aria-label="Historical Benchmark Records">
          <details className="hb-dev-past-details">
            <summary className="hb-dev-past-summary">
              <div className="hb-dev-past-summary-text">
                <span className="hb-dev-past-title">Historical Benchmark Evidence &amp; Audit Logs</span>
                <span className="hb-caption">
                  A2 controlled Asterisk 20 ARI + Gnani Prisma REST qualification (November 7, 2026 · live-journey-three-fresh-two)
                </span>
              </div>
              <span className="hb-dev-past-badge">EXPAND AUDIT LOGS</span>
            </summary>
            <div className="hb-dev-past-content">
              <VerifiedEngineTest isDeveloperLab={true} />
            </div>
          </details>
        </section>

        <section className="hb-dev-footer-meta">
          <div className="hb-dev-meta-card">
            <h3 className="hb-heading">Telephony Execution Security Boundary</h3>
            <p className="hb-body">
              All calls initiated here are executed strictly in loopback userspace (<code>127.0.0.1</code>) via AudioSocket TCP PCM16.
              API keys, bearer tokens, and Asterisk ARI credentials are strictly server-side and never exposed to browser bundles.
              Public consumers on the main site are completely isolated from this test harness.
            </p>
            <div className="hb-dev-meta-actions">
              <a href={ROUTE_PATHS.home} onClick={go("home")} className="hb-btn hb-btn-secondary">
                Back to Consumer Experience
              </a>
              <a href={ROUTE_PATHS.trust} onClick={go("trust")} className="hb-btn hb-btn-outline">
                Review Trust &amp; Boundaries
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default DeveloperLabPage;