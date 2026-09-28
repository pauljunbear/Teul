# Release gate receipt

- Status: **FAILED** (4 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T07:04:13.755Z
- Finished: 2026-09-25T07:06:46.536Z (2 min 33 s)
- Commit: `abb968b8188bb744ac4d085e1298f6f880d59c94` (`abb968b`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 12 s) — Vitest suite with coverage thresholds
5. FAILED `npm run build` (4 s) — Production plugin bundle (generic channel disabled)
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

- `dist/code.js`: 235,402 bytes, SHA-256 `cdfb4d22e2194b248fac82026d07aa6412eb2ef5aab8df73c3ad21c74f079073`
- `dist/ui.html`: 305,491 bytes, SHA-256 `dea3b2ab5b5003990d829bb98558f030cbd2f5eab28e94e72e7c145071099482`
- `figma-candidate/dist/code.js`: 1,562,370 bytes, SHA-256 `8f568b772d78050d5b47919d97d45d519e5ff0b59515ad7599a91c1a8c896dc1`
- `figma-candidate/dist/ui.html`: 429,841 bytes, SHA-256 `172cc257d0a4fd44acd0f167aa72652af51b9ce0b8b8466b213d97f8b1538cdd`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
