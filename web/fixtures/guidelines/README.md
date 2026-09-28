# Guideline fixtures

`harbor-native.pdf`, `harbor-scanned.pdf`, and `harbor-dense.pdf` are synthetic technical fixtures made for Teul. Harbor is a fictional identity. They are not brand precedent or evidence of an approved real system. Rebuild them with `python3 generate.py` using Pillow and ReportLab. The generator uses deterministic PDF metadata.

The native fixture contains four exact printed hex values on page 1, scoped usage prose on page 2, and an extra color on page 3 to prove that unselected content is not imported. The raster-only fixture has no extractable text and must remain a visual/manual-interpretation gap rather than silently produce exact tokens.

Private real-source PDFs and rendered pages remain outside committed fixtures. The initial real-source proof uses the previously admitted Crane guideline, verified against its recorded SHA-256. Its source does not permit new colors or gradients without an explicit exception; extraction is not permission to violate those rules.

The dense fixture has a valid four-color first page and 257 printed colors on its second page. A rejected recapture must preserve the previous evidence and review together.

`harbor-scale.pdf` supplies a separate three-anchor scale: Dawn at 100, Tide at 600 and Deep at 900. Its synthetic source rule requires the Harbor colors to appear with Tide in brand artwork. The browser proof manually reviews those names, positions and relationship, adds an intermediate shade, and explicitly renews the rule against the expanded family. No brand-quality claim derives from this fixture.

`refresh-initial.pdf`, `refresh-color.pdf`, `refresh-note.pdf` and `refresh-rule.pdf` are deterministic synthetic revisions. Rebuild them with `python3 generate-refresh.py` (ReportLab). They retain the same page coordinates while changing one source color, unrelated page text, or a usage restriction. The browser imports each as `Brand.pdf` so a file-name change does not mask the evidence-dependency check. They are engineering fixtures, not a visual benchmark.

`statement-review.ts` authors PDF text observations for grouping and saved-project UI tests; it does not claim PDF extraction. It includes four identical notices with an intentionally different existing decision, a similar but unequal notice, and a split qualifier beside an unrelated column. The statement-review browser harness also authors a synthetic native capture with repeated text, distinct mode scopes and a long quotation. Actual PDF import and source highlighting are checked separately against the private OpenWeb development case. No fixture supplies brand authority or human acceptance.
