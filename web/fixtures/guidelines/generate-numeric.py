"""Rebuild fictional numeric-color fixtures; requires ReportLab and pypdf.

Source text is the numeric authority. Swatches are visual previews only.
The encrypted PDF deliberately uses obsolete deterministic test encryption;
it contains no secrets and is not an encryption implementation example.
"""
from hashlib import sha256
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, ByteStringObject
from reportlab.lib.colors import Color, HexColor
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 640, 820
INK = HexColor("#182E34")
MUTED = HexColor("#52636A")
LINE = HexColor("#DBE2E1")
PAPER = HexColor("#F5F7F6")


def text(c, x, y, value, size=11, bold=False, muted=False):
    c.setFillColor(MUTED if muted else INK)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, value)


def page(c, number, title, subtitle):
    c.setFillColor(PAPER)
    c.rect(0, 0, WIDTH, HEIGHT, stroke=0, fill=1)
    text(c, 40, 777, "HARBOR / NUMERIC COLOR FIXTURE", 10, bold=True, muted=True)
    text(c, 40, 735, title, 25, bold=True)
    text(c, 40, 711, subtitle, 10, muted=True)
    c.setStrokeColor(LINE)
    c.line(40, 690, 600, 690)
    text(c, 40, 41, "Synthetic technical source. Harbor is fictional; this is not an approved brand.", 9, muted=True)
    text(c, 40, 25, "Printed values are authoritative for tests. Swatches are previews only.", 9, muted=True)
    text(c, 580, 25, f"{number} / 5", 9, muted=True)


def swatch(c, x, y, rgb, alpha=1, width=66, height=66):
    c.saveState()
    c.setFillColor(HexColor("#FFFFFF"))
    c.rect(x, y, width, height, stroke=0, fill=1)
    c.setFillColor(Color(*rgb, alpha=alpha))
    c.rect(x, y, width, height, stroke=0, fill=1)
    c.restoreState()


def row(c, y, label, literal, note, rgb, alpha=1):
    swatch(c, 40, y - 46, rgb, alpha)
    text(c, 126, y + 2, label, 13, bold=True)
    text(c, 126, y - 21, literal, 12)
    text(c, 126, y - 44, note, 10, muted=True)


numeric = ROOT / "harbor-numeric.pdf"
c = canvas.Canvas(str(numeric), pagesize=(WIDTH, HEIGHT), invariant=1, pageCompression=1)
c.setTitle("Harbor numeric color extraction fixture")
c.setAuthor("Teul synthetic fixtures")
c.setSubject("Native digital values, precision, unsupported color spaces, and text grouping")

page(c, 1, "Digital color specifications", "Recognize each complete notation without rounding its source value.")
row(c, 642, "Ocean / integer channels", "RGB 18, 110, 120",
    "Opaque sRGB channels on the 0-255 scale.", (18 / 255, 110 / 255, 120 / 255))
row(c, 507, "Mist / fractional channel and alpha", "rgb(12.5 110 120 / 75%)",
    "Keep the fractional first channel and 0.75 opacity.", (12.5 / 255, 110 / 255, 120 / 255), .75)
row(c, 372, "Tide / percentage channels", "rgb(10% 40% 50% / 50%)",
    "Percentage components are not integer channel values.", (.1, .4, .5), .5)
row(c, 237, "Veil / legacy percentage notation", "rgba(10%, 40%, 50%, 25%)",
    "Comma-separated percentages retain 0.25 opacity.", (.1, .4, .5), .25)
c.showPage()

page(c, 2, "Precision and text grouping", "Preserve distinct native values; reconstruct only spatially adjacent items.")
row(c, 642, "Deep A / precise sRGB", "color(srgb 0.123456789012345 0.4 0.5 / 0.875)",
    "Display swatch rounds to the same preview as Deep B.", (.123456789012345, .4, .5), .875)
row(c, 521, "Deep B / distinct precise sRGB", "color(srgb 0.123456789012346 0.4 0.5 / 0.875)",
    "Same rounded preview as Deep A; the source value is different.", (.123456789012346, .4, .5), .875)
text(c, 40, 390, "Joined baseline / four separate text items", 13, bold=True)
# Font changes prevent PDF.js from merging the four native text items automatically.
text(c, 40, 367, "RGB", 12, bold=True)
text(c, 69, 367, "18,", 12)
text(c, 92, 367, "110,", 12, bold=True)
text(c, 122, 367, "120", 12)
text(c, 40, 345, "These four drawString calls share one baseline and small horizontal gaps.", 10, muted=True)
c.setStrokeColor(LINE)
c.line(40, 323, 600, 323)
text(c, 40, 292, "Unrelated list / do not join these lines", 13, bold=True)
text(c, 40, 263, "RGB", 12)
text(c, 40, 239, "18", 12)
text(c, 40, 215, "110", 12)
text(c, 40, 191, "120", 12)
text(c, 180, 239, "Page count", 10, muted=True)
text(c, 180, 215, "Inventory count", 10, muted=True)
text(c, 180, 191, "Reference index", 10, muted=True)
text(c, 40, 150, "The heading and unrelated numbers are separate lines, not a color expression.", 10, muted=True)
c.showPage()

