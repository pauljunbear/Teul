import {
  freeze,
  type FigmaCapturePacket,
} from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  canonicalIntakeJson,
  type JsonValue,
} from '../../../../services/guideline-intake/src/protocol';
import type { ColorSystemSourceIdentityV1 } from '../../../../src/lib/colorSystemModelV1';
import { colorSystemInventoryModeIdV1 } from '../../../../src/lib/colorSystemModelSourceAdapterV1';
import { guidelineHash } from './review';
import { hashCanonical } from './intakeClient';
import { readFigmaCapture } from './figmaCapture';

type Data = Record<string, JsonValue>;
export interface FigmaNativeChannels {
  r: number;
  g: number;
  b: number;
  alpha: number;
}
export interface FigmaNativeObservation {
  modeId: string;
  value: FigmaNativeChannels | null;
  aliasPath: readonly string[];
  gap: string | null;
}
export interface FigmaNativeDeclaration {
  id: string;
  kind: 'node-paint' | 'variable';
  sourceId: string;
  label: string;
  locator: string;
  observations: readonly FigmaNativeObservation[];
  notices: readonly string[];
}
export interface FigmaNativeInventory {
  readonly packet: FigmaCapturePacket;
  readonly sources: readonly ColorSystemSourceIdentityV1[];
  readonly modes: readonly {
    id: string;
    label: string;
    collectionId: string | null;
    nativeModeId: string | null;
  }[];
  readonly declarations: readonly FigmaNativeDeclaration[];
  readonly texts: readonly { id: string; sourceId: string; locator: string; text: string }[];
  readonly unsupported: readonly { locator: string; reason: string }[];
}
const trusted = new WeakSet<object>();
const MAX_DECLARATIONS = 10000;
const MAX_OBSERVATIONS = 20000;
const MAX_MODES = 10000;
const MAX_ALIAS_DEPTH = 64;
const STATIC_MODE = 'figma:captured-paints';
export function figmaNativeId(kind: string, identity: unknown): string {
  return `figma:${kind}:${guidelineHash(identity).slice(7, 39)}`;
}
function object(value: unknown): Data | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : null;
}
function unit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function channels(value: unknown, opacity: unknown = 1): FigmaNativeChannels | null {
  const color = object(value);
  const alpha = color?.a === undefined ? 1 : color.a;
  if (
    !color ||
    !unit(color.r) ||
    !unit(color.g) ||
    !unit(color.b) ||
    !unit(alpha) ||
    !unit(opacity) ||
    Object.keys(color).some(key => !['r', 'g', 'b', 'a'].includes(key))
  )
    return null;
  return { r: color.r, g: color.g, b: color.b, alpha: alpha * opacity };
}

function unsupportedProfile(value: Data): string | null {
  for (const key of ['colorProfile', 'colorSpace']) {
    const profile = value[key];
    if (profile !== undefined && !['srgb', 'SRGB'].includes(String(profile)))
      return `Recorded ${key} is not supported for native sRGB interpretation. Preserve the original channels until an explicit conversion is available.`;
  }
  return null;
}

