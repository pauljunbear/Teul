import { colorSystemDerivationNoticeV1 } from './colorSystemValueProvenanceV1';
/** A declared working proposal is separate from the immutable source and from trusted execution. */
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  hashColorSystemScopedRuleV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS,
  parseColorSystemModelV1,
  type ColorSystemAuthoredFamilyV1,
  type ColorSystemAuthoredScaleV1,
  type ColorSystemModelInputV1,
  type ColorSystemModelV1,
  type ColorSystemRuleAdoptionDecisionV1,
  type ColorSystemRuleAdoptionV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSourceColorV1,
} from './colorSystemModelV1';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
} from './colorSystemRelationshipsV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

export const COLOR_SYSTEM_PROPOSAL_V1_VERSION = 'teul.color-system-proposal.v1' as const;
type Links = 'evidenceRefs' | 'claimIds';
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export interface ColorSystemProposalOriginV1 {
  readonly id: string;
  /** Declared leaf or individual rule proposal identity, excluding its review decisions. */
  readonly sourceHash: string;
  readonly derivation: ColorSystemProposalRequestV1['derivation'];
  readonly colorIds: readonly string[];
  readonly familyIds: readonly string[];
  readonly scaleIds: readonly string[];
  readonly ruleIds: readonly string[];
}
export interface ColorSystemProposalRequestV1 {
  readonly version: typeof COLOR_SYSTEM_PROPOSAL_V1_VERSION;
  readonly id: string;
  readonly sourceModelHash: string;
  readonly brief: {
    readonly briefHash: string;
    readonly operation: 'apply' | 'extend' | 'explore';
    readonly contextIds: readonly string[];
    readonly modeIds: readonly string[];
    readonly permissions: {
      readonly addColors: boolean;
      readonly addFamilies: boolean;
      readonly addScales: boolean;
      readonly addRules: boolean;
      readonly editFamilyIds: readonly string[];
      readonly editScaleIds: readonly string[];
      readonly replaceRuleIds: readonly string[];
    };
  };
  /** These identifiers/hashes declare lineage. A later backend must reproduce it independently. */
  readonly derivation: {
    readonly algorithmId: string;
    readonly algorithmVersion: string;
    readonly policyHash: string;
    readonly inputHash: string;
    readonly sourceColorIds: readonly string[];
    readonly sourceScaleIds: readonly string[];
    readonly provider?: {
      readonly id: 'wada' | 'werner' | 'radix';
      readonly sourceVersion: string;
      readonly catalogHash: string;
      readonly candidateHash: string;
      readonly queryHash: string;
      readonly policyHash: string;
    };
  };
  readonly colors: readonly Omit<
    ColorSystemSourceColorV1,
    Links | 'sourceId' | 'valueGapClaimIdsByMode'
  >[];
  /** A named existing structure is an explicit additive edit, never an implicit membership grant. */
  readonly families: readonly Omit<ColorSystemAuthoredFamilyV1, Links>[];
  readonly scales: readonly Omit<ColorSystemAuthoredScaleV1, Links>[];
  readonly rules: readonly DistributiveOmit<ColorSystemScopedRuleV1, Links | 'origin'>[];
  readonly exceptions: readonly {
    readonly sourceRuleId: string;
    readonly replacementRuleId: string;
    readonly reason: string;
  }[];
  /** Optional independent declared origins; every changed entity must be covered. */
  readonly origins?: readonly ColorSystemProposalOriginV1[];
  /** Existing declared decisions are retained only with unchanged rule/dependency bindings. */
  readonly retainedAdoptions?: readonly ColorSystemRuleAdoptionV1[];
  readonly review?: {
    readonly reviewedProposalHash: string;
    readonly decisions: readonly ColorSystemRuleAdoptionDecisionV1[];
  };
}

export interface ColorSystemProposalV1 {
  readonly version: typeof COLOR_SYSTEM_PROPOSAL_V1_VERSION;
  readonly status: 'proposed';
  readonly proposalHash: string;
  readonly sourceModelHash: string;
  readonly briefHash: string;
  readonly derivationStatus: 'declared-not-recomputed';
  readonly reviewStatus: 'absent' | 'current' | 'stale';
  readonly pendingRuleIds: readonly string[];
  readonly request: ColorSystemProposalRequestV1;
  readonly sourceAssessmentModel: ColorSystemModelV1;
  readonly workingModel: ColorSystemModelV1;
  readonly retention?: {
    readonly retainedRuleIds: readonly string[];
    readonly staleRuleIds: readonly string[];
  };
}

