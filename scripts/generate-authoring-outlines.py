"""Compile the three fixed control labels to bounded artwork; never redistribute a font.

Usage: python generate-authoring-outlines.py PATH_TO_ARIAL_TTF OUTPUT_JSON
Requires fonttools==4.60.0. The resulting path coordinates, source digest and approximation
policy are checked in. Runtime generation does not depend on Python or the installed font.
"""
import hashlib
import json
import math
import sys
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

FONT_SIZE = 16
FLATNESS = 0.125
GRID = 64
FONT_SHA256 = '525979822591a3447cfc49d943d6f7683508e25543407871c0ed8fed05fd2bd9'


class OutlinePen(BasePen):
    def __init__(self, glyphs, scale, offset):
        super().__init__(glyphs)
        self.scale = scale
        self.offset = offset
        self.contours = []
        self.points = []

    def point(self, point):
        return (point[0] * self.scale + self.offset, -point[1] * self.scale)

    def _moveTo(self, point):
        self.points = [self.point(point)]

    def _lineTo(self, point):
        self.points.append(self.point(point))

    def _curveToOne(self, a, b, c):
        start = self.points[-1]
        a, b, c = self.point(a), self.point(b), self.point(c)
        self.flatten(start, a, b, c)

    def _qCurveToOne(self, control, end):
        start = self.points[-1]
        control, end = self.point(control), self.point(end)
        a = tuple(start[i] + (control[i] - start[i]) * 2 / 3 for i in (0, 1))
        b = tuple(end[i] + (control[i] - end[i]) * 2 / 3 for i in (0, 1))
        self.flatten(start, a, b, end)

    def flatten(self, p0, p1, p2, p3, depth=0):
        # Bound both interior control points against the chord segment, including overshoot.
        def distance(point):
            dx, dy = p3[0] - p0[0], p3[1] - p0[1]
            denominator = dx * dx + dy * dy
            t = max(0, min(1, ((point[0] - p0[0]) * dx + (point[1] - p0[1]) * dy) / denominator)) if denominator else 0
            return math.hypot(point[0] - p0[0] - t * dx, point[1] - p0[1] - t * dy)
        if max(distance(p1), distance(p2)) <= FLATNESS:
            self.points.append(p3)
            return
        if depth >= 20:
            raise ValueError('Curve subdivision exceeded its bound')
        midpoint = lambda a, b: tuple((a[i] + b[i]) / 2 for i in (0, 1))
        a, b, c = midpoint(p0, p1), midpoint(p1, p2), midpoint(p2, p3)
        d, e = midpoint(a, b), midpoint(b, c)
        middle = midpoint(d, e)
        self.flatten(p0, a, d, middle, depth + 1)
        self.flatten(middle, e, c, p3, depth + 1)

    def _closePath(self):
        points = []
        for x, y in self.points:
            point = (round(x * GRID), round(y * GRID))
            if not points or points[-1] != point:
                points.append(point)
        if len(points) > 1 and points[-1] == points[0]:
            points.pop()
        # Removing collinear intermediate points changes no filled region.
        changed = True
        while changed and len(points) > 3:
            changed = False
            for index, b in enumerate(points):
                a, c = points[index - 1], points[(index + 1) % len(points)]
                if (b[0] - a[0]) * (c[1] - b[1]) == (b[1] - a[1]) * (c[0] - b[0]):
                    points.pop(index)
                    changed = True
                    break
        if len(points) < 3:
            raise ValueError('Collapsed glyph contour')
        self.contours.append(points)

    def _endPath(self):
        raise ValueError('Open font contour')


def main():
    source, destination = map(Path, sys.argv[1:])
    if fontTools.__version__ != '4.60.0':
        raise ValueError('Reproduction requires fonttools==4.60.0')
    source_digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_digest != FONT_SHA256:
        raise ValueError('Source is not the pinned Arial Regular font; do not relabel other artwork')
    font = TTFont(source)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = FONT_SIZE / font['head'].unitsPerEm
    labels = {}
    for key, text in [('control', 'Continue'), ('text-link', 'View details'), ('selected-control', 'Selected')]:
        contours, offset = [], 0
        for character in text:
            name = cmap[ord(character)]
            pen = OutlinePen(glyphs, scale, offset)
            glyphs[name].draw(pen)
            contours.extend(pen.contours)
            offset += font['hmtx'][name][0] * scale
        minimum_x = min(x for points in contours for x, _ in points)
        minimum_y = min(y for points in contours for _, y in points)
        transformed = [[{'x': (x - minimum_x) / GRID, 'y': (y - minimum_y) / GRID} for x, y in points] for points in contours]
        labels[key] = {'text': text, 'width': max(point['x'] for points in transformed for point in points),
                       'height': max(point['y'] for points in transformed for point in points), 'contours': transformed}
    output = {'version': 'teul.control-outlines.v1', 'font': {'family': 'Arial', 'style': 'Regular',
        'size': FONT_SIZE, 'sourceSha256': source_digest},
        'compilation': {'tool': 'fonttools', 'version': '4.60.0', 'flatnessCssPx': FLATNESS, 'gridScale': GRID,
        'shaping': 'cmap glyphs with hmtx advances; no kerning or hinting',
        'disclosure': 'Finite outlined label artwork; polygon approximation, not exact original font curves.'}, 'labels': labels}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
