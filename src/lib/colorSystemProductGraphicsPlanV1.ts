/** Source-bound graphic uses and exact geometry; never source approval or Create authority. */
import type {
  ColorSystemApplicationColorRefV2,
  ColorSystemBuilderBriefV2,
  ColorSystemColorValueV2,
  ColorSystemProductGraphicsJobV2,
} from './colorSystemBuilderV2Contracts';
import type {
  ColorSystemProductGraphicsSpecimenV2,
  ColorSystemRenderedPairContextV2,
  ColorSystemRenderedPairEvidenceV2,
} from './colorSystemApplicationBlueprintV2';
import {
  colorSystemGeometryShapeToContoursV1,
  measureColorSystemApplicationGeometryBoardsV1,
  type ColorSystemApplicationGeometryBoardV1,
  type ColorSystemApplicationGeometryNodeV1,
} from './colorSystemApplicationGeometryV1';
import type { ColorSystemEvidenceStatusV1 } from './colorSystemModelV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

export const COLOR_SYSTEM_PRODUCT_GRAPHICS_REQUIREMENTS_V1_VERSION =
  'teul-product-graphics-requirements/v1' as const;
export const COLOR_SYSTEM_PRODUCT_GRAPHICS_RENDERING_V1_VERSION =
  'teul-product-graphics-rendering/v1' as const;

const JOBS = ['product-graphic', 'functional-iconography', 'product-ui-surface'] as const;
const ROLES = [
  'outer-backdrop',
  'card-surface',
  'control-surface',
  'accent',
  'functional-icon',
  'label',
  'border',
] as const;
export type ColorSystemGraphicRoleV1 = (typeof ROLES)[number];
type PreservedRef = Extract<ColorSystemApplicationColorRefV2, { kind: 'preserved-source-color' }>;
export interface ColorSystemGraphicEvidenceRefV1 {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly locator: string;
  readonly status: ColorSystemEvidenceStatusV1;
}
export interface ColorSystemGraphicUseV1 {
  readonly id: string;
  readonly role: ColorSystemGraphicRoleV1;
  readonly assessment: 'informative' | 'decorative';
  readonly paint:
    | { readonly kind: 'selected-member' }
    | {
        readonly kind: 'source';
        readonly ref: PreservedRef;
      };
}
export interface ColorSystemGraphicPairV1 extends Pick<
  ColorSystemRenderedPairContextV2,
  'category' | 'fontSizePx' | 'fontWeight' | 'useCase' | 'evidenceIds'
> {
  readonly id: string;
  readonly foregroundUseId: string;
  readonly backgroundUseId: string;
  readonly underlayUseId?: string;
}
export interface ColorSystemGraphicContextV1 {
  readonly id: string;
  readonly job: ColorSystemProductGraphicsJobV2;
  readonly mode: string;
  readonly evidenceIds: readonly string[];
  readonly selection:
    | { readonly kind: 'job-eligible' }
    | {
        readonly kind: 'exact-source-values';
        readonly refs: readonly PreservedRef[];
      };
  readonly uses: readonly ColorSystemGraphicUseV1[];
  readonly pairs: readonly ColorSystemGraphicPairV1[];
  readonly geometry: ColorSystemApplicationGeometryBoardV1;
}
export interface ColorSystemProductGraphicsRequirementsV1 {
  readonly policyVersion: typeof COLOR_SYSTEM_PRODUCT_GRAPHICS_REQUIREMENTS_V1_VERSION;
  readonly binding: {
    readonly sourceHash: string;
    readonly sourcePackageHash: string;
    readonly briefHash: string;
  };
  readonly evidence: readonly ColorSystemGraphicEvidenceRefV1[];
  readonly contexts: readonly ColorSystemGraphicContextV1[];
}
export interface ColorSystemProductGraphicsRenderNodeV1 {
  readonly id: string;
  readonly parentId: string | null;
  readonly useId: string;
  readonly kind: 'rectangle' | 'vector';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Even-odd SVG path, local to x/y. */
  readonly path: string | null;
  readonly textAlternative: string | null;
}
export interface ColorSystemProductGraphicsRenderingV1 {
  readonly policyVersion: typeof COLOR_SYSTEM_PRODUCT_GRAPHICS_RENDERING_V1_VERSION;
  readonly provenance: 'declared-context' | 'legacy-pair-only';
  readonly requirementsHash: string | null;
  readonly contextId: string;
  readonly layoutHash: string;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly ColorSystemProductGraphicsRenderNodeV1[];
  readonly uses: readonly {
    readonly id: string;
    readonly role: ColorSystemGraphicRoleV1;
    readonly assessment: 'informative' | 'decorative';
    readonly ref: ColorSystemApplicationColorRefV2;
  }[];
  readonly pairs: readonly {
    readonly pairEvidenceId: string;
    readonly foregroundUseId: string;
    readonly backgroundUseId: string;
    readonly underlayUseId: string | null;
  }[];
}

