# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-08T20:28:30.242Z
- Finished: 2026-09-08T20:30:32.371Z (2 min 2 s)
- Commit: `9e17bb850470e99cd778053463d1b632035b6532` (`9e17bb8`), branch `audit-remediation-2026-09-07`, worktree has uncommitted changes
- Runtime: Node v24.20.0, npm 10.9.9, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (6 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (3 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (1 min 10 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (7 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (159 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (3 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (280 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (266 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (387 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (2 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (8 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (180 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (3 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (395 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (14 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 175,548 bytes, SHA-256 `eaff666bcc1bad3c136fa64d44bec3c58be28aaf8de89a3ebb4014d12d80fd84`
- `dist/ui.html`: 333,904 bytes, SHA-256 `72084d54e75e03f02509d93001f40006f0bd5f36ca413e3c6f2e88c270665cf7`
- `figma-candidate/dist/code.js`: 691,950 bytes, SHA-256 `1e9ae424eb46af5f865b317f92834b35c385cf77a7007ec51272281933c78763`
- `figma-candidate/dist/ui.html`: 414,396 bytes, SHA-256 `8a6805bf19f55c0c189b50905eb7d2f608c60b22f7b93a0f74752b65af6d0302`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
