/** Stable design semantics. Execution receipts, source authority and write permission stay separate. */
import {
  captureColorSystemModelV1,
  type ColorSystemModelV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSelectorV1,
} from './colorSystemModelV1';
import type { ColorSystemBrandTerritoryRuleV1 } from './colorSystemBrandConstraintsV1';
import {
  buildColorSystemContextApplicationV1,
  type ColorSystemContextApplicationV1,
} from './colorSystemRelationshipsV1';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';

export const COLOR_SYSTEM_DESIGN_CONTENT_V1_VERSION = 'teul.design-content.v1' as const;
export const COLOR_SYSTEM_DESIGN_LOCK_V1_VERSION = 'teul.design-lock.v1' as const;
export const COLOR_SYSTEM_DESIGN_CONTENT_V1_LIMITS = { maximumApplications: 64 } as const;

type WithoutEvidence<T> = T extends unknown ? Omit<T, 'evidenceRefs' | 'claimIds'> : never;
type DesignRule = WithoutEvidence<ColorSystemScopedRuleV1>;
type DesignTerritoryRule = WithoutEvidence<ColorSystemBrandTerritoryRuleV1>;
type DesignAdoption = { readonly ruleId: string; readonly status: 'accepted' | 'rejected' };
export interface ColorSystemDesignSemanticsV1 {
  readonly modes: ColorSystemModelV1['modes'];
  readonly colors: readonly Pick<
    ColorSystemModelV1['colors'][number],
    'id' | 'label' | 'valuesByMode'
  >[];
  readonly families: readonly WithoutEvidence<ColorSystemModelV1['families'][number]>[];
  readonly scales: readonly WithoutEvidence<ColorSystemModelV1['scales'][number]>[];
  readonly contexts: readonly WithoutEvidence<ColorSystemModelV1['contexts'][number]>[];
  readonly rules: readonly DesignRule[];
  /** Decision meaning only. Full attribution and dependency bindings remain in the model/recipe. */
  readonly adoptions: readonly DesignAdoption[];
  readonly brandConstraintsByContext: readonly {
    readonly id: string;
    readonly contextIds: readonly string[];
    readonly rules: readonly DesignTerritoryRule[];
    readonly adoptions: readonly DesignAdoption[];
  }[];
  readonly applications: readonly ColorSystemContextApplicationV1[];
}
export interface ColorSystemDesignContentV1 {
  readonly version: typeof COLOR_SYSTEM_DESIGN_CONTENT_V1_VERSION;
  readonly qualified: false;
  /** A working-model receipt is not an assertion that generated additions are original source. */
  readonly sourceIdentity: {
    readonly workingModelHash: string;
    readonly sources: ColorSystemModelV1['sources'];
  };
  readonly content: ColorSystemDesignSemanticsV1;
  readonly contentHash: string;
}
export interface ColorSystemDesignEntityRefV1 {
  readonly kind: keyof ColorSystemDesignSemanticsV1 | 'applicationUses' | 'applicationPairs';
  readonly id: string;
  readonly applicationId?: string;
}
export interface ColorSystemDesignDiffV1 {
  readonly beforeContentHash: string;
  readonly afterContentHash: string;
  readonly kept: readonly ColorSystemDesignEntityRefV1[];
  readonly added: readonly ColorSystemDesignEntityRefV1[];
  readonly changed: readonly {
    readonly entity: ColorSystemDesignEntityRefV1;
    /** Exact paths within this entity, including individual native channels. */
    readonly paths: readonly (readonly (string | number)[])[];
  }[];
  readonly removed: readonly ColorSystemDesignEntityRefV1[];
}
export type ColorSystemDesignLockTargetV1 = {
  readonly kind: 'family' | 'scale';
  readonly id: string;
};
type DesignScale = ColorSystemDesignSemanticsV1['scales'][number];
type SelectorMembership =
  | { readonly kind: 'color'; readonly id: string }
  | { readonly kind: 'family'; readonly id: string; readonly colorIds: readonly string[] }
  | { readonly kind: 'scale'; readonly id: string; readonly scale: DesignScale };
