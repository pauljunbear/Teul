# Werner Data Derivation

Status: reviewed independent derivation
Date: 2026-06-06

Teul's Werner dataset is independently derived from public-domain scans of
Patrick Syme's 1821 second edition. It does not depend on a modern recreation
for its bundled transcription, relationships, or digital samples.

## Sources

- Sampling master: Getty Research Institute copy,
  https://archive.org/details/gri_c00033125012743312
- Rights status: `NOT_IN_COPYRIGHT`
- Sampling archive:
  https://archive.org/download/gri_c00033125012743312/gri_c00033125012743312_jp2.zip
- Sampling archive SHA-256:
  `fdc2e5dbd04dec41e46ce85f1406193823c3667c61b0b83b66c76ef6de3da4d9`
- Cross-check copy: Smithsonian Libraries/Biodiversity Heritage Library,
  https://www.biodiversitylibrary.org/item/304442
- Smithsonian status: public domain/CC0

The Getty copy is the sampling master because its color plates are cleaner and
less obstructed than the Smithsonian copy. The painted plates differ between
copies, so Teul does not average them.

## Text

Names, groups, nature references, characteristic markers, and component
descriptions were independently reviewed against the public-domain Getty scan
and cross-checked with the Smithsonian copy and OCR. `src/wernerColors.json`
stores the reviewed source transcription. The application derives display text
only through `scripts/werner-sampling/transcription-audit.json`, which records
every source/display difference, its reason, and evidence location.

The source layer is a semantic transcription, not a diplomatic facsimile.
Printed layout, line breaks, `W.` attribution marks, and incidental typography
are outside the current text model and are documented as such in the audit
policy.

The audit preserves printed inconsistencies instead of silently correcting
them. For example, No. 45 is `Pale Blackish Purple` in the table but `Pale
Bluish Purple` in the component-parts text, and No. 109 is `Clove Brown` in the
table but `Olive Brown` in the component-parts text. Teul displays the table
names while retaining and exposing the conflicting source wording.

Confirmed transcription corrections include the complete `Lemon Yellow`
description, `Anthers of Saffron Crocus`, `Variegated Horse-Shoe Geranium`,
`Lygæus Apterus`, `Arterial Blood Red`, `Red Cobalt Ore`, and `Grosbeak`.
The source spelling `chesnut` is retained in the source transcription and
explicitly normalized to `chestnut` for display.

The modern-only alias fields and inferred related-color graph were removed.
The 1821 book describes component relationships in prose; Teul preserves that
prose instead of generating an undocumented navigation graph.

## Digital Samples

The committed sampling manifest pins:

- Every source plate SHA-256.
- Every color ID from 1 through 110.
- A reviewed center coordinate for each painted swatch.
- A 100 by 100 pixel sample size.

The generator takes the median RGB value of each reviewed square using the
ImageMagick `magick` CLI. It does not resize, denoise, sharpen, white-balance,
or correct against the aged paper. The committed result was reviewed with
ImageMagick 7.1.2-10 Q16-HDRI and Node.js 22.13.0; the manifest records both
versions because decoder changes can affect pixel output.

Regenerate after downloading and extracting the pinned Getty JP2 archive:

```bash
node scripts/werner-sampling/sample.mjs \
  /path/to/gri_c00033125012743312_jp2
```

These values represent the appearance of one aged Getty scan under an assumed
sRGB interpretation. They are not device-independent Werner colors and are not
measurements of the original pigments.
