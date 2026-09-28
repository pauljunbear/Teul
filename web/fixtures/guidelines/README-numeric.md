# Numeric PDF fixtures

These are fictional technical fixtures for Teul's PDF extraction tests. Harbor is not a real client or approved brand. Printed color expressions are the source of numeric truth; swatches are visual previews. No result from these fixtures establishes extraction accuracy on real guidelines or design quality.

Rebuild only these two files with `python3 generate-numeric.py`. This generator leaves the older fixtures and `generate.py` unchanged. It requires ReportLab and pypdf; verification used ReportLab 4.4.9 and pypdf 6.10.0. The PDFs use a 640 × 820 point page, native text, standard Helvetica fonts, and fixed creation/modification metadata (`2000-01-01T00:00:00Z`). Rebuilding twice produced identical bytes.

| File                   | Pages                              | Bytes | SHA-256                                                            |
| ---------------------- | ---------------------------------- | ----- | ------------------------------------------------------------------ |
| `harbor-numeric.pdf`   | 5                                  | 8,220 | `b583664ade57f7a03a825a97f0d68e148eba2d5b25cb7c2aebcee6e925465925` |
| `harbor-encrypted.pdf` | 5 after authorized test decryption | 8,610 | `45f96f8c2eea91adc51f2bcf6ecdfb086025b1942f541d4a20fec464466da828` |

Coordinates below are PDF points measured from the bottom-left corner. Each coordinate locates the expression's text baseline, not a pixel or top-left highlight rectangle. Convert through the PDF viewport when asserting displayed evidence locations.

## Page 1: complete digital values

| Label | Exact source expression    | Baseline `(x, y)` | Normalized sRGB components     | Alpha  |
| ----- | -------------------------- | ----------------- | ------------------------------ | ------ |
| Ocean | `RGB 18, 110, 120`         | `(126, 621)`      | `[18/255, 110/255, 120/255]`   | `1`    |
| Mist  | `rgb(12.5 110 120 / 75%)`  | `(126, 486)`      | `[12.5/255, 110/255, 120/255]` | `0.75` |
| Tide  | `rgb(10% 40% 50% / 50%)`   | `(126, 351)`      | `[0.1, 0.4, 0.5]`              | `0.5`  |
| Veil  | `rgba(10%, 40%, 50%, 25%)` | `(126, 216)`      | `[0.1, 0.4, 0.5]`              | `0.25` |

Keep channel units, the original expression, fractional channels, and alpha. A display hex is not a replacement for the native value. In particular, Tide and Veil have identical RGB components but different alpha. The rendered transparent swatches sit on a white preview rectangle; do not mistake the composited pixels for their stated numeric values.

## Page 2: precision and text grouping

| Case            | Exact source expression                         | Baseline `(x, y)`                                   | Expected behavior                                                                                                                               |
| --------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep A          | `color(srgb 0.123456789012345 0.4 0.5 / 0.875)` | `(126, 621)`                                        | Preserve every stated component digit and alpha `0.875`.                                                                                        |
| Deep B          | `color(srgb 0.123456789012346 0.4 0.5 / 0.875)` | `(126, 500)`                                        | Retain as a distinct source value from Deep A.                                                                                                  |
| Joined baseline | `RGB`, `18,`, `110,`, `120`                     | `(40, 367)`, `(69, 367)`, `(92, 367)`, `(122, 367)` | Adjacent items form the single expression `RGB 18, 110, 120`; retain all contributing evidence references and their combined geometry.          |
| Unrelated lines | `RGB`; `18`; `110`; `120`                       | `(40, 263)`; `(40, 239)`; `(40, 215)`; `(40, 191)`  | Never concatenate these separate lines into a color. Labels at `x=180` identify the numbers as unrelated page, inventory, and reference counts. |

Deep A and Deep B both round to the uncomposited 8-bit display hex `#1F6680`, but differ by `0.000000000000001` in the stated first component. They must not be deduplicated by display hex. The distinction is in the printed source, not in an assertion about a reader's ability to distinguish the swatches visually.

The joined-baseline fixture alternates regular and bold Helvetica text objects so PDF.js does not combine them automatically. PDF.js 6.3.289 returned four nonblank text items exactly: `RGB`, `18,`, `110,`, `120`, all at `y=367`, with widths `26.664`, `16.68`, `23.352`, and `20.016`. A generator that merely calls `drawString` four times using one font does not guarantee this test: PDF.js merges those adjacent items. Do not remove the font alternation without checking the actual PDF.js item output.

## Page 3: unsupported spaces and conflicting stated values

| Case              | Exact source expression         | Baseline `(x, y)` | Expected behavior                                                                                                             |
| ----------------- | ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Print Ocean       | `CMYK 85, 25, 35, 10`           | `(153, 595)`      | Preserve unsupported print-color evidence. Do not convert to an exact sRGB token.                                             |
| Named print ink   | `PANTONE 7716 C`                | `(40, 466)`       | Preserve the named specification; no RGB equivalence is stated.                                                               |
| Wide-gamut accent | `color(display-p3 0.1 0.8 0.3)` | `(40, 376)`       | Preserve the stated color space. If unsupported, emit a gap; do not relabel the components as sRGB.                           |
| Ocean, left       | `HEX #126E78`                   | `(128, 216)`      | Preserve this exact stated digital value and its source location.                                                             |
| Ocean, right      | `RGB 19, 110, 120`              | `(426, 216)`      | Preserve this different exact stated value under the same Ocean label; surface the conflict instead of choosing one silently. |

