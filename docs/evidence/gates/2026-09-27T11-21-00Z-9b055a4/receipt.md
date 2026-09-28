# Release gate receipt

- Status: **FAILED** (3 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-27T11:17:20.754Z
- Finished: 2026-09-27T11:21:00.790Z (3 min 40 s)
- Commit: `9b055a4b7fb06dc43821299eb970685a2c1fb3cc` (`9b055a4`), branch `codex/figma-library-import`, worktree has uncommitted changes
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (8 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (16 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (8 s) — TypeScript without emit
4. FAILED `npm run test:coverage` (3 min 9 s) — Vitest suite with coverage thresholds
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
- `dist/ui.html`: 306,985 bytes, SHA-256 `855247b1774b7c6e7337271295a396579f48466fbe798e1478b5d57b8271b827`
- `figma-candidate/dist/code.js`: 1,575,702 bytes, SHA-256 `fc8177572a6c85a8e2948367c42c7116520ef7b303c5b374f95580e9906262e4`
- `figma-candidate/dist/ui.html`: 429,847 bytes, SHA-256 `0b55cdb99f95f7e366be6f77146cecdefd65d8417fe07e8c4b546431c008f27f`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
