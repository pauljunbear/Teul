# Authored color relationships, version 1

The candidate's **Source relationships** intake accepts a local JSON model or reads the current Figma file. Both paths produce `teul.color-system-model.v1`. Intake preserves exact values and evidence; it does not generate resources or authorize a Figma write.

The production plugin keeps this path disabled. The existing five-section builder remains available in the candidate and retains its own confirmation and creation contract.

## What the model preserves

- Named colors with exact native sRGB channels and alpha, source identity, and values in explicitly named modes. Hex is only a display approximation when native channels are fractional.
- Authored families and multiple separate scales per family. A scale has ordered positions and exact color anchors in each declared mode. Unfilled positions remain unfilled.
- Usage contexts separate from display modes. An interface role does not establish a global brand primary.
- Source claims, locators, coverage, disagreements, and attributed rule decisions. An imported source can be historical or partial; retaining it does not establish current approval.

When the source names a color without sufficient numeric authority, `valueGapClaimIdsByMode` binds the missing value to retained unresolved claims. Qualitative relationships can still be inspected. Numeric contrast and dependent qualification remain unresolved. Import never samples a screenshot or copies a Light value into a missing Dark mode.

## Executable rules

Every rule names contexts, modes, force, evidence, and origin. Selectors name a color, family, or scale. An optional selector `role` filters the **actual painted use**, so a color used as an accent does not also count as a base. A scale selector selects its recorded anchors for the requested mode; construction must explicitly add permitted derived members later.

| Kind                 | Meaning                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette-membership` | All actual paints belong to the selected palette, or no paint matches a prohibition. Grounds, keylines and separators count.                                                                                                                                                 |
| `allowed-pair`       | Relevant actual co-presence or foreground/background pairs obey the relation. Co-presence is unordered.                                                                                                                                                                      |
| `forbidden-pair`     | No actual pair matches the forbidden relation.                                                                                                                                                                                                                               |
| `required-partner`   | A matching subject use requires a matching partner use. Existing `subjectRole` and `partnerRole` apply in addition to selector role filters.                                                                                                                                 |
| `color-count`        | Count distinct matching colors, or distinct authored groups with `unit: "groups"`. A prohibition forbids the inclusive range. Group counts require family/scale selectors; repeated roles for one group count once. A color recorded in two different groups activates both. |
| `prominence`         | Compare measured painted areas in ordered groups, or use an explicitly supplied area-fraction range. No percentage is inferred from a source diagram. Overlapping actual uses across ordered groups leave the relation unresolved.                                           |
| `role-binding`       | A role must use selected colors. `presence: "if-present"` constrains optional roles without requiring their presence; omitted presence retains the required-role behavior.                                                                                                   |

Accepted requirements and prohibitions block an incompatible application. Accepted preferences are advisory. Permissions and examples retain their force and do not become requirements or exclusive allowlists. Unreviewed hard rules block dependent qualification. A rejected rule remains in the model with its attributed decision.

The evaluator does not claim full guideline compliance from these seven kinds. Unsupported instructions remain claims, scoped to the contexts/rules they affect. Surface materials, arbitrary conditional logic, unknown numeric derivations and multi-color arrangements must not be silently flattened into pair rules.

## Review and identity

`modelHash` binds the complete canonical model. Each adoption binds both the normalized rule hash and a dependency hash covering its relevant source records, evidence, selected structures, modes, contexts and conflicts. Changing protected input invalidates the old adoption. An unrelated source or unselected mode can remain unchanged without invalidating an independent decision.

Authoring code uses `buildColorSystemRuleAdoptionsV1` only after an explicit attributed review decision. It must not refresh stale decisions merely to make parsing pass. An agent adoption is not owner approval or mutation permission.

A JSON import retains the original capture identity, including any recorded current-file hash. The controller's runtime intake origin remains `guideline-json`: importing a previously captured current-file model does **not** revalidate that file. Actual current-file freshness requires a new host read.

## Bounds and failure behavior

The complete serialized envelope is limited to 2 MiB, with at most 256 colors, 128 executable/territory rules, 16 contexts, four modes, 32 sources, 1,024 evidence records, 512 claims, 64 families, 128 scales, 64 positions per scale and 128 conflicts. The parser also bounds nesting, node count and strings. It rejects duplicate JSON fields, accessors, prototypes, nonfinite numbers, malformed references and unknown fields.

Unknown schema versions are reported before version-1 field validation, after checking the input is inert. The intake keeps the original text available for inspection and copying. A failed or cancelled read preserves the last confirmed model. Late reads and earlier file selections cannot replace a newer result.

There is no reverse adapter that discards relationships to manufacture a five-section input. The old compiler rejects the new schema. Existing compatible five-section inputs continue through the unchanged old path; the source inventory adapter is shared without altering that source or its confirmation chain.

## Verification boundary

Public tests use invented source colors and relationships. Private reference packets, source images and reconstruction renders stay outside distributable fixtures. Built-bundle DOM tests exercise the actual bundled UI in JSDOM; they do not establish real Figma or screen-reader acceptance. Those observations remain separate release gates.
