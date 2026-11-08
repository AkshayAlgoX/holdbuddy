# Controlled deployment procedure

No remote action is authorized by this package. This candidate is separate from the accepted complaint-only rollback release. A1 owns the sanitized collaboration-source publication; do not push an original branch or Git history, overwrite the rollback archives, or merge another agent's branch.

## Rebuild and verify locally

Use only this sanitized source directory as the Docker context:

```sh
docker build --target verify -t holdbuddy-three-goal:test .
docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m --memory=512m --cpus=.5 --pids-limit=64 --cap-drop=ALL --security-opt=no-new-privileges holdbuddy-three-goal:test node --permission --allow-fs-read=/app --allow-fs-read=/tmp --allow-fs-write=/tmp --max-old-space-size=256 tests/run.mjs
docker build -f Dockerfile.runtime -t holdbuddy-three-goal:release .
```

After a host dependency installation, `node --max-old-space-size=256 scripts/check-audits.mjs` runs the 25 authored audit regressions and two topology/permuted-menu checks. It bundles only this public source into a temporary directory and uses no provider or protected test corpus.

`tests/run.mjs` executes all twelve production-gateway/security/objective tests, including eight real-paced calls, without spawning a child. Runtime containers contain only compiled code, public fonts/licenses and fourteen unchanged Kokoro WAVs. No runtime npm installation or provider account is required.

The compiled runtime archive has its own standalone Dockerfile. Extract it into a fresh directory, verify `sha256sum -c SHA256SUMS`, and use that extracted directory alone as the build context. Do not upload the operator's verification directory, node_modules, local TLS keys, downloaded models, private records or original repository.

## Acceptance and any later publication

1. Review the new source and runtime manifests/hashes and the independent local evidence. Approve this candidate explicitly. The previous listening approvals cover the six identical WAVs, not this new artifact.
2. A1 may prepare a fresh sanitized collaboration snapshot from this source only. Source publication requires owner approval; no existing development history, telephony branch or private evidence may be pushed.
3. Separately approve deployment and any hosting spend. The retained Render configuration uses one Docker service, one instance, manual deployment, and same-origin HTTPS for frontend, JSON, SSE and audio. Reconfirm the provider's current plan, region, bandwidth allowance and costs before purchase. No new pricing research or hosting recommendation was made during this integration.
4. Use `Dockerfile.runtime` for a source build, or the runtime archive's Dockerfile. Keep the existing command and `/healthz`. Configure the exact HTTPS `PUBLIC_ORIGIN`, or use Render's `RENDER_EXTERNAL_URL`. No Gnani, telephony, STT, TTS or other API secret is needed. No disk/database or autoscaling is part of this demo.
5. At the actual public address, use an ordinary desktop browser and physical phones. Complete complaint, payment help and refund refusal; hear complete menus and greeting; confirm handoff or explicitly take over; verify closure. Check sound-blocked replay, stop, navigation away/return, objective reset, independent visitors, HTTP/SSE recovery and service restart. Confirm payment help never claims a transaction and no provider request occurs.
6. Run the bounded browser qualification from the source:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
DEMO_URL=https://THE-APPROVED-ADDRESS EVIDENCE_DIR=verification/deployed node tests/browser.mjs
```

The deployed check reports outage/restart hooks as incomplete unless exercised separately by the operator. Local hooks intentionally exist only outside the public service. Browser-engine emulation is not physical-device acceptance. Inspect hosting memory/bandwidth metrics and stream behavior before declaring public usability.

## Rollback

Preserve the prior accepted sanitized source/runtime archives and image unchanged. If the new experience fails acceptance, select those prior artifacts rather than changing this source to a live provider. Before any deployment rollback, obtain the required deployment authorization; use the previously accepted image/archive and repeat the actual-address complaint call and confirmed-closure check. Within this candidate, `?demo=classic#/studio` provides the original complaint route as a UI fallback but is not an artifact rollback.

Capabilities and fictional calls are in memory. A restart ends them; page reload obtains a fresh capability and requires an explicit new call. Reconnection never repeats call creation or DTMF. Monitor resource/admission limits and pause traffic if needed. The application is a bounded fictional demonstration, not a real phone or payment service.
