# HoldBuddy — Hold, handled.

> **An intelligent, sovereign voice AI agent that navigates complex Indian customer-care IVRs, waits on hold, and hands control back to you when a human agent answers.**
> 
> *Built for the **Gnani AI Great Indian AI Internship Challenge 2026**.*

[![CI Status](https://github.com/AkshayAlgoX/HoldBuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/AkshayAlgoX/HoldBuddy/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D22.16-brightgreen.svg)](https://nodejs.org/)
[![Built with Gnani AI](https://img.shields.io/badge/Speech_AI-Gnani_Prisma_%26_Timbre_v3.0-orange.svg)](https://gnani.ai)
[![Demo](https://img.shields.io/badge/Live_Demo-Cloudflare_Pages-success.svg)](https://holdbuddy-cloudflare-pages.pages.dev/)

---

### 🌐 Live Interactive Demonstration
👉 **[Launch HoldBuddy on Cloudflare Pages](https://holdbuddy-cloudflare-pages.pages.dev/)** — *Zero-cost, edge-hosted Hindi IVR navigation simulation with real-time SSE telemetry and full mobile responsiveness.*

**Quick Links:** [🚀 Try Live Demo](https://holdbuddy-cloudflare-pages.pages.dev/) • [🔬 Verified Native Evidence](docs/GENUINE_NATIVE_EVIDENCE.md) • [📐 Architecture & Provenance](docs/INTEGRATION.md) • [🧪 Verification Suite (48 Tests Passed)](docs/VERIFICATION.md) • [💻 Local Quickstart](#9-installation--local-development) • [🔒 Security Model](#12-security--privacy-model)

---

### 🔬 Verified Native Engineering Evidence (Separately Qualified)

Separately from the public zero-cost interactive web simulation, HoldBuddy completed an authorized end-to-end native engineering test driving a real **Asterisk 20 PBX daemon** via ARI and AudioSocket with live **Gnani Prisma v3.0 Speech-to-Text REST requests** (`https://api.vachana.ai/stt/v3`):

- **Judge Walkthrough (Broadband Complaint Journey):**
  1. **Goal Selection:** User selects `"Complaint Help"` (`मेरे ब्रॉडबैंड बिल की शिकायत`) in the local developer console.
  2. **IVR Audio Playback:** Asterisk 20 PBX plays telecommunications Hindi IVR audio into the local loopback channel.
  3. **Gnani Prisma STT:** Prisma processes 3 live Hindi telephonic menus (sub-350ms server latency; Request IDs: `7113b10c-67ac-4e12-8636-4d2d24931413`, `77114a5f-ec02-4d5d-962a-60af1010356c`, `fa8604c5-7367-45a3-9038-ab8891d1b339`).
  4. **Goal-Constrained Controller:** HoldBuddy's semantic matching engine routes `5 → 8 → 1` (3/3 correct decisions in this controlled journey).
  5. **Independent Telephony Confirmation:** Asterisk independently records DTMF receipts (`5`, `8`, `1`) on the channel wire.
  6. **Safe Detach & Cleanup:** 119 ms clean media detach; Asterisk daemon exits cleanly (`code: 0`).
- **Architectural Truth & Boundaries:**
  - `REAL_API`: Real HTTPS calls to Gnani Prisma v3.0 REST STT (`hi-IN`).
  - `REAL_LOCAL_PBX`: Real native Asterisk 20 ARI + AudioSocket on Linux loopback.
  - `CONTROLLED_SYNTHETIC`: Local Hindi IVR menu audio played from verified benchmark fixtures.
  - `PREPARED_GNANI_TIMBRE`: Public website streams genuine Gnani Timbre v3.0 Shivani audio assets.
  - `SIMULATED_CONSUMER_UI`: The public Cloudflare Pages web demo is a client simulation for zero-cost competition accessibility.
  - `NO_PSTN`: No public PSTN carrier calls or live telecom trunking was used.
- **Full Evidence Dossier:** See [`docs/GENUINE_NATIVE_EVIDENCE.md`](docs/GENUINE_NATIVE_EVIDENCE.md) and machine-readable [`docs/evidence/genuine-acceptance-evidence.json`](docs/evidence/genuine-acceptance-evidence.json).

---

## 1. The Customer-Care Problem in India

Every day, millions of Indian consumers call telecom, banking, and utility customer helplines. The experience is notoriously frustrating:
- **Long, nested multi-level IVR menus** requiring constant attention and manual dialpad pressing across Hindi, English, and regional languages.
- **Ambiguous or unfamiliar phrasing** that leads to wrong departments or accidental disconnection.
- **Excruciating wait times on hold (15–45 minutes)** filled with repetitive hold music, preventing users from getting work done.
- **Missed human handoffs:** If the caller steps away for just 10 seconds and an executive picks up, the call is abruptly terminated due to silence.

**HoldBuddy solves this end-to-end:** you state your goal in plain Hindi or Hinglish, HoldBuddy takes over the line, listens to the prompts, makes intelligent DTMF navigation decisions, absorbs the entire hold period, and immediately alerts you the moment a live human representative speaks.

---

## 2. Product Experience & Interface

HoldBuddy features an editorial, high-clarity client interface designed for both mobile handsets and desktop workstations.

### Live Production Walkthrough

#### 1. Objective Selection & Phone Tree Configuration
Users select their intended goal in natural Hindi (`मेरे ब्रॉडबैंड बिल की शिकायत`, `मेरे ब्रॉडबैंड बिल का भुगतान`, or `मेरे ब्रॉडबैंड बिल का रिफंड`). HoldBuddy maps the natural-language intent to the IVR topology without requiring the user to know dialpad shortcuts beforehand:

![HoldBuddy Desktop Homepage — Objective selection cards for broadband complaint, payment help, and refund requests](docs/screenshots/desktop-homepage-objectives.png)

#### 2. Live IVR Navigation, Hold Queue & Human Agent Handoff
As the call progresses, HoldBuddy dynamically renders the real-time call trajectory across multi-level IVR menus (`5 → 8 → 1`), absorbs the hold queue, and fires an instant visual and acoustic notification the second an executive answers:

![HoldBuddy Call Journey & Human Handoff — Phase rail showing 5 -> 8 -> 1 navigation, hold absorption, and human agent takeover prompt](docs/screenshots/desktop-complaint-handoff.png)

#### 3. Mobile Responsiveness & Safe Refusal Policy

| Mobile Experience (390×844 Viewport) | Safe Refusal Policy (5 → 8 → Abstain) |
|:---:|:---:|
| [![HoldBuddy Mobile Responsive Interface at 390x844 viewport](docs/screenshots/mobile-layout-390.png)](docs/screenshots/mobile-layout-390.png) | [![HoldBuddy Safe Refusal Journey - Decision engine abstains at level 3 when refund is unoffered](docs/screenshots/desktop-refund-safe-refusal.png)](docs/screenshots/desktop-refund-safe-refusal.png) |
| *Adaptive single-column layout optimized for mobile touchscreens* | *Deterministic refusal (`action_mismatch`): never guesses or misdials* |

---

### Key Interface Capabilities

- **Live Navigation Phase Rails:** Visual trajectory tracking current menu depth, duration, and dispatched DTMF digits (`5 → 8 → 1`).
- **Synchronized Audio & Glosses:** Real-time audio streaming paired with millisecond-accurate Hindi transcript phrases and timing metadata.
- **Human Arrival Detection & Handoff:** High-priority human agent detection prompt (`"नमस्ते, मेरा नाम आशा है..."`) allowing the user to take over the live line with one tap.
- **Safe Refusal & Transparency:** Transparently discloses when a requested option (e.g., refund) is unoffered by the telecom provider and halts execution rather than misrouting.
- **Audio Provenance & Disclosure Transparency:** The live public demonstration streams verified Gnani Timbre v3.0 Shivani neural voice audio (`prompt-02.wav` through `prompt-07.wav`, verified via `x-holdbuddy-audio-origin: public_synthetic` HTTP headers). The client interface preserves a conservative synthetic fallback disclosure caption in adherence with competition transparency guidelines.

---

## 3. Live Demonstration & Video

- **Public Interactive Web Demo:** [https://holdbuddy-cloudflare-pages.pages.dev/](https://holdbuddy-cloudflare-pages.pages.dev/)  
  *(Durable zero-cost Cloudflare edge deployment with full mobile support).*
- **Secondary Web Demo:** [https://holdbuddy-demo-deploy.onrender.com/](https://holdbuddy-demo-deploy.onrender.com/)
- **60-Second Competition Video:** High-definition video walkthrough showcasing the complete Hindi customer journey from IVR dialing to human executive handoff.
- **Technical Architecture Documentation:** See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for three-goal integration provenance and component boundaries.
- **Verification & Acceptance Ledger:** See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) for 48 automated test results and production gateway qualification.

---

## 4. Key Features & Supported Scenarios

| Scenario | Input Objective | Navigation Path | Decision Outcome |
|---|---|:---:|---|
| **Broadband Bill Complaint** | `"मेरे ब्रॉडबैंड बिल की शिकायत"` | `5 → 8 → 1` | Navigates 3 levels, enters hold queue, detects executive greeting (`"नमस्ते, मेरा नाम आशा है"`), alerts user. |
| **Broadband Bill Payment** | `"मेरे ब्रॉडबैंड बिल का भुगतान"` | `5 → 8 → 2` | Navigates broadband (`5`), billing (`8`), payment help (`2`), enters hold, completes handoff. |
| **Unsupported Refund Request** | `"मेरे ब्रॉडबैंड बिल का रिफंड"` | `5 → 8` | Safely abstains (`decision.abstained: action_mismatch`) at menu level 3 when refund is unoffered. **Never guesses.** |

---

## 5. System Architecture

HoldBuddy is designed with a strict clean-architecture separation between the conversational decision engine, the session state machine, and the telephony/audio layer:

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer (React 19 + TypeScript)"]
        UI["Studio / Keypad / Phase Rail"]
        Waveform["Audio Waveform & Glosses"]
        SSEClient["Server-Sent Events (SSE) Client"]
    end

    subgraph ServiceLayer ["Edge & Backend Runtime"]
        CF["Cloudflare Pages Functions / Node.js Server"]
        Sessions["Session Factory & Mutex Coordinator"]
    end

    subgraph CoreEngine ["HoldBuddy Core Engine"]
        IVR["IVR Decision Engine (packages/ivr-core)"]
        Matcher["Goal & Semantic Policy Matcher"]
        Handoff["Hold & Human Classifier (packages/handoff)"]
        Runtime["Call Session State Machine (packages/call-runtime)"]
    end

    subgraph TelephonyLayer ["Telephony & Speech Providers"]
        Sim["Deterministic Simulator (packages/simulator)"]
        Audio["Gnani Timbre v3.0 Audio Catalog"]
        Asterisk["Asterisk 20 PBX (AudioSocket PCM16 / ARI)"]
        Prisma["Gnani Prisma v3.0 STT REST Engine"]
    end

    UI --> SSEClient
    SSEClient <--> CF
    CF <--> Sessions
    Sessions --> Runtime
    Runtime --> IVR
    IVR --> Matcher
    Runtime --> Handoff
    Runtime -.->|Public Demonstration| Sim
    Sim --> Audio
    Runtime -.->|Local Native Qualification| Asterisk
    Asterisk <--> Prisma
```

---

## 6. Gnani AI Integration Architecture

HoldBuddy leverages **Gnani AI's sovereign Indic speech models** across two distinct operational pipelines:

### 1. Gnani Timbre v3.0 (Text-to-Speech)
- **Model:** Timbre v3.0 (Shivani — Hindi Neural Voice).
- **Application:** Generates lifelike IVR telephony prompts and human agent greetings with authentic Indian cadence, numeral pronunciation, and natural conversational prosody.
- **Deployment:** Pre-generated audio assets (`prompt-02.wav` through `prompt-07.wav`) served over CDN and streaming endpoints with strict metadata (`x-holdbuddy-audio-origin: public_synthetic`).

### 2. Gnani Prisma v3.0 (Speech-to-Text)
- **Model:** Prisma v3.0 (`hi-IN` / Hindi telephonic model).
- **Application:** Transcribes incoming phone menu audio captured during live Asterisk PBX sessions via REST integration (`https://api.vachana.ai/stt/v3`).
- **Telemetry Verification:** Each native API response provides a verified provider request ID (`providerRequestId`), language probability, and word timings.

---

## 7. Asterisk 20 PBX & AudioSocket Native Verification

For native telephony verification, HoldBuddy integrates with **Asterisk 20** using Asterisk REST Interface (ARI) and AudioSocket:

1. **Audio Capture:** AudioSocket streams raw 16-bit 8kHz/16kHz linear PCM audio over TCP between the Asterisk channel driver and HoldBuddy's user-space daemon.
2. **Menu Turn Recognition:** Audio is framed and sent to Gnani Prisma STT after silence boundary detection.
3. **DTMF Dispatch:** When the IVR decision policy chooses an option (e.g., digit `5`), HoldBuddy issues an ARI command:
   ```http
   POST /ari/channels/{channelId}/dtmf?dtmf=5
   ```
4. **Independent Audit Ledger:** DTMF acknowledgement events, audio detaches, and hangup signals are recorded in an immutable local transaction ledger.

> 📖 **Full Engineering Report & Artifacts:** See [`docs/GENUINE_NATIVE_EVIDENCE.md`](docs/GENUINE_NATIVE_EVIDENCE.md) for complete request IDs, sample-accurate audio verification, and reproducible offline validation scripts. Full machine-readable evidence: [`docs/evidence/genuine-acceptance-evidence.json`](docs/evidence/genuine-acceptance-evidence.json).

---

## 8. Public Demonstration vs. Native Telephony Boundary

To ensure absolute public safety, zero hosting costs, and resilience against cold starts, HoldBuddy maintains an intentional architectural boundary:

| Feature / Capability | Public Web Demonstration (`pages.dev`) | Local Native Qualified Testbed |
|---|:---:|:---:|
| **Runtime Environment** | Cloudflare Pages + Edge Functions | Node.js + Local Asterisk 20 PBX |
| **Hosting Cost** | $0.00 / month (Cloudflare Free) | Local developer workstation |
| **Voice Audio Source** | Genuine Gnani Timbre v3.0 WAV assets | Live Asterisk AudioSocket stream |
| **STT Execution** | Pre-verified deterministic fixtures | Live Gnani Prisma v3.0 REST calls |
| **Phone Lines Used** | 0 (No PSTN / carrier connection) | Local loopback softphone extension |
| **API Credentials Exposed** | None (Zero keys in code/bundle) | Server-side volatile memory |
| **Native Telephony Routes** | Fail closed (`404` / `403` / `503`) | Enabled for same-origin loopback |

---

## 9. Installation & Local Development

### Prerequisites
- **Node.js:** `>= 22.16.0` (Recommended: Node 22 LTS)
- **npm:** `>= 10.0.0`
- **Git**

### Quick Start (Local Web Simulator)
```bash
# 1. Clone the repository
git clone https://github.com/AkshayAlgoX/HoldBuddy.git
cd HoldBuddy

# 2. Install dependencies
npm install

# 3. Verify type integrity
npm run typecheck

# 4. Build frontend and backend bundles
npm run build

# 5. Start the local server
npm start
```
Open **[http://127.0.0.1:10000](http://127.0.0.1:10000)** in your browser.

---

## 10. Environment Configuration

Copy the example configuration file:
```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `10000` | Port for the HTTP and SSE server |
| `HOST` | `127.0.0.1` | Bind address (loopback for security) |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:10000` | Allowed origin for CORS & SSE |
| `TELEPHONY_MODE` | `offline_mock` | `offline_mock` (safe default) or `live_native` |
| `GNANI_API_KEY` | *(blank)* | Optional key for live Prisma native runs |

---

## 11. Reproducible Test Suite

HoldBuddy includes a comprehensive automated test suite utilizing Node.js's native test runner (`node:test`):

```bash
# Run all 48 automated regression, isolation, and security tests
npm test
```

### Test Coverage Highlights:
- **`tests/server.test.mjs`:** Verifies deterministic 5→8→1 navigation, session mutex, rate limits, audio PCM integrity, and traversal rejection.
- **`tests/shared-objectives.test.mjs`:** Validates 8-concurrent visitor pacing, session isolation, and goal mutation rejection.
- **`tests/website-integration.test.mjs`:** Confirms presentation evidence contracts, anti-fabrication guards, and strict header policies.
- **`tests/build-integrity.test.mjs`:** Validates build output hashes, bundle hygiene, and anti-replay guards.
- **`tests/native-adapter.test.mjs`:** Tests native telephony loopback authorization, phrase gating, and fail-closed security.

---

## 12. Security & Privacy Model

- **No Credential Leakage:** No API keys, passwords, or tokens are committed to Git or bundled into browser assets.
- **Strict Content Security Policy (CSP):**
  - `default-src 'self'`
  - `form-action 'none'` (disables unauthorized external data postback)
  - `frame-ancestors 'none'` (prevents iframe embedding / clickjacking)
- **Local Loopback Isolation:** Privileged native endpoints verify `127.0.0.1` / `localhost` origins and reject external host headers.
- **Zero PII:** No user audio or phone numbers are recorded or persisted.

---

## 13. Known Limitations

- **Simulated Carrier Line:** The public web demonstration is an interactive simulation using genuine Gnani Timbre audio and verified transcripts. It does not initiate actual PSTN carrier phone calls.
- **Single Active Session per IP (Simulator):** To prevent edge abuse, visitor sessions are rate-limited and bound to single concurrent call threads.
- **Pre-defined Scenario Breadth:** Current IVR decision trees focus on common telecommunications broadband workflows (complaint, billing, payment, and refund refusal). Expanding to banking and aviation requires additional scenario definitions.
- **Controlled Qualification Scope:** The native Asterisk engineering verification confirmed 3 out of 3 correct routing decisions in one specific controlled broadband complaint journey; it does not claim universal 100% routing accuracy across untested phone menus.
- **Constrained Decision Engine:** HoldBuddy utilizes a deterministic, goal-constrained semantic policy matcher against discrete IVR menu choices; it is not an unconstrained generative LLM.
- **Internal Verification Attestation:** Auditing and test qualification were conducted internally by the project engineering team using automated reproducible test scripts; no external third-party auditing agency is claimed.

---

## 14. Technical Roadmap

- [x] Multi-level Hindi IVR decision engine with safe abstention (`5 → 8 → 1` and `5 → 8 → 2`).
- [x] Acoustic hold-music and human speech classification model.
- [x] Zero-cost durable Cloudflare Pages deployment with SSE streaming.
- [ ] Direct SIP / WebRTC bridge for live in-browser softphone calling.
- [ ] Regional Indic language packs: Kannada, Tamil, Telugu, and Marathi IVR navigation.
- [ ] On-device Whisper / Kokoro quantization for local edge inference on mobile devices.
- [ ] Enterprise CRM and ticketing webhook integrations (Zendesk, Freshdesk).

---

## 15. Team Credits

HoldBuddy was conceptualized, built, and qualified by:

- **Akshaya R ([@AkshayAlgoX](https://github.com/AkshayAlgoX))** — Core System Architecture, IVR Decision Policy, Asterisk AudioSocket Pipelines, Cloudflare Edge Deployment, and Test Automation.
- **Nikhil** — Product Strategy, Telephony Scenario Research, UI/UX Design Direction, and Competition Video Storyboarding.

---

## 16. Gnani AI Acknowledgment

We gratefully acknowledge **Gnani Innovations Private Limited** for organizing the **Great Indian AI Internship Challenge 2026** and providing access to their state-of-the-art sovereign Indic speech models:
- **Gnani Prisma v3.0** — High-accuracy telephonic Speech-to-Text.
- **Gnani Timbre v3.0** — Natural Indic Text-to-Speech.
- **Gnani Evon v3.3** — Indic multilingual reasoning models.

---

## 17. License & Third-Party Notices

- **Source Code:** Original HoldBuddy source code is licensed under the [Apache License, Version 2.0](./LICENSE).
- **Gnani Timbre Audio Assets:** Audio files (`prompt-02.wav` through `prompt-07.wav`) are synthetic speech outputs of Gnani Timbre v3.0, used with authorized competition distribution rights. They are not covered under Apache 2.0.
- **Third-Party Notices:** See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for full font, model, and dependency licenses.

---

## 18. Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before submitting pull requests.
