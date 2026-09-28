# Release gate receipt

- Status: **FAILED** (14 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T07:17:28.842Z
- Finished: 2026-09-25T07:20:43.214Z (3 min 14 s)
- Commit: `8be95a2a05e254c749f2f7a58762bc775b8ef773` (`8be95a2`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 13 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (11 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (233 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (6 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (419 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (373 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (468 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (4 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (13 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (236 ms) — Candidate UI bundle budget
15. FAILED `npm run test:generic-candidate-ui` (7 s) — Candidate UI smoke test
16. SKIPPED `npm run assert:generic-candidate-artifacts` (not run) — Candidate artifacts and manifest
17. SKIPPED `npm run verify:generic-source-benchmark` (not run) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,972 bytes, SHA-256 `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32`
- `figma-candidate/dist/code.js`: 1,562,735 bytes, SHA-256 `e21aebcac5daf38ba564b05788f9c13696653b54077e6c7f7e77cf2ec18345fe`
- `figma-candidate/dist/ui.html`: 429,835 bytes, SHA-256 `7f45b349ae86aca15710c30aaa2450fd983555d57a63138a61eb4b881c7ef7d5`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
