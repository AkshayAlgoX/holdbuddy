# Verified Native Engineering Evidence

> **Competition Target:** Gnani AI Great Indian AI Internship Challenge 2026  
> **Qualification Run:** `native-web-2da1e346-7689-4d2b-925f-96f3dd38566e`  
> **Execution Date:** 2026-11-08T16:47:13+05:30  
> **Acceptance Verdict:** **PASS (GO)** — `REAL_REST_COMPLETE_NATIVE_JOURNEY`  
> **Machine-Readable Evidence File:** [`docs/evidence/genuine-acceptance-evidence.json`](./evidence/genuine-acceptance-evidence.json)

---

## 1. Executive Summary

Separately from the public zero-cost interactive web simulation hosted on Cloudflare Pages, HoldBuddy completed an authorized end-to-end native engineering test.

In this test, the HoldBuddy developer console directly drove a **real local Asterisk 20 PBX daemon** via Asterisk REST Interface (ARI) and AudioSocket TCP, submitting incoming PCM audio to **live Gnani Prisma v3.0 Speech-to-Text REST endpoints** (`https://api.vachana.ai/stt/v3`), recognizing spoken Hindi telephonic menus, making goal-constrained routing decisions, and dispatching DTMF tones independently verified by Asterisk on the channel wire.

```
┌─────────────────────────────────┐
│     Local Developer Console     │
└───────────────┬─────────────────┘
                │ Loopback REST & SSE
                ▼
┌────────────────────────┐  AudioSocket  ┌──────────────┐   HTTPS REST   ┌────────────────────────┐
│  Asterisk 20 PBX Core  │◄─────────────►│ Native Worker│◄──────────────►│    Gnani Prisma v3     │
│  (127.0.0.1:8088/9099) │   (PCM16)     │   (Node/TS)  │                │     Live REST STT      │
└────────────────────────┘               └──────────────┘                └────────────────────────┘
```

---

## 2. Walkthrough for Judges & Evaluators

The complete journey executed autonomously through the following sequence:

1. **Objective Selection:** The user initiates `"Complaint Help"` (`मेरे ब्रॉडबैंड बिल की शिकायत`) from the local developer console.
2. **Audio Injection:** Asterisk 20 PBX plays the initial telecommunications Hindi IVR prompt into the channel.
3. **Turn 1 Recognition & DTMF Dispatch:**
   - Raw linear PCM16 (8 kHz mono, 183,680 bytes) is framed over AudioSocket and submitted to Gnani Prisma v3.0.
   - **Prisma Request ID:** `7113b10c-67ac-4e12-8636-4d2d24931413` (processing time: 204.9 ms, language: `hi-IN`).
   - **Transcript:** `"mobile के लिए कृपया 3 दबाएं। landline के लिए 6 दबाएं। रोमिंग के लिए कृपया एक दबाएं। ब्रॉडबैंड के लिए पाँच दबाएं।"`
   - **Decision:** HoldBuddy matches the broadband category and issues DTMF digit **`5`**.
   - **Independent Receipt:** Asterisk records `ChannelDtmfReceived: '5'` (`sequence: 1`, duration: 100 ms).
4. **Turn 2 Recognition & DTMF Dispatch:**
   - Asterisk plays the secondary service menu (368,640 bytes).
   - **Prisma Request ID:** `77114a5f-ec02-4d5d-962a-60af1010356c` (processing time: 295.8 ms, language: `hi-IN`).
   - **Transcript:** `"दोबारा सुनने के लिए 3 दबाएं। बिल के लिए कृपया 8 दबाएं। प्लान के लिए 2 दबाएं। नया connection के लिए कृपया 6 दबाएं। तकनीकी सहायता के लिए 7 दबाएं। store की जानकारी के लिए कृपया 1 दबाएं। मुख्य menu पर वापस जाने के लिए 9 दबाएं।"`
   - **Decision:** HoldBuddy identifies the billing option and issues DTMF digit **`8`**.
   - **Independent Receipt:** Asterisk records `ChannelDtmfReceived: '8'` (`sequence: 2`, duration: 100 ms).
5. **Turn 3 Recognition & DTMF Dispatch:**
   - Asterisk plays the billing actions menu (282,560 bytes).
   - **Prisma Request ID:** `fa8604c5-7367-45a3-9038-ab8891d1b339` (processing time: 266.6 ms, language: `hi-IN`).
   - **Transcript:** `"बिल की शिकायत के लिए कृपया 1 दबाएँ। roaming के लिए 7 दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएं। बिल के भुगतान के लिए 2 दबाएं। मुख्य menu पर वापस जाने के लिए कृपया 5 दबाएं।"`
   - **Decision:** HoldBuddy matches the complaint destination and issues DTMF digit **`1`**.
   - **Independent Receipt:** Asterisk records `ChannelDtmfReceived: '1'` (`sequence: 3`, duration: 100 ms).
6. **Arrival & Safe Detach:**
   - Destination prompt (194,880 bytes) arrives at `complaint_help`.
   - HoldBuddy executes a **119 ms clean media detach**, hangs up channels, and halts the Asterisk daemon with **exit code 0**.

---

## 3. Verified Metrics & Evidence Ledger

