/** Evaluate authored relationships against the actual paints in one scoped application. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import {
  parseColorSystemModelV1,
  hashColorSystemScopedRuleV1,
  type ColorSystemModelV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSelectorV1,
} from './colorSystemModelV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { getWCAGContrast } from './accessibility';
import { colorSystemSrgbToRgbV1, compositeColorSystemRgbV1 } from './colorSystemSrgbValueV1';

export const COLOR_SYSTEM_RELATIONSHIPS_V1_VERSION = 'teul.context-relationships.v1' as const;
export const COLOR_SYSTEM_CONTEXT_APPLICATION_V1_LIMITS = { uses: 128, pairs: 512 } as const;

export interface ColorSystemApplicationPaintUseV1 {
  readonly id: string;
  readonly colorId: string;
  readonly role: string;
  /** Actual visible painted area in a consistent unit; never an inferred source percentage. */
  readonly area?: number;
}
export interface ColorSystemApplicationPaintPairV1 {
  readonly id: string;
  readonly foregroundUseId: string;
  readonly backgroundUseId: string;
  /** Required for a translucent background; its value must be opaque. */
  readonly underlayUseId?: string;
  readonly contrast?: {
    readonly minimum: number;
    readonly assessment: 'required' | 'advisory' | 'inactive-exempt';
  };
}
export interface ColorSystemContextApplicationV1 {
  readonly id: string;
  readonly contextId: string;
  readonly modeId: string;
  /** Include grounds, strokes, chart separators and other auxiliary paints. */
  readonly uses: readonly ColorSystemApplicationPaintUseV1[];
  readonly pairs: readonly ColorSystemApplicationPaintPairV1[];
}
export interface ColorSystemRelationshipAssessmentV1 {
  readonly ruleId: string;
  readonly ruleHash: string;
  readonly kind: ColorSystemScopedRuleV1['kind'];
  readonly force: ColorSystemScopedRuleV1['force'];
  readonly adoption: 'accepted' | 'rejected' | 'unreviewed';
  readonly status:
    'pass' | 'fail' | 'unresolved' | 'advisory' | 'evidence-only' | 'not-applicable' | 'rejected';
  readonly enforcement: 'blocking' | 'advisory' | 'none';
  readonly satisfied: boolean | null;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly claimIds: readonly string[];
}
export interface ColorSystemContextAssessmentV1 {
  readonly version: typeof COLOR_SYSTEM_RELATIONSHIPS_V1_VERSION;
  readonly modelHash: string;
  readonly applicationHash: string;
  readonly application: ColorSystemContextApplicationV1;
  readonly eligible: boolean;
  readonly sourceConfidence: 'observed' | 'provisional' | 'unresolved';
  readonly rules: readonly ColorSystemRelationshipAssessmentV1[];
  readonly pairs: readonly {
    readonly pairId: string;
    readonly ratio: number | null;
    readonly threshold: number;
    readonly assessment: 'required' | 'advisory' | 'inactive-exempt';
    readonly status: 'pass' | 'fail' | 'unresolved' | 'inactive-exempt';
  }[];
  readonly blockers: readonly { readonly id: string; readonly reason: string }[];
  readonly unresolvedClaimIds: readonly string[];
  readonly unresolvedEvidenceRefs: readonly string[];
  readonly conflictIds: readonly string[];
  /** Generation must consume these same scoped fragments; source colors are not rewritten. */
  readonly brandConstraintFragmentHashes: readonly string[];
  readonly assessmentHash: string;
}

/** The same exact compositing measurement is used for search pruning and final assessment. */
export function renderColorSystemContextPairV1(
  foreground: ColorSystemColorValueV2 | undefined,
  background: ColorSystemColorValueV2 | undefined,
  underlay?: ColorSystemColorValueV2
) {
  if (!foreground || !background || (background.alpha < 1 && (!underlay || underlay.alpha !== 1)))
    return null;
  const renderedBackground =
    background.alpha === 1
      ? colorSystemSrgbToRgbV1(background)
      : compositeColorSystemRgbV1(
          colorSystemSrgbToRgbV1(background),
          background.alpha,
          colorSystemSrgbToRgbV1(underlay!)
        );
  return {
    foreground: compositeColorSystemRgbV1(
      colorSystemSrgbToRgbV1(foreground),
      foreground.alpha,
      renderedBackground
    ),
    background: renderedBackground,
  };
}

