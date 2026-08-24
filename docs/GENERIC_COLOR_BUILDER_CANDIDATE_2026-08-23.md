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

`npm run verify:generic-sanitization` scans active source, fixtures, scripts,
manifest, Webpack configuration, and package metadata for the rejected private
names, corporate identifiers, Figma file key, node IDs, and fixture paths.

## Deterministic hashing

Raw source serialization remains byte-preserving through `canonicalJson`.
Hash receipts use `canonicalHashJson`, which quantizes generated non-integer
numbers to 12 decimal places before SHA-256. Tests prove that sub-precision
runtime noise hashes identically while meaningful differences remain distinct.

The normalized public secondary-engine golden hash is:

`sha256:4d205676d6920d86b145f1d428a7ba4bf90151c479ba0fd1f74a4f9da26b39dc`

Node 22.13.0 passes the focused hash test and full suite. Node 24 was not
installed locally, so an independent Node 24 execution remains a release
qualification check rather than claimed proof.

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

## Local verification receipt

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

Publication remains a separate manual action. Until those checks are recorded,
the production channel must remain `disabled` and the candidate must not be
described as released.
