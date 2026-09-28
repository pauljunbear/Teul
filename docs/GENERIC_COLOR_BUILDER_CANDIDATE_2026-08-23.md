# Generic Color Builder Candidate — 2026-08-23

## Outcome

The useful donor color-system work has been adapted into a generic-only,
qualification-gated candidate. The normal production build does not expose or
ship the candidate controller, audit runtime, renderer, or creation journal.
The explicit candidate build contains the complete analyze → confirm → create
path for controlled Figma acceptance.

For desktop qualification, import `figma-candidate/manifest.json`. Its distinct local
development ID prevents Figma from silently launching an already-registered
production Teul manifest with the same name and plugin ID.

The donor archive remains evidence, not authority. No donor history,
dependencies, build output, release receipts, private palettes, private Figma
keys, private node IDs, or client-specific fixtures are included.

## Improvements retained

- Generic Figma source inventory across variables, paint styles, structured
  palette headings, and supported usage evidence.
- Five-role plan generation for Primary, Secondary, Product Graphics, Data
  Visualization, and Typography.
- Owner confirmation bound to the exact displayed plan.
- Deterministic secondary-family generation and review directions.
- Preflight, final source revalidation, collision handling, mutation journal,
  rollback receipts, and idempotent replay behavior.
- Lazy historical-color delivery, compact historical JSON loading, local icon
  assets, and stricter UI/backend message validation.
- A synthetic seven-fixture generic corpus and bounded 10k/100k source
  benchmark.

## Privacy and provenance boundary

Structured canvas palettes are accepted only when a unique native heading
explicitly declares a supported role, such as `Colors (Primary)`. Duplicate
headings for the same role fail closed. RGB prose and uncorroborated labels do
not become source colors.

`npm run verify:generic-sanitization` scans every text file in the repository,
including `docs/`, `README.md`, `AGENTS.md`, `THIRD_PARTY_NOTICES.md`, the
configuration files, and the built `dist/` and `figma-candidate/dist/` when
present, for the rejected private names, corporate identifiers, Figma file key,
node IDs, and fixture paths. Since 2026-09-07 the gate stores only SHA-256
digests of those identifiers and compares them against candidates extracted by
shape, so the identifiers themselves never appear in the tree, not even as
fragments. Two historical governance records that name the rejected source to
document its exclusion are allow-listed by exact file and rule.

## Deterministic hashing

Raw source serialization remains byte-preserving through `canonicalJson`.
Hash receipts use `canonicalHashJson`, which until 2026-09-08 quantized
generated non-integer numbers to 9 decimal places before SHA-256 (see “Numeric
canonicalization” below for the single policy that replaced it). Tests prove
that sub-precision runtime noise hashes identically while meaningful
differences remain distinct.

The August public secondary-engine golden hash was:

`sha256:6573e79dacc69ce45f2c506ebb2cdbaf5d94dee6d7ed41fa53324602ee023f1f`

The September reconciliation supersedes that hash after canonicalizing
derived color math and powerless hue evidence. Its current source-level golden
hash is:

`sha256:31463566213fefd3005d98e262d92e703c141715dc0e18f72d9eabbc4a070b36`

For the August receipt, Node 22.13.0 passed the focused hash test and full suite
locally. The release gate is `npm run release-gate`, run locally on Node 22 and
again on Node 24; both runs must pass, and their receipts under
`docs/evidence/gates/` are committed before release. (GitHub Actions ran the
same steps until 2026-09-07, when the workflow was removed in favour of the
local gate.) The current reconciliation receipt is recorded separately after
its exact final matrix passes.

## Build isolation and size

| Build                   | Backend |      UI | Channel    |
| ----------------------- | ------: | ------: | ---------- |
| Current `main` baseline | 132 KiB | 362 KiB | Production |
| Adapted production      | 188 KiB | 319 KiB | Disabled   |
| Explicit candidate      | 866 KiB | 370 KiB | Candidate  |

The adapted production total is approximately 2.6% larger than the baseline
while its UI is approximately 12% smaller. Candidate-only backend modules are
selected through explicit Webpack aliases and are absent from the normal
release bundle.

## August local verification receipt

- TypeScript and ESLint: pass with zero warnings.
- Tests: 96 files and 1,403 tests pass.
- Coverage: 78.04% statements, 72.23% branches, 82.62% functions, and 79.50%
  lines; all repository thresholds pass.
- Production build: artifact assertion, 392,000-byte UI budget, and disabled
  surface smoke test pass.
- Candidate build: candidate-channel artifact assertion, 392,000-byte UI
  budget, and generic analyze → confirm → three-direction review → strict
  Create-request smoke test pass.
- Generic benchmark: 10k nodes + 2k variables + 500 styles p95 151.165 ms;
  100k nodes p95 512.318 ms; cancellation adds zero visits.
