/** Captured gradient paint stays separate from the reviewed solid-color palette. */
import type { JsonValue } from '../../../../services/guideline-intake/src/protocol';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze, FIGMA_READ_LIMITS } from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  inspectNativeGradientPaintV1 as geometry,
  nativeGradientProfileIssuesV1 as profileIssues,
  serializeNativeGradientSvgV1,
} from '../../../../src/lib/colorSystemNativeGradientGeometryV1';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import {
  assertFigmaNativeInventory,
  figmaNativeId,
  type FigmaNativeInventory,
} from './figmaInventory';
import { guidelineHash } from './review';

type Data = Record<string, JsonValue>;
export const NATIVE_GRADIENT_RENDERER = 'teul.native-gradient-svg.v1' as const;
export const NATIVE_GRADIENT_MODE = 'figma:captured-paints';
export interface NativeGradientEvidence {
  readonly id: string;
  readonly captureHash: string;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly modeId: typeof NATIVE_GRADIENT_MODE;
  readonly nodeId: string;
  readonly locator: string;
  readonly label: string;
  readonly paint: JsonValue;
  readonly context: readonly { locator: string; value: JsonValue }[];
  readonly limitations: readonly string[];
  readonly evidenceHash: string;
}
export interface NativeGradientRendering {
  readonly renderer: typeof NATIVE_GRADIENT_RENDERER;
  readonly interpretation: 'srgb';
  readonly width: number;
  readonly height: number;
  readonly status: 'interpreted' | 'unsupported';
  readonly limitations: readonly string[];
  readonly notices: readonly string[];
  readonly svg: string | null;
  readonly renderingHash: string;
}
const trusted = new WeakSet<object>();
const inventories = new WeakMap<FigmaNativeInventory, readonly NativeGradientEvidence[]>();
const object = (value: unknown): Data | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : null;
const CONTEXT_FIELDS = [
  'visible',
  'opacity',
  'blendMode',
  'effects',
  'isMask',
  'maskType',
  'clipsContent',
  'colorProfile',
  'colorSpace',
] as const;

function contextIssues(node: Data): string[] {
  return [
    ...profileIssues(node),
    ...(node.visible !== undefined && node.visible !== true
      ? ['A captured node or ancestor is hidden or has unknown visibility.']
      : []),
    ...(node.opacity !== undefined && node.opacity !== 1
      ? ['Layer or ancestor opacity requires a flattened source rendering.']
      : []),
    ...(node.blendMode !== undefined && !['NORMAL', 'PASS_THROUGH'].includes(String(node.blendMode))
      ? ['Layer or ancestor blending requires a flattened source rendering.']
      : []),
    ...((node.isMask !== undefined && node.isMask !== false) || node.maskType !== undefined
      ? ['Captured masking requires a flattened source rendering.']
      : []),
    ...(node.clipsContent !== undefined && node.clipsContent !== false
      ? ['Captured clipping is outside this isolated-paint comparison.']
      : []),
    ...(node.effects !== undefined &&
    (!Array.isArray(node.effects) || node.effects.some(effect => object(effect)?.visible !== false))
      ? ['Captured effects require a flattened source rendering.']
      : []),
  ];
}