const limits = COLOR_SYSTEM_MODEL_V1_LIMITS;
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function fail(message: string): never {
  throw new Error(`Invalid color-system proposal: ${message}`);
}

function detach(input: unknown): unknown {
  try {
    return snapshotColorSystemInertJsonV1(input, {
      maximumBytes: limits.maximumBytes,
      maximumDepth: limits.maximumDepth,
      maximumNodes: limits.maximumNodes,
      maximumObjectKeys: limits.maximumEvidence,
      maximumArrayLength: limits.maximumEvidence,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Unsupported inert input.');
  }
}
function record(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a record.');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(key => !required.includes(key) && !optional.includes(key)) ||
    required.some(key => !Object.prototype.hasOwnProperty.call(data, key))
  )
    fail('Missing or unknown field.');
  return data;
}
function text(value: unknown, maximum: number = limits.maximumId): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail('Text is blank or over its bound.');
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    fail('Expected a content hash.');
  return value;
}
function list(value: unknown, maximum: number = limits.maximumRefs): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail('Array exceeds its bound.');
  return value;
}
function ids(value: unknown, maximum: number = limits.maximumRefs): string[] {
  const result = list(value, maximum).map(item => text(item));
  if (new Set(result).size !== result.length) fail('Repeated identifier.');
  return result.sort(compareText);
}
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const within = (small: readonly string[], large: readonly string[]) =>
  small.every(id => large.includes(id));

function declaredDerivation(value: unknown, source: ColorSystemModelV1) {
  const derivation = record(
    value,
    [
      'algorithmId',
      'algorithmVersion',
      'policyHash',
      'inputHash',
      'sourceColorIds',
      'sourceScaleIds',
    ],
    ['provider']
  );
  text(derivation.algorithmId);
  text(derivation.algorithmVersion);
  hash(derivation.policyHash);
  hash(derivation.inputHash);
  derivation.sourceColorIds = ids(derivation.sourceColorIds);
  derivation.sourceScaleIds = ids(derivation.sourceScaleIds);
  if (
    !within(
      derivation.sourceColorIds as string[],
      source.colors.map(color => color.id)
    ) ||
    !within(
      derivation.sourceScaleIds as string[],
      source.scales.map(scale => scale.id)
    )
  )
    fail('Declared derivation references unknown source records.');
  if (derivation.provider !== undefined) {
    const provider = record(derivation.provider, [
      'id',
      'sourceVersion',
      'catalogHash',
      'candidateHash',
      'queryHash',
      'policyHash',
    ]);
    if (!['wada', 'werner', 'radix'].includes(provider.id as string))
      fail('Unknown declared catalog provider.');
    text(provider.sourceVersion, limits.maximumText);
    for (const key of ['catalogHash', 'candidateHash', 'queryHash', 'policyHash'])
      hash(provider[key]);
  }
  return derivation;
}

function decisionRecords(value: unknown, retained: boolean) {
  const entries = list(value, limits.maximumRules).map(raw => {
    const item = record(raw, [
      'ruleId',
      ...(retained ? ['ruleHash', 'dependencyHash'] : []),
      'status',
      'actor',
      'authorityRef',
      'decisionRef',
    ]);
    text(item.ruleId);
    if (retained) {
      hash(item.ruleHash);
      hash(item.dependencyHash);
    }
    if (!['accepted', 'rejected'].includes(item.status as string)) fail('Unknown rule decision.');
    const actor = record(item.actor, ['kind', 'ref']);
    if (!['user', 'agent'].includes(actor.kind as string)) fail('Unknown rule decision actor.');
    text(actor.ref);
    text(item.authorityRef, limits.maximumText);
    text(item.decisionRef, limits.maximumText);
    return item;
  });
  if (new Set(entries.map(item => item.ruleId)).size !== entries.length)
    fail(`Repeated ${retained ? 'retained ' : ''}rule decision.`);
  return entries;
}