- Wada upstream integrity, color-foundation ledger, generic sanitization, and
  the live dependency audit pass. The dependency policy reports zero production
  or development vulnerabilities and permits no exceptions.

Benchmark timings are local engineering evidence from this machine, not a
guarantee for every Figma document or device.

## Live Figma qualification — 2026-08-24

A clean replay in a non-private, disposable Figma file completed the full
Analyze → confirm exact plan → review generated directions → Create path using
the `Teul Candidate` bundle. The selected direction was `Balanced Contrast`.

The created system contains:

- 75 primitive and derived variables.
- 49 semantic variables.
- 124 paint styles.
- 21 components.
- 5 editable presentation frames.

The original `Generic Source Colors` collection and its five variables remained
intact. The successful replay is intentionally left open in Figma for visual
inspection; the candidate reports the system as ready to review, and nothing
has been published.

Before the clean replay, a separate successful creation proved that closing
Teul and invoking one native Figma Undo removes the generated page and generated
collections while preserving the original five-variable collection.

The live fixes exercised by this replay include unique Light/Dark typography
variable names, complete mode values for every semantic variable, alpha-derived
values in every mode, compiler rejection of duplicate names or incomplete mode
maps, clearer inventory mismatch diagnostics, and inclusion of Figma's reveal
action inside the same Undo transaction as creation.

## Remaining Figma-host acceptance

The current run records generic analysis, exact-plan confirmation, successful
candidate creation, resource counts, source preservation, and native Undo of a
prior successful creation. The remaining checks are:

1. Final mutation-fence rejection after a source change between review and
   Create.
2. Forced failure with complete rollback and no orphaned resources.
3. Replaying the same authorized Create as a no-op rather than a duplicate.
4. Keyboard and assistive-technology review of confirmation and creation.

Those four checks are necessary but not sufficient for promotion. The exact
final candidate must also be sealed to a commit and artifact hashes, reviewed
and accepted by the designated product/domain owner, and bound to an explicit
qualified-release receipt under a separate qualification contract. This
reconciliation does not authorize that decision.

Publication remains a separate manual action. Until both the host matrix and
owner-acceptance evidence are recorded against the exact artifact, the
production channel must remain `disabled` and the candidate must not be
described as released.

## Reconciliation boundary — 2026-09-02

The August 24 Figma observation above applies to the candidate bytes exercised
in that run. Later commits changed deterministic hashing and creation-journal
persistence, so the observation is historical evidence rather than a live
qualification receipt for the current artifact.

The September reconciliation starts from public `main` and preserves the
separate production and candidate bundles. It adds direct sRGB document-profile
guards, fractional-hue stability, compatible dependency updates, and a nested
prototype security audit. The exact rebuilt candidate remains `qualified:
false`. Its current local verification receipt is:

- Node 22.13.1 and Node 24.0.0: lint, typecheck, 96 test files, and 1,416 tests
  pass with identical repository coverage of 78.07% statements, 72.30%
  branches, 82.64% functions, and 79.59% lines.
- Production: backend 192,625 bytes
  (`ab23d2407d1cf12acc6437bd90104f80d831affc154a77badcace12dc9b367dc`), UI
  326,108 bytes
  (`d06211197f6a91da7fc2b1f425410d29bcf5b956551f0f8e28997446eb624c41`),
  artifact assertions, module-isolation checks, UI budget, and disabled-surface
  smoke pass.
- Candidate: backend 885,316 bytes
  (`8c693ebeb76a23138487ecbdd6ea98f6a74265e2339b7d5e1c7e54b213d8f26e`), UI
  377,683 bytes
  (`71599c21a816c78e625614205a060f886cc2e58a8253473971b0069a4e182d8c`),
  artifact assertions, module-isolation checks, UI budget, and Analyze →
  confirm → review → Create smoke pass.
- Root and prototype dependency audits, Wada integrity, color foundations,
  sanitization, and the read-only 10k/100k benchmark pass. The preserved local
  benchmark receipt was not overwritten.

These are local source/build receipts, not Figma-host observation or
qualification. Promotion still requires the exact-artifact host,
accessibility, owner-acceptance, and qualification-contract gates above.

## 2026-09-07 — V1 audit program excluded from the candidate bundle

The candidate backend had been compiling the older V1 audit/strategy program,
`src/backend/colorSystemAuditController.ts` and the modules only it reaches,
although nothing in the plugin could reach it: `ColorSystemAuditSimpleTab` is
never mounted and the controller's thirteen message types are never sent. Both
Webpack channels now resolve `./backend/colorSystemAuditReleaseRuntime` to
`colorSystemAuditDisabledRuntime.ts`, and the candidate module boundary forbids
`colorSystemAuditController.ts` and `colorSystemAuditCandidateRuntime.ts`. The
V2 builder keeps its one legitimate dependency on that program,
`colorSystemAuditInventory.ts`, through `colorSystemGenericSourceInventoryV2.ts`.
No source file was deleted; the excluded program stays in the tree, still
type-checked and linted, pending the owner's deletion decision.

