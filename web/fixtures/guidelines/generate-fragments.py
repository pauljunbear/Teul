"""Fictional RGB fragment cases; no private source artwork or values are copied."""
from pathlib import Path
from hashlib import sha256
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
root = Path(__file__).resolve().parent
out = root / 'harbor-fragments.pdf'
c = canvas.Canvas(str(out), pagesize=(640, 820), invariant=1, pageCompression=1)
c.setTitle('Harbor fragmented RGB evidence fixture')
c.setAuthor('Teul synthetic fixtures')
def text(x, y, value, size=11, bold=False):
    c.setFillColorRGB(.07,.15,.17)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(x,y,value)
def page(n,title,subtitle):
    text(40,780,'HARBOR / FICTIONAL SOURCE FOR TECHNICAL TESTS',10,True)
    text(40,738,title,22,True)
    text(40,710,subtitle,10)
    text(40,28,'Technical evidence only. These colors are not a recommended brand palette.',9)
    text(580,28,str(n),10)
def row(y,parts):
    text(40,y,'RGB:',11,True)
    text(40,y-20,'HEX',11,True)
    text(110,y-20,'#126E78',11)
    x=110
    for index,part in enumerate(parts):
        bold=index%2==1
        text(x,y,part,bold=bold)
        x+=stringWidth(part,'Helvetica-Bold' if bold else 'Helvetica',11)+6
page(1,'One expression, several text objects','Retain every label, channel and separator as source evidence.')
text(40,657,'Ocean / same RGB and HEX value',12,True)
row(627,['018','-','110','-','120'])
text(40,537,'Ocean variation / conflicting RGB and HEX values',12,True)
row(507,['019','-','110','-','120'])
text(40,417,'A comma-separated fragmented expression',12,True)
row(387,['018',',','110',',','120'])
text(40,285,'The conflict remains visible. A HEX statement does not override RGB.',11)
c.showPage()
page(2,'Incomplete rows stay unresolved','These rows must produce a coverage warning and no RGB color.')
for y,title,parts in [
 (637,'Fourth channel',['018','-','110','-','120','/ 50%']),
 (527,'Missing final channel',['018','-','110']),
 (417,'Fractional channels without declared units',['0.1','-','0.4','-','0.5']),
 (307,'An attached alpha label',['018','-','110','-','120','alpha .5']),
 (197,'Mixed separators',['018','-','110','/','120']),
]:
    text(40,y+30,title,12,True)
    row(y,parts)
c.save()
print(f'{out.name} bytes={out.stat().st_size} sha256={sha256(out.read_bytes()).hexdigest()}')
