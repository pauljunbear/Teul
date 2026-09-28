# Release gate receipt

- Status: **PASSED** (17 of 17 steps passed)
- Command: `npm run release-gate`
- Started: 2026-09-25T08:47:57.198Z
- Finished: 2026-09-25T08:51:29.740Z (3 min 33 s)
- Commit: `7c7cabce4c7a4d6dbecfe9ee34ccd37b8f6f43ef` (`7c7cabc`), branch `codex/brand-color-system-authoring`, worktree clean
- Runtime: Node v22.13.1, npm 10.9.2, darwin arm64
- Package version: 1.0.0

## Steps

1. PASSED `npm run audit` (2 s) — Fail-closed dependency policy for the root and prototype graphs
2. PASSED `npm run lint` (9 s) — ESLint with zero warnings allowed
3. PASSED `npm run typecheck` (6 s) — TypeScript without emit
4. PASSED `npm run test:coverage` (2 min 12 s) — Vitest suite with coverage thresholds
5. PASSED `npm run build` (11 s) — Production plugin bundle (generic channel disabled)
6. PASSED `npm run check:ui-bundle` (272 ms) — Inline UI bundle budget
7. PASSED `npm run test:production-ui` (3 s) — Production UI smoke test against dist/
8. PASSED `npm run report:dead-code` (7 s) — Exports without a production reference
9. PASSED `npm run verify:wada` (481 ms) — Pinned Wada corpus matches upstream
10. PASSED `npm run verify:color-foundations` (371 ms) — Color-foundation evidence ledger is current
11. PASSED `npm run assert:artifacts` (484 ms) — Production artifacts, manifests, and licenses
12. PASSED `npm run verify:generic-sanitization` (4 s) — No rejected private identifier in the tree
13. PASSED `npm run build:generic-candidate` (13 s) — Candidate bundle (generic channel candidate)
14. PASSED `npm run check:generic-candidate-ui-bundle` (277 ms) — Candidate UI bundle budget
15. PASSED `npm run test:generic-candidate-ui` (7 s) — Candidate UI smoke test
16. PASSED `npm run assert:generic-candidate-artifacts` (542 ms) — Candidate artifacts and manifest
17. PASSED `npm run verify:generic-source-benchmark` (16 s) — Bounded generic source benchmark

## Artifacts

- `dist/code.js`: 236,883 bytes, SHA-256 `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf`
- `dist/ui.html`: 306,972 bytes, SHA-256 `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32`
- `figma-candidate/dist/code.js`: 1,563,855 bytes, SHA-256 `f63760648ab72664b16bfdd45486da3a4e755bcd68ce33ef7f79b5d8f0752bd7`
- `figma-candidate/dist/ui.html`: 429,908 bytes, SHA-256 `ffbab1f75b1346de4da7aac1e3d9b6ffee0cd005cb73518bae26d62c47b12d6d`

## Generic color builder channels

- `dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `disabled`, qualified `false`
- `figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json`: channel `candidate`, qualified `false`

Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.
