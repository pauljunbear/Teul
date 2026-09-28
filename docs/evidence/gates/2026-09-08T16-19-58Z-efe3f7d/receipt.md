# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-08T16:18:01.469Z
- Finished: 2026-09-08T16:19:58.545Z (1 min 57 s)
- Commit: `efe3f7dcf75d79fff324f02d6146a5584c0db57b` (`efe3f7d`), branch `worktree-agent-a0e976fb679b1be65`, worktree has uncommitted changes
- Runtime: Node v22.23.1, npm 10.9.8, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (7 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (4 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (56 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (8 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (181 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (3 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (424 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (268 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (409 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (2 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (10 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (207 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (4 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (465 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (15 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 174,479 bytes, SHA-256 `1e61220a2b3cd9536816389b8daa3375929c4ed435743c74e19af35c86cd799d`
- `dist/ui.html`: 331,734 bytes, SHA-256 `fe5b843a1438e85feedaba8ce3e782fabe4b30b483bf2e5eecde447385ebb56c`
- `figma-candidate/dist/code.js`: 643,589 bytes, SHA-256 `4420c2acb50e1bbad399d62977a1b94c9829c49749f774901d6fefe4a9ae8e25`
- `figma-candidate/dist/ui.html`: 396,188 bytes, SHA-256 `256d4f81de81c25f286aa3ced21fe95f290159d3e4a993e1a01b1d615bb36060`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
