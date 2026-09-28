# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T07:33:39.245Z
- Finished: 2026-09-25T07:36:54.685Z (3 min 15 s)
- Commit: `ecec5f19d1e62340ef8766fb98663e8dab8ba071` (`ecec5f1`), branch `codex/brand-color-system-authoring`, worktree has uncommitted changes
- Runtime: Node v24.19.0, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (8 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (5 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 6 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (9 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (206 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (6 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (358 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (330 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (396 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (4 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (11 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (240 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (6 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (439 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (13 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,972 bytes, SHA-256 `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32`
- `figma-candidate/dist/code.js`: 1,562,735 bytes, SHA-256 `e21aebcac5daf38ba564b05788f9c13696653b54077e6c7f7e77cf2ec18345fe`
- `figma-candidate/dist/ui.html`: 429,908 bytes, SHA-256 `ffbab1f75b1346de4da7aac1e3d9b6ffee0cd005cb73518bae26d62c47b12d6d`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
