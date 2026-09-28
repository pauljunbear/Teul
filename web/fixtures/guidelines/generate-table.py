"""Build a fictional table fixture with independent PDF drawing and reading orders."""
from pathlib import Path
from hashlib import sha256
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

root = Path(__file__).resolve().parent
out = root / 'harbor-table.pdf'
c = canvas.Canvas(str(out), pagesize=(640, 820), invariant=1, pageCompression=1)
c.setTitle('Harbor nonconsecutive table evidence fixture')
c.setAuthor('Teul synthetic fixtures')

def text(x, y, value, size=10, bold=False):
    c.setFillColorRGB(.07, .15, .17)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(x, y, value)

def page(n, title, subtitle):
    text(40, 780, 'HARBOR / FICTIONAL SOURCE FOR TECHNICAL TESTS', 10, True)
    text(40, 739, title, 23, True)
    text(40, 711, subtitle, 10)
    text(40, 28, 'Printed values are test evidence. This is not a recommended brand palette.', 9)
    text(580, 28, str(n), 10)

page(1, 'Table cells in a different drawing order', 'RGB labels and values are separate cells. Keep each original source reference.')
text(40, 670, 'Ocean', 13, True)
text(340, 670, 'Ocean alternative / conflicting channels', 12, True)
# Drawing all labels before any values prevents text-stream adjacency from supplying authority.
for x in (40, 340):
    for y, label in ((636, 'RGB'), (612, 'HEX'), (588, 'CMYK')):
        text(x, y, label, 9, True)
for x, rgb, hex_value in ((100, '18 / 110 / 120', '#126E78'), (400, '19 / 110 / 120', '#126E78')):
    text(x, 636, rgb, 9)
    text(x, 612, hex_value, 9)
    text(x, 588, '85 / 25 / 35 / 10', 9)
text(40, 516, 'The second RGB and HEX specifications disagree. Neither replaces the other.', 11)
text(40, 486, 'Do not turn CMYK cells or unrelated numbers into RGB values.', 11)
c.showPage()

page(2, 'Ambiguous rows require source review', 'None of the following RGB rows should produce an automatic exact color.')
for y, heading in ((650, 'An attached fourth channel'), (540, 'Two possible value cells'), (430, 'Fractional channels without declared units'), (320, 'Two overlapping labels')):
    text(40, y + 25, heading, 12, True)
    text(40, y, 'RGB', 9, True)
text(40, 320, 'RGB', 9)
# Values are drawn after all labels, matching the nonconsecutive source-order challenge.
value = '18 / 110 / 120'
text(100, 650, value, 9)
text(100 + stringWidth(value, 'Helvetica', 9) + 2, 650, '/ 50%', 9, True)
text(90, 540, '1 / 2 / 3', 9)
text(127, 540, '4 / 5 / 6', 9, True)
text(100, 430, '0.1 / 0.4 / 0.5', 9)
text(100, 320, '18 / 110 / 120', 9)
text(40, 212, 'RGB', 12, True)
text(40, 185, 'A standalone section heading supplies no numeric value.', 10)
c.showPage()

page(3, 'Retain nonhorizontal text limitations', 'Rotated or skewed text makes separate-cell geometry unqualified on this page.')
text(100, 636, 'RGB', 9, True)
text(100, 612, 'HEX', 9, True)
text(160, 636, '18 / 110 / 120', 9)
text(160, 612, '#126E78', 9)
c.saveState()
c.translate(40, 430)
c.rotate(90)
text(0, 0, 'Rotated source caption', 10)
c.restoreState()
text(100, 510, 'Keep the explicit HEX literal and source text. Leave the table RGB unresolved.', 10)
c.save()
print(f'{out.name} bytes={out.stat().st_size} sha256={sha256(out.read_bytes()).hexdigest()}')