export function measureColorSystemContextPairV1(
  foreground: ColorSystemColorValueV2 | undefined,
  background: ColorSystemColorValueV2 | undefined,
  underlay?: ColorSystemColorValueV2
): number | null {
  const pair = renderColorSystemContextPairV1(foreground, background, underlay);
  return pair ? getWCAGContrast(pair.foreground, pair.background) : null;
}

function record(
  value: unknown,
  label: string,
  allowed: readonly string[]
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !allowed.includes(key) ||
      !descriptor ||
      !('value' in descriptor) ||
      !descriptor.enumerable
    ) {
      throw new Error(`${label} has unsupported fields or accessors.`);
    }
  }
  return value as Record<string, unknown>;
}
function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new Error(`${label} requires nonblank text of at most 128 characters.`);
  }
  return value;
}
function list(value: unknown, maximum: number, label: string): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum
  )
    throw new Error(`${label} exceeds its bound.`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    keys.some(
      key =>
        typeof key !== 'string' ||
        (key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))
    )
  ) {
    throw new Error(`${label} contains unsupported array fields.`);
  }
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new Error(`${label} contains missing entries or accessors.`);
    copy.push(descriptor.value);
  }
  return copy;
}

/** A bounded, inert value. This does not authorize a Figma mutation. */
export function buildColorSystemContextApplicationV1(
  input: unknown
): ColorSystemContextApplicationV1 {
  const root = record(input, 'application', ['id', 'contextId', 'modeId', 'uses', 'pairs']);
  const uses = list(root.uses, COLOR_SYSTEM_CONTEXT_APPLICATION_V1_LIMITS.uses, 'uses').map(
    item => {
      const use = record(item, 'paint use', ['id', 'colorId', 'role', 'area']);
      if (
        use.area !== undefined &&
        (typeof use.area !== 'number' || !Number.isFinite(use.area) || use.area <= 0)
      ) {
        throw new Error('An actual painted use must have finite positive area when measured.');
      }
      return {
        id: id(use.id, 'use.id'),
        colorId: id(use.colorId, 'use.colorId'),
        role: id(use.role, 'use.role'),
        ...(use.area === undefined ? {} : { area: use.area as number }),
      };
    }
  );
  if (uses.length === 0 || new Set(uses.map(use => use.id)).size !== uses.length) {
    throw new Error('An application requires unique actual paint uses.');
  }
  const useIds = new Set(uses.map(use => use.id));
  const pairs = list(root.pairs, COLOR_SYSTEM_CONTEXT_APPLICATION_V1_LIMITS.pairs, 'pairs').map(
    item => {
      const pair = record(item, 'pair', [
        'id',
        'foregroundUseId',
        'backgroundUseId',
        'underlayUseId',
        'contrast',
      ]);
      const foregroundUseId = id(pair.foregroundUseId, 'pair.foregroundUseId');
      const backgroundUseId = id(pair.backgroundUseId, 'pair.backgroundUseId');
      const underlayUseId =
        pair.underlayUseId === undefined ? undefined : id(pair.underlayUseId, 'pair.underlayUseId');
      if (
        foregroundUseId === backgroundUseId ||
        underlayUseId === foregroundUseId ||
        underlayUseId === backgroundUseId ||
        [foregroundUseId, backgroundUseId, ...(underlayUseId ? [underlayUseId] : [])].some(
          ref => !useIds.has(ref)
        )
      ) {
        throw new Error(
          'Pair references must name actual distinct foreground and background uses.'
        );
      }
      let contrast: ColorSystemApplicationPaintPairV1['contrast'];
      if (pair.contrast !== undefined) {
        const claim = record(pair.contrast, 'contrast', ['minimum', 'assessment']);
        if (
          typeof claim.minimum !== 'number' ||
          !Number.isFinite(claim.minimum) ||
          claim.minimum < 1 ||
          claim.minimum > 21 ||
          !['required', 'advisory', 'inactive-exempt'].includes(claim.assessment as string)
        ) {
          throw new Error(
            'Contrast requires a threshold from one through 21 and an explicit assessment.'
          );
        }
        contrast = {
          minimum: claim.minimum,
          assessment: claim.assessment as NonNullable<typeof contrast>['assessment'],
        };
      }
      return {
        id: id(pair.id, 'pair.id'),
        foregroundUseId,
        backgroundUseId,
        ...(underlayUseId === undefined ? {} : { underlayUseId }),
        ...(contrast === undefined ? {} : { contrast }),
      };
    }
  );
  if (new Set(pairs.map(pair => pair.id)).size !== pairs.length)
    throw new Error('Pair IDs must be unique.');
  return {
    id: id(root.id, 'application.id'),
    contextId: id(root.contextId, 'contextId'),
    modeId: id(root.modeId, 'modeId'),
    uses,
    pairs,
  };
}

