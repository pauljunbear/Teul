# Fragmented RGB evidence fixture

`harbor-fragments.pdf` is an independently authored technical fixture. Its two pages contain fictional values and no private Robinhood source artwork. Rebuild with `generate-fragments.py` and ReportLab; fixed metadata makes the output deterministic. The current file is 3,358 bytes, SHA-256 `9a952fbaa0dee28d4cab31efc28791f45eade0bc71926d9dda02d640b7754e41`.

Page 1 has three explicit RGB expressions and three HEX statements. Each RGB expression occupies six native text items: its label, three channels and two separators. Alternating separator fonts prevent PDF.js from coalescing those fragments. Labels and values occur in different stream positions. One RGB statement intentionally disagrees with its HEX statement; retain both.

Page 2 has five HEX statements and five unsupported RGB rows: an additional alpha/channel, a missing channel, fractional channels without explicit units, an attached alpha label and mixed separators. Keep the source text and produce a page-specific coverage gap, with no automatic RGB observations.

Expected total: eleven digital statements, comprising eight HEX and three RGB. Both final page renders were inspected at 96 dpi for legibility and clipping. Unit tests use the actual PDF reader; the production browser test covers the warning, all source references, union highlight bounds, mobile layout and exact offline reopening.

New captures use `teul.pdf-evidence.v2-table-2/pdfjs-6.3.289`. The saved table-1 reader retains its original rules. The new spaced-hyphen grammar applies only to a complete versioned PDF spatial witness; it does not change manual, CSS or earlier-capture grammar. This fixture is technical evidence, not a real-brand accuracy or design-quality rating.