interface LockSnapshot {
  readonly target: ColorSystemDesignLockTargetV1;
  readonly colors: ColorSystemDesignSemanticsV1['colors'];
  readonly families: ColorSystemDesignSemanticsV1['families'];
  readonly scales: ColorSystemDesignSemanticsV1['scales'];
  readonly memberships: readonly {
    readonly familyId: string;
    readonly colorIds: readonly string[];
  }[];
  readonly modes: ColorSystemDesignSemanticsV1['modes'];
  readonly contexts: ColorSystemDesignSemanticsV1['contexts'];
  readonly rules: ColorSystemDesignSemanticsV1['rules'];
  readonly adoptions: readonly DesignAdoption[];
  readonly brandConstraintsByContext: ColorSystemDesignSemanticsV1['brandConstraintsByContext'];
  readonly selectorMemberships: readonly SelectorMembership[];
  readonly applications: readonly ColorSystemContextApplicationV1[];
  readonly pairedPaints: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly colorId: string;
    readonly modeId: string;
    readonly value: ColorSystemModelV1['colors'][number]['valuesByMode'][string] | null;
  }[];
}
export interface ColorSystemDesignLockV1 {
  readonly version: typeof COLOR_SYSTEM_DESIGN_LOCK_V1_VERSION;
  readonly qualified: false;
  readonly target: ColorSystemDesignLockTargetV1;
  readonly snapshot: LockSnapshot;
  readonly snapshotHash: string;
  readonly lockHash: string;
}
export interface ColorSystemDesignLockCheckV1 {
  readonly qualified: false;
  readonly status: 'intact' | 'changed' | 'missing';
  readonly target: ColorSystemDesignLockTargetV1;
  readonly expectedSnapshotHash: string;
  readonly currentSnapshotHash: string | null;
}

const captures = new WeakSet<ColorSystemDesignContentV1>();
const hashPattern = /^sha256:[0-9a-f]{64}$/;
const byId = <T extends { readonly id: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => compareText(a.id, b.id));

function withoutEvidence<
  T extends { readonly evidenceRefs: readonly string[]; readonly claimIds: readonly string[] },
