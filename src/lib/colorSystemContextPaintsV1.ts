/** Explicit user context values; never imported palette facts or automatic source exceptions. */
import { captureColorSystemModelV1, COLOR_SYSTEM_MODEL_V1_LIMITS } from './colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from './colorSystemProposalV1';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';

export const COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION = 'teul.context-paints.v1' as const;
export const COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT = 8;
export interface ColorSystemContextPaintsInputV1 {
  readonly version: typeof COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION;
  readonly id: string;
  /** An input attribution, not corporate approval or a source-rule decision. */
  readonly actor: { readonly kind: 'user'; readonly ref: string };
  readonly paints: readonly {
    readonly id: string;
    readonly label: string;
    readonly modeId: string;
    readonly role: 'background' | 'foreground';
    readonly value: ColorSystemColorValueV2;
  }[];
}
export interface ColorSystemContextPaintsRequestV1 extends ColorSystemContextPaintsInputV1 {
  readonly sourceModelHash: string;
  readonly brief: ColorSystemProposalRequestV1['brief'];
}
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const LIMITS = { maximumBytes: 32768, maximumDepth: 16, maximumNodes: 4096 };
const POLICY_HASH = hash({
  version: COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION,
  maximumPaints: COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT,
  values: 'Exact canonical opaque sRGB supplied by the user; never rounded to display hex.',
  identity: 'Stable namespace by declaration and authored paint IDs, independent of value or mode.',
  authority: 'No source colors, families, scales, rules, adoptions or permissions are changed.',
});
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Context paints require an inert record.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !(key in input)))
    throw new Error('Context paints contain missing or unknown fields.');
  return input;
}
function text(value: unknown, maximum: number = COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error('Context paint identity is blank or exceeds its bound.');
  return value;
}

export function colorSystemContextPaintAllowsRoleV1(
  role: 'background' | 'foreground',
  applicationRole: string
): boolean {
  return role === 'background'
    ? applicationRole === 'ground'
    : /^(?:label|text)(?:-[1-9][0-9]?)?$/.test(applicationRole);
}

/** IDs remain stable across edits; the request and proposal hashes bind every exact value. */
export function colorSystemContextPaintIdV1(declarationId: string, paintId: string): string {
  return `context:${hash({ declarationId: text(declarationId, 64), paintId: text(paintId) }).slice(7)}`;
}

/** Source-independent input parsing also serves unfinished Studio controls. */
export function readColorSystemContextPaintsInputV1(raw: unknown): ColorSystemContextPaintsInputV1 {
  const input = record(snapshotColorSystemInertJsonV1(raw, LIMITS), [
    'version',
    'id',
    'actor',
    'paints',
  ]);
  if (input.version !== COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION)
    throw new Error('Unsupported context paint version.');
  const declarationId = text(input.id, 64);
  const actor = record(input.actor, ['kind', 'ref']);
  if (actor.kind !== 'user') throw new Error('Context paints require explicit user input.');
  const actorRef = text(actor.ref);
  if (
    !Array.isArray(input.paints) ||
    !input.paints.length ||
    input.paints.length > COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT
  )
    throw new Error('Choose one through eight authored context paints.');
  const seen = new Set<string>();
  const paints: ColorSystemContextPaintsRequestV1['paints'] = input.paints.map(rawPaint => {
    const paint = record(rawPaint, ['id', 'label', 'modeId', 'role', 'value']);
    const id = text(paint.id),
      label = text(paint.label),
      modeId = text(paint.modeId);
    if (seen.has(id)) throw new Error('Authored paint IDs must be distinct.');
    seen.add(id);
    if (paint.role !== 'background' && paint.role !== 'foreground')
      throw new Error('Declare the intended background or foreground role.');
    const value = normalizeColorSystemSrgbValueV1(paint.value as ColorSystemColorValueV2);
    if (value.alpha !== 1 || canonicalJson(value) !== canonicalJson(paint.value))
      throw new Error('Context paints must be exact canonical opaque sRGB.');
    return { id, label, modeId, role: paint.role, value };
  });
  return {
    version: COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION,
    id: declarationId,
    actor: { kind: 'user', ref: actorRef },
    paints,
  };
}

export function buildColorSystemContextPaintsV1(sourceInput: unknown, raw: unknown) {
  const source = captureColorSystemModelV1(sourceInput);
  const input = record(snapshotColorSystemInertJsonV1(raw, LIMITS), [
    'version',
    'id',
    'sourceModelHash',
    'brief',
    'actor',
    'paints',
  ]);
  if (input.sourceModelHash !== source.modelHash)
    throw new Error('Unsupported context paints or changed source.');
  const { sourceModelHash: _source, brief: rawBrief, ...values } = input;
  const parsed = readColorSystemContextPaintsInputV1(values);
  const brief = rawBrief as ColorSystemProposalRequestV1['brief'] | null;
  for (const paint of parsed.paints)
    if (
      !brief ||
      !Array.isArray(brief.modeIds) ||
      !Array.isArray(brief.contextIds) ||
      !brief.modeIds.includes(paint.modeId) ||
      brief.contextIds.some(
        contextId =>
          !source.contexts.find(context => context.id === contextId)?.modeIds.includes(paint.modeId)
      )
    )
      throw new Error('Context paint mode must exist in every declared context.');
  const {
    id: declarationId,
    actor: { ref: actorRef },
    paints,
  } = parsed;
  const request: ColorSystemContextPaintsRequestV1 = {
    ...parsed,
    sourceModelHash: source.modelHash,
    brief: brief!,
  };
  const requestHash = hash(request);
  const mappings = paints.map(paint => ({
    paintId: paint.id,
    colorId: colorSystemContextPaintIdV1(declarationId, paint.id),
    modeId: paint.modeId,
    role: paint.role,
  }));
  const proposal = buildColorSystemProposalV1(source, {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: `context:${hash(declarationId).slice(7, 55)}`,
    sourceModelHash: source.modelHash,
    brief: request.brief,
    derivation: {
      algorithmId: COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION,
      algorithmVersion: '1',
      policyHash: POLICY_HASH,
      inputHash: requestHash,
      sourceColorIds: [],
      sourceScaleIds: [],
      authoredContext: {
        actorRef,
        contextIds: request.brief.contextIds,
        paints: mappings.map(({ colorId, modeId, role }) => ({ colorId, modeId, role })),
      },
    },
    colors: paints.map((paint, index) => ({
      id: mappings[index].colorId,
      label: paint.label,
      valuesByMode: { [paint.modeId]: paint.value },
    })),
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  });
  return {
    version: COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION,
    qualified: false as const,
    request,
    requestHash,
    mappings,
    proposal,
  };
}
