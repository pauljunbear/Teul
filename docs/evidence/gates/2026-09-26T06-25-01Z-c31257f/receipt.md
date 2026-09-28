# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-26T06:20:54.350Z
- Finished: 2026-09-26T06:25:01.440Z (4 min 7 s)
- Commit: `c31257f0bc2a676cb6479f2ee8ef10d1575d7c59` (`c31257f`), branch `codex/brand-guideline-import`, worktree has uncommitted changes
- Runtime: Node v24.19.0, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (8 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (5 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 58 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (9 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (215 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (2 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (5 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (286 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (296 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (386 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (6 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (10 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (242 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (6 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (414 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (13 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,985 bytes, SHA-256 `855247b1774b7c6e7337271295a396579f48466fbe798e1478b5d57b8271b827`
- `figma-candidate/dist/code.js`: 1,575,269 bytes, SHA-256 `3deb201974cc231cefcf0630a2f88e1384b263e43fbd06e880d34bfd2e4d881a`
- `figma-candidate/dist/ui.html`: 429,847 bytes, SHA-256 `0b55cdb99f95f7e366be6f77146cecdefd65d8417fe07e8c4b546431c008f27f`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
