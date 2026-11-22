"""Compile the installed, pinned Geist Latin font for bounded composition text.

Run with fonttools==4.60.0, brotli==1.1.0 and skia-pathops==0.9.2:
  python scripts/generate-composition-glyphs.py

The runtime needs neither Python nor a font parser. Existing fixed Arial artwork is unchanged.
"""
import hashlib
import importlib.util
import importlib.metadata
import json
import unicodedata
from pathlib import Path

import fontTools
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'
DIGEST = '19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1'
DESTINATION = ROOT / 'web/src/lib/guideline/compositionGlyphsV1.json'


def main():
    if fontTools.__version__ != '4.60.0' or hashlib.sha256(SOURCE.read_bytes()).hexdigest() != DIGEST:
        raise ValueError('Reproduction requires the pinned font and fonttools==4.60.0')
    if importlib.metadata.version('skia-pathops') != '0.9.2' or importlib.metadata.version('brotli') != '1.1.0':
        raise ValueError('Reproduction requires skia-pathops==0.9.2 and brotli==1.1.0')
    spec = importlib.util.spec_from_file_location('outline_compiler', ROOT / 'scripts/generate-authoring-outlines.py')
    compiler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compiler)
    compiler.FLATNESS = 0.0625
    faces = {}
    for weight in (400, 600):
        font = instantiateVariableFont(TTFont(SOURCE), {'wght': weight}, inplace=True)
        # Variable glyphs contain overlapping strokes; preserve their nonzero filled union
        # before converting to the simple even-odd contours required by measured geometry.
        removeOverlaps(font)
        glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
        scale = 64 / font['head'].unitsPerEm
        rows = {}
        for codepoint, name in sorted(cmap.items()):
            char = chr(codepoint)
            if unicodedata.category(char)[0] in ('C', 'M'):
                continue
            pen = compiler.OutlinePen(glyphs, scale, 0)
            glyphs[name].draw(pen)
            rows[str(codepoint)] = {
                'advance': round(font['hmtx'][name][0] * scale * compiler.GRID),
                'contours': pen.contours,
            }
        faces[str(weight)] = {
            'ascent': round(font['hhea'].ascent * scale * compiler.GRID),
            'descent': round(-font['hhea'].descent * scale * compiler.GRID),
            'glyphs': rows,
        }
    output = {
        'version': 'teul.composition-glyphs.v1',
        'font': {'family': 'Geist', 'subset': 'Latin', 'style': 'normal', 'sourceSha256': DIGEST,
                 'license': 'SIL Open Font License 1.1; bundled in THIRD_PARTY_LICENSES.txt'},
        'compilation': {'fonttools': '4.60.0', 'brotli': '1.1.0', 'skiaPathops': '0.9.2', 'baseSize': 64, 'gridScale': 64,
                        'flatnessCssPxAtBaseSize': compiler.FLATNESS,
                        'shaping': 'cmap glyphs and hmtx advances; no kerning, ligatures or combining marks',
                        'disclosure': 'Geist Latin outlined text; bounded polygon approximation, not exact font curves or imported brand typography.'},
        'faces': faces,
    }
    DESTINATION.write_text(json.dumps(output, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f'{DESTINATION.relative_to(ROOT)}: {DESTINATION.stat().st_size} bytes')


if __name__ == '__main__':
    main()
