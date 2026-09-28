import { beforeAll, describe, expect, it } from 'vitest';
import { renderColorSystemAuthoredSvgV1 } from '../colorSystemAuthoredSvgV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from '../colorSystemAuthoringDeliveryV1';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from './fixtures/colorSystemAuthoringDeliveryV1Fixture';
import { executeColorSystemAuthoringDirectionV1 } from '../colorSystemAuthoringExecutionV1';
import { buildColorSystemDesignContentV1 } from '../colorSystemDesignContentV1';
import { parseColorSystemRecipeV1 } from '../colorSystemRecipeV1';
import { hashColorSystemGeometryApplicationsV1 } from '../colorSystemApplicationGeometryV1';
import { deterministicContentHash } from '../colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../colorSystemInertJsonV1';

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
const copy = <T>(value: T) => structuredClone(value) as Mutable<T>;
const immediate = { isCancelled: () => false, yield: async () => {} };
type Fixture = Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
function xml(svg: string) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  return document;
}
function nativeFill(value: string | null) {
  const match = /^color\(srgb (\S+) (\S+) (\S+) \/ (\S+)\)$/.exec(value ?? '');
  expect(match).not.toBeNull();
  return match!.slice(1).map(Number);
}

describe('authored SVG consumes exact compiled paint geometry as inert images', () => {
  let fixture: Fixture, capture: ColorSystemAuthoredDeliveryCaptureV1;
  beforeAll(async () => {
    fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
    capture = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      fixture.geometry,
      immediate
    );
  });
  it('resolves actual use colors in each exact authored mode without byte rounding or missing-mode fallback', () => {
    const preview = renderColorSystemAuthoredSvgV1(capture);
    expect(preview.boards.map(board => board.applicationId)).toEqual(
      fixture.applications.map(item => item.id)
    );
    expect(capture.blueprint.boards.map(board => board.modeId)).toEqual([
      'Day',
      'Night',
      'day',
      'Contrast',
    ]);
    for (const board of preview.boards) {
      const application = fixture.applications.find(item => item.id === board.applicationId)!;
      const paths = Array.from(xml(board.svg).querySelectorAll('path'));
      const regions = capture.blueprint.geometry.regions.filter(
        item => item.applicationId === application.id
      );
      expect(paths).toHaveLength(regions.length);
      paths.forEach((path, index) => {
        const use = application.uses.find(item => item.id === regions[index].useId)!;
        const value = fixture.source.colors.find(color => color.id === use.colorId)!.valuesByMode[
          application.modeId
        ];
        expect(nativeFill(path.getAttribute('fill'))).toEqual([
          value.components.r,
          value.components.g,
          value.components.b,
          value.alpha,
        ]);
        expect(path.getAttribute('fill')).not.toBe(value.hex);
        expect(value.alpha).toBe(1);
      });
    }
    const day = xml(preview.boards[0].svg).querySelector('path')!.getAttribute('fill');
    const night = xml(preview.boards[1].svg).querySelector('path')!.getAttribute('fill');
    expect(day).not.toBe(night);
    expect(preview.boards.every(board => !board.svg.includes('0.3456789012345679'))).toBe(true);
  });
  it('retains exact byte-source HEX values in every explicitly mapped mode', async () => {
    const direction = copy(fixture.direction);
    if (direction.generation.kind !== 'apply') throw new Error('Synthetic apply fixture changed.');
    direction.generation.proposal.derivation.sourceColorIds = ['paper', 'blue-deep'];
    for (const assignment of direction.composition.groups[0].options[0].assignments)
      if (assignment.useId === 'mark') assignment.colorId = 'blue-deep';
    const execution = await executeColorSystemAuthoringDirectionV1(
      fixture.source,
      direction,
      immediate
    );
    expect(execution.status).toBe('ready');
    const candidate = execution.candidates[0],
      model = candidate.proposal.workingModel;
    const applications = candidate.applications.applications.map(item => item.application);
    const recipe = parseColorSystemRecipeV1({
      ...fixture.recipe,
      direction,
      selection: {
        model,
        applications,
        contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
        executionReceiptHash: execution.receipt.receiptHash,
      },
    });
    const geometry = {
      ...fixture.geometry,
      modelHash: model.modelHash,
      applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    };
    const compiled = await compileColorSystemAuthoredDeliveryV1(recipe, geometry, immediate);
    const preview = renderColorSystemAuthoredSvgV1(compiled);
    preview.boards.forEach((board, index) => {
      const modeId = applications[index].modeId;
      const source = fixture.source.colors.find(color => color.id === 'blue-deep')!.valuesByMode[
        modeId
      ];
      expect(source.representation).toBeUndefined();
      expect(xml(board.svg).querySelectorAll('path')[1].getAttribute('fill')).toBe(source.hex);
    });
  });
  it('renders exact alpha on the foreground path while retaining the opaque carrier and glyph hole', async () => {
    const alpha = await syntheticColorSystemAuthoringDeliveryV1Fixture({ markAlpha: 0.7 });
    const geometry = copy(alpha.geometry);
    geometry.boards[0].root.children[0].shape = {
      kind: 'compound-polygon',
      fillRule: 'evenodd',
      contours: [
        [
          { x: 20, y: 24 },
          { x: 60, y: 24 },
          { x: 60, y: 56 },
          { x: 20, y: 56 },
        ],
        [
          { x: 30, y: 32 },
          { x: 50, y: 32 },
          { x: 50, y: 48 },
          { x: 30, y: 48 },
        ],
      ],
    };
    const compiled = await compileColorSystemAuthoredDeliveryV1(alpha.recipe, geometry, immediate);
    const preview = renderColorSystemAuthoredSvgV1(compiled);
    for (const [index, board] of preview.boards.entries()) {
      const application = alpha.applications[index];
      const paths = Array.from(xml(board.svg).querySelectorAll('path'));
      expect(paths).toHaveLength(2);
      for (const [pathIndex, colorId] of ['paper', 'ink'].entries()) {
        const value = alpha.source.colors.find(color => color.id === colorId)!.valuesByMode[
          application.modeId
        ];
        expect(nativeFill(paths[pathIndex].getAttribute('fill'))).toEqual([
          value.components.r,
          value.components.g,
          value.components.b,
          pathIndex === 0 ? 1 : 0.7,
        ]);
        expect(paths[pathIndex].hasAttribute('opacity')).toBe(false);
        expect(paths[pathIndex].getAttribute('fill-rule')).toBe('evenodd');
      }
      expect(paths.map(item => item.getAttribute('d'))).toEqual(
        compiled.blueprint.geometry.regions
          .filter(region => region.applicationId === application.id)
          .map(region => region.svgPath)
      );
    }
    expect(xml(preview.boards[0].svg).querySelectorAll('path')[1].getAttribute('d')).toBe(
      'M20 24 L60 24 L60 56 L20 56 Z M30 32 L50 32 L50 48 L30 48 Z'
    );
    expect(compiled.blueprint.geometry.regions[1].visibleArea).toBe(960);
    expect(compiled.blueprint.identity.sourceModelHash).toBe(alpha.source.modelHash);
    expect(compiled.recipe.source.model).toStrictEqual(alpha.source);
  });
  it('preserves assessed painter order, exact path coordinates, dimensions and layout identity', () => {
    const preview = renderColorSystemAuthoredSvgV1(capture);
    expect(preview.layoutHash).toBe(capture.blueprint.geometry.layoutHash);
    preview.boards.forEach((board, index) => {
      const doc = xml(board.svg),
        source = fixture.geometry.boards[index];
      const application = fixture.recipe.selection!.applications[index];
      const model = fixture.recipe.selection!.model;
      expect(board.name).toBe(
        [
          model.contexts.find(context => context.id === application.contextId)!.label,
          model.modes.find(mode => mode.id === application.modeId)!.label,
          source.root.textAlternative ?? application.id,
        ].join(' · ')
      );
      expect(doc.querySelector('title')!.textContent).toBe(board.name);
      expect(doc.documentElement.getAttribute('width')).toBe(String(source.width));
      expect(doc.documentElement.getAttribute('height')).toBe(String(source.height));
      expect(doc.documentElement.getAttribute('viewBox')).toBe(
        `0 0 ${source.width} ${source.height}`
      );
      expect(doc.documentElement.getAttribute('role')).toBe('img');
      const paths = Array.from(doc.querySelectorAll('path'));
      expect(paths.map(path => path.getAttribute('d'))).toEqual([
        'M0 0 L100 0 L100 80 L0 80 Z',
        'M20 28 L60 28 L60 52 L20 52 Z',
      ]);
      expect(paths.map(path => path.getAttribute('d'))).toEqual(
        capture.blueprint.geometry.regions
          .filter(region => region.applicationId === board.applicationId)
          .map(region => region.svgPath)
      );
      expect(paths.every(path => path.getAttribute('fill-rule') === 'evenodd')).toBe(true);
      expect(paths[1].querySelector('title')!.textContent).toBe(
        source.root.children[0].textAlternative
      );
      expect(doc.querySelectorAll('text,rect,foreignObject')).toHaveLength(0);
    });
  });
  it('retains a compound hole as one EVENODD path in absolute board coordinates', async () => {
    const geometry = copy(fixture.geometry);
    geometry.boards[0].root.children[0].shape = {
      kind: 'compound-polygon',
      fillRule: 'evenodd',
      contours: [
        [
          { x: 20, y: 24 },
          { x: 60, y: 24 },
          { x: 60, y: 56 },
          { x: 20, y: 56 },
        ],
        [
          { x: 30, y: 32 },
          { x: 50, y: 32 },
          { x: 50, y: 48 },
          { x: 30, y: 48 },
        ],
      ],
    };
    const compiled = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      geometry,
      immediate
    );
    const paths = xml(renderColorSystemAuthoredSvgV1(compiled).boards[0].svg).querySelectorAll(
      'path'
    );
    expect(paths).toHaveLength(2);
    expect(paths[1].getAttribute('fill-rule')).toBe('evenodd');
    expect(paths[1].getAttribute('d')).toBe(
      'M20 24 L60 24 L60 56 L20 56 Z M30 32 L50 32 L50 48 L30 48 Z'
    );
    expect(compiled.blueprint.geometry.regions[1].area).toBe(960);
  });
  it('preserves fractional grid dimensions and coordinates without display rounding', async () => {
    const unallocated = await syntheticColorSystemAuthoringDeliveryV1Fixture({ omitAreas: true });
    const geometry = copy(unallocated.geometry);
    geometry.boards[0].width = 100.015625;
    const root = geometry.boards[0].root.shape,
      mark = geometry.boards[0].root.children[0].shape;
    if (root.kind !== 'rect' || mark.kind !== 'rect')
      throw new Error('Synthetic rectangle fixture changed.');
    root.width = 100.015625;
    mark.x = 20.015625;
    const compiled = await compileColorSystemAuthoredDeliveryV1(
      unallocated.recipe,
      geometry,
      immediate
    );
    const doc = xml(renderColorSystemAuthoredSvgV1(compiled).boards[0].svg);
    expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 100.015625 80');
    expect(doc.querySelectorAll('path')[1].getAttribute('d')).toBe(
      'M20.015625 28 L60.015625 28 L60.015625 52 L20.015625 52 Z'
    );
  });
  it('keeps hostile names and text alternatives inert after XML parsing', async () => {
    const hostile = await syntheticColorSystemAuthoringDeliveryV1Fixture({ hostileLabels: true });
    const geometry = copy(hostile.geometry);
    const title =
      '</title><script>alert("x")</script><image href="https://example.invalid/x" onload="x"/> &amp; \'quoted\'';
    geometry.boards[0].root.children[0].textAlternative = title;
    const compiled = await compileColorSystemAuthoredDeliveryV1(
      hostile.recipe,
      geometry,
      immediate
    );
    const board = renderColorSystemAuthoredSvgV1(compiled).boards[0],
      doc = xml(board.svg);
    expect(doc.querySelector('title')!.textContent).toBe(board.name);
    expect(doc.querySelectorAll('path')[1].querySelector('title')!.textContent).toBe(title);
    expect(doc.querySelectorAll('script,image,style,foreignObject,a,use')).toHaveLength(0);
    expect(
      Array.from(doc.querySelectorAll('*')).every(node =>
        ['svg', 'title', 'path'].includes(node.localName)
      )
    ).toBe(true);
    expect(
      Array.from(doc.querySelectorAll('*')).flatMap(node =>
        Array.from(node.attributes).map(attribute => attribute.name)
      )
    ).not.toContain('onload');
    expect(board.svg).not.toContain('<!DOCTYPE');
    expect(board.svg).not.toContain('<script');
    expect(board.svg).toContain('&amp;amp;');
  });
  it('accepts valid supplementary Unicode and XML whitespace as text', async () => {
    const geometry = copy(fixture.geometry),
      title = '🎨 漢字 العربية \t\n<&"\'>';
    geometry.boards[0].root.children[0].textAlternative = title;
    const compiled = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      geometry,
      immediate
    );
    expect(
      xml(renderColorSystemAuthoredSvgV1(compiled).boards[0].svg)
        .querySelectorAll('path')[1]
        .querySelector('title')!.textContent
    ).toBe(title);
  });
  it.each(['\u0000', '\u0001', '\ud800', '\udc00', '\ufffe', '\uffff'])(
    'rejects XML-invalid title code unit %j rather than emitting malformed SVG',
    async character => {
      const geometry = copy(fixture.geometry);
      geometry.boards[0].root.children[0].textAlternative = `Invalid ${character} label`;
      const compiled = await compileColorSystemAuthoredDeliveryV1(
        fixture.recipe,
        geometry,
        immediate
      );
      expect(() => renderColorSystemAuthoredSvgV1(compiled)).toThrow(/unsupported by XML/);
    }
  );
  it('rejects forged serialized captures before reading caller accessors', () => {
    expect(() => renderColorSystemAuthoredSvgV1(copy(capture))).toThrow(/Recompute/);
    let calls = 0;
    const forged = Object.defineProperty({}, 'blueprint', {
      get() {
        calls++;
        return capture.blueprint;
      },
    });
    expect(() =>
      renderColorSystemAuthoredSvgV1(forged as ColorSystemAuthoredDeliveryCaptureV1)
    ).toThrow(/Recompute/);
    expect(calls).toBe(0);
  });
  it('returns detached boards and deterministic hashes while protecting the compiled capture', () => {
    const first = renderColorSystemAuthoredSvgV1(capture),
      baseline = serializeColorSystemInertJsonV1(first);
    expect(first.boards.every(board => board.svgHash === deterministicContentHash(board.svg))).toBe(
      true
    );
    const { previewHash, ...body } = first;
    expect(previewHash).toBe(deterministicContentHash(serializeColorSystemInertJsonV1(body)));
    const writable = first as Mutable<typeof first>;
    writable.boards[0].svg = '<svg>changed</svg>';
    writable.boards[0].name = 'changed';
    writable.boards.splice(1);
    writable.layoutHash = 'changed';
    const again = renderColorSystemAuthoredSvgV1(capture);
    expect(serializeColorSystemInertJsonV1(again)).toBe(baseline);
    expect(again.boards).not.toBe(first.boards);
    expect(again.boards[0]).not.toBe(first.boards[0]);
  });
});
