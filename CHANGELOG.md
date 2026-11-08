# Changelog

All notable changes to the HoldBuddy project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-11-08

### Added
- **Verified Native Engineering Evidence:** Complete audit report (`docs/GENUINE_NATIVE_EVIDENCE.md`) and sanitized machine-readable ledger (`docs/evidence/genuine-acceptance-evidence.json`) documenting the authorized Asterisk 20 ARI + Gnani Prisma v3.0 REST acceptance run (`native-web-2da1e346-7689-4d2b-925f-96f3dd38566e`).
- **Independent ARI Telephony Receipts:** 3 verified DTMF events (`5 → 8 → 1`) captured on Asterisk channel `2e3842f4-98db-4d2b-a8b8-b9140501ee0a`.
- **Offline Ledger Verifier:** Added automated offline structural and cryptographic invariant verifier (`scripts/verify-evidence.mjs` / `npm run verify:evidence`).
- **Judge & Evaluator Walkthrough:** Step-by-step engineering walkthrough in `README.md` and offline validation commands.

### Clarified
- **Architectural Boundaries:** Strict separation of REAL_API STT, local Asterisk loopback PBX, synthetic IVR prompts, prepared Gnani Timbre web audio, simulated Cloudflare Pages demo, and zero public PSTN calling.
- **Scope Disclosures:** Explicitly qualified routing accuracy to 3/3 decisions in this single controlled broadband complaint journey; attributed sub-350ms timings to Gnani Prisma STT server processing.
- **Team Attribution:** Formally updated co-author credits for Nikhil VS (@Nikhil-VS1811) across project documentation.

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
