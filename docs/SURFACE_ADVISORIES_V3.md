# Surface Advisories v3 — brand surfaces, print and out-of-home

Module: `src/lib/colorSystemSurfaceAdvisoriesV3.ts` (pure, deterministic, no
hashing). Tests: `src/lib/__tests__/colorSystemSurfaceAdvisoriesV3.test.ts`.
Wired into the candidate review (“Brand surfaces” section) on 2026-09-07.

## Why

The color builder had no model of where a color lives. “marketing-accent” was
a label with no logic, and print, CMYK, spot color and out-of-home appeared
nowhere. The brief covers marketing materials, websites and out-of-home print
as well as product UI. This module gives every job a surface set and runs the
checks a print-literate reviewer would run first.

## What the module claims

| Check                                               | Function                                  | Basis                                                         |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Surface set per job                                 | `surfacesForJob(s)`                       | Teul policy default (table below)                             |
| Unprofiled sRGB → CMYK estimate, whole percentages  | `estimateCmykUnprofiled`                  | Standard naive formula; always labelled, never called a build |
| Total ink coverage against a named press condition  | `totalInkCoverage`, `inkCoverageAdvisory` | ECI offset standards page                                     |
| Saturated screen color likely to shift in CMYK      | `screenToPrintDriftAdvisory`              | Teul threshold (OKLCH chroma > 0.20); X-Rite quote as context |
| Pale tint likely to drop out in print and on boards | `screenToPrintDriftAdvisory`              | Teul threshold (OKLCH lightness > 0.90)                       |
| Out-of-home text contrast                           | `outOfHomeTextAdvisory`                   | WCAG 2.2 formula; Teul floor 4.5:1                            |
| All-white digital-board ground → pull to light gray | `outOfHomeTextAdvisory`                   | OAAA “make the white a 10% black”; Teul threshold L > 0.97    |
| Letter height by viewing distance                   | `minimumLetterHeightCm`                   | OAAA “Font Size” table, feet and inches converted via NIST    |
| Print triplet (screen, CMYK estimate, owner spot)   | `printTriplet`                            | `canonical` is `spot` only when the owner supplied one        |
| Sorted advisory list with per-surface counts        | `buildSurfaceAdvisoriesV3`                | Deterministic under reordered input                           |

## What the module refuses to claim

- **Any spot-color name or number.** Spot references are licensed data. The
  module carries an `OwnerSuppliedSpotColor` field (`source: 'owner-supplied'`)
  and throws on anything else. With no spot supplied, `spot` is `null`, the
  screen value is canonical, and no output text names a spot system. The only
  places the word appears in output are X-Rite’s own quoted sentence and the
  URL it was fetched from, carried as `evidence.context` and
  `evidence.contextCitation` on the saturation warning; the tests pin both.
- **A profiled CMYK conversion.** The estimate uses the naive formula
  (K = 1 − max(R, G, B); C = (1 − R − K) / (1 − K), likewise M and Y). It is
  labelled `method: 'unprofiled-naive-estimate'` and carries a fixed
  disclaimer. It is never called a build.
- **That the estimate proves ink coverage is safe.** The naive formula replaces
  gray with black as far as possible, so its total is always below 300 % (the
  sweep test tops out at 294 %). An estimate therefore never trips the 300 %
  default; the aggregate runs the ink check on owner-supplied CMYK values and
  says “within limit” only for those. An estimate-based check is emitted only
  when it exceeds an opt-in or caller-supplied lower limit.
- **Gamut membership.** No color is declared in or out of a press gamut.
- **Anything about screen surfaces.** `screen-product` and `screen-marketing`
  are listed as active but carry no checks here; nothing cited applies yet.
- **A replacement hex for “10% black”.** The OAAA recommendation is quoted; the
  designer picks the gray.

## Job → surface mapping (Teul policy default)

| Job                                                                                     | screen-product | screen-marketing | print | out-of-home |
| --------------------------------------------------------------------------------------- | :------------: | :--------------: | :---: | :---------: |
| `brand-primary`, `rendered-text-pair`                                                   |       ✓        |        ✓         |   ✓   |      ✓      |
| `marketing-accent`                                                                      |                |        ✓         |   ✓   |      ✓      |
| `product-graphics`, `functional-iconography`, `product-ui-surface`, `product-semantics` |       ✓        |                  |       |             |
| `categorical-data`, `sequential-data`, `diverging-data`                                 |       ✓        |        ✓         |       |             |

