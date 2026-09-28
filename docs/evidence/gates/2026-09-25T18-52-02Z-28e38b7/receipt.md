# Release gate receipt

- Status: **FAILED** (11 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T18:48:47.256Z
- Finished: 2026-09-25T18:52:02.441Z (3 min 15 s)
- Commit: `28e38b7346a7febe6f66c8ee3ef145e899ba9c80` (`28e38b7`), branch `codex/studio-authoring-foundation`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (7 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 25 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (14 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (318 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (6 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (526 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (434 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (576 ms) — Production artifacts, manifests, and licenses
12. FAILED `npm run verify:generic-sanitization` (6 s) — No rejected private identifier in the tree
13. SKIPPED `npm run build:generic-candidate` (not run) — Candidate bundle (generic channel candidate)
14. SKIPPED `npm run check:generic-candidate-ui-bundle` (not run) — Candidate UI bundle budget
15. SKIPPED `npm run test:generic-candidate-ui` (not run) — Candidate UI smoke test
16. SKIPPED `npm run assert:generic-candidate-artifacts` (not run) — Candidate artifacts and manifest
17. SKIPPED `npm run verify:generic-source-benchmark` (not run) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,985 bytes, SHA-256 `855247b1774b7c6e7337271295a396579f48466fbe798e1478b5d57b8271b827`
- `figma-candidate/dist/code.js`: 1,571,722 bytes, SHA-256 `7fff08b15d89e794000517c17a60342c029dd898f8646b7041a24fcd66dcab05`
- `figma-candidate/dist/ui.html`: 429,847 bytes, SHA-256 `0b55cdb99f95f7e366be6f77146cecdefd65d8417fe07e8c4b546431c008f27f`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
