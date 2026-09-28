# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T20:10:52.527Z
- Finished: 2026-09-25T20:14:31.077Z (3 min 39 s)
- Commit: `7684f6d04443dd50c9bbd34cdaba52c85964d03c` (`7684f6d`), branch `codex/brand-guideline-import`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 17 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (12 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (270 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (5 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (526 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (392 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (467 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (6 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (13 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (255 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (8 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (491 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (15 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,985 bytes, SHA-256 `855247b1774b7c6e7337271295a396579f48466fbe798e1478b5d57b8271b827`
- `figma-candidate/dist/code.js`: 1,573,040 bytes, SHA-256 `1640625c712f745b02ec5dd2e125e5fd0fcb3cecc8be4dfb87a65b277a87229d`
- `figma-candidate/dist/ui.html`: 429,847 bytes, SHA-256 `0b55cdb99f95f7e366be6f77146cecdefd65d8417fe07e8c4b546431c008f27f`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
