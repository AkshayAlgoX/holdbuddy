# Three-goal integration provenance

Approved feature source: `91e2e4556faf8a105ea4ad8ae24999d545d0665e`. Website-quality source: `5c243fb20e79f3bd208ec951b0297671b172bd08`, based on `d14d1891e93faa643ec7997276fdac7a8e8b7a0e`. These identify reviewed inputs; no original Git history is included.

The 72-file feature change, including 41 report/evidence files, and the 14-file website patch were inventoried and reviewed separately. Development reports, screenshots, original manifests, launchers, evaluation metadata and dependency changes were not imported into this package.

Incorporated functionality:

- `scenarios.json`: add `hi-broadband-shared-objectives` by cloning the accepted original complaint topology and changing only the offered payment option's destination from the unsupported branch to the existing hold step. All original menus, prompt texts and the original scenario remain intact. There is no financial endpoint.
- `apps/web/src/judge/demo-scenarios.ts`, `pages/StudioPage.tsx`, `judge/launch-fragment.ts`, `shell/AppShell.tsx`: three objective choices; same scenario and no digit hint in each request; runtime-owned goal for restored/closed traces; chooser locked during call creation and until explicit reset; original complaint fallback. Public launch remains same-origin and capability based.
- `apps/web/src/judge/audio.ts`: retain the feature patch's generation fencing across fetch, decode and playback continuations, cleanup on unmount, no automatic playback of closed traces, and explicit replay. This intentionally fulfills the overlapping website cleanup fix without replacing the stronger fence with a separate mounted flag. Existing public playback priming and Kokoro attribution remain intact.
- `apps/web/src/ui/Overlay.tsx` and `design/refinements.css`: website patch's stable-document viewport placement and a 44px logo hit height. No visible logo redesign or global specificity change.
- `tests/`: authored audit/topology regressions and production-gateway objective, ownership, reconnect and eight-call tests; Chromium three-goal and lifecycle qualification; mobile WebKit complaint check. Docker verification imports test modules directly so the runtime's child-process prohibition remains enabled.

Minimal independently reproduced audit fixes also apply in `packages/ivr-core/src/menu-parser.ts`, `goal-matcher.ts`, and `session.ts`: remove only an initial comma-delimited Hindi courtesy greeting before menu parsing; normalize monthly-bill and Hindi bill-payment wording only in the goal; retain a prior hold for the reported refused offer announcement while maintaining hold limits. Hostile/quoted/negated instructions remain refused. Clean new menus, person confirmation and termination can still leave hold. The dispatcher, attestation, structural authorization, policy and experimental multilingual boundary were not changed.

Reported system-spoof instructions were already rejected by the current session-level structural guard. A legitimate “This is a recording” telephone announcement still permits its actual menu. Ambiguous phone/mobile aliases, Hindi verbless menus and `sat` as a global digit remain unsupported; broad aliases or model proposals were not enabled. Unsupported goals abstain safely.

All three website fixes are accepted against this sanitized runtime. The older mobile audit did not reproduce footer overlap with a native 34px bottom safe area, Indic glyph clipping, or poor 320px hero wrapping. The unused `.hb-btn-sm` rule remains 38px; it produces no visible control in the four public routes. Broader Studio script/language inference is deferred: the supported call inputs are Hindi/English, while the Languages page already uses explicit language metadata. No incorrect Bengali range or automatic Marathi-to-Hindi mapping was added.

The package and lockfile are unchanged from the accepted sanitized baseline. All fourteen existing Kokoro files are unchanged; the primary six match prior owner-approved listening checks. No other asset's listening approval is implied. No protected recording or private evidence is incorporated. Post-call history is outside this change.