const HASH = /^sha256:[a-f0-9]{64}$/;
const BOUNDARY = { maximumBytes: 2 * 1024 * 1024, maximumDepth: 40, maximumNodes: 100000 };
const exact = (value: unknown) => canonicalJson(value);
function fail(message: string): never {
  throw new Error(`Product graphics: ${message}`);
}
function object(
  value: unknown,
  required: string[],
  optional: string[] = []
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a record.');
  const data = value as Record<string, unknown>;
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(data, key)) ||
    Object.keys(data).some(key => !required.includes(key) && !optional.includes(key))
  )
    fail('Missing or unsupported fields.');
  return data;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024)
    fail('Expected bounded text.');
  return value;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail('Collection exceeds its bound.');
  return value;
}
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`Duplicate ${label}.`);
}
function ref(value: unknown): ColorSystemApplicationColorRefV2 {
  const data = value as ColorSystemApplicationColorRefV2;
  if (data?.kind === 'preserved-source-color') {
    object(data, ['kind', 'stableColorId', 'mode']);
    text(data.stableColorId);
    text(data.mode);
  } else if (data?.kind === 'approved-family-member') {
    object(data, ['kind', 'ref']);
    object(data.ref, ['familyId', 'memberId', 'mode']);
    text(data.ref.familyId);
    text(data.ref.memberId);
    text(data.ref.mode);
  } else fail('Unsupported paint reference.');
  return data;
}
function preserved(brief: ColorSystemBuilderBriefV2, value: unknown, mode: string): PreservedRef {
  const parsed = ref(value);
  if (
    parsed.kind !== 'preserved-source-color' ||
    parsed.mode !== mode ||
    !brief.preservedColors.some(
      color => color.stableColorId === parsed.stableColorId && color.valuesByMode[mode]
    )
  )
    fail('Fixed paint must resolve to an exact preserved source color in this mode.');
  return parsed;
}
function evidenceIds(value: unknown, available: ReadonlySet<string>): readonly string[] {
  const ids = list(value, 64).map(text);
  unique(ids, 'evidence IDs');
  if (!ids.length || ids.some(id => !available.has(id))) fail('Unresolved source evidence.');
  return ids;
}
function nodes(
  board: ColorSystemApplicationGeometryBoardV1
): ColorSystemProductGraphicsRenderNodeV1[] {
  const result: ColorSystemProductGraphicsRenderNodeV1[] = [];
  const visit = (node: ColorSystemApplicationGeometryNodeV1, parentId: string | null) => {
    const contours = colorSystemGeometryShapeToContoursV1(node.shape);
    const points = contours.flat();
    const x = Math.min(...points.map(point => point.x));
    const y = Math.min(...points.map(point => point.y));
    const width = Math.max(...points.map(point => point.x)) - x;
    const height = Math.max(...points.map(point => point.y)) - y;
    result.push({
      id: node.id,
      parentId,
      useId: node.useId,
      kind: node.shape.kind === 'rect' ? 'rectangle' : 'vector',
      x,
      y,
      width,
      height,
      path:
        node.shape.kind === 'rect'
          ? null
          : contours
              .map(
                contour =>
                  contour
                    .map((point, index) => `${index ? 'L' : 'M'}${point.x - x} ${point.y - y}`)
                    .join(' ') + ' Z'
              )
              .join(' '),
      textAlternative: node.textAlternative ?? null,
    });
    node.children.forEach(child => visit(child, node.id));
  };
  visit(board.root, null);
  return result;
}
function roleForJob(job: ColorSystemProductGraphicsJobV2): ColorSystemGraphicRoleV1 {
  return job === 'product-graphic'
    ? 'accent'
    : job === 'functional-iconography'
      ? 'functional-icon'
      : 'control-surface';
}

