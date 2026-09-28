# Numeric PDF evidence

The standalone Studio now imports printed HEX, integer RGB notation, CSS `rgb()`/`rgba()`, and CSS `color(srgb ...)` from selected PDF pages. Fractional channels and alpha use Teul's existing native-sRGB model; the original literal and source location remain attached. Two values that round to the same hex preview stay separate observations. This is partial local implementation of TASK-002 and TASK-004, not full PDF or product acceptance.

The source parser deliberately accepts a narrower numeric subset than CSS rendering. Out-of-range values, relative colors, `calc()`, incomplete expressions, and fractional RGB notation without explicit channel units stay text evidence. Labeled RGB uses integer bytes; fractional byte channels require `rgb()`, and normalized channels require `color(srgb ...)`. CMYK, Pantone and Display P3 specifications stay visible in source text. No profile conversion, renderer sampling or invented digital equivalence is claimed. Original decimal text is retained; normalized channels use JavaScript numbers, matching the existing color engine.

Adjacent PDF items can form a color only when their order, baseline, height, spacing and complete expression agree. The capture retains every contributing text reference and the union of their source bounds. Both extraction and reopening reject omitted numeric suffixes and fragments inside unfinished or unsupported expressions. Unrelated lines cannot supply missing channels.

## Compatibility and reuse

| Record                  | Behavior                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Capture V1              | Original strict hex-only reader and exact values remain unchanged.                                                       |
| Capture V2              | Strict stated-digital observations bind syntax, literal, native value, source text and geometry.                         |
| Review V1/V2            | Original envelopes and model hashes replay unchanged through shared model assembly.                                      |
| Review V3               | Uses Capture V2 and the existing names, families, source scales and relationship draft.                                  |
| Project V1/V2           | Reopen through their original readers. Fixtures generated from pre-change commit `edbac86` verify byte-identical replay. |
| Project V3              | Saves the native capture, draft, applied review and selected design; verifies all bindings on reopen.                    |
| Unknown project version | Retained read-only; cannot replace the current open work.                                                                |

The import path no longer converts every source color back through an eight-bit hex code. It uses `buildColorSystemSrgbValueV1` and the shared review/model compiler. Generation and portable exports continue through the existing engine. Transparent values remain transparent; the existing opaque-gradient restriction stays enforced.

Optional assisted review receives bounded notation and cited source text. Its result can name or group existing observations; it cannot overwrite their numeric values. Very long notation stays complete in source text rather than exceeding the service's shorter display field.

## Verification

The [source-bound check receipt](numeric-evidence-checks.json) records commands, runtimes and exact file hashes. The fictional [Harbor fixtures](../../../web/fixtures/guidelines/README-numeric.md) exercise native precision, alpha, split text, unsupported spaces, conflicting stated values, malformed input, unselected pages and encrypted-file rejection. They establish technical behavior, not brand quality.

Browser verification covers the real Studio import/review/download controls, native model values, source highlights, keyboard use at 390px, byte-identical offline project/review recovery, preservation of open work after encrypted input, and existing opaque SVG/CSS/JSON generation. No external source upload, provider call, Figma mutation or source publication is part of these checks. The [desktop review](numeric-evidence-desktop.png) and [mobile source highlight](numeric-evidence-mobile.png) show the synthetic fixture; they are technical evidence, not a recommended brand palette.

Independent simplify reviews covered reuse, quality and efficiency against `edbac86`. The reviews found and drove fixes for adjacent numeric suffixes and preceding unfinished expressions. Existing native-value, hashing, PDF bounds and model code are reused; versioned project codecs remain explicit to protect replay.

## Remaining

Full AC-001 and AC-004 remain open. Scanned/manual confirmation, labeled renderer-derived appearance, conflict resolution, multiple sources, Figma/website adapters, real-source interpretation evaluation, durable project storage/refresh, remaining supporting-color and gradient work, human quality acceptance and release gates remain in the [engineering plan](../../plans/2026-09-25-brand-guideline-import-plan.md). Differing stated values are retained here; automatic conflict identification and resolution are not implemented by this slice. No integration into shipping `main`, push, deployment, or full goal completion is claimed.
