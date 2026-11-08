# Frozen website integration source

This directory is the readable build source for deployment commit
`9e7e7b37aca641aa792ddf679b06a24513039587` on
`release/website-final-integration-20261107-190220`.

Use RELEASE_SOURCE_SHA256SUMS to verify this source snapshot. The copied original SHA256SUMS,
INCLUDED_FILES.txt and earlier acceptance documents describe historical baseline artifacts;
they are preserved and do not assert the identity or acceptance of this new release.

Build with the unchanged package-lock.json and existing dependencies: `npm run typecheck`,
`npm run build`, `npm test`, and `node scripts/check-audits.mjs`. No installation or provider
credential is part of local verification. The deployment repository contains only the compiled
69-file Docker context. The prepared source archive is a local review artifact, not an upload.

See the sibling REPORT.md, BACKEND_EVIDENCE_HANDOFF.md and DEPLOYMENT_STEPS.md for evidence,
limitations and authorization gates. No new backend endpoint or live provider connection is enabled.
