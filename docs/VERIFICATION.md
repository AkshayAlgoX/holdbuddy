# Verification and final acceptance

**Local integration: GO for owner review. Publication/deployment: BLOCKED pending explicit approval of this candidate and acceptance at the eventual public HTTPS address.** Nothing has been published or deployed.

Current verification on November 6, 2026 used the sanitized production gateway and compiled runtime, not the development launcher:

| Check | Actual result |
| --- | --- |
| Production gateway/security tests | 12 passed, 0 failed in a fresh verifier container |
| Concurrent production-paced calls | 8/8 confirmed closure: four complaints, four payment-help calls; ninth rejected; 72.716 seconds |
| Core regression selection | 774 passed, 0 failed; existing hostile corpus and operation grid unchanged |
| Narrow audit regressions | 25 passed, 0 failed, including negative and hold-transition cases |
| Independent topology/permuted-menu checks | 2 passed, 0 failed; moved keys and reversed offers still follow goal meaning |
| Portable frontend regression selection | 59 passed in 11 files, including four audio lifecycle tests and four objective UI tests |
| Extracted runtime archive | Fresh extraction and reproducible source build match the corrected runtime payload exercised by the independent three-goal browser tests |
| TypeScript / production build | Passed; clean Docker and host builds produced the same 67 runtime files |
| Chromium 145.0.7632.6 | Three objectives, 16 complete actual WAVs, lifecycle/recovery/isolation/layout checks passed |

The container uses 512 MiB RAM, 0.5 CPU, a read-only filesystem, a 32 MiB tmpfs, 64 PID limit, no added capabilities, no host mounts and Node permissions that forbid child processes. The HTTP test container has no network except its own loopback. Browser verification uses a separate internal Docker network with no external egress and a host loopback HTTPS proxy. No Gnani or telephony provider is reachable from these runs. Browser contexts also reject any foreign-origin request; there were zero foreign requests or page errors.

| Objective | Requested and delivered keys | Complete Kokoro WAVs | Confirmed ending |
| --- | --- | --- | --- |
| Complaint | 5 → 8 → 1 | 6 | User-confirmed fictional handoff |
| Payment help | 5 → 8 → 2 | 6 | User-confirmed fictional payment assistance; no transaction |
| Unsupported refund | 5 → 8, no final key | 4 | Safe refusal followed by explicit takeover |

Chromium ran without `--mute-audio` or an autoplay-policy bypass. Each speech clip emitted native `playing` and `ended` events at volume 1 without mute. Browser-computed SHA-256 of nonempty received WAV bytes matched the existing Kokoro files; private hash headers remained absent. The 50ms silent user-gesture primer was excluded from speech completion counts. Recognition events were MOCK/offline_fixture, with no REAL_API event. Playback verification does not claim a human listened during automation.

The browser also checked actual decision explanations, creation-time objective locking, fresh calls after reset, closed-trace identity and silent restoration, explicit replay after denied autoplay, stop/confirmed closure, the original complaint fallback, independent visitor ownership, navigation during active playback, reload, failed stop during an HTTP/SSE outage, reconnection of the same call, and capability replacement after a real service restart. Leaving Try a call paused and revoked local audio without closing or transferring the running call.

Four public routes fitted 320×568, 375×667, 412×915 and 667×375 without horizontal overflow. A 320px Evidence Labels panel remained between x=16 and x=304 despite a stale reported window width; Escape restored focus. Every tested logo hit area was 44px high. Native Chromium safe-area emulation at 320px with 34px bottom inset left the final footer link above the fixed navigation. Kannada, Telugu and Tamil rendered with the shipped fonts, explicit language attributes, visible overflow and 1.65 text line height; rendered screenshots were inspected. The 320px home hero wrapped legibly without overflow. Keyboard objective selection, arrows, Home/End, Enter and Escape passed.

Coverage limits: the complete original 191-test development web suite and the broad simulator suite were not rerun or imported into the sanitized package. The 59-test selection adapts public-mode setup/capabilities and preserves behavior assertions. Eleven paid-provider unit tests and one static test requiring the deliberately excluded provider module were omitted from the core selection; protected boundaries were instead exercised through this production gateway. No sealed tests, private recordings or provider adapters were imported to increase counts. Independent acceptance supplied missing WebKit libraries only in a per-process verification directory, reproduced automatic menu truncation, and corrected it by serializing recorded playback. All three goals and 16 complete unmuted WAVs then passed in WebKit iPhone emulation and Chromium. No system package was installed. See `INDEPENDENT_ACCEPTANCE.md`; the earlier launch failure is historical. Firefox, physical phones and assistive-technology sessions remain unverified. Native listening acceptance of the six identical primary clips exists from the earlier artifact; it does not approve this new artifact or authorize deployment. Historical recognition limitations remain disclosed.

Failed attempts are retained in the operator's separate private verification directory: an offline dependency build had no npm cache, the initial test-runner invocation tried to fork under Node permissions, and the private portable-test harness initially lacked public-mode setup/async media mocks. They were corrected without weakening runtime permissions, expected keys, WAV hashes, closure checks or hostile-corpus assertions. That directory also contains local test TLS keys and must never be published.

Final acceptance requires reviewing the exact source/runtime manifests and archive hashes, approving this candidate, then separately approving any publication, hosting spend and deployment. After deployment approval, exercise all three objectives at the actual HTTPS address, speaker playback on physical phones, stop/takeover/closure, reload/reconnect/restart and bounded capacity under the hosting proxy. Until then, local success is not proof of public usability.