interface PredicateResult {
  applicable: boolean;
  satisfied: boolean | null;
  reason: string;
}

/** Validate once and index authored selectors for repeat candidate assessment. */
export function compileColorSystemRelationshipsV1(model: ColorSystemModelV1): {
  evaluate(input: unknown): ColorSystemContextAssessmentV1;
} {
  // Parsing validates and detaches the model so caller mutation cannot change policy.
  const source = parseColorSystemModelV1(model);
  const colors = new Map(source.colors.map(color => [color.id, color]));
  const families = new Map(source.families.map(family => [family.id, family]));
  const scales = new Map(source.scales.map(scale => [scale.id, scale]));
  const evidenceById = new Map(source.evidence.map(item => [item.id, item]));
  const claims = new Map(source.claims.map(claim => [claim.id, claim]));
  const adoptions = new Map(source.adoptions.map(adoption => [adoption.ruleId, adoption]));
  const ruleHashes = new Map(
    source.rules.map(rule => [rule.id, hashColorSystemScopedRuleV1(rule)])
  );
  const structuresByRule = new Map(
    source.rules.map(rule => {
      let selectors: readonly ColorSystemSelectorV1[];
      switch (rule.kind) {
        case 'palette-membership':
        case 'color-count':
        case 'role-binding':
          selectors = rule.operands.members;
          break;
        case 'allowed-pair':
        case 'forbidden-pair':
          selectors = [...rule.operands.left, ...rule.operands.right];
          break;
        case 'required-partner':
          selectors = [...rule.operands.subject, ...rule.operands.partner];
          break;
        case 'prominence':
          selectors =
            rule.operands.kind === 'ordered-groups'
              ? rule.operands.groups.flat()
              : rule.operands.members;
          break;
      }
      const structures = selectors.flatMap(selector =>
        selector.kind === 'family'
          ? [families.get(selector.id)!]
          : selector.kind === 'scale'
            ? [scales.get(selector.id)!, families.get(scales.get(selector.id)!.familyId)!]
            : []
      );
      return [
        rule.id,
        {
          selectors,
          claimIds: [...new Set(structures.flatMap(item => item.claimIds))],
          evidenceRefs: [...new Set(structures.flatMap(item => item.evidenceRefs))],
        },
      ];
    })
  );
  const selectorCache = new WeakMap<ColorSystemSelectorV1, Map<string, ReadonlySet<string>>>();
  function select(selector: ColorSystemSelectorV1, modeId: string): ReadonlySet<string> {
    let modes = selectorCache.get(selector);
    const cached = modes?.get(modeId);
    if (cached) return cached;
    const result = new Set(
      selector.kind === 'color'
        ? [selector.id]
        : selector.kind === 'family'
          ? families.get(selector.id)!.colorIds
          : (scales
              .get(selector.id)!
              .modes.find(mode => mode.modeId === modeId)
              ?.anchors.map(anchor => anchor.colorId) ?? [])
    );
    if (!modes) {
      modes = new Map();
      selectorCache.set(selector, modes);
    }
    modes.set(modeId, result);
    return result;
  }

  return {
    evaluate(input) {
      const application = buildColorSystemContextApplicationV1(input);
      const context = source.contexts.find(item => item.id === application.contextId);
      if (!context || !context.modeIds.includes(application.modeId))
        throw new Error('Application context or authored mode is unsupported.');
      const used = new Set(application.uses.map(use => use.colorId));
      const values = new Map<string, ColorSystemColorValueV2>();
      for (const use of application.uses) {
        const color = colors.get(use.colorId);
        const value = color?.valuesByMode[application.modeId];
        if (!value && !color?.valueGapClaimIdsByMode?.[application.modeId])
          throw new Error(`Paint ${use.id} lacks a recorded value in the requested mode.`);
        if (value) values.set(use.id, value);
      }
      const useById = new Map(application.uses.map(use => [use.id, use]));
      const coPresent = application.uses.flatMap((left, index) =>
        application.uses.slice(index + 1).map(right => [left, right] as const)
      );
      const foregroundBackground = application.pairs.map(
        pair => [useById.get(pair.foregroundUseId)!, useById.get(pair.backgroundUseId)!] as const
      );
      const matches = (
        selectors: readonly ColorSystemSelectorV1[],
        use: ColorSystemApplicationPaintUseV1
      ) =>
        selectors.some(
          selector =>
            (selector.role === undefined || selector.role === use.role) &&
            select(selector, application.modeId).has(use.colorId)
        );
      const predicate = (rule: ColorSystemScopedRuleV1): PredicateResult => {
        switch (rule.kind) {
          case 'palette-membership': {
            const satisfied =
              rule.force === 'prohibition'
                ? !application.uses.some(use => matches(rule.operands.members, use))
                : application.uses.every(use => matches(rule.operands.members, use));
            return {
              applicable: true,
              satisfied,
              reason: satisfied
                ? 'Every actual paint respects the scoped palette.'
                : 'An actual paint violates the scoped palette.',
            };
          }
          case 'role-binding': {
            const roleUses = application.uses.filter(use => use.role === rule.operands.role);
            const optionalAbsent = rule.operands.presence === 'if-present' && roleUses.length === 0;
            const satisfied =
              rule.force === 'prohibition'
                ? roleUses.every(use => !matches(rule.operands.members, use))
                : roleUses.length > 0 && roleUses.every(use => matches(rule.operands.members, use));
            return {
              applicable: !optionalAbsent && (rule.force !== 'prohibition' || roleUses.length > 0),
              satisfied: optionalAbsent || satisfied,
              reason: optionalAbsent
                ? 'The optional role is absent.'
                : satisfied
                  ? 'The actual role uses its permitted colors.'
                  : 'A required role is absent or uses an incompatible color.',
            };
          }
          case 'required-partner': {
            const applicable = application.uses.some(
              use =>
                matches(rule.operands.subject, use) &&
                (rule.operands.subjectRole === undefined || use.role === rule.operands.subjectRole)
            );
            const satisfied =
              !applicable ||
              application.uses.some(
                use =>
                  matches(rule.operands.partner, use) &&
                  (rule.operands.partnerRole === undefined ||
                    use.role === rule.operands.partnerRole)
              );
            return {
              applicable,
              satisfied,
              reason: satisfied
                ? 'The authored partner is present when needed.'
                : 'The authored partner is missing.',
            };
          }
          case 'allowed-pair':
          case 'forbidden-pair': {
            const pairs =
              rule.operands.relation === 'foreground-background' ? foregroundBackground : coPresent;
            const relevant = pairs.filter(
              ([a, b]) =>
                matches(rule.operands.left, a) ||
                (!rule.operands.ordered && matches(rule.operands.left, b))
            );
            const allowed = ([a, b]: (typeof pairs)[number]) =>
              (matches(rule.operands.left, a) && matches(rule.operands.right, b)) ||
              (!rule.operands.ordered &&
                matches(rule.operands.left, b) &&
                matches(rule.operands.right, a));
            const applicable =
              rule.kind === 'forbidden-pair' ? relevant.some(allowed) : relevant.length > 0;
            const satisfied =
              rule.kind === 'allowed-pair' ? relevant.every(allowed) : !relevant.some(allowed);
            return {
              applicable,
              satisfied,
              reason: satisfied
                ? 'Actual relationships respect the scoped pairing rule.'
                : 'An actual relationship violates the scoped pairing rule.',
            };
          }
          case 'color-count': {
            const count =
              rule.operands.unit === 'groups'
                ? new Set(
                    rule.operands.members
                      .filter(selector => application.uses.some(use => matches([selector], use)))
                      .map(selector => canonicalJson([selector.kind, selector.id]))
                  ).size
                : new Set(
                    application.uses
                      .filter(use => matches(rule.operands.members, use))
                      .map(use => use.colorId)
                  ).size;
            const within = count >= rule.operands.minimum && count <= rule.operands.maximum;
            return {
              applicable: true,
              satisfied: rule.force === 'prohibition' ? !within : within,
              reason: `${count} distinct ${rule.operands.unit === 'groups' ? 'authored groups' : 'recorded colors'} are used; ${rule.force === 'prohibition' ? 'forbidden' : 'stated'} range ${rule.operands.minimum}–${rule.operands.maximum}.`,
            };
          }
          case 'prominence': {
            if (application.uses.some(use => use.area === undefined))
              return {
                applicable: true,
                satisfied: null,
                reason: 'Actual painted area is missing; prominence cannot be established.',
              };
            const area = (members: readonly ColorSystemSelectorV1[]) =>
              application.uses.reduce(
                (sum, use) => sum + (matches(members, use) ? use.area! : 0),
                0
              );
            if (rule.operands.kind === 'ordered-groups') {
              const groups = rule.operands.groups;
              if (
                application.uses.some(use => groups.filter(group => matches(group, use)).length > 1)
              )
                return {
                  applicable: true,
                  satisfied: null,
                  reason:
                    'A painted use belongs to multiple ordered groups; prominence is ambiguous.',
                };
              const areas = groups.map(area);
              if (areas.some(value => !Number.isFinite(value)))
                return {
                  applicable: true,
                  satisfied: null,
                  reason: 'Measured group areas must remain finite.',
                };
              return {
                applicable: true,
                satisfied: areas.every((value, index) => index === 0 || areas[index - 1] > value),
                reason: `Measured group areas in source order: ${areas.join(', ')}. The source supplies an ordering, not percentages.`,
              };
            }
            const total = application.uses.reduce((sum, use) => sum + use.area!, 0);
            if (!Number.isFinite(total) || total <= 0)
              return {
                applicable: true,
                satisfied: null,
                reason: 'A positive finite total painted area is required.',
              };
            const fraction = area(rule.operands.members) / total;
            return {
              applicable: true,
              satisfied: fraction >= rule.operands.minimum && fraction <= rule.operands.maximum,
              reason: `Measured fraction ${fraction}; explicit source/working bounds ${rule.operands.minimum}–${rule.operands.maximum}.`,
            };
          }
        }
      };
      const assessments: ColorSystemRelationshipAssessmentV1[] = source.rules
        .filter(
          rule =>
            rule.contextIds.includes(application.contextId) &&
            rule.modeIds.includes(application.modeId)
        )
        .map(rule => {
          const adoption = adoptions.get(rule.id)?.status ?? 'unreviewed';
          const hard = rule.force === 'requirement' || rule.force === 'prohibition';
          const observed = predicate(rule);
          const status: ColorSystemRelationshipAssessmentV1['status'] =
            adoption === 'rejected'
              ? 'rejected'
              : !observed.applicable
                ? 'not-applicable'
                : hard && adoption !== 'accepted'
                  ? 'unresolved'
                  : adoption !== 'accepted' ||
                      rule.force === 'permission' ||
                      rule.force === 'example'
                    ? 'evidence-only'
                    : rule.force === 'preference' && adoption === 'accepted'
                      ? 'advisory'
                      : observed.satisfied === null
                        ? 'unresolved'
                        : observed.satisfied
                          ? 'pass'
                          : 'fail';
          return {
            ruleId: rule.id,
            ruleHash: ruleHashes.get(rule.id)!,
            kind: rule.kind,
            force: rule.force,
            adoption,
            status,
            enforcement:
              hard && adoption !== 'rejected'
                ? 'blocking'
                : rule.force === 'preference' && adoption === 'accepted'
                  ? 'advisory'
                  : 'none',
            satisfied: observed.satisfied,
            reason:
              status === 'unresolved' && adoption === 'unreviewed'
                ? 'This scoped rule still needs an explicit adoption decision.'
                : observed.reason,
            evidenceRefs: [...rule.evidenceRefs],
            claimIds: [...rule.claimIds],
          };
        });
      const activeRuleIds = new Set(
        assessments
          .filter(item => item.status !== 'not-applicable' && item.status !== 'rejected')
          .map(item => item.ruleId)
      );
      const hardRuleIds = new Set(
        assessments
          .filter(item => activeRuleIds.has(item.ruleId) && item.enforcement === 'blocking')
          .map(item => item.ruleId)
      );
      const scopedConflicts = source.conflicts.filter(
        conflict =>
          (!conflict.colorIds?.length || conflict.colorIds.some(id => used.has(id))) &&
          (!conflict.modeIds?.length || conflict.modeIds.includes(application.modeId)) &&
          (conflict.contextIds.length === 0 ||
            conflict.contextIds.includes(application.contextId)) &&
          (conflict.ruleIds.length === 0 ||
            conflict.ruleIds.some(ruleId => activeRuleIds.has(ruleId)))
      );
      const claimScopeMatches = (claim: (typeof source.claims)[number]) =>
        (claim.contextIds.length === 0 || claim.contextIds.includes(application.contextId)) &&
        (!claim.modeIds?.length || claim.modeIds.includes(application.modeId)) &&
        (claim.ruleIds.length === 0 || claim.ruleIds.some(ruleId => activeRuleIds.has(ruleId)));
      const resolutionUsable = (conflict: (typeof source.conflicts)[number]) => {
        const resolution = conflict.resolutionClaimId
          ? claims.get(conflict.resolutionClaimId)
          : undefined;
        return (
          conflict.status === 'resolved' &&
          resolution !== undefined &&
          ['observed', 'inferred'].includes(resolution.status) &&
          resolution.evidenceRefs.length > 0 &&
          resolution.evidenceRefs.every(ref =>
            ['observed', 'inferred'].includes(evidenceById.get(ref)!.status)
          ) &&
          claimScopeMatches(resolution)
        );
      };
      const conflicts = scopedConflicts.filter(conflict => !resolutionUsable(conflict));
      const usedColors = [...used].map(colorId => colors.get(colorId)!);
      const activeGapClaims = new Set(
        usedColors.flatMap(color => color.valueGapClaimIdsByMode?.[application.modeId] ?? [])
      );
      const inactiveGapClaims = new Set(
        usedColors
          .flatMap(color => Object.values(color.valueGapClaimIdsByMode ?? {}).flat())
          .filter(ref => !activeGapClaims.has(ref))
      );
      const colorClaimIds = new Set(
        usedColors.flatMap(color => color.claimIds.filter(ref => !inactiveGapClaims.has(ref)))
      );
      const ruleClaims = (ruleIds: ReadonlySet<string>) =>
        new Set(
          assessments
            .filter(item => ruleIds.has(item.ruleId))
            .flatMap(item => [...item.claimIds, ...structuresByRule.get(item.ruleId)!.claimIds])
        );
      const activeRuleClaimIds = ruleClaims(activeRuleIds);
      const hardRuleClaimIds = ruleClaims(hardRuleIds);
      const relevantClaimIds = new Set(
        source.claims
          .filter(
            claim =>
              claimScopeMatches(claim) &&
              (!inactiveGapClaims.has(claim.id) ||
                context.claimIds.includes(claim.id) ||
                activeRuleClaimIds.has(claim.id)) &&
              (colorClaimIds.has(claim.id) ||
                context.claimIds.includes(claim.id) ||
                activeRuleClaimIds.has(claim.id) ||
                claim.contextIds.includes(application.contextId) ||
                claim.ruleIds.some(ruleId => activeRuleIds.has(ruleId)))
          )
          .map(claim => claim.id)
      );
      for (const conflict of scopedConflicts) {
        if (
          conflict.resolutionClaimId &&
          claimScopeMatches(claims.get(conflict.resolutionClaimId)!)
        )
          relevantClaimIds.add(conflict.resolutionClaimId);
      }
      // A resolution is scoped to its actual consumers. Sharing an evidence/claim ID
      // does not let a corrected paint or rule clear another unresolved consumer.
      type Dependency = { colorId?: string; ruleId?: string };
      const usableResolutions = scopedConflicts.filter(resolutionUsable);
      const covers = (conflict: (typeof source.conflicts)[number], dependency: Dependency) =>
        (!conflict.colorIds?.length ||
          (dependency.colorId !== undefined && conflict.colorIds.includes(dependency.colorId))) &&
        (!conflict.ruleIds.length ||
          (dependency.ruleId !== undefined && conflict.ruleIds.includes(dependency.ruleId)));
      const ruleDependencies = new Map<string, readonly Dependency[]>();
      for (const ruleId of usableResolutions.length ? activeRuleIds : []) {
        const members = structuresByRule.get(ruleId)!.selectors;
        const colorIds = [
          ...new Set(application.uses.filter(use => matches(members, use)).map(use => use.colorId)),
        ];
        ruleDependencies.set(
          ruleId,
          colorIds.length ? colorIds.map(colorId => ({ ruleId, colorId })) : [{ ruleId }]
        );
      }
      const claimDependencies = new Map<string, readonly Dependency[]>();
      for (const claimId of usableResolutions.length ? relevantClaimIds : []) {
        const claim = claims.get(claimId)!;
        const dependencies: Dependency[] = usedColors
          .filter(color => color.claimIds.includes(claimId))
          .map(color => ({ colorId: color.id }));
        for (const rule of assessments.filter(item => activeRuleIds.has(item.ruleId))) {
          if (
            claim.ruleIds.includes(rule.ruleId) ||
            rule.claimIds.includes(claimId) ||
            structuresByRule.get(rule.ruleId)!.claimIds.includes(claimId)
          )
            dependencies.push(...ruleDependencies.get(rule.ruleId)!);
        }
        if (
          context.claimIds.includes(claimId) ||
          (claim.ruleIds.length === 0 && claim.contextIds.includes(application.contextId))
        )
          dependencies.push({});
        claimDependencies.set(claimId, dependencies.length ? dependencies : [{}]);
      }
      const resolvedClaimIds = new Set(
        [...relevantClaimIds].filter(
          claimId =>
            usableResolutions.length > 0 &&
            claimDependencies
              .get(claimId)!
              .every(dependency =>
                usableResolutions.some(
                  conflict => conflict.claimIds.includes(claimId) && covers(conflict, dependency)
                )
              )
        )
      );
      const unresolvedClaims = source.claims.filter(
        claim =>
          relevantClaimIds.has(claim.id) &&
          !resolvedClaimIds.has(claim.id) &&
          ['contradicted', 'unsupported', 'unresolved'].includes(claim.status)
      );
      const blockingClaims = unresolvedClaims.filter(
        claim =>
          colorClaimIds.has(claim.id) ||
          hardRuleClaimIds.has(claim.id) ||
          claim.ruleIds.some(ruleId => hardRuleIds.has(ruleId)) ||
          (claim.ruleIds.length === 0 &&
            (context.claimIds.includes(claim.id) ||
              claim.contextIds.includes(application.contextId)))
      );
      const blockingConflicts = conflicts.filter(
        conflict =>
          conflict.ruleIds.length === 0 || conflict.ruleIds.some(ruleId => hardRuleIds.has(ruleId))
      );
      const activeClaimEvidence = new Set(
        source.claims
          .filter(claim => relevantClaimIds.has(claim.id))
          .flatMap(claim => claim.evidenceRefs)
      );
      const inactiveGapEvidence = new Set(
        source.claims
          .filter(claim => inactiveGapClaims.has(claim.id))
          .flatMap(claim => claim.evidenceRefs)
      );
      const paintEvidence = usedColors.flatMap(color =>
        color.evidenceRefs.filter(
          ref => !inactiveGapEvidence.has(ref) || activeClaimEvidence.has(ref)
        )
      );
      const contextualEvidence = [
        ...context.evidenceRefs,
        ...source.claims
          .filter(
            claim =>
              relevantClaimIds.has(claim.id) &&
              claim.ruleIds.length === 0 &&
              claim.contextIds.includes(application.contextId)
          )
          .flatMap(claim => claim.evidenceRefs),
      ];
      const structuralEvidence = (ruleIds: ReadonlySet<string>) =>
        assessments
          .filter(item => ruleIds.has(item.ruleId))
          .flatMap(item => [
            ...item.evidenceRefs,
            ...structuresByRule.get(item.ruleId)!.evidenceRefs,
          ]);
      const relevantEvidence = new Set([
        ...paintEvidence,
        ...contextualEvidence,
        ...activeClaimEvidence,
        ...structuralEvidence(activeRuleIds),
      ]);
      const hardClaimEvidence = source.claims
        .filter(
          claim =>
            relevantClaimIds.has(claim.id) &&
            (colorClaimIds.has(claim.id) ||
              hardRuleClaimIds.has(claim.id) ||
              claim.ruleIds.some(ref => hardRuleIds.has(ref)))
        )
        .flatMap(claim => claim.evidenceRefs);
      const hardEvidence = new Set([
        ...paintEvidence,
        ...contextualEvidence,
        ...hardClaimEvidence,
        ...structuralEvidence(hardRuleIds),
      ]);
      const resolvedEvidence = new Set(
        [...relevantEvidence].filter(ref => {
          if (!usableResolutions.length) return false;
          const dependencies: Dependency[] = usedColors
            .filter(color => color.evidenceRefs.includes(ref))
            .map(color => ({ colorId: color.id }));
          if (context.evidenceRefs.includes(ref)) dependencies.push({});
          for (const claimId of relevantClaimIds)
            if (claims.get(claimId)!.evidenceRefs.includes(ref))
              dependencies.push(...claimDependencies.get(claimId)!);
          for (const rule of assessments.filter(item => activeRuleIds.has(item.ruleId)))
            if (
              rule.evidenceRefs.includes(ref) ||
              structuresByRule.get(rule.ruleId)!.evidenceRefs.includes(ref)
            )
              dependencies.push(...ruleDependencies.get(rule.ruleId)!);
          return (
            dependencies.length > 0 &&
            dependencies.every(dependency =>
              usableResolutions.some(
                conflict => conflict.evidenceRefs.includes(ref) && covers(conflict, dependency)
              )
            )
          );
        })
      );
      const evidenceIssues = source.evidence.filter(
        item =>
          relevantEvidence.has(item.id) &&
          !resolvedEvidence.has(item.id) &&
          ['contradicted', 'unsupported', 'unresolved'].includes(item.status)
      );
      const blockingEvidence = evidenceIssues.filter(item => hardEvidence.has(item.id));
      const pairs: ColorSystemContextAssessmentV1['pairs'] = application.pairs
        .filter(pair => pair.contrast !== undefined)
        .map(pair => {
          const contrast = pair.contrast!;
          const foreground = values.get(pair.foregroundUseId);
          const background = values.get(pair.backgroundUseId);
          const underlay = pair.underlayUseId ? values.get(pair.underlayUseId) : undefined;
          const ratio = measureColorSystemContextPairV1(foreground, background, underlay);
          return {
            pairId: pair.id,
            ratio,
            threshold: contrast.minimum,
            assessment: contrast.assessment,
            status:
              contrast.assessment === 'inactive-exempt'
                ? 'inactive-exempt'
                : ratio === null
                  ? 'unresolved'
                  : ratio >= contrast.minimum
                    ? 'pass'
                    : 'fail',
          };
        });
      const brandConstraints = source.brandConstraintsByContext.filter(binding =>
        binding.contextIds.includes(application.contextId)
      );
      const pendingBrandRules = brandConstraints.flatMap(binding =>
        binding.fragment.rules
          .filter(rule => !binding.fragment.decisions.some(decision => decision.ruleId === rule.id))
          .map(rule => ({
            id: `${binding.id}:${rule.id}`,
            reason: 'This scoped generation constraint needs an explicit adoption decision.',
          }))
      );
      const blockers = [
        ...usedColors
          .filter(color => !color.valuesByMode[application.modeId])
          .map(color => ({
            id: `value:${color.id}:${application.modeId}`,
            reason: `Exact ${color.label} values are unavailable in the requested mode. Resolving a claim cannot supply a missing paint value.`,
          })),
        ...assessments
          .filter(
            item => item.enforcement === 'blocking' && ['fail', 'unresolved'].includes(item.status)
          )
          .map(item => ({ id: item.ruleId, reason: item.reason })),
        ...blockingConflicts.map(conflict => ({ id: conflict.id, reason: conflict.message })),
        ...blockingClaims.map(claim => ({ id: claim.id, reason: claim.text })),
        ...blockingEvidence.map(item => ({ id: item.id, reason: item.description })),
        ...pairs
          .filter(
            pair => pair.assessment === 'required' && ['fail', 'unresolved'].includes(pair.status)
          )
          .map(pair => ({
            id: pair.pairId,
            reason:
              pair.status === 'unresolved'
                ? 'Exact numeric values or the actual compositing ground are unresolved.'
                : 'Actual rendered contrast misses the required threshold.',
          })),
        ...pendingBrandRules,
      ];
      const usedSourceIds = new Set([...used].map(colorId => colors.get(colorId)!.sourceId));
      const provisional =
        usedColors.some(
          color =>
            color.evidenceRefs.length === 0 &&
            !color.claimIds.some(id => claims.get(id)!.evidenceRefs.length > 0)
        ) ||
        source.evidence.some(item => relevantEvidence.has(item.id) && item.status === 'inferred') ||
        source.rules.some(
          rule =>
            activeRuleIds.has(rule.id) &&
            ['inferred', 'proposal', 'teul-default'].includes(rule.origin)
        ) ||
        source.coverage.some(
          coverage => usedSourceIds.has(coverage.sourceId) && coverage.status !== 'complete'
        ) ||
        source.claims.some(
          claim => relevantClaimIds.has(claim.id) && claim.status === 'inferred'
        ) ||
        assessments.some(
          item => item.adoption === 'accepted' && adoptions.get(item.ruleId)?.actor.kind === 'agent'
        );
      const content = {
        version: COLOR_SYSTEM_RELATIONSHIPS_V1_VERSION,
        modelHash: source.modelHash,
        applicationHash: deterministicContentHash(canonicalJson(application)),
        application,
        eligible: blockers.length === 0,
        sourceConfidence: (activeGapClaims.size ||
        conflicts.length ||
        unresolvedClaims.length ||
        evidenceIssues.length
          ? 'unresolved'
          : provisional
            ? 'provisional'
            : 'observed') as ColorSystemContextAssessmentV1['sourceConfidence'],
        rules: assessments,
        pairs,
        blockers,
        unresolvedClaimIds: unresolvedClaims.map(claim => claim.id),
        unresolvedEvidenceRefs: evidenceIssues.map(item => item.id),
        conflictIds: conflicts.map(conflict => conflict.id),
        brandConstraintFragmentHashes: brandConstraints.map(
          binding => binding.fragment.fragmentHash
        ),
      };
      return { ...content, assessmentHash: deterministicContentHash(canonicalJson(content)) };
    },
  };
}