/** Pure admission before selection; source evidence identities do not confer approval. */
export function normalizeColorSystemProductGraphicsRequirementsV1(
  input: unknown,
  brief: ColorSystemBuilderBriefV2,
  mode: string
): ColorSystemProductGraphicsRequirementsV1 {
  const raw = snapshotColorSystemInertJsonV1(input, BOUNDARY);
  const root = object(raw, ['policyVersion', 'binding', 'evidence', 'contexts']);
  if (root.policyVersion !== COLOR_SYSTEM_PRODUCT_GRAPHICS_REQUIREMENTS_V1_VERSION)
    fail('Unsupported requirements version.');
  const binding = object(root.binding, ['sourceHash', 'sourcePackageHash', 'briefHash']);
  if (
    binding.sourceHash !== brief.sourceHash ||
    binding.sourcePackageHash !== brief.sourcePackageHash ||
    binding.briefHash !== brief.briefHash
  )
    fail('Stale source, source package or brief binding.');
  const evidence = list(root.evidence, 128).map(value => {
    const item = object(value, ['id', 'sourceId', 'sourceHash', 'locator', 'status']);
    text(item.id);
    text(item.sourceId);
    text(item.locator);
    if (
      !HASH.test(String(item.sourceHash)) ||
      !['observed', 'inferred', 'contradicted', 'unsupported', 'unresolved'].includes(
        String(item.status)
      )
    )
      fail('Invalid source evidence identity.');
    return item as unknown as ColorSystemGraphicEvidenceRefV1;
  });
  unique(
    evidence.map(item => item.id),
    'evidence identities'
  );
  const evidenceSet = new Set(evidence.map(item => item.id));
  const contexts = list(root.contexts, 3).map((value, index) => {
    const item = object(value, [
      'id',
      'job',
      'mode',
      'evidenceIds',
      'selection',
      'uses',
      'pairs',
      'geometry',
    ]);
    text(item.id);
    if (item.job !== JOBS[index] || item.mode !== mode)
      fail('Exactly the canonical three jobs in the application mode are required.');
    evidenceIds(item.evidenceIds, evidenceSet);
    const selection = item.selection as ColorSystemGraphicContextV1['selection'];
    if (selection?.kind === 'job-eligible') object(selection, ['kind']);
    else if (selection?.kind === 'exact-source-values') {
      object(selection, ['kind', 'refs']);
      if (!list(selection.refs, 64).length) fail('An exact source pool cannot be empty.');
      selection.refs.forEach(value => preserved(brief, value, mode));
      unique(selection.refs.map(exact), 'selection refs');
    } else fail('Unsupported selected-member constraint.');
    const uses = list(item.uses, 32).map(value => {
      const use = object(value, ['id', 'role', 'assessment', 'paint']);
      text(use.id);
      if (
        !ROLES.includes(use.role as ColorSystemGraphicRoleV1) ||
        !['informative', 'decorative'].includes(String(use.assessment))
      )
        fail('Invalid graphic role or assessment.');
      const paint = use.paint as ColorSystemGraphicUseV1['paint'];
      if (paint?.kind === 'selected-member') object(paint, ['kind']);
      else if (paint?.kind === 'source') {
        object(paint, ['kind', 'ref']);
        preserved(brief, paint.ref, mode);
      } else fail('Every use needs an explicit source paint or selected member.');
      return use as unknown as ColorSystemGraphicUseV1;
    });
    unique(
      uses.map(use => use.id),
      'use IDs'
    );
    const selected = uses.filter(use => use.paint.kind === 'selected-member');
    if (
      selected.length !== 1 ||
      selected[0].role !== roleForJob(item.job as ColorSystemProductGraphicsJobV2) ||
      selected[0].assessment !== 'informative'
    )
      fail(
        'The required job needs exactly one informative selected-member use in its actual role.'
      );
    const pairs = list(item.pairs, 64).map(value => {
      const pair = object(
        value,
        [
          'id',
          'foregroundUseId',
          'backgroundUseId',
          'category',
          'fontSizePx',
          'fontWeight',
          'useCase',
          'evidenceIds',
        ],
        ['underlayUseId']
      );
      text(pair.id);
      text(pair.foregroundUseId);
      text(pair.backgroundUseId);
      text(pair.useCase);
      if (pair.underlayUseId !== undefined) text(pair.underlayUseId);
      evidenceIds(pair.evidenceIds, evidenceSet);
      if (!['non-text', 'normal-text', 'large-text'].includes(String(pair.category)))
        fail('Unsupported pair category.');
      if (pair.category === 'non-text') {
        if (pair.fontSizePx !== null || pair.fontWeight !== null)
          fail('Non-text pairs cannot declare text metrics.');
      } else {
        if (
          typeof pair.fontSizePx !== 'number' ||
          !Number.isFinite(pair.fontSizePx) ||
          pair.fontSizePx <= 0 ||
          typeof pair.fontWeight !== 'number' ||
          !Number.isInteger(pair.fontWeight)
        )
          fail('Text pairs require exact size and weight.');
        const large = pair.fontSizePx >= 24 || (pair.fontWeight >= 700 && pair.fontSizePx >= 18.66);
        if (large !== (pair.category === 'large-text'))
          fail('Text size differs from its contrast category.');
      }
      return pair as unknown as ColorSystemGraphicPairV1;
    });
    unique(
      pairs.map(pair => pair.id),
      'pair IDs'
    );
    const board = measureColorSystemApplicationGeometryBoardsV1([item.geometry]).boards[0];
    if (board.applicationId !== item.id) fail('Geometry belongs to another context.');
    const projected = nodes(board);
    const byUse = new Map(uses.map(use => [use.id, use]));
    const byNode = new Map(projected.map(node => [node.id, node]));
    const outer = byUse.get(board.root.useId);
    const cards = uses.filter(use => use.role === 'card-surface');
    if (
      !outer ||
      outer.role !== 'outer-backdrop' ||
      uses.filter(use => use.role === 'outer-backdrop').length !== 1 ||
      cards.length !== 1
    )
      fail('A declared outer backdrop and one distinct opaque card are required.');
    for (const ground of [outer, cards[0]]) {
      const paint = ground.paint;
      if (
        paint.kind !== 'source' ||
        brief.preservedColors.find(color => color.stableColorId === paint.ref.stableColorId)
          ?.valuesByMode[mode].alpha !== 1
      )
        fail('Outer backdrop and card must be exact opaque source paints.');
    }
    if (
      projected.some(node => !byUse.has(node.useId)) ||
      uses.some(use => !projected.some(node => node.useId === use.id))
    )
      fail('Geometry and paint uses must cover one another exactly.');
    for (const node of projected) {
      const use = byUse.get(node.useId)!;
      const parent = node.parentId === null ? null : byNode.get(node.parentId)!;
      if (use.role === 'card-surface' && parent?.useId !== outer.id)
        fail('The opaque card must be inside the declared outer backdrop.');
      if (use.paint.kind === 'selected-member') {
        let ancestor = parent;
        while (ancestor && ancestor.useId !== cards[0].id)
          ancestor = ancestor.parentId === null ? null : byNode.get(ancestor.parentId)!;
        if (!ancestor) fail('The selected job use must remain inside the declared card.');
      }
      const usePairs = pairs.filter(pair => pair.foregroundUseId === use.id);
      if (use.assessment === 'informative' && !usePairs.length)
        fail('Every informative paint occurrence requires exact pair evidence.');
      for (const pair of usePairs) {
        if (
          !byUse.has(pair.backgroundUseId) ||
          (pair.underlayUseId && !byUse.has(pair.underlayUseId)) ||
          parent?.useId !== pair.backgroundUseId
        )
          fail('Pair background differs from the nearest painted parent.');
        const grandparent = parent?.parentId ? byNode.get(parent.parentId) : null;
        if (pair.underlayUseId && grandparent?.useId !== pair.underlayUseId)
          fail('Pair underlay differs from the actual painted grandparent.');
        if ((use.role === 'label') === (pair.category === 'non-text'))
          fail('Label/non-text role and pair category disagree.');
      }
    }
    if (pairs.some(pair => !byUse.has(pair.foregroundUseId)))
      fail('Pair refers to an absent foreground use.');
    return { ...item, geometry: board } as unknown as ColorSystemGraphicContextV1;
  });
  if (contexts.length !== 3) fail('All three product graphics jobs remain required.');
  unique(
    contexts.map(context => context.id),
    'context IDs'
  );
  return {
    policyVersion: COLOR_SYSTEM_PRODUCT_GRAPHICS_REQUIREMENTS_V1_VERSION,
    binding: binding as ColorSystemProductGraphicsRequirementsV1['binding'],
    evidence,
    contexts,
  };
}