Measured locally on Node 22.23.1 from the integrated Wave 1 base (`2daeab7`)
and from this change:

- `figma-candidate/dist/code.js`: 903,898 → 565,480 bytes (−338,418 bytes;
  SHA-256 `813257527b9e7653b31330146b8bbdc73f0171d758019335349e8a8e0e47032c`
  → `555e1cbe42c392a736dfe6458dcfd828b780fea66d4deef4a0b36c5baebfbe7f`).
- `figma-candidate/dist/ui.html`: unchanged at 382,476 bytes.
- Production `dist/code.js`: unchanged at 192,626 bytes with the same 46-module
  `code` chunk before and after.
- Candidate `code` chunk: 95 → 72 modules. Twenty-four modules (695,237 bytes
  before minification) dropped out — `colorSystemAuditController`,
  `colorSystemAuditApply`, `colorSystemAuditCandidateRuntime`,
  `colorSystemApplyJournal`, `colorSystemLibraryPage`,
  `colorSystemLibraryPageAdapter`, `colorSystemProposalOverview` (backend and
  lib), `colorSystemAuditMessageValidation`, `colorSystemAuditExport`,
  `colorSystemApproval`, `colorSystemBuilderPackage`,
  `colorSystemObjectiveModules`, `colorSystemOutputBlueprint`,
  `colorSystemProposal`, `colorSystemStrategyBuilder`,
  `colorSystemStrategyPreview`, `colorSystemStrategyProposal`,
  `colorSystemStrategyReceipts`, `colorSystemStructured`,
  `colorSystemTokenExport`, `colorSystemTokenImport`,
  `colorSystemVisualization`, and `types/structuredColorTokens` — and
  `colorSystemAuditDisabledRuntime` (1,286 bytes) came in.

These are local build receipts, not Figma-host observation or qualification.

## UI budget per channel — 2026-09-07

The candidate review now shows a side-by-side direction comparison, measured evidence and brand
surfaces, and its `ui.html` passed 392,000 bytes. `scripts/check-ui-bundle.js` now applies two
budgets under one ceiling: production keeps the 392,000-byte improvement budget; the candidate uses the
former 409,600-byte product budget; `scripts/assert-build-artifacts.js` keeps the 450,560-byte ceiling
for both. Measured at this change: production `ui.html` 329,736 bytes, candidate `ui.html` 392,233 bytes.

## 2026-09-08 — V1 audit program removed from the source tree

The program excluded from the bundle on 2026-09-07 no longer exists in the
working tree. It remains in git history; at the time of writing the last commit
that still contains it is `6ec2e37`. Two commits did the work as a lossless
refactor, justified module by module from the import graph rather than by name:

1. The hashing helpers the V2 builder still needs (`canonicalJson`,
   `canonicalHashJson`, `deterministicContentHash`,
   `DETERMINISTIC_HASH_DECIMAL_PLACES` and the sandbox SHA-256 behind them)
   moved verbatim from `src/lib/colorSystemAudit.ts` into
   `src/lib/colorSystemHashing.ts`, with their oracle tests.
   `colorSystemAudit.ts` re-exports them for the modules being edited
   concurrently on another branch.
2. Twenty-nine source files (24,049 lines) and seventeen test files (13,123
   lines) that only the V1 program reached were deleted, and the shared
   surfaces were trimmed: the thirteen V1 message types, their result types
   and validators left `src/types/messages.ts` (864 → 333 lines) and
   `src/lib/messageValidation.ts` (2,602 → 1,031); `src/code.ts` lost the V1
   routing and invalid-message fallbacks (892 → 674);
   `src/types/colorSystemAudit.ts` keeps only the source, snapshot and audit
   types the inventory and the audit engine still use (741 → 314);
   `webpack.config.js` lost the `colorSystemAuditReleaseRuntime` alias and the
   audit entries in `GENERIC_CHANNEL_MODULE_BOUNDARIES` (305 → 290);
   `scripts/smoke-production-ui.js` lost its never-called V1 fixtures
   (1,489 → 1,193); `src/backend/colorResourceOwnership.ts` lost the V1 apply
   markers while keeping the read side the inventory uses (62 → 36).

Kept because the V2 builder still reaches them: `colorSystemAuditInventory.ts`
(through `colorSystemGenericSourceInventoryV2.ts`),
`colorSystemRoleInference.ts` and `colorSystemSourceSectionPolicy.ts`
(imported by the inventory), and `colorSystemAudit.ts` itself for
`COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS`, `observedLiteralCandidateIdentity` and
the hashing re-export. Its audit engine (`auditColorSystem`,
`createSourceSystemSnapshot`, `evaluateAccessibilityPair`) now has test-only
references — the inventory tests use it as an oracle — and appears in the
dead-export report; removing it is a separate decision.