>(value: T): WithoutEvidence<T> {
  const { evidenceRefs: _evidence, claimIds: _claims, ...meaning } = value;
  return meaning as WithoutEvidence<T>;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** canonicalJson preserves finite precision; the side binding distinguishes JSON's signed-zero loss. */
function exactHash(value: unknown): string {
  const negativeZeroPaths: (string | number)[][] = [];
  const visit = (item: unknown, path: (string | number)[]) => {
    if (Object.is(item, -0)) negativeZeroPaths.push(path);
    else if (Array.isArray(item)) item.forEach((child, index) => visit(child, [...path, index]));
    else if (item && typeof item === 'object')
      for (const key of Object.keys(item).sort(compareText))
        visit((item as Record<string, unknown>)[key], [...path, key]);
  };
  visit(value, []);
  return deterministicContentHash(canonicalJson({ value, negativeZeroPaths }));
}
function captured(value: unknown): ColorSystemDesignContentV1 {
  if (!value || typeof value !== 'object' || !captures.has(value as ColorSystemDesignContentV1))
    throw new Error('Rebuild design content from the validated model and actual applications.');
  return value as ColorSystemDesignContentV1;
}

/** Detach and validate actual inputs; this projection never evaluates or authorizes the design. */
export function buildColorSystemDesignContentV1(
  modelInput: unknown,
  applicationInput: unknown
): ColorSystemDesignContentV1 {
  const model = captureColorSystemModelV1(modelInput);
  const raw = snapshotColorSystemInertJsonV1(applicationInput);
  if (!Array.isArray(raw) || raw.length > COLOR_SYSTEM_DESIGN_CONTENT_V1_LIMITS.maximumApplications)
    throw new Error('Design content supports at most 64 actual applications.');
  const applications = byId(raw.map(buildColorSystemContextApplicationV1));
  if (new Set(applications.map(item => item.id)).size !== applications.length)
    throw new Error('Design applications require unique IDs.');
  const colors = new Map(model.colors.map(color => [color.id, color]));
  for (const application of applications) {
    const context = model.contexts.find(item => item.id === application.contextId);
    if (!context?.modeIds.includes(application.modeId))
      throw new Error('Design application context or authored mode is unsupported.');
    for (const use of application.uses) {
      const color = colors.get(use.colorId);
      if (
        !color ||
        (!color.valuesByMode[application.modeId] &&
          !color.valueGapClaimIdsByMode?.[application.modeId])
      )
        throw new Error(
          'Design paint requires an explicit value or retained gap in its actual mode.'
        );
    }
  }
  const content = snapshotColorSystemInertJsonV1({
    modes: model.modes,
    colors: model.colors.map(({ id, label, valuesByMode }) => ({ id, label, valuesByMode })),
    families: model.families.map(withoutEvidence),
    scales: model.scales.map(withoutEvidence),
    contexts: model.contexts.map(withoutEvidence),
    rules: model.rules.map(withoutEvidence),
    adoptions: model.adoptions.map(({ ruleId, status }) => ({ ruleId, status })),
    brandConstraintsByContext: model.brandConstraintsByContext.map(
      ({ id, contextIds, fragment }) => ({
        id,
        contextIds,
        rules: fragment.rules.map(({ evidenceRefs: _evidence, ...rule }) => rule),
        adoptions: fragment.decisions.map(({ ruleId, status }) => ({ ruleId, status })),
      })
    ),
    applications: applications.map(application => ({
      ...application,
      uses: byId(application.uses),
      pairs: byId(application.pairs),
    })),
  }) as unknown as ColorSystemDesignSemanticsV1;
  const design = freeze({
    version: COLOR_SYSTEM_DESIGN_CONTENT_V1_VERSION,
    qualified: false as const,
    sourceIdentity: { workingModelHash: model.modelHash, sources: model.sources },
    content,
    contentHash: exactHash({ version: COLOR_SYSTEM_DESIGN_CONTENT_V1_VERSION, content }),
  });
  captures.add(design);
  return design;
}

function differencePaths(
  before: unknown,
  after: unknown,
  path: (string | number)[] = []
): (string | number)[][] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return [path];
    return before.flatMap((item, index) => differencePaths(item, after[index], [...path, index]));
  }
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>,
      right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort(compareText)
      .flatMap(key =>
        !(key in left) || !(key in right)
          ? [[...path, key]]
          : differencePaths(left[key], right[key], [...path, key])
      );
  }
  return [path];
}
function entities(content: ColorSystemDesignSemanticsV1) {
  const entries = new Map<string, { entity: ColorSystemDesignEntityRefV1; value: unknown }>();
  const add = (entity: ColorSystemDesignEntityRefV1, value: unknown) =>
    entries.set(canonicalJson(entity), { entity, value });
  for (const kind of Object.keys(content) as (keyof ColorSystemDesignSemanticsV1)[])
    for (const value of content[kind])
      add({ kind, id: 'id' in value ? value.id : value.ruleId }, value);
  for (const application of content.applications) {
    for (const use of application.uses)
      add({ kind: 'applicationUses', applicationId: application.id, id: use.id }, use);
    for (const pair of application.pairs)
      add({ kind: 'applicationPairs', applicationId: application.id, id: pair.id }, pair);
  }
  return entries;
}
export function diffColorSystemDesignContentV1(
  beforeInput: unknown,
  afterInput: unknown
): ColorSystemDesignDiffV1 {
  const before = captured(beforeInput),
    after = captured(afterInput);
  const left = entities(before.content),
    right = entities(after.content);
  const kept: ColorSystemDesignEntityRefV1[] = [],
    added: ColorSystemDesignEntityRefV1[] = [],
    removed: ColorSystemDesignEntityRefV1[] = [];
  const changed: { entity: ColorSystemDesignEntityRefV1; paths: (string | number)[][] }[] = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort(compareText)) {
    const old = left.get(key),
      current = right.get(key);
    if (!old) added.push(current!.entity);
    else if (!current) removed.push(old.entity);
    else {
      const paths = differencePaths(old.value, current.value);
      if (paths.length) changed.push({ entity: current.entity, paths });
      else kept.push(current.entity);
    }
  }
  return freeze({
    beforeContentHash: before.contentHash,
    afterContentHash: after.contentHash,
    kept,
    added,
    changed,
    removed,
  });
}