export function colorSystemProductGraphicsPairContextsV1(
  context: ColorSystemGraphicContextV1,
  selected: ColorSystemApplicationColorRefV2
): ColorSystemRenderedPairContextV2[] {
  const refs = new Map(
    context.uses.map(use => [use.id, use.paint.kind === 'source' ? use.paint.ref : selected])
  );
  return context.pairs.map(pair => ({
    id: `graphics:${context.id}:${pair.id}`,
    mode: context.mode,
    foreground: refs.get(pair.foregroundUseId)!,
    background: refs.get(pair.backgroundUseId)!,
    underlay: pair.underlayUseId ? refs.get(pair.underlayUseId)! : null,
    backdropKind: 'solid',
    category: pair.category,
    assessment: 'required',
    fontSizePx: pair.fontSizePx,
    fontWeight: pair.fontWeight,
    useCase: pair.useCase,
    evidenceIds: pair.evidenceIds,
  }));
}

export function colorSystemProductGraphicsCandidateAllowedV1(
  context: ColorSystemGraphicContextV1,
  value: ColorSystemColorValueV2,
  resolve: (ref: PreservedRef) => ColorSystemColorValueV2
): boolean {
  return (
    context.selection.kind === 'job-eligible' ||
    context.selection.refs.some(ref => exact(resolve(ref)) === exact(value))
  );
}

