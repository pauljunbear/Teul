# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-08T23:31:13.303Z
- Finished: 2026-09-08T23:33:36.527Z (2 min 23 s)
- Commit: `5e5e689fcc20315333dbace69e36deee79f7edd3` (`5e5e689`), branch `audit-remediation-2026-09-07`, worktree clean
- Runtime: Node v22.23.1, npm 10.9.8, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (7 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (4 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (1 min 17 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (8 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (181 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (4 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (504 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (318 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (601 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (3 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (11 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (208 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (4 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (588 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (17 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 175,739 bytes, SHA-256 `1e4add86eb478e6dd805d21c7ee3add7a36174e04a24d815e5f615dd187c59a2`
- `dist/ui.html`: 334,234 bytes, SHA-256 `1ea2ed5d5f5327264438efcf1e5857295fa37d5496842dacfce62bb187df7fa4`
- `figma-candidate/dist/code.js`: 695,818 bytes, SHA-256 `b6e9ee737084e12f2db60dea97b7bc8c34c638861c3a8f354c1fedc52aecb19e`
- `figma-candidate/dist/ui.html`: 416,501 bytes, SHA-256 `b223d695455b2707d9c2b8357e223ecb70e59f143e6360e0926368df8525dec0`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