page(c, 3, "Mixed spaces and a conflict", "Retain unsupported print or wide-gamut evidence without inventing conversion.")
text(c, 40, 650, "Print Ocean / actual DeviceCMYK swatch", 13, bold=True)
c.saveState()
c.setFillColorCMYK(.85, .25, .35, .10)
c.rect(40, 538, 94, 82, stroke=0, fill=1)
c.restoreState()
text(c, 153, 595, "CMYK 85, 25, 35, 10", 12)
text(c, 153, 572, "DeviceCMYK fill is intentionally present in the PDF.", 10, muted=True)
text(c, 153, 552, "No ICC-based conversion or RGB equivalence is supplied.", 10, muted=True)
text(c, 40, 490, "Spot reference / named print ink", 13, bold=True)
text(c, 40, 466, "PANTONE 7716 C", 12)
text(c, 40, 444, "A named specification only; no RGB value or spot-ink paint is supplied.", 10, muted=True)
text(c, 40, 400, "Wide-gamut accent / printed specification", 13, bold=True)
text(c, 40, 376, "color(display-p3 0.1 0.8 0.3)", 12)
text(c, 40, 354, "Do not relabel this expression as sRGB or infer a conversion from its name.", 10, muted=True)
c.setStrokeColor(LINE)
c.line(40, 328, 600, 328)
text(c, 40, 299, "Ocean / conflicting digital specifications", 13, bold=True)
swatch(c, 40, 187, (18 / 255, 110 / 255, 120 / 255), width=74, height=74)
swatch(c, 338, 187, (19 / 255, 110 / 255, 120 / 255), width=74, height=74)
text(c, 128, 240, "Ocean", 11, bold=True)
text(c, 128, 216, "HEX #126E78", 12)
text(c, 426, 240, "Ocean", 11, bold=True)
text(c, 426, 216, "RGB 19, 110, 120", 12)
text(c, 40, 154, "Both values are printed under Ocean. Preserve both and flag the disagreement.", 10, muted=True)
c.showPage()

page(c, 4, "Invalid and ambiguous notation", "None of these rows is a complete, in-range color value for automatic admission.")
invalid = [
    ("Integer out of range", "rgb(256 110 120)"),
    ("Negative channel", "rgb(-1 110 120)"),
    ("Percentage out of range", "rgb(10% 101% 50%)"),
    ("Alpha out of range", "rgb(18 110 120 / 125%)"),
    ("sRGB component out of range", "color(srgb 1.1 0.4 0.5)"),
    ("Missing component", "rgb(18, 110)"),
    ("Mixed separator grammar", "rgb(18, 110 120)"),
    ("No declared component units", "RGB 0.1 / 0.4 / 0.5"),
    ("No closing parenthesis", "color(srgb 0.1 0.4 0.5"),
    ("Unlabeled numbers", "18, 110, 120"),
]
for index, (label, literal) in enumerate(invalid):
    y = 645 - index * 53
    text(c, 40, y, label, 11, bold=True)
    text(c, 300, y, literal, 11)
    c.setStrokeColor(LINE)
    c.line(40, y - 18, 600, y - 18)
text(c, 40, 90, "Retain the source text and describe uncertainty. Do not clamp, repair, or guess.", 10, muted=True)
c.showPage()

page(c, 5, "Unselected page sentinel", "Tests selecting pages 1-4 must not read or import anything from this page.")
text(c, 40, 631, "UNSELECTED_NUMERIC_SENTINEL", 16, bold=True)
text(c, 40, 590, "HEX #AD1234", 16)
text(c, 40, 553, "rgb(173 18 52 / 37%)", 16)
text(c, 40, 510, "This page exists only to test the selected-page boundary.", 11, muted=True)
swatch(c, 40, 316, (173 / 255, 18 / 255, 52 / 255), width=220, height=145)
c.save()

reader = PdfReader(numeric)
writer = PdfWriter()
writer.clone_document_from_reader(reader)
# Fixed IDs plus RC4 make the password-blocking fixture reproducible. Never use this for secrets.
identifier = sha256(numeric.read_bytes()).digest()[:16]
writer._ID = ArrayObject([ByteStringObject(identifier), ByteStringObject(identifier)])
writer.encrypt(user_password="harbor-test-only", owner_password="harbor-owner-test-only", algorithm="RC4-128")
encrypted = ROOT / "harbor-encrypted.pdf"
with encrypted.open("wb") as output:
    writer.write(output)

for file in (numeric, encrypted):
    print(f"{file.name} bytes={file.stat().st_size} sha256={sha256(file.read_bytes()).hexdigest()}")