export function buildColorSystemProductGraphicsProjectionV1(
  board: ColorSystemApplicationGeometryBoardV1,
  content: Pick<
    ColorSystemProductGraphicsRenderingV1,
    'provenance' | 'requirementsHash' | 'contextId' | 'uses' | 'pairs'
  >
): ColorSystemProductGraphicsRenderingV1 {
  const normalized = measureColorSystemApplicationGeometryBoardsV1([board]).boards[0];
  const layout = { width: normalized.width, height: normalized.height, nodes: nodes(normalized) };
  return {
    policyVersion: COLOR_SYSTEM_PRODUCT_GRAPHICS_RENDERING_V1_VERSION,
    ...content,
    ...layout,
    layoutHash: deterministicContentHash(layout),
  };
}

export function buildColorSystemProductGraphicsRenderingV1(
  requirements: ColorSystemProductGraphicsRequirementsV1,
  context: ColorSystemGraphicContextV1,
  selected: ColorSystemApplicationColorRefV2,
  evidence: readonly ColorSystemRenderedPairEvidenceV2[]
): ColorSystemProductGraphicsRenderingV1 {
  const contexts = colorSystemProductGraphicsPairContextsV1(context, selected);
  contexts.forEach(expected => {
    const actual = evidence.find(item => item.context.id === expected.id);
    if (
      !actual ||
      exact(actual.context) !==
        exact({ ...expected, evidenceIds: [...expected.evidenceIds].sort() })
    )
      fail('Rendered pair does not reproduce the declared exact context.');
    if (actual.background.value.alpha !== 1 && actual.underlay?.value.alpha !== 1)
      fail('A translucent background requires its exact opaque underlay.');
  });
  return buildColorSystemProductGraphicsProjectionV1(context.geometry, {
    provenance: 'declared-context',
    requirementsHash: deterministicContentHash(requirements),
    contextId: context.id,
    uses: context.uses.map(use => ({
      id: use.id,
      role: use.role,
      assessment: use.assessment,
      ref: use.paint.kind === 'source' ? use.paint.ref : selected,
    })),
    pairs: context.pairs.map((pair, index) => ({
      pairEvidenceId: contexts[index].id,
      foregroundUseId: pair.foregroundUseId,
      backgroundUseId: pair.backgroundUseId,
      underlayUseId: pair.underlayUseId ?? null,
    })),
  });
}

