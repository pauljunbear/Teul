# Release gate receipt

- Status: **FAILED** (11 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-07T15:19:18.181Z
- Finished: 2026-09-07T15:20:32.858Z (1 min 15 s)
- Commit: `0ac4af341a3de48a033ca0f6ed39afc18acc65a9` (`0ac4af3`), branch `audit-remediation-2026-09-07`, worktree has uncommitted changes
- Runtime: Node v24.20.0, npm 10.9.9, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (7 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (4 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (45 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (8 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (156 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (3 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (254 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (275 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (375 ms) — Production artifacts, manifests, and licenses
12. FAILED `npm run verify:generic-sanitization` (2 s) — No rejected private identifier in the tree
13. SKIPPED `npm run build:generic-candidate` (not run) — Candidate bundle (generic channel candidate)
14. SKIPPED `npm run check:generic-candidate-ui-bundle` (not run) — Candidate UI bundle budget
15. SKIPPED `npm run test:generic-candidate-ui` (not run) — Candidate UI smoke test
16. SKIPPED `npm run assert:generic-candidate-artifacts` (not run) — Candidate artifacts and manifest
17. SKIPPED `npm run verify:generic-source-benchmark` (not run) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 195,547 bytes, SHA-256 `cdb352a6e079845fc4ab079347eb58adb2862532afd591e4bc6b2352ffb05b03`
- `dist/ui.html`: 329,736 bytes, SHA-256 `a7cd4123e5218a180f2bd0bdd31379510207f1753d01d19e04c5bd334db17693`
- `figma-candidate/dist/code.js`: 631,334 bytes, SHA-256 `8fe29531b1b6641ee5e50bdd5d4d99d801f6b93a117b66b47f11b811095ba289`
- `figma-candidate/dist/ui.html`: 392,233 bytes, SHA-256 `71ddde7d6bdc35d16f34a9576be1d1594328a4c83bac07390481a0fd3300e69d`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
