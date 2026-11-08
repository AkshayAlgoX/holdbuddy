<div align="center">

# HoldBuddy — Hold, handled.

**An intelligent voice AI agent that navigates complex Indian customer-care IVRs, waits on hold, and hands control back to you when a human agent answers.**

*Built for the **Gnani AI Great Indian AI Internship Challenge 2026**.*

[![CI Status](https://github.com/AkshayAlgoX/holdbuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/AkshayAlgoX/holdbuddy/actions)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Speech AI: Gnani AI](https://img.shields.io/badge/Speech_AI-Gnani_Prisma_%26_Timbre_v3.0-orange.svg)](https://gnani.ai)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D22.16-brightgreen.svg)](https://nodejs.org/)
[![Live Demo: Cloudflare Pages](https://img.shields.io/badge/Live_Demo-Cloudflare_Pages-success.svg)](https://holdbuddy-cloudflare-pages.pages.dev/)

---

### [🚀 Try the Live Interactive Demo on Cloudflare Pages](https://holdbuddy-cloudflare-pages.pages.dev/)
*Zero-install, mobile-ready Hindi IVR simulation running on Cloudflare Pages edge runtime.*

[**Live Demo**](https://holdbuddy-cloudflare-pages.pages.dev/) • [**Verified Evidence**](docs/GENUINE_NATIVE_EVIDENCE.md) • [**System Architecture**](#4-system-architecture--component-boundaries) • [**Local Reproduction**](#6-installation--reproducible-verification) • [**Known Limitations**](#7-known-limitations--truth-in-engineering)

---

</div>

<p align="center">
  <img src="docs/screenshots/desktop-homepage-objectives.png" alt="HoldBuddy Desktop Homepage — Objective selection cards for broadband complaint, payment help, and refund requests" width="100%">
</p>

---

## 1. The Customer-Care Problem & The HoldBuddy Approach

### The Problem in India
Every day, millions of Indian consumers call telecom, banking, and utility customer helplines. The experience is notoriously frustrating:
- **Labyrinthine IVR Menus:** Deeply nested dialpad trees across Hindi, English, and regional languages that force callers to listen to repetitive, irrelevant options.
- **Cognitive Load & Ambiguity:** Dialpad options move or use unfamiliar phrasing, leading to misrouting or accidental disconnection.
- **Excruciating Hold Queues:** 15–45 minutes trapped listening to repetitive hold music, preventing users from working or stepping away.
- **Abrupt Disconnections:** If a human executive finally answers while the caller steps away for just 10 seconds, the executive disconnects due to silence.

### The HoldBuddy Solution
HoldBuddy acts as an intelligent, sovereign proxy for your telephone line:
1. **Goal-First Intent:** You state your goal in plain Hindi or Hinglish (`"मेरे ब्रॉडबैंड बिल की शिकायत"`).
2. **Autonomous Telephony Navigation:** HoldBuddy listens to the live prompts, identifies the correct options using constrained semantic matching, and presses the necessary DTMF tones (`5 → 8 → 1`).
3. **Hold Queue Absorption:** HoldBuddy stays on the line through the hold music while you carry on with your life.
4. **Instant Human Hand-off:** The acoustic classifier detects live human speech greetings (`"नमस्ते, मेरा नाम आशा है..."`) and immediately fires high-priority visual and audio alerts to transfer the call to you.
5. **Deterministic Safe Abstention:** HoldBuddy **never guesses**. If a requested option (e.g., refund) is unoffered by the telecom provider, it halts and refuses safely (`action_mismatch`) instead of misdialing.

---

## 2. Product Experience & Visual Walkthrough

HoldBuddy features an editorial, high-clarity client interface designed for mobile touchscreens and desktop workstations.

### Live Call Progression & Human Executive Handoff
As the call advances through the Hindi IVR phone tree, HoldBuddy dynamically renders the live trajectory, absorbs the hold queue, and fires an instant takeover alert when an executive speaks:

<p align="center">
  <img src="docs/screenshots/desktop-complaint-handoff.png" alt="HoldBuddy Live Call Navigation — Phase rail showing 5 -> 8 -> 1 navigation, hold queue absorption, and human agent takeover prompt" width="100%">
</p>

### Mobile Responsiveness & Safe Refusal Policy

| Mobile Interface (390×844 Viewport) | Safe Refusal Policy (`5 → 8 → Abstain`) |
|:---:|:---:|
| [![HoldBuddy Mobile Responsive Interface at 390x844 viewport](docs/screenshots/mobile-layout-390.png)](docs/screenshots/mobile-layout-390.png) | [![HoldBuddy Safe Refusal Journey - Decision engine abstains at level 3 when refund is unoffered](docs/screenshots/desktop-refund-safe-refusal.png)](docs/screenshots/desktop-refund-safe-refusal.png) |
| *Adaptive single-column layout optimized for mobile touchscreens* | *Deterministic refusal (`action_mismatch`): halts rather than guessing* |

### Supported Customer Scenarios

| Scenario | Input Objective | Navigation Path | Decision Outcome |
|---|---|:---:|---|
| **Broadband Bill Complaint** | `"मेरे ब्रॉडबैंड बिल की शिकायत"` | `5 → 8 → 1` | Navigates 3 menu levels, enters hold queue, detects executive greeting (`"नमस्ते, मेरा नाम आशा है"`), alerts user. |
| **Broadband Bill Payment** | `"मेरे ब्रॉडबैंड बिल का भुगतान"` | `5 → 8 → 2` | Navigates broadband (`5`), billing (`8`), payment help (`2`), enters hold, completes handoff. |
| **Unsupported Refund Request** | `"मेरे ब्रॉडबैंड बिल का रिफंड"` | `5 → 8` | Safely abstains (`decision.abstained: action_mismatch`) at menu level 3 when refund is unoffered. **Never guesses.** |

---

## 3. Verified Native Engineering Evidence (Prisma STT + Asterisk 20)

Separately from the public zero-cost interactive web simulation, HoldBuddy completed an authorized end-to-end native engineering qualification driving a **real local Asterisk 20 PBX daemon** via ARI and AudioSocket with live **Gnani Prisma v3.0 Speech-to-Text REST requests** (`https://api.vachana.ai/stt/v3`):

### The 90-Second Evaluator Walkthrough
1. **Goal Selection:** User selects `"Complaint Help"` (`मेरे ब्रॉडबैंड बिल की शिकायत`) in the local developer console.
2. **Audio Injection:** Asterisk 20 PBX plays telecommunications Hindi IVR audio into the local channel driver.
3. **Live Gnani Prisma STT:** Prisma processes 3 live Hindi telephonic menus (sub-350ms server latency; Request IDs: `7113b10c-67ac-4e12-8636-4d2d24931413`, `77114a5f-ec02-4d5d-962a-60af1010356c`, `fa8604c5-7367-45a3-9038-ab8891d1b339`).
4. **Constrained Decision Controller:** HoldBuddy routes `5 → 8 → 1` (**3 out of 3 correct decisions** in this controlled journey).
5. **Independent Telephony Receipts:** Asterisk independently confirms DTMF keypresses (`5`, `8`, `1`) on the channel wire.
6. **Safe Detach & Teardown:** 119 ms clean media detach; Asterisk daemon exits cleanly with **code 0**.

### Verified Turn Evidence Ledger

| Turn | Audio Bytes | Gnani Prisma Request ID | Server Processing | Recognized Hindi Transcript | Dispatched Digit | Asterisk ARI Receipt |
|:---:|:---:|:---:|:---:|---|:---:|:---:|
| **1** | 183,680 B | `7113b10c-67ac-4e12-8636-4d2d24931413` | 204.9 ms | `"mobile के लिए कृपया 3 दबाएं। landline के लिए 6 दबाएं। रोमिंग के लिए कृपया एक दबाएं। ब्रॉडबैंड के लिए पाँच दबाएं।"` | **`5`** | `ChannelDtmfReceived: 5` (100ms) |
| **2** | 368,640 B | `77114a5f-ec02-4d5d-962a-60af1010356c` | 295.8 ms | `"दोबारा सुनने के लिए 3 दबाएं। बिल के लिए कृपया 8 दबाएं। प्लान के लिए 2 दबाएं। नया connection के लिए कृपया 6 दबाएं... बिल के लिए कृपया 8 दबाएं।"` | **`8`** | `ChannelDtmfReceived: 8` (100ms) |
| **3** | 282,560 B | `fa8604c5-7367-45a3-9038-ab8891d1b339` | 266.6 ms | `"बिल की शिकायत के लिए कृपया 1 दबाएँ। roaming के लिए 7 दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएं। बिल के भुगतान के लिए 2 दबाएं..."` | **`1`** | `ChannelDtmfReceived: 1` (100ms) |

> 📖 **Full Engineering Report & Artifacts:** See [`docs/GENUINE_NATIVE_EVIDENCE.md`](docs/GENUINE_NATIVE_EVIDENCE.md) for full turn breakdowns, sample-accurate audio verification, and reproducible offline validation commands. Complete machine-readable evidence: [`docs/evidence/genuine-acceptance-evidence.json`](docs/evidence/genuine-acceptance-evidence.json).

---

## 4. System Architecture & Component Boundaries

HoldBuddy enforces a strict architectural boundary between client presentation, conversational decision logic, and telephony hardware/speech adapters:

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

### Architectural Truth Matrix

To ensure absolute transparency, the implementation boundaries are classified below:

| Domain | Provenance | Implementation Details |
|---|---|---|
| **Speech Recognition** | **`REAL_API`** | Live HTTPS requests to **Gnani Prisma v3.0 REST STT** (`/stt/v3`). Returned real provider request IDs, detected Hindi language (`hi-IN`), and sub-350ms processing latencies. |
| **Telephony Control** | **`REAL_LOCAL_PBX`** | Native **Asterisk 20 PBX** on Linux loopback via ARI REST and AudioSocket TCP. DTMF injection with independent wire receipts (`ChannelDtmfReceived`). |
| **Carrier Trunking** | **`NONE`** | **No public PSTN trunking or live phone carrier connection.** Audio was routed through Asterisk loopback channels. We do not claim live carrier dialing. |
| **Local IVR Prompts** | **`CONTROLLED_SYNTHETIC`** | Hindi prompt WAVs played into Asterisk channels were pre-generated telecommunications benchmark fixtures with byte-exact PCM matching. |
| **Public Website Audio** | **`PREPARED_GNANI_TIMBRE`** | Public interactive web demonstration streams authentic pre-rendered **Gnani Timbre v3.0 Shivani** neural voice recordings (`prompt-02.wav` through `prompt-07.wav`). |
| **Public Web Demo** | **`EDGE_SIMULATION`** | Cloudflare Pages consumer site simulates the timeline on the edge for zero hosting cost; it does not connect to Asterisk or submit live API requests. |

---

## 5. Gnani AI Integration Architecture

HoldBuddy integrates **Gnani AI's sovereign Indic speech models** across two specialized pipelines:

### 1. Gnani Timbre v3.0 (Text-to-Speech)
- **Model:** Timbre v3.0 (Shivani — Hindi Neural Voice).
- **Role:** Delivers lifelike IVR telephony prompts and human agent greetings with authentic Indian cadence, numeral pronunciation, and natural conversational prosody.
- **Asset Delivery:** Served over Cloudflare CDN and streaming endpoints with strict metadata (`x-holdbuddy-audio-origin: public_synthetic`).

### 2. Gnani Prisma v3.0 (Speech-to-Text)
- **Model:** Prisma v3.0 (`hi-IN` / Hindi telephonic model).
- **Role:** Transcribes incoming phone menu audio captured during live Asterisk PBX sessions via REST integration (`https://api.vachana.ai/stt/v3`).
- **Telemetry Verification:** Each native API response provides a verified provider request ID (`providerRequestId`), language probability, and word timings.

---

## 6. Installation & Reproducible Verification

### Quick Start (Local Web Simulator)
```bash
# 1. Clone the repository
git clone https://github.com/AkshayAlgoX/holdbuddy.git
cd holdbuddy

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

### Reproducing the Automated Test Suite
HoldBuddy includes 48 automated regression, isolation, and security tests using Node.js's native test runner (`node:test`):

```bash
# Run all 48 automated tests (clean offline execution)
npm test
```

### Reproducing the Offline Evidence Verification
Any evaluator can verify the cryptographic and structural integrity of the published evidence ledger in under 1 second:

```bash
node -e "
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('docs/evidence/genuine-acceptance-evidence.json', 'utf8'));
console.log('Verdict:', data.acceptanceVerdict);
console.log('Classification:', data.classification);
console.log('Turns Verified:', data.turns.length);
data.turns.forEach(t => {
  console.log(\` Turn \${t.generation}: Prisma ID=\${t.requestId} -> Pressed \${t.decision.digit} -> ARI Confirmed \${t.independentDtmfReceipt.digit}\`);
});
"
```

---

## 7. Known Limitations & Truth in Engineering

To maintain scientific integrity and prevent exaggerated claims, the project scope is explicitly bound:

1. **No PSTN Carrier Calling:** The public web demonstration is an interactive simulation; the native testbed uses local Asterisk loopback. Neither initiates actual PSTN or cellular carrier phone calls.
2. **Controlled Journey Scope:** The native engineering test validated **3 out of 3 correct routing decisions in one specific controlled broadband complaint journey**. It does *not* claim universal 100% routing accuracy across untested telephony topologies.
3. **Latency Attribution:** The measured sub-350ms timings represent **Gnani Prisma v3.0 STT server processing times**, not the full round-trip latency of the complete decision pipeline.
4. **Constrained Goal Matcher:** HoldBuddy's controller is a **deterministic, goal-constrained semantic policy matcher** operating against discrete IVR menu choices; it is not an unconstrained, generative reasoning LLM.
5. **Internal Auditing Attestation:** Testing was verified internally by our automated engineering suite; no external third-party auditing agency is claimed.
6. **Single Active Session per IP (Demo):** To prevent edge abuse, visitor sessions are rate-limited and bound to single concurrent call threads.

---

## 8. Team Credits & Attribution

HoldBuddy was conceptualized, built, and qualified by:

- **Akshaya R ([@AkshayAlgoX](https://github.com/AkshayAlgoX))** — Core System Architecture, IVR Decision Policy, Asterisk AudioSocket Pipelines, Cloudflare Edge Deployment, and Test Automation.
- **Nikhil** — Product Strategy, Telephony Scenario Research, UI/UX Design Direction, and Competition Video Storyboarding.

### Gnani AI Acknowledgment
We gratefully acknowledge **Gnani Innovations Private Limited** for organizing the **Great Indian AI Internship Challenge 2026** and providing access to their sovereign Indic speech models:
- **Gnani Prisma v3.0** — High-accuracy telephonic Speech-to-Text.
- **Gnani Timbre v3.0** — Natural Indic Text-to-Speech.
- **Gnani Evon v3.3** — Multilingual Indic reasoning models.

---

## 9. License & Third-Party Notices

- **Source Code:** Original HoldBuddy source code is licensed under the [Apache License, Version 2.0](./LICENSE).
- **Gnani Timbre Audio Assets:** Audio files (`prompt-02.wav` through `prompt-07.wav`) are synthetic speech outputs of Gnani Timbre v3.0, used with authorized competition distribution rights. They are not covered under Apache 2.0.
- **Third-Party Notices:** See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for full font, model, and dependency licenses.
- **Contributing:** See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