/** A legacy pair can be shown faithfully; it conveys no source-backed spatial permission. */
export function getColorSystemProductGraphicsRenderingV1(
  specimen: ColorSystemProductGraphicsSpecimenV2,
  evidence: readonly ColorSystemRenderedPairEvidenceV2[]
): ColorSystemProductGraphicsRenderingV1 {
  if (specimen.rendering) return readColorSystemProductGraphicsRenderingV1(specimen.rendering);
  if (
    specimen.colors.length !== 1 ||
    specimen.pairEvidenceIds.length !== 1 ||
    specimen.transform.kind !== 'identity'
  )
    fail('Legacy graphic has no unambiguous exact rendering context.');
  const pair = evidence.find(item => item.context.id === specimen.pairEvidenceIds[0]);
  if (
    !pair ||
    pair.context.mode !== specimen.mode ||
    pair.context.category !== 'non-text' ||
    pair.context.backdropKind !== 'solid' ||
    exact(pair.context.foreground) !== exact(specimen.colors[0].ref) ||
    pair.renderedBackground === null
  )
    fail('Legacy graphic lacks the exact selected foreground/background pair.');
  const rootUse = pair.context.underlay ? 'underlay' : 'background';
  const foreground: ColorSystemApplicationGeometryNodeV1 = {
    id: 'foreground',
    useId: 'foreground',
    shape: { kind: 'rect', x: 180, y: 64, width: 240, height: 112 },
    textAlternative: `${specimen.job}: exact legacy pair only`,
    children: [],
  };
  const board: ColorSystemApplicationGeometryBoardV1 = {
    applicationId: specimen.derivationId,
    width: 600,
    height: 240,
    root: {
      id: rootUse,
      useId: rootUse,
      shape: { kind: 'rect', x: 0, y: 0, width: 600, height: 240 },
      children: pair.context.underlay
        ? [
            {
              id: 'background',
              useId: 'background',
              shape: { kind: 'rect', x: 0, y: 0, width: 600, height: 240 },
              children: [foreground],
            },
          ]
        : [foreground],
    },
  };
  return buildColorSystemProductGraphicsProjectionV1(board, {
    provenance: 'legacy-pair-only',
    requirementsHash: null,
    contextId: specimen.derivationId,
    uses: [
      ...(pair.context.underlay
        ? [
            {
              id: 'underlay',
              role: 'outer-backdrop' as const,
              assessment: 'decorative' as const,
              ref: pair.context.underlay,
            },
          ]
        : []),
      {
        id: 'background',
        role: pair.context.underlay ? 'card-surface' : 'outer-backdrop',
        assessment: 'decorative',
        ref: pair.context.background,
      },
      {
        id: 'foreground',
        role: roleForJob(specimen.job),
        assessment: 'informative',
        ref: pair.context.foreground,
      },
    ],
    pairs: [
      {
        pairEvidenceId: pair.context.id,
        foregroundUseId: 'foreground',
        backgroundUseId: 'background',
        underlayUseId: pair.context.underlay ? 'underlay' : null,
      },
    ],
  });
}

