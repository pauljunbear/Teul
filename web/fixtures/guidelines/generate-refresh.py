"""Deterministic fictional PDF revisions for source-refresh browser checks. Requires ReportLab."""
from pathlib import Path
from reportlab.pdfgen import canvas

root = Path(__file__).resolve().parent
for variant in ('initial', 'color', 'note', 'rule'):
    c = canvas.Canvas(str(root / f'refresh-{variant}.pdf'), pagesize=(620, 550), invariant=1)
    c.setFont('Helvetica', 12)
    c.drawString(40, 500, 'Synthetic color guideline. Not a real brand.')
    c.drawString(40, 440, f"Ocean HEX {'#136E78' if variant == 'color' else '#126E78'}")
    c.drawString(40, 390, 'Ink HEX #182E34')
    c.drawString(40, 340, 'Do not use gradients.' if variant == 'rule' else 'Brand artwork.')
    c.showPage()
    c.setFont('Helvetica', 12)
    c.drawString(40, 500, 'Revised editorial note.' if variant == 'note' else 'Original editorial note.')
    c.save()