| Metric / Check | Value | Verification Evidence |
|---|---|---|
| **Gnani Speech Mode** | `REAL_API` | Fresh HTTPS POST to `https://api.vachana.ai/stt/v3` |
| **Prisma Request IDs** | 3 distinct IDs | `7113b10c-67ac-4e12-8636-4d2d24931413`<br>`77114a5f-ec02-4d5d-962a-60af1010356c`<br>`fa8604c5-7367-45a3-9038-ab8891d1b339` |
| **Prisma STT Latencies** | 204.9 ms, 295.8 ms, 266.6 ms | Reported directly in Gnani API responses |
| **Telephony Engine** | Native Asterisk 20 PBX | Linux userspace daemon on `127.0.0.1:8088` (ARI) & `9099` (AudioSocket) |
| **ARI DTMF Receipts** | 3 independent events | Recorded on channel `2e3842f4-98db-4d2b-a8b8-b9140501ee0a` |
| **Navigated Route** | `5 → 8 → 1` | Verified sequence matching objective `complaint` |
| **Audio Verification** | 4/4 byte-exact SHA-256 | Captured audio matches reference PCM byte-for-byte |
| **Safe Detach Latency** | 119 ms | Detach started at +67.286s, completed at +67.405s |
| **Daemon Teardown** | Clean exit (`code: 0`) | All snoop, tap, and bridge channels destroyed |

---

## 4. Architectural Boundaries: Real vs. Synthetic vs. Simulated

To ensure total transparency, the following table defines the exact boundaries of each component:

| Component | Provenance Classification | Reality & Implementation Details |
|---|---|---|
| **Speech Recognition** | **`REAL_API`** | Live HTTPS requests to **Gnani Prisma v3.0 REST STT**. Verified provider request IDs, language detection (`hi-IN`), and word-level latency metadata. |
| **Telephony Control** | **`REAL_LOCAL_PBX`** | Native **Asterisk 20 PBX** running on Linux loopback. Channel creation via ARI REST, bidirectional PCM over AudioSocket TCP, and independent ARI DTMF event capture. |
| **Carrier Trunking / PSTN** | **`NONE`** | **No public PSTN trunking or live telecom carrier calls.** Audio was routed through Asterisk loopback channels. We do not claim live cellular or landline calling. |
| **Local IVR Prompts** | **`CONTROLLED_SYNTHETIC`** | Hindi audio prompts played by Asterisk were pre-generated telecommunications benchmark fixtures (Kokoro Hindi TTS) with strict PCM SHA-256 integrity checks. |
| **Public Website Audio** | **`PREPARED_GNANI_TIMBRE`** | Public interactive demonstration serves authentic **Gnani Timbre v3.0 Shivani** neural voice recordings (`prompt-02.wav` through `prompt-07.wav`). |
| **Public Web Demonstration** | **`EDGE_SIMULATION`** | Cloudflare Pages consumer site simulates the IVR timeline and audio playback on the edge; it does not connect to Asterisk or submit live API requests. |

---

## 5. Scope & Explicit Engineering Disclosures

To prevent misleading interpretations, the engineering scope is explicitly qualified:

1. **Routing Accuracy Scope:** The test verified **3 out of 3 correct decisions in this specific controlled broadband complaint journey**. It does *not* claim universal 100% routing accuracy across untested telephony topologies.
2. **Latency Attribution:** The measured sub-350ms latencies (204.9 ms, 295.8 ms, 266.6 ms) represent **Gnani Prisma v3.0 STT server processing times**, not the total round-trip time of the complete decision pipeline.
3. **Auditing Attestation:** Verification was performed by our internal engineering team using automated reproducible verification scripts; no external third-party auditing agency is claimed.
4. **Controller Architecture:** HoldBuddy's decision controller is a **constrained semantic goal-matching engine** operating against structured IVR menu choices; it is not an unconstrained, open-ended conversational LLM.

---

## 6. How to Validate This Evidence Offline

### Distinction Between Publicly Verifiable Checks & Retained Artifacts

- **Verifiable from Fresh Public Clone (Zero Private Dependencies):**
  - **Cryptographic & Structural Integrity:** All prompt SHA-256 digests (`pcmSha256`), turn sequences, and DTMF receipts in [`docs/evidence/genuine-acceptance-evidence.json`](./evidence/genuine-acceptance-evidence.json) can be validated using the offline node script below.
  - **Automated Regression & Security Suite:** Running `npm test` executes all 48 test suites, validating decision rules, rate-limits, Content Security Policies, and session mutex guarantees.
  - **Build Reproducibility:** Clean Vite bundling and TypeScript verification run without network dependencies.

- **Retained in Private Developer Testbed:**
  - **Raw AudioSocket Wire Stream:** The 1,086,268-byte binary capture (`native-audiosocket.bin`) and unredacted PBX console logs are retained in private test records to avoid committing megabyte-scale raw wire binaries and internal path strings.
  - **API Credentials:** The volatile `GNANI_API_KEY` was entered exclusively via ephemeral terminal stdin and was never persisted to disk.

---

### Step-by-Step Offline Invariant Verification

Evaluators can run the offline integrity verifier using only published repository files:

```bash
# Run the structural, sequence, and cryptographic invariant verifier
npm run verify:evidence
```

Alternatively, run the script directly:
```bash
node scripts/verify-evidence.mjs
```

> [!NOTE]
> **Scope of Offline Verification:** This offline script programmatically validates that the recorded evidence ledger maintains internal schema invariants, sequential turn ordering (`1 → 2 → 3`), expected DTMF digits (`5 → 8 → 1`), valid 64-character SHA-256 prompt hex digests, and independent Asterisk ARI wire receipts. However, a self-contained JSON file cannot independently prove to a third party that Gnani's external servers emitted those responses without access to Gnani's server-side request audit logs. No external third-party certification is claimed.
