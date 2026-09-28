# Nonconsecutive PDF table fixture

`harbor-table.pdf` is a fictional technical source. Rebuild with `generate-table.py` using ReportLab. It is independent of the private Crane source; none of that source's text, colors or page artwork is distributed here.

The three 640 × 820 point pages deliberately draw labels before their value cells. Reading PDF text in stream order therefore does not reconstruct the table rows. Numeric authority comes from the explicit label, complete value and checked geometry, with both original source references retained.

- Page 1: two RGB rows, two HEX rows and two unsupported CMYK rows. The second RGB value disagrees with its HEX entry. Expected: four exact observations, including both conflicting specifications. Never convert CMYK or choose a conflict winner.
- Page 2: an extra alpha/channel suffix, two plausible value cells, fractional channels with ambiguous units, and overlapping RGB labels. Expected: no exact colors; a visible table-value gap. A standalone RGB heading adds no value.
- Page 3: one explicit HEX value and a separated RGB row alongside rotated text. Expected: retain the HEX and all source text; report unqualified spatial evidence and require manual confirmation of separated table cells. The current rule is conservative at page scope.

The fixture has fixed PDF metadata. Its original generation is 4,067 bytes with SHA-256 `7bccbd9fb0e504944f33ec54528e1a45463c6cb030726b66c412657b6f96fcf8`. All three rendered pages were inspected for legible source text; deliberate ambiguity remains part of the fixture. Unit tests run the real PDF reader. The existing numeric browser harness covers visible gaps, source highlights and exact offline reopening through Studio.

The original table policy remains bound to extraction version `teul.pdf-evidence.v2-table-1/pdfjs-6.3.289`. New captures use table-2, which additionally supports bounded fragmented expressions; see [fragment fixtures](README-fragments.md). Old captures retain their former admission rules. This fixture proves the mechanism and its limitations; it does not qualify real-source interpretation or design quality.
