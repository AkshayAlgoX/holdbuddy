# Changelog

All notable changes to the HoldBuddy project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-08

### Added
- **Core IVR Decision Engine (`packages/ivr-core`):** Real-time Hindi/Hinglish menu recognition, multi-level DTMF routing policy, and intelligent safe refusal for unsupported options.
- **Call Runtime & State Orchestrator (`packages/call-runtime`):** Single-session caller mutex, AudioSocket PCM16 bridge, and SSE event streaming.
- **Hold & Handoff Detection (`packages/handoff`):** Acoustic energy classification, hold music detection, and human speech arrival alerts.
- **Interactive Web Simulator (`apps/web`):** Full React 19 interface with real-time audio waveform, live transcript glosses, and phase rails.
- **Supported Consumer Journeys:**
  - Broadband Complaint: `5 → 8 → 1`
  - Bill Payment: `5 → 8 → 2`
  - Unsupported Refund: `5 → 8` with safe refusal (`action_mismatch`).
- **Gnani AI Integration:**
  - Timbre v3.0 Hindi Neural Voice (Shivani) integration for realistic IVR announcements and agent handoffs.
  - Prisma v3.0 Speech-to-Text adapter with verified local offline qualification evidence.
- **Security & Quality Harness:**
  - 48 automated regression, isolation, and integrity tests passing 100%.
  - Strict Content Security Policy, zero external credential exposure, and fail-closed native telephony routes.
