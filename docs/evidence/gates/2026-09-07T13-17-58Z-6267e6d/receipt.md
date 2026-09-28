# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-07T13:16:25.753Z
- Finished: 2026-09-07T13:17:58.979Z (1 min 33 s)
- Commit: `6267e6dba865de2f5811ddb8e1f88a3be2dfd2c3` (`6267e6d`), branch `worktree-agent-a0e6fef4ff53df134`, worktree clean
- Runtime: Node v22.23.1, npm 10.9.8, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (7 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (4 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (29 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (10 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (408 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (4 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (4 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (373 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (273 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (421 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (2 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (11 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (181 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (3 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (486 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (15 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 192,626 bytes, SHA-256 `68b2774e6b2ebd3ff1854fa80ba4acaf850f8a5267cf231420bdcbed5a8ee8fd`
- `dist/ui.html`: 326,053 bytes, SHA-256 `71101562d05de6e6286626f434ab4e96bfaf0c197bec351e86ed764eef7b4fee`
- `figma-candidate/dist/code.js`: 885,317 bytes, SHA-256 `9b8aa0ccf40cedb23c85068562d908632c53cc31079e7459f309914b4a8e9dc1`
- `figma-candidate/dist/ui.html`: 377,628 bytes, SHA-256 `20d2fe1a0e8d6baa02cb1e9a61c16f628d35d8df5c398ab362c778fb1511b5bd`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