function target(input: unknown): ColorSystemDesignLockTargetV1 {
  const value = snapshotColorSystemInertJsonV1(input);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid design lock target.');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(',') !== 'id,kind' ||
    !['family', 'scale'].includes(data.kind as string) ||
    typeof data.id !== 'string' ||
    !data.id.trim() ||
    data.id.length > 128
  )
    throw new Error('A design lock names one explicit family or scale.');
  return data as unknown as ColorSystemDesignLockTargetV1;
}
function selectors(rule: DesignRule): readonly ColorSystemSelectorV1[] {
  const operands = rule.operands;
  if ('left' in operands) return [...operands.left, ...operands.right];
  if ('subject' in operands) return [...operands.subject, ...operands.partner];
  if ('groups' in operands) return operands.groups.flat();
  return operands.members;
}
function lockSnapshot(
  design: ColorSystemDesignContentV1,
  selected: ColorSystemDesignLockTargetV1
): LockSnapshot | null {
  const content = design.content;
  const family =
    selected.kind === 'family' ? content.families.find(item => item.id === selected.id) : undefined;
  const scales = content.scales.filter(item =>
    selected.kind === 'family' ? item.familyId === selected.id : item.id === selected.id
  );
  if (selected.kind === 'family' ? !family : !scales.length) return null;
  const colorIds = new Set(
    family?.colorIds ??
      scales.flatMap(scale =>
        scale.modes.flatMap(mode => mode.anchors.map(anchor => anchor.colorId))
      )
  );
  const colorById = new Map(content.colors.map(color => [color.id, color]));
  const resolve = (selector: ColorSystemSelectorV1): readonly string[] => {
    if (selector.kind === 'color') return [selector.id];
    if (selector.kind === 'family')
      return content.families.find(item => item.id === selector.id)!.colorIds;
    return content.scales
      .find(item => item.id === selector.id)!
      .modes.flatMap(mode => mode.anchors.map(anchor => anchor.colorId));
  };
  const pairedPaints: LockSnapshot['pairedPaints'][number][] = [];
  const applications = content.applications
    .filter(application => application.uses.some(use => colorIds.has(use.colorId)))
    .map(application => {
      const included = new Set(
        application.uses.filter(use => colorIds.has(use.colorId)).map(use => use.id)
      );
      const pairs = application.pairs.filter(pair =>
        [pair.foregroundUseId, pair.backgroundUseId, pair.underlayUseId].some(
          id => id !== undefined && included.has(id)
        )
      );
      for (const pair of pairs)
        for (const id of [
          pair.foregroundUseId,
          pair.backgroundUseId,
          ...(pair.underlayUseId ? [pair.underlayUseId] : []),
        ])
          included.add(id);
      const uses = application.uses.filter(use => included.has(use.id));
      for (const use of uses) {
        if (!colorIds.has(use.colorId))
          pairedPaints.push({
            applicationId: application.id,
            useId: use.id,
            colorId: use.colorId,
            modeId: application.modeId,
            value: colorById.get(use.colorId)!.valuesByMode[application.modeId] ?? null,
          });
      }
      return { ...application, uses, pairs };
    });
  const rules = content.rules.filter(
    rule =>
      selectors(rule).some(selector => resolve(selector).some(id => colorIds.has(id))) ||
      applications.some(
        application =>
          rule.contextIds.includes(application.contextId) &&
          rule.modeIds.includes(application.modeId) &&
          ((rule.kind === 'role-binding' &&
            application.uses.some(
              use => colorIds.has(use.colorId) && use.role === rule.operands.role
            )) ||
            rule.kind === 'allowed-pair' ||
            rule.kind === 'palette-membership')
      )
  );
  const selectedRefs = new Map<string, ColorSystemSelectorV1>();
  for (const rule of rules)
    for (const selector of selectors(rule))
      selectedRefs.set(canonicalJson([selector.kind, selector.id]), selector);
  const selectorMemberships: SelectorMembership[] = [...selectedRefs.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, selector]) => {
      if (selector.kind === 'family')
        return { kind: 'family', id: selector.id, colorIds: resolve(selector) };
      if (selector.kind === 'scale')
        return {
          kind: 'scale',
          id: selector.id,
          scale: content.scales.find(item => item.id === selector.id)!,
        };
      return { kind: 'color', id: selector.id };
    });
  const contexts = new Set([
    ...applications.map(item => item.contextId),
    ...rules.flatMap(rule => rule.contextIds),
  ]);
  const modeIds = new Set([
    ...applications.map(item => item.modeId),
    ...rules.flatMap(rule => rule.modeIds),
    ...scales.flatMap(scale => scale.modes.map(mode => mode.modeId)),
    ...[...colorIds].flatMap(id => Object.keys(colorById.get(id)!.valuesByMode)),
  ]);
  return {
    target: selected,
    colors: content.colors.filter(color => colorIds.has(color.id)),
    families: family ? [family] : [],
    scales,
    memberships: content.families
      .map(item => ({ familyId: item.id, colorIds: item.colorIds.filter(id => colorIds.has(id)) }))
      .filter(item => item.colorIds.length),
    modes: content.modes.filter(mode => modeIds.has(mode.id)),
    contexts: content.contexts.filter(context => contexts.has(context.id)),
    rules,
    adoptions: content.adoptions.filter(adoption =>
      rules.some(rule => rule.id === adoption.ruleId)
    ),
    brandConstraintsByContext: content.brandConstraintsByContext.filter(wrapper =>
      wrapper.contextIds.some(
        id =>
          contexts.has(id) &&
          content.contexts
            .find(context => context.id === id)!
            .modeIds.some(modeId => modeIds.has(modeId))
      )
    ),
    selectorMemberships,
    applications,
    pairedPaints,
  };
}
export function buildColorSystemDesignLockV1(
  designInput: unknown,
  targetInput: unknown
): ColorSystemDesignLockV1 {
  const design = captured(designInput),
    selected = target(targetInput);
  const snapshot = lockSnapshot(design, selected);
  if (!snapshot) throw new Error('The locked family or scale is missing from this design.');
  const body = {
    version: COLOR_SYSTEM_DESIGN_LOCK_V1_VERSION,
    qualified: false as const,
    target: selected,
    snapshot,
    snapshotHash: exactHash(snapshot),
  };
  const bounded = snapshotColorSystemInertJsonV1(body) as typeof body;
  return freeze({ ...bounded, lockHash: exactHash(bounded) });
}