/** All overlapping capture paths contribute context; selecting a child first cannot hide a restriction. */
export function figmaNativeGradients(
  inventory: FigmaNativeInventory
): readonly NativeGradientEvidence[] {
  assertFigmaNativeInventory(inventory);
  const cached = inventories.get(inventory);
  if (cached) return cached;
  const contexts = new Map<string, Map<string, { locator: string; value: JsonValue }>>();
  const problems = new Map<string, Set<string>>();
  const nodes = new Map<string, Data>();
  const contextBytes = new Map<string, number>();
  let retainedBytes = 0;
  let retainedContextBytes = 0;
  const reserve = (bytes: number, context = false) => {
    if (context) retainedContextBytes += bytes;
    else retainedBytes += bytes;
    if (Math.max(retainedBytes, retainedContextBytes) > FIGMA_READ_LIMITS.responseBytes)
      throw new Error(
        'Native gradient comparison evidence exceeds 8 MiB; choose a smaller capture.'
      );
  };
  const visit = (
    node: Data,
    inherited: { locator: string; value: JsonValue }[],
    issues: string[]
  ) => {
    const id = String(node.id);
    const own = CONTEXT_FIELDS.flatMap(key =>
      node[key] === undefined ? [] : [{ locator: `node:${id}/${key}`, value: node[key] }]
    );
    const scope = own.length ? [...inherited, ...own] : inherited;
    const allIssues = [...issues, ...contextIssues(node)];
    if (
      ['fills', 'strokes', 'background'].some(
        property =>
          Array.isArray(node[property]) &&
          node[property].some(raw => {
            const type = object(raw)?.type;
            return typeof type === 'string' && type.startsWith('GRADIENT_');
          })
      )
    ) {
      // The validated packet already rejects contradictory node properties and child identities.
      nodes.set(id, node);
      const evidence = contexts.get(id) ?? new Map();
      scope.forEach(item => {
        if (evidence.has(item.locator)) return;
        let bytes = contextBytes.get(item.locator);
        if (bytes === undefined) {
          bytes = utf8ByteLength(JSON.stringify(item));
          contextBytes.set(item.locator, bytes);
        }
        reserve(bytes, true);
        evidence.set(item.locator, item);
      });
      contexts.set(id, evidence);
      const limits = problems.get(id) ?? new Set();
      allIssues.forEach(issue => limits.add(issue));
      problems.set(id, limits);
    }
    if (Array.isArray(node.children)) {
      const masks = node.children.flatMap(child => {
        const sibling = object(child);
        if (!sibling || sibling.visible === false) return [];
        return ['isMask', 'maskType'].flatMap(key =>
          sibling[key] !== undefined && (key !== 'isMask' || sibling[key] !== false)
            ? [{ locator: `node:${sibling.id}/${key}`, value: sibling[key] }]
            : []
        );
      });
      const childIssues = masks.length
        ? [...allIssues, 'A captured sibling mask requires a flattened source rendering.']
        : allIssues;
      const childScope = masks.length ? [...scope, ...masks] : scope;
      node.children.forEach(child => visit(child as Data, childScope, childIssues));
    }
  };
  inventory.packet.roots.forEach(root => visit(root.document, [], []));
  const source = inventory.sources[0];
  const result: NativeGradientEvidence[] = [];
  for (const [nodeId, node] of nodes) {
    for (const property of ['fills', 'strokes', 'background']) {
      const paints = node[property];
      if (!Array.isArray(paints)) continue;
      paints.forEach((raw, index) => {
        const paint = object(raw);
        if (!paint || typeof paint.type !== 'string' || !paint.type.startsWith('GRADIENT_')) return;
        const locator = `node:${nodeId}/${property}/${index}`;
        const limits = new Set(problems.get(nodeId));
        if (property !== 'fills')
          limits.add(
            'Only isolated fill gradients have a comparison renderer; stroke/background geometry is retained.'
          );
        if (paints.some((other, i) => i !== index && object(other)?.visible !== false))
          limits.add('Other visible paints require a flattened source rendering.');
        if (
          node.strokes !== undefined &&
          (!Array.isArray(node.strokes) ||
            node.strokes.some(other => object(other)?.visible !== false))
        )
          limits.add('Visible strokes require a flattened source rendering.');
        const content: Omit<NativeGradientEvidence, 'evidenceHash'> = {
          id: figmaNativeId('gradient', [source.id, nodeId, property, index]),
          captureHash: inventory.packet.contentHash,
          sourceId: source.id,
          sourceHash: source.sourceHash,
          modeId: NATIVE_GRADIENT_MODE,
          nodeId,
          locator,
          label: `${node.name} / ${property} ${index + 1}`.slice(0, 4096),
          paint: raw,
          context: [...(contexts.get(nodeId)?.entries() ?? [])]
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([, value]) => value),
          limitations: [...limits].sort(),
        };
        reserve(utf8ByteLength(JSON.stringify(content)));
        const value = freeze({ ...content, evidenceHash: guidelineHash(content) });
        trusted.add(value);
        result.push(value);
      });
    }
  }
  const captured = freeze(result);
  inventories.set(inventory, captured);
  return captured;
}

/** A declared sRGB interpretation, never a certificate of native Figma pixel equivalence. */
export function renderFigmaNativeGradient(
  evidence: NativeGradientEvidence,
  input: { interpretation: 'srgb'; width: number; height: number }
): NativeGradientRendering {
  if (!trusted.has(evidence))
    throw new Error('Resolve the native gradient from its validated capture.');
  record(input, ['interpretation', 'width', 'height']);
  if (
    input.interpretation !== 'srgb' ||
    ![input.width, input.height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096)
  )
    throw new Error('Choose explicit sRGB interpretation and a 64–4096 pixel comparison frame.');
  const paint = object(evidence.paint)!;
  const parsed = geometry(paint);
  const limitations = [...new Set([...evidence.limitations, ...parsed.issues])];
  const notices = [
    'Native stops and normalized handles are retained on an authored comparison frame; this is not the original node geometry.',
    'sRGB channels and interpolation are explicit working interpretations. The capture does not establish Figma interpolation or pixel equivalence.',
    'Isolated captured paint, not the flattened Figma scene. No source contrast, source-rule approval or brand approval is inferred.',
    'Only retained context is inspected; uncaptured ancestor or paint properties may affect the original appearance.',
    ...(parsed.stops.some(stop => 'boundVariables' in stop) || paint.boundVariables
      ? [
          'Variable bindings remain captured evidence; current variable values do not replace these stops.',
        ]
      : []),
  ];
  const svg = limitations.length
    ? null
    : serializeNativeGradientSvgV1(paint, input.width, input.height, {
        label: evidence.label,
        description: notices.join(' '),
      });
  const content = {
    renderer: NATIVE_GRADIENT_RENDERER,
    interpretation: input.interpretation,
    width: input.width,
    height: input.height,
    status: limitations.length ? ('unsupported' as const) : ('interpreted' as const),
    limitations,
    notices,
    svg,
  };
  return freeze({
    ...content,
    renderingHash: guidelineHash({ evidenceHash: evidence.evidenceHash, ...content }),
  });
}
