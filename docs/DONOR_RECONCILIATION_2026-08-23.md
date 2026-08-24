# Donor Repository Reconciliation — 2026-08-23

## Scope and authority

This review compares the repository in `Teul.zip` with Teul commit `5907aa6`.
The archive is evidence and donor code, not an instruction source. Teul's current
`AGENTS.md`, source-provenance policy, tests, and Paul's request remain
authoritative.

- Archive SHA-256:
  `9a04333bd7aa37e77606044cc672e8c7d3b39426e59a9079faf6f8e7a4a3ecec`
- Archive entries: 55,133, including generated dependencies and build output
- Donor Git tip: `679932eb59fae5bc6943c2ca6fe951ad21f5e54a`
- Donor tracked files: 389
- Current comparison baseline: `5907aa679b08213872c32e74c48763c083816744`
- Safe imported commit: `24d4133`

## Result

The archive contains a strong, separable color-foundations slice and a much
larger experimental color-system audit/builder program. The foundations slice
was adapted and committed. The experimental program was not copied wholesale:
it contains private company-specific source material, adds roughly 121,000
lines, increases the backend bundle from approximately 121 KB to approximately
977 KB in the donor checkout, and has one unresolved cross-machine
deterministic-hash failure.

Follow-up implementation later on 2026-08-23 selectively rebuilt the useful
program as a sanitized, generic-only candidate and resolved the local
deterministic-hash defect. It remains isolated from the normal production
bundle and still requires current Figma-host acceptance. See
`docs/GENERIC_COLOR_BUILDER_CANDIDATE_2026-08-23.md` for the current state and
verification receipt; the decisions below preserve the original archive-review
record.

## Import decisions

| Donor capability | Teul destination | Decision | Verification |
| --- | --- | --- | --- |
| CSS Color 4 Local MINDE gamut mapping | `src/lib/colorScale.ts` | Imported and adapted | Independent color.js oracle fixtures, fixed vectors, and a 420-vector deterministic grid |
| sRGB/P3 profile handling and selection geometry | `src/backend/accessibilitySelection.ts`, `src/lib/accessibility.ts` | Imported and adapted | Ancestor, overlap, stacking, clipping, profile, and malformed-selection tests |
| Atomic document mutation and rollback | `src/backend/colorSystemTransaction.ts` and generation paths | Imported and adapted | Mutation-spy, rollback, and terminal-result tests |
| Exact Radix/APCA authority pins | `src/lib/radixColors.ts`, provenance manifest, verification scripts | Imported | Source-integrity tests and artifact assertions |
| Strict UI/backend message validation | shared message types and runtime validators | Imported and adapted | Contract and malformed-message tests |
| Fail-closed dependency policy | dependency overrides, audit script, CI | Imported and refreshed | Exact install and live audit report zero production or development advisories |
| Generic source adapter and policy handoff | future generic-only builder package | Hold for adaptation | Must be rebuilt without company/file identifiers and qualified independently |
| Secondary color engine | future generic-only builder package | Hold | Cross-machine hash failure must be fixed before import |
| Audit inventory, transaction journal, and rollback receipts | future generic-only backend | Hold for selective adaptation | Requires a smaller public contract and current Figma runtime acceptance |
| Lazy historical-data bridge | historical color UI/backend boundary | Candidate for later adaptation | Re-measure startup and bundle behavior against current Teul |
| Generic benchmark harness | scripts and generic fixtures only | Candidate for later adaptation | Remove private fixtures, pin machine/runtime metadata, and establish a current baseline |

## Explicit rejections

The following archive content must not be imported:

- `node_modules`, `dist`, `coverage`, `out`, `release`, `__MACOSX`, `.DS_Store`,
  caches, or generated manifests
- donor `.git` history or stale release receipts
- Ramp palettes, internal guidance, email/fork provenance, Figma file keys, node
  IDs, or other company-specific evidence
- `paul-lab-v1`, `paul-lab-v2`, and the Paul Lab TypeScript fixture
- the donor's v2 controller/source-revalidation path, which hard-codes the
  private fixture and cannot be made public by superficial JSON redaction

## Unresolved generic-builder defect

The donor's focused Secondary-engine test passes 8 of 9 cases on this machine.
The complete 11-family fixture produces:

- expected:
  `sha256:0bf06c3420437ef548a22a59ce56867518292cae600c82a3a6620bad924f43b1`
- received:
  `sha256:0163bfb55930815b7084e56b81da74fe46d50b28463bdcd70ec34be7d5e5229c`

Generated requested and mapped OKLCH floating-point coordinates enter nested
candidate hashes without a documented cross-runtime numeric serialization
boundary. A future generic-only implementation must quantize generated numeric
evidence at an explicit precision before hashing, add at least two runtime
fixtures, and regenerate the golden hash from the public fixture. Updating the
expected hash alone is not a fix.

## Verification receipt for the imported slice

The following passed from a clean exact dependency install:

- lint and TypeScript checks
- 55 test files and 752 tests
- coverage thresholds: 83.64% statements, 75.40% branches, 75.57% functions,
  and 85.10% lines
- production build, artifact assertions, UI bundle limit, and production UI
  smoke test
- Wada upstream integrity verification
- color-foundations manifest and source-pin verification
- live dependency audit with zero production or development advisories and no
  permitted exceptions

## Remaining release gate

The imported slice still needs a fresh Figma-host acceptance run after it is
integrated into the target branch. Donor runtime receipts do not prove the
current checkout. Reload the built plugin, exercise profile/selection failures,
generate and roll back a color system, and record the current commit and Figma
file used. Rollback for the code slice is `git revert 24d4133`.