/** Bounded inert projection validation for native preflight; no source or geometry admission. */
export function readColorSystemProductGraphicsRenderingV1(
  input: unknown
): ColorSystemProductGraphicsRenderingV1 {
  const value = snapshotColorSystemInertJsonV1(input, BOUNDARY);
  const data = object(value, [
    'policyVersion',
    'provenance',
    'requirementsHash',
    'contextId',
    'layoutHash',
    'width',
    'height',
    'nodes',
    'uses',
    'pairs',
  ]);
  if (
    data.policyVersion !== COLOR_SYSTEM_PRODUCT_GRAPHICS_RENDERING_V1_VERSION ||
    !['declared-context', 'legacy-pair-only'].includes(String(data.provenance)) ||
    (data.provenance === 'declared-context'
      ? !HASH.test(String(data.requirementsHash))
      : data.requirementsHash !== null)
  )
    fail('Invalid rendering identity.');
  text(data.contextId);
  for (const size of [data.width, data.height])
    if (typeof size !== 'number' || size <= 0 || size > 8192 || !Number.isSafeInteger(size * 64))
      fail('Invalid rendering size.');
  const uses = list(data.uses, 32).map(value => {
    const use = object(value, ['id', 'role', 'assessment', 'ref']);
    text(use.id);
    ref(use.ref);
    if (
      !ROLES.includes(use.role as ColorSystemGraphicRoleV1) ||
      !['informative', 'decorative'].includes(String(use.assessment))
    )
      fail('Invalid rendered use.');
    return use as unknown as ColorSystemProductGraphicsRenderingV1['uses'][number];
  });
  unique(
    uses.map(use => use.id),
    'rendered uses'
  );
  const useIds = new Set(uses.map(use => use.id));
  const seen = new Set<string>();
  const projected = list(data.nodes, 1024).map((value, index) => {
    const node = object(value, [
      'id',
      'parentId',
      'useId',
      'kind',
      'x',
      'y',
      'width',
      'height',
      'path',
      'textAlternative',
    ]);
    const id = text(node.id);
    text(node.useId);
    if (
      seen.has(id) ||
      !useIds.has(String(node.useId)) ||
      (index === 0 ? node.parentId !== null : !seen.has(String(node.parentId)))
    )
      fail('Rendering tree is not ordered and reference-closed.');
    seen.add(id);
    for (const key of ['x', 'y', 'width', 'height'])
      if (
        typeof node[key] !== 'number' ||
        !Number.isFinite(node[key]) ||
        Number(node[key]) < 0 ||
        !Number.isSafeInteger(Number(node[key]) * 64)
      )
        fail('Invalid node bounds.');
    if (
      Number(node.width) <= 0 ||
      Number(node.height) <= 0 ||
      Number(node.x) + Number(node.width) > Number(data.width) ||
      Number(node.y) + Number(node.height) > Number(data.height)
    )
      fail('Node lies outside its board.');
    if (
      node.kind === 'rectangle'
        ? node.path !== null
        : node.kind !== 'vector' ||
          typeof node.path !== 'string' ||
          !node.path.length ||
          node.path.length > 524288 ||
          !/^[MLZ0-9.e+\-\s]+$/.test(node.path)
    )
      fail('Invalid inert shape path.');
    if (node.textAlternative !== null) text(node.textAlternative);
    return node as unknown as ColorSystemProductGraphicsRenderNodeV1;
  });
  if (!projected.length || uses.some(use => !projected.some(node => node.useId === use.id)))
    fail('Rendering omits an actual paint use.');
  const pairs = list(data.pairs, 64).map(value => {
    const pair = object(value, [
      'pairEvidenceId',
      'foregroundUseId',
      'backgroundUseId',
      'underlayUseId',
    ]);
    text(pair.pairEvidenceId);
    if (
      ![
        pair.foregroundUseId,
        pair.backgroundUseId,
        ...(pair.underlayUseId === null ? [] : [pair.underlayUseId]),
      ].every(id => useIds.has(String(id)))
    )
      fail('Rendering pair refers to absent paint.');
    return pair as unknown as ColorSystemProductGraphicsRenderingV1['pairs'][number];
  });
  unique(
    pairs.map(pair => pair.pairEvidenceId),
    'rendered pair IDs'
  );
  if (
    data.layoutHash !==
    deterministicContentHash({ width: data.width, height: data.height, nodes: projected })
  )
    fail('Rendering layout identity changed.');
  return {
    ...data,
    nodes: projected,
    uses,
    pairs,
  } as unknown as ColorSystemProductGraphicsRenderingV1;
}