## Sources (all fetched 2026-09-07; verbatim quotes live in `SURFACE_ADVISORY_SOURCES_V3`)

| Id                                 | URL                                                                                                                    | Used for                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eci-offset-standards`             | https://eci.org/doku.php?id=en:colorstandards:offset                                                                   | “ISO Coated v2 300% (ECI)” is “a good choice in cases where the intended printing condition is not yet known” (default 300 % limit). “Reducing the maximum ink coverage from 350% to 330%, or 300% respectively” (opt-in 330 % limit; see reading note). FOGRA39L, paper types 1 and 2, PSO v3 names. |
| `xrite-extended-gamut`             | https://www.xrite.com/blog/pantone-extended-gamut-guide-helps-printers                                                 | CMYK “can only hit about half of PANTONE MATCHING SYSTEM® Colors” — context only, never a number about a specific color.                                                                                                                                                                              |
| `oaaa-ooh-creative-best-practices` | https://oaaa.org/wp-content/uploads/2022/09/OAAA-Best-Practices-oct20-2021-spreads_2_.pdf                              | “make the white a 10% black” (PDF page 13 of the spreads file, printed folio 24); “Font Size” DISTANCE / MEDIA TYPE / FONT SIZE table (PDF page 14, printed folio 26). Text extracted locally with `pdftotext` from the fetched file.                                                                 |
| `lamar-design-tips`                | https://lamar.com/en/advertising-resources/design-tips                                                                 | “high-color contrast can improve outdoor advertising recall by 38%” — context on the contrast finding.                                                                                                                                                                                                |
| `wcag22-contrast-minimum`          | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html                                                      | Origin of the 4.5:1 number reused as Teul’s out-of-home floor.                                                                                                                                                                                                                                        |
| `nist-sp811-appendix-b9`           | https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9 | Exact factors: foot → 0.3048 m, inch → 2.54 cm.                                                                                                                                                                                                                                                       |

**Reading note on the 330 % limit.** The ECI page states the reduced limits as
“from 350% to 330%, or 300% respectively” for the FOGRA39L coated pair and
names only the 300 % profile explicitly. Teul maps 330 % to “ISO Coated v2
(ECI)” from that “respectively” and keeps it opt-in; the default stays at the
explicitly named 300 % profile.

**Not used.** The widely repeated “1 inch of letter height per 10 feet” rule,
the “10:1 contrast” figure and ranked OOH color-pair lists were not found on a
primary page and are not in the module.

## Teul policy defaults (labelled `Teul policy default` in `SURFACE_ADVISORY_CONSTANTS_V3`)

| Constant                                     | Value | Why                                                                                                                  |
| -------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------- |
| `saturated-screen-chroma-threshold`          |  0.20 | OKLCH chroma above which CMYK reproduction typically shifts. A judgment, not a measured gamut boundary.              |
| `pale-tint-lightness-threshold`              |  0.90 | OKLCH lightness above which a tint tends to drop out in print and on boards.                                         |
| `out-of-home-text-minimum-contrast`          |   4.5 | WCAG 2.2 SC 1.4.3 normal-text floor reused for boards. WCAG is a web standard; applying it to boards is Teul’s call. |
| `out-of-home-near-white-lightness-threshold` |  0.97 | OKLCH lightness above which a board ground counts as all white and the OAAA recommendation is surfaced.              |
| Job → surface mapping                        |     — | See table above.                                                                                                     |

Conventions the module also fixes: hex is normalized to uppercase `#RRGGBB`
(shorthand expanded); OKLCH in evidence is rounded to 3/3/1 decimals while
thresholds compare raw values; OAAA distance ranges are half-open (50 ft falls
in the 50–100 row); distances under 5 ft return `null`.

## Output shape for the UI

`buildSurfaceAdvisoriesV3({ jobs, colors, textPairs?, spots?, inkCoverageLimitId?, heroDiscipline? })`
returns `{ version, surfaces, advisories, summary }` where each advisory is
`{ id, surface, severity: 'info' | 'warning', code, message, evidence }` and
`summary` counts `info`, `warning` and `total` per surface. Codes are the
`SURFACE_ADVISORY_CODES_V3` tuple. Advisories are sorted by surface (canonical
order), then id, then code, then message. `evidence` is JSON-safe.

