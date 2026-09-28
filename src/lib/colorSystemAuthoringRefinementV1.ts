/** Explicit recipe edits. Catalog discovery is replayed; construction and acceptance remain separate. */
import {
  parseColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from './colorSystemRecipeV1';
import {
  COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_LIMIT,
  parseColorSystemOverlayProposalRequestV1,
  type ColorSystemOverlayFragmentV1,
} from './colorSystemOverlayProposalV1';
import {
  parseColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from './colorSystemAuthoringExecutionV1';
import {
  compileColorSystemCatalogProposalV1,
  type ColorSystemCatalogProposalRequestV1,
  type ColorSystemCatalogProposalMaterializedV1,
} from './colorSystemCatalogProposalV1';
import {
  COLOR_SYSTEM_CATALOG_POLICY_V1,
  type ColorSystemCatalogCandidateV1,
  type ColorSystemCatalogExecutionV1,
  type ColorSystemCatalogProviderV1,
} from './colorSystemCatalogCandidatesV1';
import {
  parseColorSystemProposalRequestV1,
  type ColorSystemProposalRequestV1,
} from './colorSystemProposalV1';
import { buildColorSystemApplicationRequirementsV1 } from './colorSystemApplicationRequirementsV1';
import type { ColorSystemSelectorV1 } from './colorSystemModelV1';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from './colorSystemInertJsonV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';

export const COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION = 'teul.authoring-refinement.v1' as const;
type Kind = ColorSystemSelectorV1['kind'];
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type CatalogFragment = Extract<ColorSystemOverlayFragmentV1, { kind: 'catalog' }>;
type Binding = ColorSystemCatalogProposalMaterializedV1['binding'];
type RoleRule = Extract<ColorSystemProposalRequestV1['rules'][number], { kind: 'role-binding' }>;
export interface ColorSystemAuthoringRefinementReferenceV1 {
  readonly kind: Kind;
  readonly id: string;
  readonly path: string;
  readonly editable: boolean;
  readonly ruleId?: string;
}
export interface ColorSystemAuthoringCatalogDiscoveryRequestV1 {
  readonly recipeHash: string;
  readonly fragmentId: string;
  readonly provider: ColorSystemCatalogProviderV1;
  /** Required for Radix; every retained authored mode has an explicit published scheme. */
  readonly radix?: ColorSystemCatalogProposalRequestV1['radix'];
}
export interface ColorSystemAuthoringCatalogSelectionRequestV1 extends ColorSystemAuthoringCatalogDiscoveryRequestV1 {
  readonly discoveryHash: string;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly mappings: readonly {
    readonly kind: Kind;
    readonly fromId: string;
    readonly toId: string;
  }[];
}
export interface ColorSystemAuthoringRoleBindingEditV1 {
  readonly recipeHash: string;
  readonly fragmentId: string;
  readonly ruleId: string;
  readonly contextIds: readonly string[];
  readonly modeIds: readonly string[];
  readonly members: readonly ColorSystemSelectorV1[];
}
export interface ColorSystemAuthoringCatalogChoiceV1 {
  readonly candidate: ColorSystemCatalogCandidateV1;
  readonly binding: Binding;
  readonly colors: ColorSystemProposalRequestV1['colors'];
}
export type ColorSystemAuthoringCatalogDiscoveryV1 = {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION;
  readonly qualified: false;
  readonly recipeHash: string;
  readonly fragmentId: string;
} & (
  | { readonly status: 'cancelled'; readonly candidates: readonly [] }
  | {
      readonly status: 'ready';
      readonly discoveryHash: string;
      readonly query: ColorSystemCatalogProposalRequestV1;
      readonly current: Binding;
      readonly references: readonly ColorSystemAuthoringRefinementReferenceV1[];
      readonly candidates: readonly ColorSystemAuthoringCatalogChoiceV1[];
    }
);
export type ColorSystemAuthoringRefinementV1 = {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION;
  readonly qualified: false;
  readonly recipeHash: string;
} & (
  | { readonly status: 'cancelled'; readonly direction: null }
  | {
      readonly status: 'blocked';
      readonly direction: null;
      readonly unresolved: readonly (ColorSystemAuthoringRefinementReferenceV1 & {
        readonly reason: string;
      })[];
    }
  | {
      readonly status: 'proposed';
      readonly direction: ColorSystemAuthoringDirectionV1;
      readonly changedPaths: readonly string[];
      /** Known edited rules. Final dependency checks may require additional review. */
      readonly pendingRuleIds: readonly string[];
    }
);
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const same = (a: unknown, b: unknown) =>
  serializeColorSystemInertJsonV1(a) === serializeColorSystemInertJsonV1(b);
const key = (kind: Kind, id: string) => canonicalJson([kind, id]);
function refinementDerivation(
  prepared: Prepared,
  proposal: ColorSystemProposalRequestV1,
  input: unknown
) {
  return {
    ...proposal.derivation,
    algorithmId: 'teul.authoring-refinement',
    algorithmVersion: COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION,
    policyHash: exactHash(
      'Explicit proposal role references; original-source scope and force retained; fresh review required.'
    ),
    inputHash: exactHash({ recipeHash: prepared.recipeHash, command: input }),
  };
}

/** Keep unrelated rule declarations and their provenance intact; only edited rules move. */
function refineRuleFragments(
  prepared: Prepared,
  fragments: readonly ColorSystemOverlayFragmentV1[],
  pendingRuleIds: readonly string[],
  input: unknown
): readonly ColorSystemOverlayFragmentV1[] {
  const pending = new Set(pendingRuleIds),
    added: ColorSystemOverlayFragmentV1[] = [];
  const result = fragments.map(fragment => {
    if (fragment.kind !== 'rules') return fragment;
    const edited = fragment.proposal.rules.filter(rule => pending.has(rule.id));
    if (!edited.length) return fragment;
    const retained = fragment.proposal.rules.filter(rule => !pending.has(rule.id));
    const splitId = `refined-rules:${exactHash({
      fragmentId: fragment.id,
      ruleIds: edited.map(rule => rule.id).sort(),
    }).slice(7, 39)}`;
    const proposal = parseColorSystemProposalRequestV1(prepared.recipe.source.model, {
      ...fragment.proposal,
      ...(retained.length ? { id: splitId } : {}),
      derivation: refinementDerivation(prepared, fragment.proposal, input),
      rules: edited,
      exceptions: fragment.proposal.exceptions.filter(exception =>
        pending.has(exception.replacementRuleId)
      ),
    }).request;
    if (!retained.length) return { ...fragment, proposal };
    added.push({ id: splitId, kind: 'rules', proposal });
    return {
      ...fragment,
      proposal: {
        ...fragment.proposal,
        rules: retained,
        exceptions: fragment.proposal.exceptions.filter(
          exception => !pending.has(exception.replacementRuleId)
        ),
      },
    };
  });
  if (result.length + added.length > COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_LIMIT)
    fail('Separating edited rules exceeds the eight-fragment limit.');
  const combined = [...result, ...added];
  if (new Set(combined.map(fragment => fragment.id)).size !== combined.length)
    fail('The edited rule fragment identity collides with an existing fragment.');
  return combined;
}
function fail(message: string): never {
  throw new Error(`Invalid authoring refinement: ${message}`);
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a data record.');
  const data = value as Record<string, unknown>;
  if (
    required.some(name => !Object.prototype.hasOwnProperty.call(data, name)) ||
    Object.keys(data).some(name => !required.includes(name) && !optional.includes(name))
  )
    fail('Missing or unknown fields.');
  return data;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128)
    fail('Identity must be bounded nonblank text.');
  return value;
}
function command(value: unknown) {
  return snapshotColorSystemInertJsonV1(value, {
    maximumBytes: 65536,
    maximumDepth: 8,
    maximumArrayLength: 256,
    maximumNodes: 4096,
  });
}
function prepare(input: unknown) {
  const recipe = parseColorSystemRecipeV1(input);
  if (!recipe.selection) fail('Select a complete recipe before refining it.');
  if (recipe.direction.generation.kind !== 'overlay')
    fail('This command requires an existing overlay recipe.');
  const overlay = parseColorSystemOverlayProposalRequestV1(
    recipe.source.model,
    recipe.direction.generation.proposal
  );
  const ruleFragments = new Map<string, ColorSystemProposalRequestV1>(),
    sourceExceptions = new Set<string>();
  for (const fragment of overlay.fragments) {
    if (fragment.kind !== 'rules') continue;
    const proposal = parseColorSystemProposalRequestV1(
      recipe.source.model,
      fragment.proposal
    ).request;
    if (proposal.colors.length || proposal.families.length || proposal.scales.length)
      fail('A rule fragment cannot contain structural changes.');
    ruleFragments.set(fragment.id, proposal);
    proposal.exceptions.forEach(exception => sourceExceptions.add(exception.replacementRuleId));
  }
  const expected = recipe.selection.model.modelHash;
  if (
    'modelHash' in recipe.direction.composition &&
    recipe.direction.composition.modelHash !== expected
  )
    fail('Composition model hash does not match the retained selection.');
  for (const group of recipe.direction.interactionGroups ?? [])
    if ('modelHash' in group.request && group.request.modelHash !== expected)
      fail('Interaction model hash does not match the retained selection.');
  if (
    recipe.direction.composition.requirementsHash !==
    exactHash(buildColorSystemApplicationRequirementsV1(recipe.direction.requirements))
  )
    fail('Requirements hash is stale.');
  return {
    recipe,
    overlay,
    ruleFragments,
    sourceExceptions,
    recipeHash: deterministicContentHash(serializeColorSystemRecipeV1(recipe)),
  };
}
type Prepared = ReturnType<typeof prepare>;
function bind(prepared: Prepared, value: unknown) {
  if (value !== prepared.recipeHash)
    fail('Recipe hash changed; inspect the current recipe before editing.');
}
function catalog(prepared: Prepared, fragmentId: unknown): CatalogFragment {
  const fragment = prepared.overlay.fragments.find(item => item.id === text(fragmentId));
  if (fragment?.kind !== 'catalog') fail('Choose an existing catalog fragment.');
  return fragment;
}
function ruleFragment(prepared: Prepared, fragmentId: unknown) {
  const index = prepared.overlay.fragments.findIndex(item => item.id === text(fragmentId)),
    fragment = prepared.overlay.fragments[index];
  if (fragment?.kind !== 'rules') fail('Choose an existing proposal rule fragment.');
  const proposal = prepared.ruleFragments.get(fragment.id)!;
  return { index, fragment, proposal };
}
function hasSourceException(prepared: Prepared, ruleId: string) {
  return prepared.sourceExceptions.has(ruleId);
}

export function inspectColorSystemAuthoringRefinementV1(input: unknown) {
  const prepared = prepare(input),
    { recipe, overlay, recipeHash } = prepared;
  const source = recipe.source.model,
    model = recipe.selection!.model;
  return {
    version: COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION,
    qualified: false as const,
    recipeHash,
    sourceModelHash: source.modelHash,
    catalogFragments: overlay.fragments.flatMap(fragment =>
      fragment.kind === 'catalog'
        ? [{ id: fragment.id, candidateId: fragment.candidateId, query: fragment.query }]
        : []
    ),
    editableRoleBindings: overlay.fragments.flatMap(fragment => {
      if (fragment.kind !== 'rules') return [];
      const { proposal } = ruleFragment(prepared, fragment.id);
      return proposal.rules.flatMap(rule =>
        rule.kind === 'role-binding' &&
        !source.rules.some(original => original.id === rule.id) &&
        !hasSourceException(prepared, rule.id)
          ? [{ fragmentId: fragment.id, rule: rule as RoleRule }]
          : []
      );
    }),
    selectorChoices: (['color', 'family', 'scale'] as const).flatMap(kind => {
      const collection = kind === 'color' ? 'colors' : kind === 'family' ? 'families' : 'scales';
      return model[collection].map(item => ({
        kind,
        id: item.id,
        label: item.label,
        inOriginalSource: source[collection].some(original => original.id === item.id),
      }));
    }),
  };
}

/** Visits only declared identity fields. Text, evidence, source identities and numeric paint are never replaced. */
function references(
  directionInput: ColorSystemAuthoringDirectionV1,
  rewrite: (ref: ColorSystemAuthoringRefinementReferenceV1) => string
) {
  const direction = parseColorSystemAuthoringDirectionV1(
    directionInput
  ) as Mutable<ColorSystemAuthoringDirectionV1>;
  const change = (kind: Kind, id: string, path: string, editable = true, ruleId?: string) =>
    rewrite({ kind, id, path, editable, ...(ruleId ? { ruleId } : {}) });
  direction.composition.groups.forEach((group, g) =>
    group.options.forEach((option, o) =>
      option.assignments.forEach((assignment, a) => {
        assignment.colorId = change(
          'color',
          assignment.colorId,
          `composition.groups[${g}].options[${o}].assignments[${a}].colorId`
        );
      })
    )
  );
  direction.requirements.locks?.forEach((lock, i) => {
    lock.colorId = change('color', lock.colorId, `requirements.locks[${i}].colorId`);
  });
  direction.interactionGroups?.forEach((group, i) => {
    const path = `interactionGroups[${i}].request`;
    group.request.scales.forEach((scale, s) => {
      scale.scaleId = change('scale', scale.scaleId, `${path}.scales[${s}].scaleId`);
    });
    for (const field of ['surfaceColorIds', 'onForegroundColorIds'] as const)
      group.request[field] = group.request[field].map((id, j) =>
        change('color', id, `${path}.${field}[${j}]`)
      );
  });
  direction.units.forEach((unit, i) => {
    unit.familyId = change('family', unit.familyId, `units[${i}].familyId`);
    if (unit.scaleId) unit.scaleId = change('scale', unit.scaleId, `units[${i}].scaleId`);
    unit.anchors.forEach((anchor, j) => {
      anchor.colorId = change('color', anchor.colorId, `units[${i}].anchors[${j}].colorId`);
    });
  });
  if (direction.generation.kind !== 'overlay') fail('Overlay direction required.');
  direction.generation.proposal.fragments.forEach((fragment, f) => {
    const path = `generation.proposal.fragments[${f}]`;
    if (fragment.kind === 'rules') {
      fragment.proposal.rules.forEach((rule, r) => {
        const selectors = (values: Mutable<ColorSystemSelectorV1>[], field: string) =>
          values.forEach((selector, s) => {
            selector.id = change(
              selector.kind,
              selector.id,
              `${path}.proposal.rules[${r}].operands.${field}[${s}].id`,
              true,
              rule.id
            );
          });
        switch (rule.kind) {
          case 'palette-membership':
          case 'color-count':
          case 'role-binding':
            selectors(rule.operands.members, 'members');
            break;
          case 'allowed-pair':
          case 'forbidden-pair':
            selectors(rule.operands.left, 'left');
            selectors(rule.operands.right, 'right');
            break;
          case 'required-partner':
            selectors(rule.operands.subject, 'subject');
            selectors(rule.operands.partner, 'partner');
            break;
          case 'prominence':
            if (rule.operands.kind === 'ordered-groups')
              rule.operands.groups.forEach((group, i) => selectors(group, `groups[${i}]`));
            else selectors(rule.operands.members, 'members');
        }
      });
    } else if (fragment.kind === 'construction') {
      const fixed = (kind: Kind, id: string, where: string) => {
        change(kind, id, where, false);
      };
      fragment.brief.scales.forEach((scale, s) =>
        fixed('scale', scale.scaleId, `${path}.brief.scales[${s}].scaleId`)
      );
      const structure = fragment.structureProposal;
      if (!structure) return;
      structure.colors.forEach((color, c) =>
        fixed('color', color.id, `${path}.structureProposal.colors[${c}].id`)
      );
      structure.families.forEach((family, i) => {
        fixed('family', family.id, `${path}.structureProposal.families[${i}].id`);
        family.colorIds.forEach((id, j) =>
          fixed('color', id, `${path}.structureProposal.families[${i}].colorIds[${j}]`)
        );
      });
      structure.scales.forEach((scale, i) => {
        fixed('scale', scale.id, `${path}.structureProposal.scales[${i}].id`);
        fixed('family', scale.familyId, `${path}.structureProposal.scales[${i}].familyId`);
        scale.modes.forEach((mode, m) =>
          mode.anchors.forEach((anchor, a) =>
            fixed(
              'color',
              anchor.colorId,
              `${path}.structureProposal.scales[${i}].modes[${m}].anchors[${a}].colorId`
            )
          )
        );
      });
    }
  });
  return direction;
}
function owned(binding: Binding, source: ColorSystemRecipeV1['source']['model']) {
  const ids = new Set(binding.members.map(member => key('color', member.colorId)));
  if (!source.families.some(family => family.id === binding.familyId))
    ids.add(key('family', binding.familyId));
  if (binding.scaleId && !source.scales.some(scale => scale.id === binding.scaleId))
    ids.add(key('scale', binding.scaleId));
  return ids;
}
function discoveryRequest(prepared: Prepared, input: unknown) {
  const data = record(command(input), ['recipeHash', 'fragmentId', 'provider'], ['radix']);
  bind(prepared, data.recipeHash);
  const fragment = catalog(prepared, data.fragmentId),
    provider = text(data.provider);
  if (!['wada', 'werner', 'radix'].includes(provider))
    fail('Choose one supported catalog provider.');
  if ((provider === 'radix') !== 'radix' in data)
    fail('Only Radix requires explicit category and mode-to-scheme mappings.');
  const modeIds = [...new Set(fragment.query.anchorRefs.map(ref => ref.modeId))].sort();
  const { radix: _oldRadix, historicalModes: _historical, ...base } = fragment.query;
  const query: ColorSystemCatalogProposalRequestV1 = {
    ...base,
    providers: [provider as ColorSystemCatalogProviderV1],
    limitPerProvider: COLOR_SYSTEM_CATALOG_POLICY_V1.maximumPerProvider,
    ...(provider === 'radix'
      ? { radix: data.radix as ColorSystemCatalogProposalRequestV1['radix'] }
      : { historicalModes: modeIds.map(modeId => ({ modeId, sourceMode: 'static' as const })) }),
  };
  return { fragment, query };
}
async function discover(
  prepared: Prepared,
  input: unknown,
  execution?: ColorSystemCatalogExecutionV1
): Promise<ColorSystemAuthoringCatalogDiscoveryV1> {
  const { fragment, query } = discoveryRequest(prepared, input),
    source = prepared.recipe.source.model;
  const run = execution ?? {
    isCancelled: () => false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  const common = {
    version: COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION,
    qualified: false as const,
    recipeHash: prepared.recipeHash,
    fragmentId: fragment.id,
  };
  const cancelled = (): ColorSystemAuthoringCatalogDiscoveryV1 => ({
    ...common,
    status: 'cancelled',
    candidates: [],
  });
  if (run.isCancelled()) return cancelled();
  const old = await compileColorSystemCatalogProposalV1(source, fragment.query, run);
  if (old.status === 'cancelled' || run.isCancelled()) return cancelled();
  if (old.status !== 'ready') fail(old.message);
  const current = old.materialize(fragment.candidateId, fragment.intent).binding;
  const session = same(old.catalog.request, query)
    ? old
    : await compileColorSystemCatalogProposalV1(source, query, run);
  if (session.status === 'cancelled' || run.isCancelled()) return cancelled();
  if (session.status !== 'ready') fail(session.message);
  const candidates: ColorSystemAuthoringCatalogChoiceV1[] = [];
  for (const candidate of session.retrieval.candidates) {
    await run.yield();
    if (run.isCancelled()) return cancelled();
    const materialized = session.materialize(candidate.id, fragment.intent);
    candidates.push({
      candidate,
      binding: materialized.binding,
      colors: materialized.proposal.request.colors,
    });
  }
  const oldIds = owned(current, source),
    refs: ColorSystemAuthoringRefinementReferenceV1[] = [];
  references(prepared.recipe.direction, ref => {
    if (oldIds.has(key(ref.kind, ref.id))) refs.push(ref);
    return ref.id;
  });
  const content = {
    ...common,
    query: session.catalog.request,
    current,
    references: refs,
    candidates,
  };
  return { ...content, status: 'ready', discoveryHash: exactHash(content) };
}

/** Retrieval/materialization only; no constructor, full application execution or rule review runs here. */
export function discoverColorSystemAuthoringCatalogV1(
  recipeInput: unknown,
  input: unknown,
  execution?: ColorSystemCatalogExecutionV1
) {
  return discover(prepare(recipeInput), input, execution);
}
function proposed(
  prepared: Prepared,
  changed: ColorSystemAuthoringDirectionV1,
  changedPaths: string[],
  pendingRuleIds: string[]
): ColorSystemAuthoringRefinementV1 {
  const direction = parseColorSystemAuthoringDirectionV1(
    changed
  ) as Mutable<ColorSystemAuthoringDirectionV1>;
  if (direction.generation.kind !== 'overlay') fail('Overlay required.');
  const overlay = direction.generation.proposal;
  delete overlay.review;
  if (direction.provisionalRuleReview) {
    delete direction.provisionalRuleReview;
    changedPaths.push('provisionalRuleReview');
  }
  const model = prepared.recipe.selection!.model,
    pending = new Set(pendingRuleIds);
  overlay.retainedAdoptions = model.adoptions.filter(adoption => {
    const rule = model.rules.find(rule => rule.id === adoption.ruleId)!;
    return (
      !pending.has(adoption.ruleId) &&
      rule.contextIds.some(id => overlay.brief.contextIds.includes(id)) &&
      rule.modeIds.some(id => overlay.brief.modeIds.includes(id))
    );
  }) as Mutable<typeof overlay.retainedAdoptions>;
  const { modelHash: _modelHash, ...composition } =
    direction.composition as typeof direction.composition & { modelHash?: string };
  direction.composition = {
    ...composition,
    modelBinding: 'generated-model',
    requirementsHash: exactHash(buildColorSystemApplicationRequirementsV1(direction.requirements)),
  };
  if (direction.interactionGroups)
    direction.interactionGroups = direction.interactionGroups.map(group => {
      const { modelHash: _hash, ...request } = group.request as typeof group.request & {
        modelHash?: string;
      };
      return { ...group, request: { ...request, modelBinding: 'generated-model' } };
    });
  // Parser rejects unknown/deep data; final overlay replay owns all dependency and new review checks.
  const clean = parseColorSystemAuthoringDirectionV1(direction);
  return {
    version: COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION,
    qualified: false,
    recipeHash: prepared.recipeHash,
    status: 'proposed',
    direction: clean,
    changedPaths,
    pendingRuleIds: [...new Set(pendingRuleIds)],
  };
}

export async function selectColorSystemAuthoringCatalogV1(
  recipeInput: unknown,
  input: unknown,
  execution?: ColorSystemCatalogExecutionV1
): Promise<ColorSystemAuthoringRefinementV1> {
  const prepared = prepare(recipeInput),
    data = record(
      command(input),
      [
        'recipeHash',
        'fragmentId',
        'provider',
        'discoveryHash',
        'candidateId',
        'candidateHash',
        'mappings',
      ],
      ['radix']
    );
  const { discoveryHash, candidateId, candidateHash, mappings, ...request } = data;
  const found = await discover(prepared, request, execution);
  const common = {
    version: COLOR_SYSTEM_AUTHORING_REFINEMENT_V1_VERSION,
    qualified: false as const,
    recipeHash: prepared.recipeHash,
  };
  if (found.status === 'cancelled') return { ...common, status: 'cancelled', direction: null };
  if (found.discoveryHash !== discoveryHash)
    fail('Catalog discovery changed; inspect the recomputed choices.');
  const choice = found.candidates.find(
    item => item.candidate.id === candidateId && item.candidate.candidateHash === candidateHash
  );
  if (!choice) fail('Choose an exact candidate from the current discovery.');
  if (!Array.isArray(mappings)) fail('Explicit identity mappings are required.');
  const oldIds = owned(found.current, prepared.recipe.source.model),
    newIds = owned(choice.binding, prepared.recipe.source.model);
  const map = new Map<string, string>();
  for (const item of mappings) {
    const mapping = record(item, ['kind', 'fromId', 'toId']),
      kind = mapping.kind as Kind,
      fromId = text(mapping.fromId),
      toId = text(mapping.toId),
      id = key(kind, fromId);
    if (
      !['color', 'family', 'scale'].includes(kind) ||
      !oldIds.has(id) ||
      map.has(id) ||
      !found.references.some(ref => key(ref.kind, ref.id) === id)
    )
      fail('Mappings require unique referenced catalog identities.');
    const allowed =
      newIds.has(key(kind, toId)) ||
      (kind === 'color' && prepared.recipe.source.model.colors.some(color => color.id === toId)) ||
      (kind === 'family' && choice.binding.familyId === toId) ||
      (kind === 'scale' && choice.binding.scaleId === toId);
    if (!allowed)
      fail(
        'Mapping target must belong to the selected candidate or be an explicit original source color.'
      );
    map.set(id, toId);
  }
  const unresolved: Extract<
    ColorSystemAuthoringRefinementV1,
    { status: 'blocked' }
  >['unresolved'][number][] = [];
  const changedPaths: string[] = [],
    pendingRuleIds: string[] = [];
  const changed = references(prepared.recipe.direction, ref => {
    const id = key(ref.kind, ref.id);
    if (!oldIds.has(id)) return ref.id;
    const next = map.get(id) ?? (newIds.has(id) ? ref.id : undefined);
    if (!next || (!ref.editable && next !== ref.id)) {
      unresolved.push({
        ...ref,
        reason: ref.editable
          ? 'Choose an explicit replacement identity; this reference cannot be dropped or mapped by member order.'
          : 'This reference belongs to another construction declaration; edit that fragment explicitly.',
      });
      return ref.id;
    }
    if (next !== ref.id) {
      changedPaths.push(ref.path);
      if (ref.ruleId) pendingRuleIds.push(ref.ruleId);
    }
    return next;
  });
  if (unresolved.length) return { ...common, status: 'blocked', direction: null, unresolved };
  if (changed.generation.kind !== 'overlay') fail('Overlay required.');
  const fragmentIndex = changed.generation.proposal.fragments.findIndex(
    fragment => fragment.id === found.fragmentId
  );
  const replaced = changed.generation.proposal.fragments.map((fragment, i) => {
    if (i === fragmentIndex)
      return {
        ...fragment,
        query: found.query,
        candidateId: choice.candidate.id,
      } as CatalogFragment;
    return fragment;
  });
  const fragments = refineRuleFragments(prepared, replaced, pendingRuleIds, data);
  const direction = {
    ...changed,
    generation: { ...changed.generation, proposal: { ...changed.generation.proposal, fragments } },
  };
  changedPaths.push(`generation.proposal.fragments[${fragmentIndex}]`);
  return proposed(prepared, direction, changedPaths, pendingRuleIds);
}

export function editColorSystemAuthoringRoleBindingV1(
  recipeInput: unknown,
  input: unknown
): ColorSystemAuthoringRefinementV1 {
  const prepared = prepare(recipeInput),
    data = record(command(input), [
      'recipeHash',
      'fragmentId',
      'ruleId',
      'contextIds',
      'modeIds',
      'members',
    ]);
  bind(prepared, data.recipeHash);
  const { index, fragment, proposal } = ruleFragment(prepared, data.fragmentId),
    ruleId = text(data.ruleId),
    rule = proposal.rules.find(rule => rule.id === ruleId),
    source = prepared.recipe.source.model;
  if (
    rule?.kind !== 'role-binding' ||
    source.rules.some(original => original.id === ruleId) ||
    hasSourceException(prepared, ruleId)
  )
    fail('Only a proposal-owned role-binding without a source exception is editable here.');
  const parsed = parseColorSystemProposalRequestV1(source, {
    ...proposal,
    rules: proposal.rules.map(item =>
      item.id === ruleId
        ? {
            ...rule,
            contextIds: data.contextIds,
            modeIds: data.modeIds,
            operands: { ...rule.operands, members: data.members },
          }
        : item
    ),
  }).request;
  const edited = parsed.rules.find(item => item.id === ruleId) as RoleRule,
    model = prepared.recipe.selection!.model;
  for (const selector of edited.operands.members) {
    const collection =
      selector.kind === 'color'
        ? model.colors
        : selector.kind === 'family'
          ? model.families
          : model.scales;
    if (!collection.some(item => item.id === selector.id))
      fail('Rule selectors require existing source or retained working identities.');
  }
  const generation = prepared.recipe.direction.generation;
  if (generation.kind !== 'overlay') fail('Overlay required.');
  const direction = {
    ...prepared.recipe.direction,
    generation: {
      ...generation,
      proposal: {
        ...generation.proposal,
        fragments: refineRuleFragments(
          prepared,
          generation.proposal.fragments.map((item, i) =>
            i === index ? { ...fragment, proposal: parsed } : item
          ),
          [ruleId],
          data
        ),
      },
    },
  };
  return proposed(
    prepared,
    direction,
    [
      `generation.proposal.fragments[${index}].proposal.rules[${proposal.rules.findIndex(item => item.id === ruleId)}]`,
    ],
    [ruleId]
  );
}
