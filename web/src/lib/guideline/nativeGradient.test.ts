import { describe, it, expect } from 'vitest';
import { FigmaReadClient } from '../../../../services/guideline-intake/src/figmaRead';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { createFigmaNativeInventory } from './figmaInventory';
import { figmaNativeGradients, renderFigmaNativeGradient } from './nativeGradient';
import fixture from '../../../fixtures/guidelines/figma-native.json';

type Data = Record<string, any>;
async function inventory(
  change: (root: Data, paint: Data, data: Data) => void = () => {},
  overlap = false
) {
  const data = structuredClone(fixture) as Data;
  const root = data.nodes['1:2'].document;
  const child = root.children[2];
  change(root, child.fills[0], data);
  if (overlap) data.nodes['1:5'] = { document: structuredClone(child), styles: {} };
  const client = new FigmaReadClient({ fetch: async () => Response.json(data) });
  const packet = await client.capture(
    {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'ABC',
      version: fixture.version,
      nodeIds: overlap ? ['1:5', '1:2'] : ['1:2'],
      includeVariables: false,
    },
    'synthetic',
    new AbortController().signal
  );
  return createFigmaNativeInventory(packet);
}
const frame = { interpretation: 'srgb' as const, width: 400, height: 240 };
describe('captured native gradient geometry', () => {
  it('keeps exact radial stops, all handles and source identity outside the solid palette', async () => {
    const source = await inventory();
    const [paint] = figmaNativeGradients(source);
    expect(paint.paint).toEqual(fixture.nodes['1:2'].document.children[2].fills![0]);
    expect(paint.locator).toBe('node:1:5/fills/0');
    expect(paint.captureHash).toBe(source.packet.contentHash);
    expect(paint.sourceHash).toBe(source.sources[0].sourceHash);
    expect(source.declarations.every(c => c.locator !== paint.locator)).toBe(true);
    const render = renderFigmaNativeGradient(paint, frame);
    expect(render.status).toBe('interpreted');
    expect(render.svg).toContain('<radialGradient');
    const matrix = render
      .svg!.match(/gradientTransform="matrix\(([^)]+)\)"/)![1]
      .split(' ')
      .map(Number);
    // Independently checked native center and two radius handles, including shear.
    expect(matrix[4]).toBeCloseTo(40, 12);
    expect(matrix[5]).toBeCloseTo(48, 12);
    expect(matrix[0] + matrix[4]).toBeCloseTo(320, 12);
    expect(matrix[1] + matrix[5]).toBeCloseTo(216, 12);
    expect(matrix[2] + matrix[4]).toBeCloseTo(80, 12);
    expect(matrix[3] + matrix[5]).toBeCloseTo(192, 12);
    expect(render.notices.join(' ')).toContain(
      'does not establish Figma interpolation or pixel equivalence'
    );
    expect(render.svg).not.toContain('<linearGradient');
    expect(Object.isFrozen(paint.paint)).toBe(true);
  });
  it('does not recenter off-frame handles or round native stop channels', async () => {
    const source = await inventory((_root, paint) => {
      paint.gradientHandlePositions = [
        { x: -0.25, y: 0.1 },
        { x: 0.75, y: 0.1 },
        { x: -0.25, y: 0.6 },
      ];
      paint.gradientStops[0].color.r = 0.1234567890123456;
      paint.gradientStops[0].position = 0.125;
    });
    const [paint] = figmaNativeGradients(source);
    expect((paint.paint as Data).gradientStops[0].color.r).toBe(0.1234567890123456);
    const render = renderFigmaNativeGradient(paint, frame);
    expect(render.svg).toContain('matrix(400 0 0 120 -100 24)');
    expect(render.svg).toContain('offset="0.125"');
    expect(render.svg).toContain(`${0.1234567890123456 * 100}%`);
  });
  it('binds the third radial handle and authored frame to separate render identities', async () => {
    const [a] = figmaNativeGradients(await inventory());
    const [b] = figmaNativeGradients(
      await inventory((_root, paint) => {
        paint.gradientHandlePositions[2].x = 0.35;
      })
    );
    const first = renderFigmaNativeGradient(a, frame);
    expect(renderFigmaNativeGradient(b, frame).svg).not.toBe(first.svg);
    expect(b.evidenceHash).not.toBe(a.evidenceHash);
    expect(renderFigmaNativeGradient(a, { ...frame, width: 240 }).renderingHash).not.toBe(
      first.renderingHash
    );
  });
  it('carries sibling masking into the gradient evidence, including overlapping selections', async () => {
    const source = await inventory(root => {
      root.children[0].isMask = true;
    }, true);
    const [paint] = figmaNativeGradients(source);
    expect(figmaNativeGradients(source)).toBe(figmaNativeGradients(source));
    expect(renderFigmaNativeGradient(paint, frame).limitations.join(' ')).toContain('sibling mask');
    expect(paint.context.some(c => c.locator === 'node:1:3/isMask')).toBe(true);
  });
  it.each([
    ['isMask', null],
    ['maskType', null],
    ['isMask', 'unknown'],
  ])('does not interpret unknown sibling %s as an absent mask', async (key, value) => {
    const [paint] = figmaNativeGradients(
      await inventory(root => {
        root.children[0][key as string] = value;
      }, true)
    );
    expect(renderFigmaNativeGradient(paint, frame).limitations.join(' ')).toContain('sibling mask');
  });
  it('accepts large validated overlapping subtrees without reserializing them', async () => {
    const source = await inventory(root => {
      const gradient = root.children[2];
      gradient.children = Array.from({ length: 530 }, (_, i) => ({
        id: `2:${i}`,
        name: 'x'.repeat(4096),
        type: 'RECTANGLE',
        fills: [],
      }));
    }, true);
    expect(figmaNativeGradients(source)).toHaveLength(1);
  });
  it('bounds repeated ancestor evidence before constructing an oversized comparison inventory', async () => {
    const source = await inventory(root => {
      root.effects = [{ type: 'FUTURE_EFFECT', payload: 'x'.repeat(24000) }];
      const gradient = root.children[2];
      root.children = Array.from({ length: 400 }, (_, i) => ({ ...gradient, id: `2:${i}` }));
    });
    expect(() => figmaNativeGradients(source)).toThrow('comparison evidence exceeds 8 MiB');
  });
  it.each([
    ['GRADIENT_ANGULAR', 'gradient type'],
    ['GRADIENT_DIAMOND', 'gradient type'],
  ])('preserves unsupported %s instead of converting it', async (type, reason) => {
    const [paint] = figmaNativeGradients(
      await inventory((_root, paint) => {
        paint.type = type;
      })
    );
    const render = renderFigmaNativeGradient(paint, frame);
    expect(render.status).toBe('unsupported');
    expect(render.svg).toBeNull();
    expect(render.limitations.join(' ')).toContain(reason);
    expect((paint.paint as Data).type).toBe(type);
  });
  it('supports orthogonal linear handles and refuses unverified skewed semantics', async () => {
    const [straight] = figmaNativeGradients(
      await inventory((_root, paint) => {
        paint.type = 'GRADIENT_LINEAR';
        paint.gradientHandlePositions = [
          { x: 0.2, y: 0.3 },
          { x: 0.8, y: 0.3 },
          { x: 0.2, y: 0.7 },
        ];
      })
    );
    expect(renderFigmaNativeGradient(straight, frame).svg).toContain('<linearGradient');
    const [skew] = figmaNativeGradients(
      await inventory((_root, paint) => {
        paint.type = 'GRADIENT_LINEAR';
      })
    );
    expect(renderFigmaNativeGradient(skew, frame).limitations.join(' ')).toContain('Skewed linear');
  });
  it.each([
    ['opacity', 0.5, 'opacity'],
    ['visible', false, 'hidden'],
    ['blendMode', 'MULTIPLY', 'blending'],
    ['colorProfile', 'DISPLAY_P3', 'colorProfile'],
    ['isMask', true, 'masking'],
    ['isMask', null, 'masking'],
    ['maskType', null, 'masking'],
    ['clipsContent', true, 'clipping'],
    ['clipsContent', null, 'clipping'],
    ['clipsContent', 'unknown', 'clipping'],
    ['effects', [{ type: 'LAYER_BLUR', radius: 5 }], 'effects'],
  ])(
    'cannot hide ancestor %s by selecting the gradient child first',
    async (key, value, reason) => {
      const [paint] = figmaNativeGradients(
        await inventory(root => {
          root[key] = value;
        }, true)
      );
      const render = renderFigmaNativeGradient(paint, frame);
      expect(render.status).toBe('unsupported');
      expect(render.limitations.join(' ')).toContain(reason);
      expect(
        paint.context.some(
          c =>
            c.locator === `node:1:2/${key}` &&
            canonicalIntakeJson(c.value) === canonicalIntakeJson(value)
        )
      ).toBe(true);
    }
  );
  it.each([
    [
      'alpha',
      (_root: Data, p: Data) => {
        p.gradientStops[0].color.a = 0.5;
      },
    ],
    [
      'opacity',
      (_root: Data, p: Data) => {
        p.opacity = 0.5;
      },
    ],
    [
      'hidden',
      (_root: Data, p: Data) => {
        p.visible = false;
      },
    ],
    [
      'blend',
      (_root: Data, p: Data) => {
        p.blendMode = 'SCREEN';
      },
    ],
    [
      'unknown',
      (_root: Data, p: Data) => {
        p.futureRenderingProperty = 1;
      },
    ],
    [
      'duplicate stop',
      (_root: Data, p: Data) => {
        p.gradientStops[1].position = 0;
      },
    ],
    [
      'singular',
      (_root: Data, p: Data) => {
        p.gradientHandlePositions[2] = p.gradientHandlePositions[0];
      },
    ],
    [
      'layers',
      (root: Data) => {
        root.children[2].fills.push({ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } });
      },
    ],
  ])('does not fabricate a render for %s', async (_label, change) => {
    const [paint] = figmaNativeGradients(await inventory(change));
    expect(renderFigmaNativeGradient(paint, frame).svg).toBeNull();
  });
  it('rejects forged evidence and invalid frame input, and escapes native labels', async () => {
    const [paint] = figmaNativeGradients(
      await inventory(root => {
        root.children[2].name = '</title><script>bad</script>';
      })
    );
    expect(() => renderFigmaNativeGradient({ ...paint }, frame)).toThrow('validated capture');
    expect(() => renderFigmaNativeGradient(paint, { ...frame, width: Infinity })).toThrow();
    expect(() =>
      renderFigmaNativeGradient(paint, { ...frame, renderer: 'unreviewed.v9' } as any)
    ).toThrow();
    const svg = renderFigmaNativeGradient(paint, frame).svg!;
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
