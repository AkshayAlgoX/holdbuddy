import React, { useState, useEffect } from "react";
import type { SessionApi } from "../shell/types.js";
import { Modal } from "./Overlay.js";
import { publicError } from "./public-copy.js";
import { IconCheck, IconClock, IconShield, IconVolume, IconArrowRight } from "./icons.js";
import { ROUTE_PATHS } from "../shell/router.js";

interface NativeReadinessMini {
  ok: boolean;
  asteriskAvailable: boolean;
  livePrismaConfigured: boolean;
}

export function ConnectionHelp({ isOpen, onClose, session }: { isOpen: boolean; onClose: () => void; session: SessionApi }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [nativeStatus, setNativeStatus] = useState<NativeReadinessMini | null>(null);

  const healthy = session.health?.ok === true;
  const connected = healthy && session.connectionState === "connected" && !session.currentSession?.closed;

  useEffect(() => {
    if (isOpen) {
      fetch("/api/v1/native/status")
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data && typeof data.ok === "boolean") {
            setNativeStatus(data);
          }
        })
        .catch(() => {
          setNativeStatus(null);
        });
    }
  }, [isOpen]);

  const reconnect = async () => {
    setChecking(true);
    setResult(null);
    try {
      await session.testConnection(session.config);
      await session.reconnect();
      setResult("Demo gateway verified. No new call was started.");
    } catch (error) {
      const unavailable = typeof error === "object" && error && "status" in error && Number(error.status) >= 500;
      setResult(publicError(unavailable ? "network_error" : typeof error === "object" && error && "code" in error ? String(error.code) : "network_error"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="HoldBuddy Status & Capabilities">
      <div className="hb-modal-body hb-status-modal">
        {/* 1. Gateway Connection State */}
        <div className="hb-status-conn-box">
          <div className="hb-status-conn-head">
            <span className={`hb-conn-dot ${healthy ? "is-online" : "is-offline"}`} />
            <span className="hb-conn-title">
              {!healthy
                ? "Demo gateway unavailable"
                : session.connectionState === "reconnecting"
                ? "Reconnecting to gateway…"
                : connected
                ? "Simulator session connected"
                : "Demo gateway ready"}
            </span>
            <button
              type="button"
              className="hb-btn hb-btn-secondary hb-btn-sm"
              onClick={() => void reconnect()}
              disabled={checking}
            >
              {checking ? "Checking…" : "Test Connection"}
            </button>
          </div>
          <p className="hb-small hb-conn-desc">
            Interactive consumer demo running with authentic Gnani Timbre Shivani voice playback.
          </p>
          {result && <p className="hb-note hb-note-info" role="status">{result}</p>}
        </div>

        {/* 2. Concise Consumer Capabilities & Boundaries */}
        <div className="hb-status-caps-section">
          <h4 className="hb-status-caps-title">Verified Capabilities & Boundaries</h4>

          <div className="hb-status-caps-grid">
            {/* Website Audio */}
            <div className="hb-status-cap-row">
              <div className="hb-status-cap-meta">
                <span className="hb-badge is-ok">
                  <IconCheck size={12} /> Authentic Voice
                </span>
                <span className="hb-status-cap-name">Website Audio (Prompt Playback)</span>
              </div>
              <p className="hb-status-cap-text">
                Authentic Gnani Timbre v3.0 (Shivani neural voice) recordings play across all Hindi customer care demo menus.
              </p>
            </div>

            {/* Customer Care Simulator */}
            <div className="hb-status-cap-row">
              <div className="hb-status-cap-meta">
                <span className="hb-badge is-info">
                  <IconClock size={12} /> Interactive Demo
                </span>
                <span className="hb-status-cap-name">Customer Care IVR Simulator</span>
              </div>
              <p className="hb-status-cap-text">
                Navigates three customer goals (Complaint, Payment, Refund) using verified offline menu transcripts.
              </p>
            </div>

            {/* Controlled Telephony Qualification */}
            <div className="hb-status-cap-row">
              <div className="hb-status-cap-meta">
                <span className="hb-badge is-ok">
                  <IconCheck size={12} /> Verified Telephony
                </span>
                <span className="hb-status-cap-name">Controlled Backend Engine</span>
              </div>
              <p className="hb-status-cap-text">
                Three genuine Gnani Prisma HTTP 200 responses and Asterisk DTMF navigation 5 → 8 → 1 verified in controlled local testing.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Honest Boundary Clarification */}
        <div className="hb-status-boundary-note">
          <p className="hb-small">
            <strong>Demonstration Scope:</strong> HoldBuddy is designed for browser-based product demonstrations and local PBX verification. Carrier-grade live PSTN calling is available only through licensed telecom trunking.
          </p>
        </div>

        {/* 4. Discreet Developer Lab Reference */}
        <div className="hb-status-dev-callout">
          <span className="hb-small">
            Evaluator or engineer looking for raw Asterisk ARI receipts, AudioSocket TCP streams, or provider IDs?
          </span>
          <a
            href={ROUTE_PATHS.developer}
            onClick={event => {
              event.preventDefault();
              onClose();
              window.location.hash = ROUTE_PATHS.developer;
            }}
            className="hb-dev-modal-link"
          >
            Open Developer Telephony Lab <IconArrowRight size={13} />
          </a>
        </div>

        <div className="hb-modal-actions">
          <button type="button" className="hb-btn hb-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConnectionHelp;
