# Release gate receipt

- Status: **FAILED** (3 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T11:53:23.851Z
- Finished: 2026-09-25T11:55:54.071Z (2 min 30 s)
- Commit: `026ee73b7ee39b1018eec0c1083959d9ad5a9d1a` (`026ee73`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. FAILED `npm run test:coverage` (2 min 14 s) — Vitest suite with coverage thresholds
5. SKIPPED `npm run build` (not run) — Production plugin bundle (generic channel disabled)
6. SKIPPED `npm run check:ui-bundle` (not run) — Inline UI bundle budget
7. SKIPPED `npm run test:production-ui` (not run) — Production UI smoke test against dist/
8. SKIPPED `npm run report:dead-code` (not run) — Exports without a production reference
9. SKIPPED `npm run verify:wada` (not run) — Pinned Wada corpus matches upstream
10. SKIPPED `npm run verify:color-foundations` (not run) — Color-foundation evidence ledger is current
11. SKIPPED `npm run assert:artifacts` (not run) — Production artifacts, manifests, and licenses
12. SKIPPED `npm run verify:generic-sanitization` (not run) — No rejected private identifier in the tree
13. SKIPPED `npm run build:generic-candidate` (not run) — Candidate bundle (generic channel candidate)
14. SKIPPED `npm run check:generic-candidate-ui-bundle` (not run) — Candidate UI bundle budget
15. SKIPPED `npm run test:generic-candidate-ui` (not run) — Candidate UI smoke test
16. SKIPPED `npm run assert:generic-candidate-artifacts` (not run) — Candidate artifacts and manifest
17. SKIPPED `npm run verify:generic-source-benchmark` (not run) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,972 bytes, SHA-256 `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32`
- `figma-candidate/dist/code.js`: 1,570,439 bytes, SHA-256 `9b9a225589481ccc635de51de0f228daaa685d21242b0c6c398597d424d1c3e4`
- `figma-candidate/dist/ui.html`: 429,989 bytes, SHA-256 `ffef0da3b79354c31a514cfa85ad01b91e11acfedf6e63ae602d03846106ed10`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
