# Release gate receipt

- Status: **FAILED** (0 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-08T23:28:54.669Z
- Finished: 2026-09-08T23:28:56.257Z (2 s)
- Commit: `0565ba421465c515bf84871b0c639a8b45fed213` (`0565ba4`), branch `audit-remediation-2026-09-07`, worktree has uncommitted changes
- Runtime: Node v24.20.0, npm 10.9.9, darwin arm64
- Package version: 1.0.0

## Steps

1. FAILED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. SKIPPED `npm run lint` (not run) — ESLint with zero warnings allowed
3. SKIPPED `npm run typecheck` (not run) — TypeScript without emit
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

- `dist/code.js`: 175,739 bytes, SHA-256 `1e4add86eb478e6dd805d21c7ee3add7a36174e04a24d815e5f615dd187c59a2`
- `dist/ui.html`: 334,234 bytes, SHA-256 `1ea2ed5d5f5327264438efcf1e5857295fa37d5496842dacfce62bb187df7fa4`
- `figma-candidate/dist/code.js`: 695,818 bytes, SHA-256 `b6e9ee737084e12f2db60dea97b7bc8c34c638861c3a8f354c1fedc52aecb19e`
- `figma-candidate/dist/ui.html`: 416,501 bytes, SHA-256 `b223d695455b2707d9c2b8357e223ecb70e59f143e6360e0926368df8525dec0`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
