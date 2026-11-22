# Data Changelog

## 2026-09-24 - Lossless Radix storage

- Packed the 62 pinned Radix solid scales into concatenated six-digit sRGB
  literals and shared family construction to make room for source review in the
  offline candidate interface.
- Preserved the complete runtime object byte for byte, including all 744 color
  values, family order, step order, names, paired neutrals and hue metadata.
- The existing direct comparison with `@radix-ui/colors@3.0.0` and pinned payload
  SHA-256 remain the integrity gates. No source value or matching policy changed.

## 2026-06-07 - Werner Transcription Audit

- Restored the omitted sentence in the `Lemon Yellow` component description.
- Corrected confirmed table and component-text transcription errors against the
  public-domain Getty scan and cross-checked them with the Smithsonian copy.
- Restored printed `chesnut` wording in the source transcription while keeping
  the normalized `chestnut` spelling for display.
- Added a machine-readable ledger for every source/display difference,
  including the source conflicts for `Pale Blackish Purple`, `Kings Yellow`,
  and `Clove Brown`.
- Exposed recorded source/display differences in the Werner detail UI and
  added tests that reject unrecorded normalizations.

## 2026-06-06 - Werner Independent Public-Domain Derivation

- Replaced Werner hex values with reproducible median samples from the pinned
  Getty Research Institute public-domain 1821 scan.
- Independently reviewed names, groups, nature references, characteristic
  markers, and component descriptions against the public-domain source.
- Restored the complete `Lemon Yellow` component description.
- Corrected source-facing display names for `Celindine Green` and
  `King's Yellow`.
- Removed modern-only aliases and inferred related-color relationships.
- Added source archive and plate hashes, reviewed sample coordinates, a
  regeneration script, provenance tests, and derivation documentation.

These values describe the appearance of one aged scan. They are not measured
historical pigments or device-independent Werner colors.
