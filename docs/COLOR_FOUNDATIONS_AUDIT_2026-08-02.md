# Teul Color Foundations Audit — 2026-08-02

Status: Implemented and independently reviewed in scope; UI bundle-budget and Figma runtime receipts pending

This audit answers a narrow, measurable question: does Teul's current color-system and accessibility guidance make only the claims that its inputs, standards, algorithms, and Figma rendering context can prove?

It does not use “state of the art” as a comparative marketing claim or as a reason to add every new color model. It evaluates Teul against a dated, testable 2026 sRGB color-foundation contract: use the current stable conformance basis, adopt newer algorithms only when they improve a measured result, distinguish normative from experimental guidance, and fail closed when a required premise is unknown.

The canonical delivery contract is [the Color Foundations Alignment PRD](prds/2026-08-02-color-foundations-alignment.md). Standards freshness is machine-readable in [the evidence manifest](color-foundations-manifest.json).

## Executive verdict

The pre-audit plugin was strong but not certifiable as current at every boundary. Its WCAG 2.2 sRGB formula, thresholds, semantic-pair blocking, APCA 0.1.9 contrast port, exact Radix 3.0.0 sRGB solid payload, and Machado linear-light implementation were already sound. Four material gaps prevented a “no worries” verdict:

1. a Display-P3 Figma triplet could be serialized as hex and judged with sRGB luminance coefficients;
2. selection analysis could omit ancestor opacity, stacking, and overlap context;
3. generated scales used boundary-only chroma reduction rather than a named current CSS Color 4 gamut mapper;
4. exact Radix data was combined with Teul-authored family matching and context-free WCAG badges whose wording exceeded the evidence.

The aligned target is not universal accessibility or identical appearance on every display. It is a locally verified sRGB color engine with explicit profile boundaries, current deterministic mapping, exact source parity, pair-bound accessibility evidence, advisory simulation labels, and expiring research provenance.

## Primary-source research snapshot

