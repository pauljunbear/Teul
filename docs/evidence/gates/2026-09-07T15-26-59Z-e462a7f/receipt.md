# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-07T15:25:21.475Z
- Finished: 2026-09-07T15:26:59.832Z (1 min 38 s)
- Commit: `e462a7fc101dd4b8e17ba90219c696c161712127` (`e462a7f`), branch `audit-remediation-2026-09-07`, worktree has uncommitted changes
- Runtime: Node v24.20.0, npm 10.9.9, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (7 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (4 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (44 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (7 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (189 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (4 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (241 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (253 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (377 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (3 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (8 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (179 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (3 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (375 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (14 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 195,547 bytes, SHA-256 `cdb352a6e079845fc4ab079347eb58adb2862532afd591e4bc6b2352ffb05b03`
- `dist/ui.html`: 329,736 bytes, SHA-256 `a7cd4123e5218a180f2bd0bdd31379510207f1753d01d19e04c5bd334db17693`
- `figma-candidate/dist/code.js`: 631,334 bytes, SHA-256 `8fe29531b1b6641ee5e50bdd5d4d99d801f6b93a117b66b47f11b811095ba289`
- `figma-candidate/dist/ui.html`: 392,233 bytes, SHA-256 `71ddde7d6bdc35d16f34a9576be1d1594328a4c83bac07390481a0fd3300e69d`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
