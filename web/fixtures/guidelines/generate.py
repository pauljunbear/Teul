"""Rebuild the fictional Harbor technical fixtures. Requires reportlab and Pillow."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
COLORS = [('Ocean', '#126E78'), ('Sand', '#ECBF74'), ('Paper', '#F4EFE6'), ('Ink', '#182E34')]

def palette(c):
    c.setFont('Helvetica-Bold', 22); c.drawString(40, 500, 'Harbor color guidelines')
    c.setFont('Helvetica', 11); c.drawString(40, 474, 'Synthetic technical fixture. Not a real brand.')
    for i,(name,code) in enumerate(COLORS):
        x=40+i*142; c.setFillColor(HexColor(code));c.rect(x,274,126,128,fill=1,stroke=0)
        c.setFillColor(HexColor('#182E34')); c.setFont('Helvetica-Bold',12); c.drawString(x,248,name)
        c.setFont('Helvetica',11);c.drawString(x,226,'HEX '+code)
    c.setFont('Helvetica',11);c.drawString(40,178,'Ocean and Sand are equal accent families.')
    c.drawString(40,156,'Paper is the light background. Ink is the text color.')

def pdf(name): return canvas.Canvas(str(ROOT/name),pagesize=(620,550),invariant=1)
c=pdf('harbor-native.pdf');palette(c);c.showPage()
c.setFont('Helvetica-Bold',22);c.drawString(40,500,'Harbor usage rules')
for i,line in enumerate([
    'Do not use Ocean and Sand together for text and background.',
    'Do not use gradients in product controls.',
    'Gradients between existing colors may be used in brand artwork.',
    'New supporting colors are proposals; keep existing values unchanged.',
]):
    c.setFont('Helvetica',12);c.drawString(40,430-i*52,line)
c.showPage();c.setFont('Helvetica',16);c.drawString(40,450,'Unselected page: HEX #AD1234');c.save()

image=Image.new('RGB',(1240,1100),'white');draw=ImageDraw.Draw(image)
draw.text((80,100),'Scanned Harbor source',fill='black',font_size=44)
draw.rectangle((80,260,400,580),fill='#126E78')
draw.text((80,650),'Ocean HEX #126E78',fill='black',font_size=34)
raw=BytesIO();image.save(raw,format='PNG');raw.seek(0)
c=pdf('harbor-scanned.pdf');c.drawImage(ImageReader(raw),0,0,620,550);c.save()

c=pdf('harbor-dense.pdf');palette(c);c.showPage()
c.setFont('Helvetica-Bold',16);c.drawString(20,525,'Oversized palette - narrow this review')
c.setFont('Helvetica',8)
for i in range(257): c.drawString(20+(i//43)*99,500-(i%43)*11,f'HEX #{i:06X}')
c.save()
c=pdf('harbor-scale.pdf')
c.setFont('Helvetica-Bold',22);c.drawString(40,500,'Harbor source scale')
c.setFont('Helvetica',11);c.drawString(40,474,'Synthetic technical fixture. Not a real brand.')
for i,(name,position,code) in enumerate([
    ('Dawn',100,'#F4EFE6'), ('Tide',600,'#126E78'), ('Deep',900,'#182E34'),
]):
    x=40+i*190;c.setFillColor(HexColor(code));c.rect(x,280,164,140,fill=1,stroke=0)
    c.setFillColor(HexColor('#182E34'));c.setFont('Helvetica-Bold',12);c.drawString(x,252,name)
    c.setFont('Helvetica',11);c.drawString(x,230,f'Position {position} / HEX {code}')
c.drawString(40,190,'Dawn, Tide and Deep form the Harbor scale in that order.')
c.drawString(40,160,'Harbor scale colors must appear with Tide in brand artwork.')
c.drawString(40,130,'Unlisted intermediate positions are available for proposed shades.')
c.save()
print('Generated native, scanned, dense and source-scale synthetic guidelines.')