/** Native evidence only. The profile decision and any brand interpretation belong to review. */
export async function createFigmaNativeInventory(raw: unknown): Promise<FigmaNativeInventory> {
  const packet = await readFigmaCapture(raw);
  const [nodeHash, variableHash] = await Promise.all([
    hashCanonical(
      canonicalIntakeJson({ request: packet.request, file: packet.file, roots: packet.roots })
    ),
    hashCanonical(
      canonicalIntakeJson({
        fileKey: packet.request.fileKey,
        capturedAt: packet.capturedAt,
        variables: packet.variables,
      })
    ),
  ]);
  const source = (
    kind: string,
    hash: string,
    version: string | null
  ): ColorSystemSourceIdentityV1 => ({
    id: figmaNativeId('source', [kind, hash]),
    label: `${packet.file.name} / ${kind}`.slice(0, 4096),
    sourceHash: hash,
    version,
    locator: `https://www.figma.com/design/${packet.request.fileKey}`,
    freshnessMode: 'imported-snapshot',
    status: 'unknown',
  });
  const nodes = source('captured nodes', nodeHash, packet.file.returnedVersion);
  const variables = source('current variables (unversioned read)', variableHash, null);
  const sources = [nodes];
  const modes: FigmaNativeInventory['modes'][number][] = [];
  const declarations: FigmaNativeDeclaration[] = [];
  const texts: FigmaNativeInventory['texts'][number][] = [];
  const unsupported: FigmaNativeInventory['unsupported'][number][] = [];
  let observationCount = 0;
  const checkObservationCapacity = (count: number) => {
    if (observationCount + count > MAX_OBSERVATIONS)
      throw new Error(
        'More than 20,000 native mode values. Narrow the captured variable scope; the original packet is retained.'
      );
  };
  const add = (declaration: FigmaNativeDeclaration) => {
    if (declarations.length >= MAX_DECLARATIONS)
      throw new Error('More than 10,000 native declarations. Select fewer Figma frames.');
    checkObservationCapacity(declaration.observations.length);
    observationCount += declaration.observations.length;
    declarations.push(declaration);
  };
  const seen = new Set<string>();
  // Overlapping selections can list a child before its ancestor. Gather contextual profile
  // restrictions first so selection order cannot hide an observed conflicting profile.
  const profileGaps = new Map<string, string>();
  const collectProfiles = (node: Data, inherited: string | null = null) => {
    const gap = inherited ?? unsupportedProfile(node);
    if (gap) profileGaps.set(String(node.id), gap);
    if (Array.isArray(node.children))
      node.children.forEach(child => collectProfiles(child as Data, gap));
  };
  packet.roots.forEach(root => collectProfiles(root.document));
  const visit = (node: Data) => {
    const nodeId = String(node.id);
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const profileGap = profileGaps.get(nodeId) ?? null;
    const locator = `node:${nodeId}`;
    if (typeof node.characters === 'string' && node.characters.trim())
      texts.push({
        id: figmaNativeId('text', [nodes.id, nodeId]),
        sourceId: nodes.id,
        locator: `${locator}/characters`,
        text: node.characters,
      });
    for (const property of ['fills', 'strokes', 'background']) {
      if (node[property] === undefined) continue;
      if (!Array.isArray(node[property])) {
        unsupported.push({
          locator: `${locator}/${property}`,
          reason: 'Paint list is not available in a supported native form.',
        });
        continue;
      }
      node[property].forEach((rawPaint, index) => {
        const paint = object(rawPaint);
        const paintLocator = `${locator}/${property}/${index}`;
        if (paint?.type !== 'SOLID') {
          unsupported.push({
            locator: paintLocator,
            reason: `Native ${String(paint?.type ?? 'unknown')} paint remains in the packet; it is not a solid declaration.`,
          });
          return;
        }
        const paintProfileGap = profileGap ?? unsupportedProfile(paint);
        const value = paintProfileGap ? null : channels(paint.color, paint.opacity);
        add({
          id: figmaNativeId('paint', [nodes.id, nodeId, property, index]),
          kind: 'node-paint',
          sourceId: nodes.id,
          label: `${node.name} / ${property} ${index + 1}`.slice(0, 4096),
          locator: paintLocator,
          observations: [
            {
              modeId: STATIC_MODE,
              value,
              aliasPath: [],
              gap:
                paintProfileGap ??
                (value ? null : 'Native color channels or paint opacity are unsupported.'),
            },
          ],
          notices: [
            'Captured node paint; not proof of a Paint Style, palette membership, scale or token role.',
            'Color alpha and paint opacity are combined; layer/ancestor opacity, blending and surrounding appearance are not flattened.',
            ...(paint.boundVariables || node.boundVariables
              ? [
                  'Native bindings remain evidence; current variable values do not replace captured paint.',
                ]
              : []),
            ...(paint.visible === false || node.visible === false
              ? ['This paint or its node was explicitly hidden.']
              : []),
          ],
        });
      });
    }
    for (const property of ['backgroundColor', 'effects', 'styleOverrideTable'])
      if (node[property] !== undefined)
        unsupported.push({
          locator: `${locator}/${property}`,
          reason:
            'This color-bearing property remains in the packet; native declaration conversion is not yet supported.',
        });
    if (node.styles)
      unsupported.push({
        locator: `${locator}/styles`,
        reason:
          'Style references and descriptors do not contain a complete reusable Paint Style declaration.',
      });
    if (Array.isArray(node.children)) node.children.forEach(child => visit(child as Data));
  };
  packet.roots.forEach(root => visit(root.document));
  if (declarations.length)
    modes.push({
      id: STATIC_MODE,
      label: 'Captured node paints (working binding)',
      collectionId: null,
      nativeModeId: null,
    });

  const collections = new Map<
    string,
    { modes: { id: string; modeId: string; name: string }[]; gap: string | null }
  >();
  if (packet.variables.status === 'captured') {
    sources.push(variables);
    for (const [id, rawCollection] of Object.entries(packet.variables.collections)) {
      const collection = object(rawCollection);
      const nativeModes = collection?.modes;
      if (!collection || collection.id !== id || !Array.isArray(nativeModes) || !nativeModes.length)
        throw new Error(
          'Captured variable collection has invalid identity or modes. Retain the packet and capture again.'
        );
      if (modes.length + nativeModes.length > MAX_MODES)
        throw new Error('More than 10,000 native modes. Narrow the captured variable scope.');
      const ids = new Set<string>();
      const parsed = nativeModes.map(rawMode => {
        const mode = object(rawMode);
        if (
          !mode ||
          typeof mode.modeId !== 'string' ||
          !mode.modeId ||
          mode.modeId.length > 256 ||
          typeof mode.name !== 'string' ||
          !mode.name.trim() ||
          mode.name.length > 4096 ||
          ids.has(mode.modeId)
        )
          throw new Error(
            'Captured variable modes must have distinct native identities and readable names.'
          );
        ids.add(mode.modeId);
        return {
          id: colorSystemInventoryModeIdV1(variables.id, id, mode.modeId),
          modeId: mode.modeId,
          name: mode.name,
        };
      });
      const gap =
        collection.isExtension === true || collection.parentVariableCollectionId
          ? 'Extended collection inheritance and overrides require an explicit resolver.'
          : collection.deletedButReferenced === true
            ? 'Collection was deleted but remains referenced.'
            : null;
      collections.set(id, { modes: parsed, gap });
      for (const mode of parsed)
        modes.push({
          id: mode.id,
          label: `${String(collection.name ?? id)} / ${mode.name}`.slice(0, 4096),
          collectionId: id,
          nativeModeId: mode.modeId,
        });
    }
    const values = new Map<string, Data>();
    for (const [id, rawVariable] of Object.entries(packet.variables.values)) {
      const variable = object(rawVariable);
      if (!variable || variable.id !== id || typeof variable.variableCollectionId !== 'string')
        throw new Error('Captured variable identity does not match its declaration.');
      values.set(id, variable);
    }
    const resolve = (variable: Data, modeId: string): Omit<FigmaNativeObservation, 'modeId'> => {
      const aliasPath: string[] = [];
      let current = variable;
      const fail = (gap: string) => ({ value: null, aliasPath, gap });
      for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth++) {
        const id = String(current.id);
        if (aliasPath.includes(id)) return fail('Variable aliases contain a cycle.');
        aliasPath.push(id);
        if (current.deletedButReferenced === true)
          return fail('Variable was deleted but remains referenced.');
        if (current.resolvedType !== 'COLOR') return fail('Alias target is not a COLOR variable.');
        const rawValue = object(current.valuesByMode)?.[modeId];
        if (rawValue === undefined) return fail('No value was captured for this native mode.');
        const literal = channels(rawValue);
        if (literal) return { value: literal, aliasPath, gap: null };
        const alias = object(rawValue);
        if (
          alias?.type !== 'VARIABLE_ALIAS' ||
          typeof alias.id !== 'string' ||
          Object.keys(alias).length !== 2
        )
          return fail('Unsupported variable value, including composed channel/opacity values.');
        const target = values.get(alias.id);
        if (!target) return fail('Alias target was not captured.');
        if (target.variableCollectionId !== variable.variableCollectionId)
          return fail(
            'Cross-collection alias needs explicit mode mapping; matching names or defaults are not used.'
          );
        current = target;
      }
      return fail(`Alias chain exceeds ${MAX_ALIAS_DEPTH} declarations.`);
    };
    for (const [id, variable] of values) {
      if (variable.resolvedType !== 'COLOR') {
        unsupported.push({
          locator: `variable:${id}`,
          reason: 'Non-COLOR variable retained as evidence.',
        });
        continue;
      }
      const collectionId = String(variable.variableCollectionId);
      const collection = collections.get(collectionId);
      checkObservationCapacity(collection?.modes.length ?? 0);
      const notices = [
        'Separate unversioned current-variable read; not evidence of the pinned node revision.',
      ];
      if (!collection)
        notices.push('Variable collection was not captured; no mode or value is invented.');
      add({
        id: figmaNativeId('variable', [variables.id, id]),
        kind: 'variable',
        sourceId: variables.id,
        label: String(variable.name ?? id).slice(0, 4096),
        locator: `variable:${id}`,
        observations: (collection?.modes ?? []).map(mode => ({
          modeId: mode.id,
          ...(collection?.gap
            ? { value: null, aliasPath: [], gap: collection.gap }
            : resolve(variable, mode.modeId)),
        })),
        notices,
      });
    }
  }
  const inventory = freeze({ packet, sources, modes, declarations, texts, unsupported });
  trusted.add(inventory);
  return inventory;
}

export function assertFigmaNativeInventory(inventory: FigmaNativeInventory): void {
  if (!trusted.has(inventory)) throw new Error('Use a validated native Figma inventory.');
}