The print swatch is an actual DeviceCMYK painting operation at `(40, 538, 94, 82)`. Its native content stream contains `0.85 0.25 0.35 0.1 k`. No ICC profile or reliable conversion to a digital token is supplied. The Pantone row is a textual specification only, not a Separation/DeviceN spot-color object. The Display-P3 row is a textual specification only, not an ICCBased wide-gamut painting. This distinction is intentional and must remain visible in test claims.

## Page 4: invalid or ambiguous inputs

The expression column starts at `x=300`; baselines are `645 - 53 × rowIndex`. No row should silently produce an admitted exact color. Preserve readable text and describe the unsupported or ambiguous case. Do not repair punctuation, clamp components, borrow numbers from another row, or invent a unit convention.

| Row index | Exact expression          | Reason                                                          |
| --------- | ------------------------- | --------------------------------------------------------------- |
| 0         | `rgb(256 110 120)`        | Integer channel exceeds the stated supported range.             |
| 1         | `rgb(-1 110 120)`         | Negative channel.                                               |
| 2         | `rgb(10% 101% 50%)`       | Percentage channel exceeds the supported range.                 |
| 3         | `rgb(18 110 120 / 125%)`  | Alpha exceeds the supported range.                              |
| 4         | `color(srgb 1.1 0.4 0.5)` | Normalized component exceeds the supported range.               |
| 5         | `rgb(18, 110)`            | Missing third component.                                        |
| 6         | `rgb(18, 110 120)`        | Mixed comma and whitespace separator grammar.                   |
| 7         | `RGB 0.1 / 0.4 / 0.5`     | Unsupported slash-separated bare notation with ambiguous units. |
| 8         | `color(srgb 0.1 0.4 0.5`  | Missing closing parenthesis.                                    |
| 9         | `18, 110, 120`            | Unlabeled numbers, not a self-contained color declaration.      |

These are source-admission expectations, not a claim that CSS renderers reject every out-of-range expression. Browser clamping must not erase the original guideline values or uncertainty.

## Page 5: unselected-page boundary

Page 5 contains `UNSELECTED_NUMERIC_SENTINEL`, `HEX #AD1234` at `(40, 590)`, and `rgb(173 18 52 / 37%)` at `(40, 553)`. A capture selecting pages 1-4 must contain none of this page's text, colors, or images. Its omission remains visible in aggregate coverage.

Across pages 1-3 there are nine supported stated digital-value occurrences: four on page 1, three on page 2 including the joined baseline, and two on page 3. Equivalent Ocean occurrences may share a normalized value, but their original expressions and individual evidence locations remain distinct. Page 2's unrelated lines and page 4 must contribute no admitted exact values.

## Encrypted-source behavior

`harbor-encrypted.pdf` is an encrypted copy of the same five-page fixture. Its user password is `harbor-test-only`; its owner password is `harbor-owner-test-only`. These are public fixture credentials, not secrets. It deliberately uses obsolete RC4-128 with fixed IDs solely for deterministic password-blocking tests; this is not production encryption guidance.

Teul should report that an unlocked copy is needed without collecting, storing, or sending a password. PDF.js 6.3.289 rejects the encrypted fixture without a password with `PasswordException`, code `1`. Independent pypdf verification rejected a wrong password, accepted the fixture user password, recovered five pages, and confirmed their extracted text matches the numeric source. A parser test must not decrypt automatically merely because the test password is documented.

## Verification performed

`legacy-project-v3.json` preserves an actual browser-downloaded V3 project from commit `949f540d57a183e7d9cf30fd9a939816006451c3`, before the reviewed-value compiler refactor. Its 39,072 original bytes have SHA-256 `11a27d87e3d714039f246c9edacda42f9782d918865d020d77af773c0eaf39db`. New readers must reproduce its serialized content and hashes exactly. Do not regenerate this compatibility fixture with the new compiler.

- Rendered all five numeric pages with bundled Poppler and inspected them at 1,200-pixel height. Text, swatches, page labels, and deliberate split lines were legible without overlap or clipping. Re-rendered and inspected page 2 after making its PDF.js item boundary explicit.
- Inspected native text and positions using PDF.js 6.3.289, including the four split items and separate unrelated lines.
- Inspected the native DeviceCMYK content-stream operator with pypdf.
- Verified encrypted-source rejection and authorized test decryption as described above.
- Rendered all five encrypted pages using the public fixture password and compared their pixels with the numeric source. All five were identical at 937 × 1,200 pixels.
- Rebuilt both files and verified identical byte counts and SHA-256 hashes. No real company source, provider inference, network request, or visual-quality acceptance is part of this fixture proof.
