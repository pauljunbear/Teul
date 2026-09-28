# Release gate receipt

- Status: **FAILED** (3 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T10:16:47.031Z
- Finished: 2026-09-25T10:19:21.139Z (2 min 34 s)
- Commit: `607331f3c6713c1d57978a2abb892b01ccced2d3` (`607331f`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (11 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (7 s) — TypeScript without emit
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
- `figma-candidate/dist/code.js`: 1,570,177 bytes, SHA-256 `494f61fb4a36dc8c0d07b044cbd5c85f3228bba178706892f932a96af8e8c831`
- `figma-candidate/dist/ui.html`: 429,962 bytes, SHA-256 `f65b4ff31ebb3c03c3adc813834fa0cbc885413fbd834fae4c141f952fae008d`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