## Hero-color discipline (added 2026-09-08, benchmark item E1)

The expert benchmark found that real brand systems keep the signature color for
selective emphasis and never let it become a card fill, highlighter or wash.
`heroDisciplineAdvisories({ colors, bindings })` judges the composer's product
role bindings on the `screen-product` surface. The hero is the composer's brand
family (anchor hue within 15° of the Primary, `colorSystemBrandFamilyIdV2`) and
the locked Primary itself; the review model supplies both.

| Code                  | Severity | Fires when                                                                                                                                                                    |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HERO_AS_WASH`        | warning  | A large-fill role (`background`, `surface`) resolves to the hero, or to a color carrying a brand-surface job (`brand-primary`, `marketing-accent`).                           |
| `HERO_SHARE_EXCEEDED` | info     | In one mode the hero carries more than one meaning role (focus, selected, link, status), or more than one product surface role (background, surface, text, border, disabled). |

Every message ends with the rule, “The primary is your hero. Keep it for
emphasis; the neutral ramp carries surfaces.”, and is labelled Teul policy
default. The role lists and the share of one per mode are Teul judgments
(`hero-meaning-role-share-limit`, `hero-surface-role-share-limit` in
`SURFACE_ADVISORY_CONSTANTS_V3`); the sources compared reserve the hero for
emphasis but give no count. The composer itself never assigns the Primary or
its family to `background`, `surface`, `border` or `disabled` (those come from
a measured neutral ramp or near-neutral preserved colors), so `HERO_AS_WASH`
is a guard on the model, pinned by tests, rather than a live failure mode.
Because focus and selected follow the brand family by design, a direction with
a brand family normally carries one `HERO_SHARE_EXCEEDED` note per mode naming
those roles; it states the hero's share, it does not block.

## Declared proportion rule (added 2026-09-08, benchmark item B2)

Expert systems state how much of a surface each tier may take, and the sources
the benchmark compared disagree: “80% neutral foundation, 20% signature
color—never reverse” (a brand-strategy pattern), “60% primary, 30% secondary,
10% accent” (an art-direction framework), primary 75 % / secondary 25 % (a
brand-guidelines anatomy example), White 60 % / Green 30 % / Black 10 % (a
fintech brand's 2020 guidelines), and one brand library that defines
distribution by context and states there is no 60-30-10. A tool must therefore
declare the rule it honours rather than apply one silently.

`COLOR_SYSTEM_PROPORTION_RULE_V3` is that declaration, carried on every review
as `proportionRule` and rendered as “How much of each” above Brand surfaces:

| Tier            | Share       | Roles                                                                                                         |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `neutral`       | 60–80 %     | background, surface, text, border, disabled                                                                   |
| `brand primary` | ≤ 20 %      | brand-primary, focus, selected, link                                                                          |
| `accents`       | ≤ 10 % each | marketing-accent, product-graphics, functional-iconography, categorical-data, sequential-data, diverging-data |
| `status`        | status only | success, warning, error, destructive, information                                                             |

`authority` is `teul-policy-default`; the shares are Teul's, chosen because the
published rules disagree, and are never measured from the file. `sources` lists
the five compared documents by description; none has a public page, so `url`
is omitted rather than invented (`sourcesNote` says so). `note` tells the owner
to substitute their own guideline's rule. The wire validator accepts only this
shape: known tiers, prose shares, an `https://` URL when one is present, and no
unknown keys.

## Status reserves in the composer (added 2026-09-08)

The planner may add conventional status families when a direction owns no hue
inside a meaning range (`contributionId` prefixed `generic-status-reserve-`,
`COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2`). The composer ranks
in-range families for each status role as brand-derived, then reserve, then
generated, and falls back to the nearest hue with the existing warning only
when no family is in range. A reserve serves only its own range, is never the
brand family, and never carries `link`, `focus`, `selected`, product graphics,
marketing or data jobs, whatever eligibility it was granted. Every meaning
role records `meaningSource` (`brand`, `reserve`, `generated`, `nearest`); the
blueprint fails closed when `nearest` disagrees with the range verdict or a
reserve is claimed for a non-status role, and the review's Why block prints
one sentence per role (“success: conventional green added because your
palette has none.”).
