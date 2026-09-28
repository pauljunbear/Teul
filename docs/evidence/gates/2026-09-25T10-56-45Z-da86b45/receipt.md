# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T10:53:32.092Z
- Finished: 2026-09-25T10:56:45.942Z (3 min 14 s)
- Commit: `da86b458488785f5aec6cf5bea6d2bf97cab6891` (`da86b45`), branch `codex/brand-color-system-authoring`, worktree has uncommitted changes
- Runtime: Node v24.19.0, npm 11.8.0, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (8 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (5 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 6 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (9 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (203 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (2 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (6 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (297 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (306 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (388 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (4 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (11 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (212 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (6 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (422 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (13 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,972 bytes, SHA-256 `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32`
- `figma-candidate/dist/code.js`: 1,570,439 bytes, SHA-256 `9b9a225589481ccc635de51de0f228daaa685d21242b0c6c398597d424d1c3e4`
- `figma-candidate/dist/ui.html`: 429,989 bytes, SHA-256 `ffef0da3b79354c31a514cfa85ad01b91e11acfedf6e63ae602d03846106ed10`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
