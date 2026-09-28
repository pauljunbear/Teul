# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-09T12:13:35.087Z
- Finished: 2026-09-09T12:15:45.107Z (2 min 10 s)
- Commit: `a6c82d025032af29ba8d8f3ca5745018622d74a0` (`a6c82d0`), branch `audit-remediation-2026-09-07`, worktree has uncommitted changes
- Runtime: Node v24.20.0, npm 10.9.9, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (6 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (4 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (1 min 14 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (7 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (205 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (3 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (330 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (279 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (474 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (3 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (9 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (191 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (3 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (423 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (14 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 176,293 bytes, SHA-256 `57a2b7f9f64fb8c3709d55d874d113dfd472d986ef95429ac355ddd68a9600e0`
- `dist/ui.html`: 334,865 bytes, SHA-256 `a1c83073885d162fda2c5ac15b644984651722c8517a52380f41346cb16390a1`
- `figma-candidate/dist/code.js`: 707,818 bytes, SHA-256 `111e43e0053a7b61984f389f7b92f8e88daee8383905f6b2589ba9b38c9ff08c`
- `figma-candidate/dist/ui.html`: 420,203 bytes, SHA-256 `d38810b2c59895964a93a97c834bfde7b35627676020e1fb85bfee04d5ca4f8f`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