| Area                      | Current authority or status                                                                                                                                                                                                                                                                                          | Teul policy                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WCAG                      | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is a W3C Recommendation, updated 12 December 2024. [ISO/IEC 40500:2025](https://www.iso.org/standard/91029.html) was published in September 2025; ISO stage 90.92 marks it as an international standard to be revised.                                                                 | WCAG 2.2 remains the blocking conformance basis for proven opaque sRGB pairs. Ratios are not rounded before threshold comparison.                                                                                   |
| WCAG 3                    | [WCAG 3.0](https://www.w3.org/TR/wcag-3.0/) is an incomplete Working Draft dated 3 March 2026.                                                                                                                                                                                                                       | It is not a conformance basis. The current draft does not make APCA a Teul requirement.                                                                                                                             |
| Display-P3                | [CSS Color 4](https://www.w3.org/TR/css-color-4/#predefined-display-p3) defines different P3 primaries and a P3-to-XYZ matrix. WCAG 2.2's normative relative-luminance definition supplies an explicit formula for sRGB, not P3.                                                                                     | Never feed raw P3 components to sRGB WCAG/APCA. This release fails closed rather than labeling a colorimetric P3 extension as normative WCAG.                                                                       |
| Gamut mapping             | The [28 July 2026 CSS Color 4 Candidate Recommendation Draft](https://www.w3.org/TR/css-color-4/#css-gamut-mapping) names Binary Search with Local MINDE, EdgeSeeker, and Ray Trace.                                                                                                                                 | Teul Generated v3 uses Binary Search with Local MINDE, Delta E OK JND `0.02`, epsilon `0.0001`, and explicit endpoint/in-gamut behavior.                                                                            |
| Radix                     | [`@radix-ui/colors` 3.0.0](https://www.npmjs.com/package/@radix-ui/colors) remains the latest public release. [Radix step guidance](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) uses APCA-based targets.                                                                       | Preserve the exact 744-value sRGB solid subset. Independently test every Teul semantic pair under WCAG. Treat family matching as Teul-authored evidence.                                                            |
| APCA                      | [`apca-w3` 0.1.9](https://www.npmjs.com/package/apca-w3) remains a public beta package with a reference font lookup.                                                                                                                                                                                                 | Keep APCA supplemental, sRGB-only, and non-conformance. Test the local contrast port and reference lookup directly against the exact package.                                                                       |
| CVD simulation            | [Machado et al. 2009](https://doi.org/10.1109/TVCG.2009.113) remains a defensible physiological simulation aid; a [2025 comparison](https://doi.org/10.1016/j.optcom.2025.131961) found Machado and Yaguchi outperformed Yang in that study. The original paper says its model is not intended to handle tritanopia. | Use linear-light sRGB matrices as advisory risk previews. Never claim diagnosis, individual perception, accessibility proof, or validated tritanopia.                                                               |
| HDR and screens           | [CSS Color HDR](https://www.w3.org/TR/css-color-hdr-1/) is a Working Draft dated 28 July 2026. Figma documents [sRGB and Display-P3 assign/convert behavior](https://help.figma.com/hc/en-us/articles/360039825114-Manage-color-profiles-in-design-files).                                                           | Display-P3 is SDR. Teul makes no HDR or monitor-universal promise. Correct tagged-space math cannot control calibration, gamut coverage, OS color management, ambient light, panel behavior, or font rasterization. |
| Forced colors/preferences | [CSS Color Adjustment](https://www.w3.org/TR/css-color-adjust-1/) and [Media Queries 5](https://www.w3.org/TR/mediaqueries-5/) define forced colors and user contrast/transparency preferences.                                                                                                                      | Record as a web-consuming-product responsibility. Teul's current Figma iframe is not a browser-delivered token consumer and does not certify downstream states.                                                     |

## Measured findings and dispositions

### F-001 — Display-P3 contrast pass reversal

Severity: High

Before: Figma profile-relative RGB channels were serialized to `#RRGGBB`; the profile was shown in status copy but `analyzeContrast` always applied sRGB WCAG/APCA math.

Evidence: `[0,109,253]` over white is approximately `4.5594:1` under sRGB coefficients and `4.4936:1` under Display-P3 normalized Y. The same numbers therefore cross the WCAG AA threshold depending on profile. Native-P3 WCAG conformance remains underspecified, so reporting the sRGB pass is unsafe even when a separate P3 calculation is available.

Disposition: Fix now. Selection analysis must accept only an authoritative sRGB document profile. P3, legacy, and unknown profiles return an explanation and no pair. Manual `#RRGGBB` remains explicitly sRGB.

Release proof: AC-001 and AC-003.

### F-002 — Selected pair was not necessarily the rendered pair

Severity: High

Before: Teul rejected opacity and blend ambiguity on the selected nodes, but not every relevant ancestor; it did not prove overlap or that a selected background was behind the text.

Evidence: Black text in a 50%-opacity group over white can be reported as `21:1` from its source fills while the rendered pair is approximately `3.95:1`.

Disposition: Fix now. Fail closed for ancestor opacity/blend/effect/stroke/mask ambiguity; irregular, rounded, rotated, or skewed backgrounds; non-overlap; render-bound or unclipped-descendant overlap; and unprovable stacking. Skip empty ancestors when finding a usable background, and recheck the live selection, profile, geometry, fills, and bound-variable identities after host awaits before returning success.

Release proof: AC-002.

### F-003 — UI profile assertion could authorize profile-invalid Figma mutation

Severity: High

Before: The UI warned about Display-P3, but the backend transaction trusted request data. WCAG-constrained creation could proceed in P3, and Teul Generated or Exact Radix sRGB hex channels could be copied into a P3 document and then mislabeled as the intended sRGB colorimetry.

Disposition: Fix now. All on-canvas color-system methods require a live sRGB root profile. The backend rechecks after collision/font/variable/style awaits, immediately before each mutation phase, and rolls back if the profile changes mid-operation. P3, legacy, and unknown documents receive zero retained mutations; non-mutating export remains available. Semantic reports serialize `colorSpace: sRGB`.

Release proof: AC-006.

### F-004 — Generated gamut mapping was current in direction, not algorithm identity

Severity: Medium

Before: Teul reduced OKLCH chroma at constant lightness/hue until the value entered sRGB. That is preferable to raw channel clipping but can over-desaturate colors near shallow or concave gamut boundaries.

Measured change: `Teul OKLCH v3` implements Local MINDE. The CSS Color 4 Display-P3 yellow fixture improves from the reviewed boundary-only reference `#fdfe00` to `#feff00`. Ten fixed vectors independently generated with `colorjs.io@0.7.0` cover identity, endpoints, epsilon-scale gamut boundaries, both sides of the `0.02` JND, shallow yellow/cyan boundaries, and a deep out-of-gamut case; Teul matches their serialized sRGB hex and mapped Delta E OK within `0.00001`. A separate 420-vector grid exercises deterministic finite output. The 538 historical source/mode results preserve anchor/finite/sRGB guarantees, retain the existing 536 valid outputs, and retain two explicit impossible exact-anchor failures for Wada White. The deterministic v3 corpus SHA-256 is `68485d2cc938988453c35fdb31992387c6079e24478377b6d7d9c78e92129050`.

Disposition: Fix now because the change has a measured fidelity result and versioned rollback boundary.

Release proof: AC-004.

### F-005 — Exact Radix source and Teul matching were conflated

Severity: High for guidance; no source-data defect

Before: Exact Radix values were current, but “closest family” compared only light step 9 with CIE76. Examples included Hermosa Pink to Bronze and Pale Lemon Yellow to Brown.

Measured change: Match with Delta E OK against every exact light/dark solid step, with stable family/mode/step tie-breaking and visible evidence. Reviewed goldens are Hermosa Pink to Ruby, Pale Lemon Yellow to Yellow, and blue to Indigo. The exact family values remain unchanged.

Disposition: Fix interpretation, preserve data. Pin `@radix-ui/colors@3.0.0` as a development source and directly compare all 744 bundled sRGB solid values.

Release proof: AC-005.

### F-006 — Radix swatches carried context-free WCAG labels

Severity: High for claim integrity

Before: Exact-mode layouts could classify steps 9, 11, or 12 as `AAA`, `AA`, `AA Large`, or `Fail` against step 1 without binding the label to a declared text/non-text use. Step 9 is documented by Radix as a solid background role.

Disposition: Remove standalone conformance badges from exact Radix layouts. Teul's WCAG-Constrained mode continues to report explicit foreground/background/use/mode/profile pairings.

Release proof: AC-005 and AC-007.

### F-007 — APCA font guidance was coarsened

Severity: Medium

Before: The core APCA contrast port matched 0.1.9, but font sizing collapsed the canonical 100–900 weight table into normal/bold bands and used simplified level sizes.

Disposition: Fix now without making APCA normative. Port the exact 0.1.9 public-beta table/interpolation, fail closed for noncanonical weights, and compare representative results and contrast vectors directly with pinned `apca-w3@0.1.9`. Label its Barlow reference face and beta status rather than promising another typeface.

Release proof: focused APCA tests and AC-007.

### F-008 — Machado tritan endpoint was labeled tritanopia

Severity: Medium

Before: The implementation correctly used published linear-light matrices, but its user label called the severity-1 tritan matrix “Tritanopia.” The source paper explicitly limits that interpretation.

Disposition: Preserve the backward-compatible internal key and relabel the user-facing result “Severe tritanomaly approximation,” with a description that it is tritan-like, advisory, and not validated as tritanopia.

Release proof: CVD info tests and AC-007.

### F-009 — Standards freshness had no expiry

Severity: Medium operational risk

Before: Sources were documented but a green build could outlive their review indefinitely.

Disposition: Add an offline evidence-manifest verifier. It requires normative, draft, package, host, and simulation sources; pins exact Radix/APCA development versions; passes through 2 February 2027; and fails afterward until a human re-reviews sources.

Release proof: AC-008.

## What did not change

- WCAG remains 2.2. No WCAG 3 or APCA conformance system was invented.
- The `0.04045` sRGB linearization breakpoint and unrounded `3`, `4.5`, and `7` thresholds remain unchanged.
- All 13 declared semantic pairings per generated mode remain blocking.
- Radix stays at 3.0.0 because it is current; no values were “improved.”
- Historical Wada and Werner data remain outside this implementation diff.
- Machado protan/deutan/tritanomaly matrices remain because current evidence supports them as advisory approximations.
- No P3, alpha, HDR, spectral, CAM16, JzAzBz, or device-calibration feature was added without a defined user outcome.

## Deferred by evidence, not forgotten

1. **Native P3 analysis:** A future design can report colorimetric normalized Y, but it must not relabel that extension normative WCAG 2.2. A defensible web export also needs a tested sRGB fallback.
2. **Radix P3 and alpha variants:** Radix 3.0.0 includes them, but Teul's exact mode is explicitly the sRGB solid subset. Adding modes needs a separate Figma/CSS compatibility and compositing contract.
3. **Alpha, gradients, and images:** Contrast requires compositing over every allowed backdrop or evaluating the actual worst case. Teul continues to reject unsupported selection contexts rather than estimate.
4. **HDR:** Capability media queries do not prove active HDR output, and CSS Color HDR remains a draft.
5. **Monitor parity:** A plugin cannot guarantee identical perception across display hardware, calibration, OS/browser color management, ambient light, or rasterization.
6. **Whole-product accessibility:** Pair checks do not prove color-independent cues, focus/hover/disabled/placeholder states, forced-colors behavior, motion, semantics, keyboard access, or assistive-technology behavior in a consuming product.

## Release contract

The implementation can be called locally verified against this dated 2026 sRGB color-foundation contract only when all of these are true:

- zero unsupported-profile or ambiguous-context pass labels;
- zero P3, legacy, or unknown-profile sRGB color-system mutations;
- Local MINDE properties and the reviewed 538-output checksum pass;
- all 744 exact Radix values equal the pinned package;
- the APCA port/reference table equals the pinned package on reviewed vectors;
- all semantic pair gates, coverage thresholds, build/artifact checks, source checks, and dependency audit pass;
- an independent reviewer finds no unresolved P1/P2 requirement gap;
- the standards evidence has not expired.

Current isolated-index receipts on Node 22.13.1: lint and typecheck pass; 55 files and 752 tests pass at 83.64% statements, 75.40% branches, 75.57% functions, and 85.10% lines; the production build, artifact assertions, and production-UI smoke pass; and `dist/ui.html` passes the improvement budget at 370,439/409,600 bytes. The standards verifier passes 9/9 policy fixtures, its dependency-audit policy passes 5/5 adversarial fixtures, and live parity verifies 159 Wada colors across 348 combinations against the pinned upstream commit. A live registry run of this exact lockfile passes with zero production findings at moderate or higher; the only accepted all-dependency finding is the exact reviewed indirect `brace-expansion` development-tool advisory set, while changed, runtime, unexpected, or post-2026-09-02 findings fail closed. Independent color-foundations review found no unresolved P1/P2 defect in the scoped implementation.

The scoped color-foundations candidate is **locally verified** against its automated release contract. A production Figma development reload remains the runtime-only acceptance step; source verification does not mean deployed or live-observed.