function request(input: unknown, source: ColorSystemModelV1): ColorSystemProposalRequestV1 {
  const data = record(
    detach(input),
    [
      'version',
      'id',
      'sourceModelHash',
      'brief',
      'derivation',
      'colors',
      'families',
      'scales',
      'rules',
      'exceptions',
    ],
    ['review', 'origins', 'retainedAdoptions']
  );
  if (data.version !== COLOR_SYSTEM_PROPOSAL_V1_VERSION) fail('Unsupported proposal version.');
  text(data.id, 64);
  if (hash(data.sourceModelHash) !== source.modelHash) fail('Source model is stale.');
  const brief = record(data.brief, [
    'briefHash',
    'operation',
    'contextIds',
    'modeIds',
    'permissions',
  ]);
  hash(brief.briefHash);
  if (!['apply', 'extend', 'explore'].includes(brief.operation as string))
    fail('Unknown operation.');
  const contextIds = ids(brief.contextIds, limits.maximumContexts);
  const modeIds = ids(brief.modeIds, limits.maximumModes);
  if (
    !contextIds.length ||
    !modeIds.length ||
    contextIds.some(id => !source.contexts.some(context => context.id === id)) ||
    !within(
      modeIds,
      source.modes.map(mode => mode.id)
    ) ||
    contextIds.some(
      id =>
        !modeIds.some(mode =>
          source.contexts.find(context => context.id === id)!.modeIds.includes(mode)
        )
    )
  )
    fail('Scope requires declared contexts and modes.');
  const permissions = record(brief.permissions, [
    'addColors',
    'addFamilies',
    'addScales',
    'addRules',
    'editFamilyIds',
    'editScaleIds',
    'replaceRuleIds',
  ]);
  for (const field of ['addColors', 'addFamilies', 'addScales', 'addRules'])
    if (typeof permissions[field] !== 'boolean')
      fail('Addition permissions must be explicit booleans.');
  for (const [field, collection] of [
    ['editFamilyIds', source.families],
    ['editScaleIds', source.scales],
    ['replaceRuleIds', source.rules],
  ] as const) {
    const selected = ids(permissions[field]);
    if (
      !within(
        selected,
        collection.map(item => item.id)
      )
    )
      fail('Edit permission names an unknown source identity.');
    permissions[field] = selected;
  }
  const derivation = declaredDerivation(data.derivation, source);
  const fields = {
    colors: ['id', 'label', 'valuesByMode'],
    families: ['id', 'label', 'colorIds'],
    scales: ['id', 'label', 'familyId', 'slots', 'modes'],
    rules: ['id', 'label', 'kind', 'force', 'contextIds', 'modeIds', 'operands'],
  } as const;
  for (const key of ['colors', 'families', 'scales', 'rules'] as const) {
    const entries = list(
      data[key],
      {
        colors: limits.maximumColors,
        families: limits.maximumFamilies,
        scales: limits.maximumScales,
        rules: limits.maximumRules,
      }[key]
    ).map(item => record(item, fields[key]));
    const entryIds = entries.map(item => text(item.id));
    if (new Set(entryIds).size !== entryIds.length) fail('Repeated proposal identity.');
    if (key === 'rules')
      for (const rule of entries) {
        // Reuse the model rule grammar without resolving selectors before fragments merge.
        hashColorSystemScopedRuleV1({
          ...rule,
          origin: 'proposal',
          evidenceRefs: [],
          claimIds: [],
        });
        if (
          !within(rule.contextIds as string[], contextIds) ||
          !within(rule.modeIds as string[], modeIds)
        )
          fail('Proposal rule scope exceeds the brief.');
      }
    data[key] = entries.sort((a, b) => compareText(a.id as string, b.id as string));
  }
  if (data.origins !== undefined) {
    const collections = {
      colorIds: 'colors',
      familyIds: 'families',
      scaleIds: 'scales',
      ruleIds: 'rules',
    } as const;
    const origins = list(data.origins, limits.maximumSources).map(raw => {
      const origin = record(raw, ['id', 'sourceHash', 'derivation', ...Object.keys(collections)]);
      text(origin.id);
      hash(origin.sourceHash);
      origin.derivation = declaredDerivation(origin.derivation, source);
      let count = 0;
      for (const [field, collection] of Object.entries(collections)) {
        const members = ids(origin[field]);
        if (
          !within(
            members,
            (data[collection] as Record<string, unknown>[]).map(item => item.id as string)
          )
        )
          fail('Origin references an unchanged or unknown entity.');
        origin[field] = members;
        count += members.length;
      }
      if (!count) fail('An origin must describe at least one changed entity.');
      return origin as unknown as ColorSystemProposalOriginV1;
    });
    if (!origins.length || new Set(origins.map(origin => origin.id)).size !== origins.length)
      fail('Origins require distinct identities.');
    for (const [field, collection] of Object.entries(collections)) {
      const covered = new Set(origins.flatMap(origin => origin[field as keyof typeof collections]));
      if (
        (data[collection] as Record<string, unknown>[]).some(
          item => !covered.has(item.id as string)
        )
      )
        fail('Every changed entity requires a declared origin.');
    }
    data.origins = origins.sort((a, b) => compareText(a.id, b.id));
  }
  if (data.retainedAdoptions !== undefined)
    data.retainedAdoptions = decisionRecords(data.retainedAdoptions, true).sort((a, b) =>
      compareText(a.ruleId as string, b.ruleId as string)
    );
  const exceptions = list(data.exceptions, limits.maximumRules)
    .map(item => {
      const entry = record(item, ['sourceRuleId', 'replacementRuleId', 'reason']);
      return {
        sourceRuleId: text(entry.sourceRuleId),
        replacementRuleId: text(entry.replacementRuleId),
        reason: text(entry.reason, limits.maximumText),
      };
    })
    .sort((a, b) => compareText(a.sourceRuleId, b.sourceRuleId));
  if (
    new Set(exceptions.map(item => item.sourceRuleId)).size !== exceptions.length ||
    new Set(exceptions.map(item => item.replacementRuleId)).size !== exceptions.length
  )
    fail('Exceptions must have distinct originals and replacements.');
  if (data.review !== undefined) {
    const review = record(data.review, ['reviewedProposalHash', 'decisions']);
    hash(review.reviewedProposalHash);
    decisionRecords(review.decisions, false);
  }
  return {
    ...data,
    brief: { ...brief, contextIds, modeIds, permissions },
    derivation,
    exceptions,
  } as unknown as ColorSystemProposalRequestV1;
}