/**
 * Imported lock data is never a trusted design or approval. The recipe must bind
 * the original lockHash separately; self-consistency cannot establish who accepted it.
 */
export function recheckColorSystemDesignLockV1(
  lockInput: unknown,
  designInput: unknown
): ColorSystemDesignLockCheckV1 {
  const design = captured(designInput);
  const raw = snapshotColorSystemInertJsonV1(lockInput);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid design lock.');
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !==
      'lockHash,qualified,snapshot,snapshotHash,target,version' ||
    value.version !== COLOR_SYSTEM_DESIGN_LOCK_V1_VERSION ||
    value.qualified !== false ||
    typeof value.snapshotHash !== 'string' ||
    !hashPattern.test(value.snapshotHash) ||
    typeof value.lockHash !== 'string' ||
    !hashPattern.test(value.lockHash)
  )
    throw new Error('Unsupported or malformed design lock.');
  const selected = target(value.target);
  const { lockHash, ...body } = value;
  if (exactHash(body) !== lockHash || exactHash(value.snapshot) !== value.snapshotHash)
    throw new Error('Design lock content does not match its exact hash.');
  const current = lockSnapshot(design, selected);
  const currentSnapshotHash = current ? exactHash(current) : null;
  // Only equality to a freshly constructed, validated projection can report intact.
  return freeze({
    qualified: false,
    status:
      current === null
        ? 'missing'
        : currentSnapshotHash === value.snapshotHash &&
            differencePaths(value.snapshot, current).length === 0
          ? 'intact'
          : 'changed',
    target: selected,
    expectedSnapshotHash: value.snapshotHash,
    currentSnapshotHash,
  });
}
