# Release gate receipt

- Status: **FAILED** (2 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-26T06:48:33.140Z
- Finished: 2026-09-26T06:48:49.598Z (16 s)
- Commit: `68ba34eb479d468c4c664e80bdf685fbf577a565` (`68ba34e`), branch `codex/brand-guideline-import`, worktree has uncommitted changes
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. FAILED `npm run typecheck` (6 s) — TypeScript without emit
4. SKIPPED `npm run test:coverage` (not run) — Vitest suite with coverage thresholds
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
- `figma-candidate/dist/code.js`: 1,575,269 bytes, SHA-256 `3deb201974cc231cefcf0630a2f88e1384b263e43fbd06e880d34bfd2e4d881a`
- `figma-candidate/dist/ui.html`: 429,847 bytes, SHA-256 `0b55cdb99f95f7e366be6f77146cecdefd65d8417fe07e8c4b546431c008f27f`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
