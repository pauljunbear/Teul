# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T04:26:18.503Z
- Finished: 2026-09-25T04:29:47.325Z (3 min 29 s)
- Commit: `8fa9263d0dd51257d23be9bfe43ae3309b94725f` (`8fa9263`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 10 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (11 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (289 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (7 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (417 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (361 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (492 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (4 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (13 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (240 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (7 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (454 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (14 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 235,402 bytes, SHA-256 `cdfb4d22e2194b248fac82026d07aa6412eb2ef5aab8df73c3ad21c74f079073`
- `dist/ui.html`: 305,491 bytes, SHA-256 `dea3b2ab5b5003990d829bb98558f030cbd2f5eab28e94e72e7c145071099482`
- `figma-candidate/dist/code.js`: 1,528,126 bytes, SHA-256 `24513c7504efaa138e8d85f41dc40b8238b053cefaa3a43168b666a137d90a33`
- `figma-candidate/dist/ui.html`: 425,147 bytes, SHA-256 `70ceca67e0ead75fcceafb79ce0a08777a16a5c86da6aa47388fe5d4892762cc`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