function preDecisionHash(input: ColorSystemProposalRequestV1): string {
  const { review: _review, retainedAdoptions: _retainedAdoptions, ...preDecision } = input;
  return exactHash(preDecision);
}

/** Declared request syntax only. Model references, native values, permissions and decision
 * bindings still require the final combined build; this creates no working model or authority. */
export function parseColorSystemProposalRequestV1(
  sourceInput: unknown,
  proposalInput: unknown
): {
  readonly request: ColorSystemProposalRequestV1;
  readonly proposalHash: string;
} {
  const parsed = request(proposalInput, parseColorSystemModelV1(sourceInput));
  return { request: parsed, proposalHash: preDecisionHash(parsed) };
}

function content(model: ColorSystemModelV1): ColorSystemModelInputV1 {
  const { modelHash: _modelHash, ...result } = model;
  return result;
}
function merge<T extends { readonly id: string }>(base: readonly T[], changes: readonly T[]): T[] {
  const result = new Map(base.map(item => [item.id, item]));
  for (const item of changes) result.set(item.id, item);
  return [...result.values()];
}

/** No file access, catalog execution, generated-value verification or write authorization occurs here. */
export function buildColorSystemProposalV1(
  sourceInput: unknown,
  proposalInput: unknown
): ColorSystemProposalV1 {
  const source = parseColorSystemModelV1(sourceInput);
  const input = request(proposalInput, source);
  const proposalHash = preDecisionHash(input);
  const permission = input.brief.permissions;
  if (
    input.brief.operation === 'apply' &&
    [input.colors, input.families, input.scales, input.rules, input.exceptions].some(
      items => items.length
    )
  )
    fail('Apply does not permit additions or structural/rule edits.');
  if (
    (!permission.addColors && input.colors.length) ||
    (!permission.addRules && input.rules.length)
  )
    fail('The brief does not permit these additions.');
  if (
    input.colors.some(color => source.colors.some(original => original.id === color.id)) ||
    input.rules.some(rule => source.rules.some(original => original.id === rule.id))
  )
    fail('Source colors and rule definitions cannot be overwritten.');
  const sourceId = `proposal:${input.id}:source`;
  const evidenceId = `proposal:${input.id}:derivation`;
  const claimId = `proposal:${input.id}:claim`;
  if (
    !input.origins &&
    (source.sources.some(item => item.id === sourceId) ||
      source.evidence.some(item => item.id === evidenceId) ||
      source.claims.some(item => item.id === claimId))
  )
    fail('Proposal provenance identity collides with the source.');
  const links = { evidenceRefs: [evidenceId], claimIds: [claimId] };
  const originRecords = input.origins?.map(origin => {
    const identity = `proposal-origin:${exactHash({ id: origin.id, sourceHash: origin.sourceHash }).slice(7)}`;
    const originSourceId = `${identity}:source`;
    const originEvidenceId = `${identity}:derivation`;
    const originClaimId = `${identity}:claim`;
    if (
      source.sources.some(item => item.id === originSourceId) ||
      source.evidence.some(item => item.id === originEvidenceId) ||
      source.claims.some(item => item.id === originClaimId)
    )
      fail('Origin provenance identity collides with the source.');
    return {
      origin,
      source: {
        id: originSourceId,
        label: `Working origin ${origin.id}`,
        sourceHash: origin.sourceHash,
        version: origin.derivation.algorithmVersion,
        locator: null,
        freshnessMode: 'imported-snapshot' as const,
        status: 'draft' as const,
      },
      evidence: {
        id: originEvidenceId,
        sourceId: originSourceId,
        locator: `proposal-origin:${origin.id}`,
        status: 'inferred' as const,
        description: `Declared derivation ${origin.derivation.algorithmId}@${origin.derivation.algorithmVersion}; input ${origin.derivation.inputHash}; source ${source.modelHash}; declaration ${exactHash(origin.derivation)}. Values have not been independently recomputed.${colorSystemDerivationNoticeV1(source, origin.derivation.sourceColorIds)}`,
      },
      claim: {
        id: originClaimId,
        sourceId: originSourceId,
        text: 'These working additions and structural changes are proposals with declared derivation, not original source facts or verified algorithm output.',
        status: 'inferred' as const,
        evidenceRefs: [originEvidenceId],
        contextIds: [],
        ruleIds: [],
      },
      coverage: {
        sourceId: originSourceId,
        status: 'partial' as const,
        evidenceRefs: [originEvidenceId],
        unresolvedClaimIds: [],
        note: 'Proposal payload is recorded; derivation is declared and has not been independently recomputed.',
      },
    };
  });
  const originsByEntity = new Map<string, NonNullable<typeof originRecords>>();
  for (const origin of originRecords ?? [])
    for (const field of ['colorIds', 'familyIds', 'scaleIds', 'ruleIds'] as const)
      for (const id of origin.origin[field]) {
        const key = `${field}:${id}`;
        originsByEntity.set(key, [...(originsByEntity.get(key) ?? []), origin]);
      }
  // A model color has exactly one source, including all of its evidence and claims.
  // Joint sources preserve every leaf contribution without changing that invariant.
  const jointOrigins = new Map<
    string,
    {
      source: ColorSystemModelV1['sources'][number];
      evidence: ColorSystemModelV1['evidence'];
      claims: ColorSystemModelV1['claims'];
      coverage: ColorSystemModelV1['coverage'][number];
    }
  >();
  const jointByColor = new Map<string, string>();
  for (const color of input.colors) {
    const contributors = originsByEntity.get(`colorIds:${color.id}`);
    if (!contributors || contributors.length < 2) continue;
    const sourceHash = exactHash(
      contributors.map(item => ({ id: item.origin.id, sourceHash: item.origin.sourceHash }))
    );
    const identity = `proposal-joint:${sourceHash.slice(7)}`;
    const jointSourceId = `${identity}:source`;
    jointByColor.set(color.id, jointSourceId);
    if (jointOrigins.has(jointSourceId)) continue;
    const evidence = contributors.map((item, index) => ({
      ...item.evidence,
      id: `${identity}:derivation:${index}`,
      sourceId: jointSourceId,
      description: `Origin ${item.origin.id}; leaf ${item.origin.sourceHash}. ${item.evidence.description}`,
    }));
    const claims = contributors.map((item, index) => ({
      ...item.claim,
      id: `${identity}:claim:${index}`,
      sourceId: jointSourceId,
      evidenceRefs: [evidence[index].id],
    }));
    if (
      source.sources.some(item => item.id === jointSourceId) ||
      evidence.some(item => source.evidence.some(original => original.id === item.id)) ||
      claims.some(item => source.claims.some(original => original.id === item.id))
    )
      fail('Joint origin provenance identity collides with the source.');
    jointOrigins.set(jointSourceId, {
      source: {
        id: jointSourceId,
        label: `Working joint origins ${contributors.map(item => item.origin.id).join(', ')}`,
        sourceHash,
        version: 'teul.declared-joint-origin.v1',
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
      evidence,
      claims,
      coverage: {
        sourceId: jointSourceId,
        status: 'partial',
        evidenceRefs: evidence.map(item => item.id),
        unresolvedClaimIds: [],
        note: 'Every contributing leaf origin is retained. Derivation is declared and has not been independently recomputed.',
      },
    });
  }
  const joints = [...jointOrigins.values()];
  if (
    originRecords &&
    source.sources.length + originRecords.length + joints.length > limits.maximumSources
  )
    fail('Declared origins exceed the combined source bound; contributors cannot be dropped.');
  const entityLinks = (field: string, id: string) => {
    const origins = originsByEntity.get(`${field}:${id}`);
    return origins
      ? {
          evidenceRefs: origins.map(item => item.evidence.id),
          claimIds: origins.map(item => item.claim.id),
        }
      : links;
  };
  const augmentedLinks = (
    original:
      | {
          readonly evidenceRefs: readonly string[];
          readonly claimIds: readonly string[];
        }
      | undefined,
    additions: typeof links
  ) => ({
    evidenceRefs: [...(original?.evidenceRefs ?? []), ...additions.evidenceRefs],
    claimIds: [...(original?.claimIds ?? []), ...additions.claimIds],
  });
  const provenance: Pick<ColorSystemModelInputV1, 'sources' | 'evidence' | 'claims' | 'coverage'> =
    originRecords
      ? {
          sources: [
            ...source.sources,
            ...originRecords.map(item => item.source),
            ...joints.map(item => item.source),
          ],
          evidence: [
            ...source.evidence,
            ...originRecords.map(item => item.evidence),
            ...joints.flatMap(item => item.evidence),
          ],
          claims: [
            ...source.claims,
            ...originRecords.map(item => item.claim),
            ...joints.flatMap(item => item.claims),
          ],
          coverage: [
            ...source.coverage,
            ...originRecords.map(item => item.coverage),
            ...joints.map(item => item.coverage),
          ],
        }
      : {
          sources: [
            ...source.sources,
            {
              id: sourceId,
              label: `Working proposal ${input.id}`,
              sourceHash: proposalHash,
              version: input.derivation.algorithmVersion,
              locator: null,
              freshnessMode: 'imported-snapshot',
              status: 'draft',
            },
          ],
          evidence: [
            ...source.evidence,
            {
              id: evidenceId,
              sourceId,
              locator: `proposal:${input.id}`,
              status: 'inferred',
              description: `Declared derivation ${input.derivation.algorithmId}@${input.derivation.algorithmVersion}; input ${input.derivation.inputHash}; source ${source.modelHash}; brief ${input.brief.briefHash}. Values have not been independently recomputed.${colorSystemDerivationNoticeV1(source, input.derivation.sourceColorIds)}`,
            },
          ],
          claims: [
            ...source.claims,
            {
              id: claimId,
              sourceId,
              text: 'These working additions and structural changes are proposals with declared derivation, not original source facts or verified algorithm output.',
              status: 'inferred',
              evidenceRefs: [evidenceId],
              contextIds: [],
              ruleIds: [],
              modeIds: input.brief.modeIds,
            },
          ],
          coverage: [
            ...source.coverage,
            {
              sourceId,
              status: 'partial',
              evidenceRefs: [evidenceId],
              unresolvedClaimIds: [],
              note: 'Proposal payload is recorded; derivation is declared and has not been independently recomputed.',
            },
          ],
        };
  const colors = input.colors.map(color => {
    const joint = jointOrigins.get(jointByColor.get(color.id) ?? '');
    return {
      ...color,
      sourceId:
        joint?.source.id ?? originsByEntity.get(`colorIds:${color.id}`)?.[0].source.id ?? sourceId,
      ...(joint
        ? {
            evidenceRefs: joint.evidence.map(item => item.id),
            claimIds: joint.claims.map(item => item.id),
          }
        : entityLinks('colorIds', color.id)),
    };
  });
  const families = input.families.map(family => ({
    ...family,
    ...augmentedLinks(
      source.families.find(item => item.id === family.id),
      entityLinks('familyIds', family.id)
    ),
  }));
  const scales = input.scales.map(scale => ({
    ...scale,
    ...augmentedLinks(
      source.scales.find(item => item.id === scale.id),
      entityLinks('scaleIds', scale.id)
    ),
  }));
  const rules: ColorSystemScopedRuleV1[] = input.rules.map(rule => ({
    ...rule,
    origin: 'proposal',
    ...entityLinks('ruleIds', rule.id),
  }));
  const changes = !!(colors.length || families.length || scales.length || rules.length);
  const draft = changes
    ? buildColorSystemModelV1({
        ...content(source),
        ...provenance,
        colors: [...source.colors, ...colors],
        families: merge(source.families, families),
        scales: merge(source.scales, scales),
        rules: [...source.rules, ...rules],
        adoptions: [],
      })
    : source;
  for (const color of colors)
    if (
      !Object.keys(color.valuesByMode).length ||
      !within(Object.keys(color.valuesByMode), input.brief.modeIds)
    )
      fail('Proposal color values must use the requested modes.');
  for (const changed of input.families) {
    const family = draft.families.find(item => item.id === changed.id)!;
    const original = source.families.find(item => item.id === family.id);
    if (original ? !permission.editFamilyIds.includes(family.id) : !permission.addFamilies)
      fail('Family change is outside the brief permission.');
    if (
      original &&
      (original.label !== family.label || !within(original.colorIds, family.colorIds))
    )
      fail('An existing family must retain its label and every source member.');
  }
  for (const changed of input.scales) {
    const scale = draft.scales.find(item => item.id === changed.id)!;
    const original = source.scales.find(item => item.id === scale.id);
    if (original ? !permission.editScaleIds.includes(scale.id) : !permission.addScales)
      fail('Scale change is outside the brief permission.');
    if (
      original &&
      (original.label !== scale.label ||
        original.familyId !== scale.familyId ||
        original.slots.some(slot => !scale.slots.some(item => same(item, slot))) ||
        original.modes.some(
          mode =>
            !scale.modes.some(
              item =>
                item.modeId === mode.modeId &&
                mode.anchors.every(anchor => item.anchors.some(entry => same(entry, anchor)))
            )
        ))
    )
      fail(
        'An existing scale must retain its source family, positions and exact anchor identities.'
      );
    for (const mode of scale.modes) {
      const prior = original?.modes.find(item => item.modeId === mode.modeId);
      if (!same(mode, prior) && !input.brief.modeIds.includes(mode.modeId))
        fail('Scale mode changes exceed the brief scope.');
    }
  }
  for (const rule of rules)
    if (
      !within(rule.contextIds, input.brief.contextIds) ||
      !within(rule.modeIds, input.brief.modeIds)
    )
      fail('Proposal rule scope exceeds the brief.');
  for (const exception of input.exceptions) {
    const original = source.rules.find(rule => rule.id === exception.sourceRuleId);
    const replacement = rules.find(rule => rule.id === exception.replacementRuleId);
    if (!original || !replacement || !permission.replaceRuleIds.includes(original.id))
      fail('Exception requires an allowed original and a new proposal rule.');
    // Adoption currently belongs to the whole rule. A narrower rejection would also
    // disable the original in unrelated contexts or modes of the exposed working model.
    if (
      !within(original.contextIds, input.brief.contextIds) ||
      !within(original.modeIds, input.brief.modeIds)
    )
      fail('Partial-scope rule replacement requires a scoped override and is unsupported.');
    if (
      !same(
        [...replacement.contextIds].sort(compareText),
        original.contextIds.filter(id => input.brief.contextIds.includes(id))
      ) ||
      !same(
        [...replacement.modeIds].sort(compareText),
        original.modeIds.filter(id => input.brief.modeIds.includes(id))
      )
    )
      fail('Replacement must cover the original rule throughout the requested scope.');
  }
  // With no changes, the fully parsed source already proves the exact dependencies.
  // Otherwise probe bindings only; never keep a rehashed copy of an old decision.
  const requestedRetentions = input.retainedAdoptions ?? [];
  const draftRules = new Map(draft.rules.map(rule => [rule.id, rule]));
  for (const adoption of requestedRetentions) {
    const rule = draftRules.get(adoption.ruleId);
    if (
      rule &&
      (!rule.contextIds.some(id => input.brief.contextIds.includes(id)) ||
        !rule.modeIds.some(id => input.brief.modeIds.includes(id)))
    )
      fail('Retained decision targets a rule outside the brief.');
  }
  const probeInputs = new Map(source.adoptions.map(item => [item.ruleId, item]));
  for (const item of requestedRetentions)
    if (draftRules.has(item.ruleId)) probeInputs.set(item.ruleId, item);
  const probes =
    changes || requestedRetentions.length
      ? new Map(
          buildColorSystemRuleAdoptionsV1(
            draft,
            [...probeInputs.values()].map(
              ({ ruleHash: _ruleHash, dependencyHash: _dependencyHash, ...decision }) => decision
            )
          ).map(item => [item.ruleId, item])
        )
      : null;
  const retained = source.adoptions.filter(original => {
    if (!probes) return true;
    const probe = probes.get(original.ruleId)!;
    return probe.ruleHash === original.ruleHash && probe.dependencyHash === original.dependencyHash;
  });
  const retainedRequested: ColorSystemRuleAdoptionV1[] = [];
  const staleRuleIds: string[] = [];
  for (const original of requestedRetentions) {
    const probe = probes?.get(original.ruleId);
    if (
      probe &&
      probe.ruleHash === original.ruleHash &&
      probe.dependencyHash === original.dependencyHash
    )
      retainedRequested.push(original);
    else staleRuleIds.push(original.ruleId);
  }
  const reviewStatus = !input.review
    ? 'absent'
    : input.review.reviewedProposalHash === proposalHash
      ? 'current'
      : 'stale';
  // Even stale reviews must be valid inert decision data. Their decisions are never applied.
  const reviewed = input.review
    ? buildColorSystemRuleAdoptionsV1(draft, input.review.decisions)
    : [];
  const decisions = reviewStatus === 'current' ? reviewed : [];
  for (const decision of decisions) {
    const rule = draft.rules.find(item => item.id === decision.ruleId)!;
    if (
      !rule.contextIds.some(id => input.brief.contextIds.includes(id)) ||
      !rule.modeIds.some(id => input.brief.modeIds.includes(id))
    )
      fail('Decision targets a rule outside the brief.');
  }
  const adoptions = new Map(retained.map(item => [item.ruleId, item]));
  for (const decision of retainedRequested) adoptions.set(decision.ruleId, decision);
  for (const decision of decisions) adoptions.set(decision.ruleId, decision);
  // Check effective decisions after overrides: retained rejection cannot outlive its
  // specifically attributed accepted replacement or bypass the scoped exception contract.
  for (const decision of adoptions.values()) {
    const old = source.adoptions.find(item => item.ruleId === decision.ruleId);
    if (
      source.rules.some(item => item.id === decision.ruleId) &&
      decision.status === 'rejected' &&
      !same(old, decision)
    ) {
      const exception = input.exceptions.find(item => item.sourceRuleId === decision.ruleId);
      const replacement = exception && adoptions.get(exception.replacementRuleId);
      if (
        !exception ||
        replacement?.status !== 'accepted' ||
        !same(decision.actor, replacement.actor) ||
        decision.authorityRef !== replacement.authorityRef ||
        decision.decisionRef !== replacement.decisionRef
      )
        fail(
          'Rejecting an original requires a specifically attributed exception and accepted replacement in the same review decision.'
        );
    }
  }
  const workingModel = buildColorSystemModelV1({
    ...content(draft),
    adoptions: [...adoptions.values()],
  });
  const sourceAssessmentModel = colors.length
    ? buildColorSystemModelV1({
        ...content(source),
        ...provenance,
        colors: [...source.colors, ...colors],
      })
    : source;
  return {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    status: 'proposed',
    proposalHash,
    sourceModelHash: source.modelHash,
    briefHash: input.brief.briefHash,
    derivationStatus: 'declared-not-recomputed',
    reviewStatus,
    request: input,
    sourceAssessmentModel,
    workingModel,
    ...(input.retainedAdoptions === undefined
      ? {}
      : {
          retention: {
            retainedRuleIds: retainedRequested
              .filter(item => !decisions.some(decision => decision.ruleId === item.ruleId))
              .map(item => item.ruleId),
            staleRuleIds,
          },
        }),
    pendingRuleIds: workingModel.rules
      .filter(
        rule =>
          !adoptions.has(rule.id) &&
          rule.contextIds.some(id => input.brief.contextIds.includes(id)) &&
          rule.modeIds.some(id => input.brief.modeIds.includes(id))
      )
      .map(rule => rule.id),
  };
}

/** Assessment is scoped and explicitly provisional; trusted qualification requires backend replay. */
export function compileColorSystemProposalV1(sourceInput: unknown, proposalInput: unknown) {
  const proposal = buildColorSystemProposalV1(sourceInput, proposalInput);
  const source = compileColorSystemRelationshipsV1(proposal.sourceAssessmentModel);
  const working = compileColorSystemRelationshipsV1(proposal.workingModel);
  const proposalHash = proposal.proposalHash;
  const contexts = new Set(proposal.request.brief.contextIds);
  const modes = new Set(proposal.request.brief.modeIds);
  return {
    proposal,
    evaluate(input: unknown) {
      const application = buildColorSystemContextApplicationV1(input);
      if (!contexts.has(application.contextId) || !modes.has(application.modeId))
        fail('Application exceeds the reviewed brief scope.');
      return {
        status: 'proposed' as const,
        qualified: false as const,
        derivationStatus: 'declared-not-recomputed' as const,
        proposalHash,
        sourceCompliance: source.evaluate(application),
        workingAssessment: working.evaluate(application),
      };
    },
  };
}