Measured locally on Node 22.23.1, before (`468d4f4`) → after:

- Source under `src/`: 97,532 → 70,684 non-test lines (153 → 125 files);
  58,335 → 44,207 test lines; 1,697 → 1,404 tests in 111 → 95 test files.
- `dist/code.js`: 196,688 → 174,479 bytes (−22,209; SHA-256
  `1e61220a2b3cd9536816389b8daa3375929c4ed435743c74e19af35c86cd799d`).
- `dist/ui.html`: unchanged at 331,611 bytes
  (`9c54c39bb1305bf1478e00aa0f10336fcc5a2b27657aefe43c3749a9a20dcde4`).
- `figma-candidate/dist/code.js`: 653,934 → 631,947 bytes (−21,987; SHA-256
  `cd5227b13f1157296c7cdc550809dc57c2db0f6f96c008667609a9f274ae9642`).
- `figma-candidate/dist/ui.html`: unchanged at 396,065 bytes
  (`c80d4582e90806f3ca5c367a89283529a97851738b784b2606302ff8d4758f2b`).
- `npm run report:dead-code`: 28 → 27 findings.
- Lint, typecheck, both artifact assertions, both UI budgets, both UI smoke
  runs and the generic sanitization pass.

These are local source/build receipts, not Figma-host observation or
qualification.

## Numeric canonicalization — 2026-09-08

One policy, one place. Until this date two quantization rules stacked in the
deterministic hash chain: `canonicalHashJson` rounded generated non-integers to
9 decimal places (`DETERMINISTIC_HASH_DECIMAL_PLACES`), while the engine, the
V3 strategy planner and the palette analyser each carried a private copy of a
12-significant-digit rounding (`canonicalColorMathNumber`, `significant`), so a
number reached SHA-256 through one rule, both, or neither depending on its
route. The rule is now `canonicalNumber` in
`src/lib/colorSystemHashing.ts`, with the documented constant
`CANONICAL_NUMBER_SIGNIFICANT_DIGITS = 12`: non-integers keep twelve
significant digits, integers pass through exactly, `-0` becomes `0`, and
non-finite values throw instead of hashing as `null`. `canonicalHashJson`
applies it to every number; the engine, the planner and the palette analyser
import it and define no rounding of their own. The 9-decimal constant is
deleted. The powerless-hue epsilon `0.000004` stays in the planner as a CSS
Color 4 value (§4.4.1; `oklch()` property table), not a hashing policy. The
planner's hue wrapper, which the engine now shares, canonicalizes before and
after a single wrap, so `-1e-20` and `359.9999999999999` normalize to `0`
rather than `360`; `-0` to `0`; fractional hues such as `12.5` are preserved.

Goldens. The source-level engine golden moved from
`sha256:064d45d910746b6b3454a3ce0a0a3e54cc5930732ca924739ad38b4c24cafcc6` to
`sha256:01345cdf2ed146952ef04e23577f4e0bb7ff3c4350414532a1be1c21a1225009`
because OKLCH evidence and sRGB channels now enter the hash at twelve
significant digits instead of nine decimal places; the re-basing test asserts
that every generated anchor reproduces its seed and recipe transform exactly,
that provenance states the signed hue offset, that the one neutral family is
the one derived from the low-chroma reference, and (as before) the separation
thresholds and per-direction counts. The seven source-snapshot hashes in
`fixtures/color-builder/generic-source-v2/manifest.json` and the corpus
property hash did not move: those fixtures carry short-decimal channels that
both rules leave unchanged, and the ledger test now shows what it protects (one
1/255 channel step moves the hash; 1e-13 relative noise does not). A new engine
test canonicalizes a real candidate, re-hashes it to its published
`candidateHash`, perturbs every canonical non-integer by 1e-13 relative and
proves the hash unchanged, then perturbs the anchor-separation measure by 1e-9
relative and proves it changes. Residual, unchanged by this work: a value
produced by a libm-dependent function (cbrt, atan2) can in principle sit within
1 ulp of a twelve-digit rounding boundary, so any rounding policy leaves a
small per-value chance that two runtimes disagree; hashing decisions or
integers instead of floats would remove it and remains a separate design
choice.

## Candidate UI budget widened — 2026-09-08

The candidate review gains an owner-supplied spot color on the print sheet and marketing /
out-of-home preview boards. `scripts/check-ui-bundle.js` raises the candidate budget from 409,600 to
430,080 bytes (420 KiB), 20 KiB under the unchanged 450,560-byte artifact ceiling; the production
improvement budget stays at 392,000 bytes.
