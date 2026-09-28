# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T10:21:31.625Z
- Finished: 2026-09-25T10:25:02.455Z (3 min 31 s)
- Commit: `3e373710b0d27a35f97a5a994d044c19cf651cb4` (`3e37371`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 13 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (11 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (243 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (6 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (457 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (357 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (462 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (4 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (13 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (256 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (7 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (462 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (14 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,972 bytes, SHA-256 `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32`
- `figma-candidate/dist/code.js`: 1,570,278 bytes, SHA-256 `f3181e4c1076625598eb62cfa630698cfb11744f4da303bf630687986bbd2911`
- `figma-candidate/dist/ui.html`: 429,962 bytes, SHA-256 `f65b4ff31ebb3c03c3adc813834fa0cbc885413fbd834fae4c141f952fae008d`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
