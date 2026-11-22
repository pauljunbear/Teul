/** Current-file inventory to the same inert model accepted by JSON guideline intake. */
import {
  assertColorSystemGenericSourceSnapshotV2Integrity,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorValueV2,
  type GenericVariableModeValueV2,
} from './colorSystemGenericSourceAdapterV2';
import {
  buildColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  type ColorSystemClaimV1,
  type ColorSystemEvidenceV1,
  type ColorSystemModelV1,
  type ColorSystemNamedModeV1,
  type ColorSystemSourceColorV1,
} from './colorSystemModelV1';
import { deterministicContentHash } from './colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';

export interface ColorSystemModelSourceAdapterOptionsV1 {
  readonly sourceId: string;
  readonly label: string;
  readonly locator: string | null;
  readonly freshnessMode: 'current-file' | 'imported-snapshot';
  /** Explicit working binding for static declarations; not an authored source mode. */
  readonly staticMode?: ColorSystemNamedModeV1;
}

function stableId(kind: string, sourceId: string, nativeIdentity: readonly string[]): string {
  return `${kind}:${deterministicContentHash([sourceId, nativeIdentity]).slice(7, 31)}`;
}

/** Native collection and mode identity is retained; matching names do not merge modes. */
export function colorSystemInventoryModeIdV1(
  sourceId: string,
  collectionId: string,
  modeId: string
): string {
  return stableId('mode', sourceId, ['collection', collectionId, 'mode', modeId]);
}

export function buildColorSystemModelFromGenericSourceV1(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  options: ColorSystemModelSourceAdapterOptionsV1
): ColorSystemModelV1 {
  assertColorSystemGenericSourceSnapshotV2Integrity(snapshot);
  const sourceId = options.sourceId;
  const variableIds = new Map(snapshot.variables.map(variable => [variable.variableId, variable]));
  const modes: ColorSystemNamedModeV1[] = snapshot.collections.flatMap(collection =>
    collection.modes.map(mode => ({
      id: colorSystemInventoryModeIdV1(sourceId, collection.collectionId, mode.modeId),
      label: `${collection.name} / ${mode.name}`,
    }))
  );
  const hasStatic =
    snapshot.paletteStructures.some(structure => structure.entries.length > 0) ||
    snapshot.paintStyles.some(
      style =>
        style.governingEligibility !== 'eligible' ||
        style.directDeclaration?.kind !== 'alias' ||
        !variableIds.has(style.directDeclaration.targetVariableId)
    );
  const staticMode = options.staticMode ?? {
    id: 'static-light',
    label: 'Light (working binding for static source)',
  };
  if (hasStatic || modes.length === 0) {
    if (!modes.some(mode => mode.id === staticMode.id)) modes.push(staticMode);
  }
  const evidence: ColorSystemEvidenceV1[] = snapshot.evidence.map(ref => ({
    id: stableId('evidence', sourceId, ['captured', ref.evidenceId]),
    sourceId,
    locator: ref.locator || null,
    status: 'observed',
    description: ref.detail || `Recorded ${ref.kind}: ${ref.evidenceId}`,
  }));
  const evidenceIds = new Map(
    snapshot.evidence.map((ref, index) => [ref.evidenceId, evidence[index].id])
  );
  const claims: ColorSystemClaimV1[] = [];
  const colors: ColorSystemSourceColorV1[] = [];
  const evidenceFor = (
    nativeRefs: readonly string[],
    nativeIdentity: readonly string[],
    description: string
  ) => {
    const refs = nativeRefs
      .map(ref => evidenceIds.get(ref))
      .filter((ref): ref is string => ref !== undefined);
    const id = stableId('evidence', sourceId, ['adapter', ...nativeIdentity]);
    evidence.push({
      id,
      sourceId,
      locator: JSON.stringify(nativeIdentity),
      status: 'observed',
      description,
    });
    return [...new Set([...refs, id])];
  };
  function claim(
    nativeIdentity: readonly string[],
    text: string,
    evidenceRefs: readonly string[],
    status: ColorSystemClaimV1['status'] = 'observed',
    modeIds: readonly string[] = []
  ): string {
    const id = stableId('claim', sourceId, nativeIdentity);
    claims.push({
      id,
      sourceId,
      text,
      status,
      evidenceRefs,
      contextIds: [],
      ruleIds: [],
      ...(modeIds.length ? { modeIds } : {}),
    });
    return id;
  }
  const staticEvidence = hasStatic
    ? evidenceFor(
        [],
        ['static-binding'],
        `Static source declarations are bound once to ${staticMode.label} for review. This is working policy, not an authored source mode.`
      )
    : [];
  const staticClaim = hasStatic
    ? claim(
        ['static-binding'],
        `Static values have one explicit application binding (${staticMode.id}); no alternative source mode was inferred.`,
        staticEvidence,
        'inferred',
        [staticMode.id]
      )
    : null;
  const profileSupported = snapshot.documentProfile === 'srgb';

  function addColor(
    nativeIdentity: readonly string[],
    label: string,
    observations: readonly {
      modeId: string;
      value?: GenericColorValueV2;
      unsupported?: string;
    }[],
    nativeRefs: readonly string[],
    isStatic = false
  ): string {
    const id = stableId('color', sourceId, nativeIdentity);
    const refs = evidenceFor(
      nativeRefs,
      ['declaration', ...nativeIdentity],
      `Native source declaration: ${label}.`
    );
    const claimIds = [
      claim(
        ['identity', ...nativeIdentity],
        `Recorded source color ${label} (${JSON.stringify(nativeIdentity)}).`,
        refs
      ),
    ];
    const valuesByMode: Record<string, ColorSystemColorValueV2> = {};
    const valueGapClaimIdsByMode: Record<string, string[]> = {};
    if (isStatic && staticClaim) claimIds.push(staticClaim);
    for (const observation of observations) {
      const value = observation.value;
      if (!observation.unsupported && value?.colorSpace === 'srgb' && profileSupported) {
        valuesByMode[observation.modeId] = buildColorSystemSrgbValueV1(
          {
            r: value.components[0],
            g: value.components[1],
            b: value.components[2],
          },
          value.alpha
        );
      } else {
        const gap = claim(
          ['value-gap', ...nativeIdentity, observation.modeId],
          observation.unsupported ??
            `Exact sRGB interpretation is unavailable. Source profile: ${snapshot.documentProfile}; recorded value: ${JSON.stringify(value ?? null)}.`,
          refs,
          'unsupported',
          [observation.modeId]
        );
        claimIds.push(gap);
        valueGapClaimIdsByMode[observation.modeId] = [gap];
      }
    }
    colors.push({
      id,
      label,
      sourceId,
      valuesByMode,
      ...(Object.keys(valueGapClaimIdsByMode).length ? { valueGapClaimIdsByMode } : {}),
      evidenceRefs: refs,
      claimIds,
    });
    return id;
  }
  const variableObservations = (
    collectionId: string,
    values: readonly GenericVariableModeValueV2[]
  ) =>
    values.map(mode => ({
      modeId: colorSystemInventoryModeIdV1(sourceId, collectionId, mode.modeId),
      ...(mode.resolution === 'literal' && mode.rawValue.kind === 'color'
        ? { value: mode.rawValue.value }
        : mode.resolution === 'resolved-alias' && mode.resolvedValue
          ? { value: mode.resolvedValue }
          : {
              unsupported: `Recorded mode ${mode.modeName} has ${mode.resolution}; no value was invented or copied.`,
            }),
    }));
  for (const variable of snapshot.variables) {
    addColor(
      ['variable', variable.variableId],
      variable.name,
      variableObservations(variable.collectionId, variable.valuesByMode),
      variable.evidenceIds
    );
  }
  for (const style of snapshot.paintStyles) {
    const declaration = style.directDeclaration;
    if (style.governingEligibility === 'eligible' && declaration?.kind === 'alias') {
      const target = variableIds.get(declaration.targetVariableId);
      if (target) {
        addColor(
          ['style', style.styleId],
          style.name,
          variableObservations(target.collectionId, target.valuesByMode),
          style.evidenceIds
        );
        continue;
      }
    }
    // Ineligible or missing aliases retain their exact source identity as an explicit gap.
    if (!modes.some(mode => mode.id === staticMode.id)) modes.push(staticMode);
    addColor(
      ['style', style.styleId],
      style.name,
      [
        {
          modeId: staticMode.id,
          ...(style.governingEligibility === 'eligible' && declaration?.kind === 'literal'
            ? { value: declaration.value }
            : {
                unsupported: `Paint style is ${style.governingEligibility}; supported resolved solid paint is unavailable. Source paint declarations remain bound by the source snapshot.`,
              }),
        },
      ],
      style.evidenceIds,
      true
    );
  }
  const families = snapshot.paletteStructures
    .filter(structure => structure.entries.length > 0)
    .map(structure => {
      const refs = evidenceFor(
        structure.evidenceIds,
        ['node', structure.sourceNodeId, 'palette', structure.structureId],
        `Explicit source palette heading: ${structure.title}.`
      );
      return {
        id: stableId('family', sourceId, ['palette', structure.structureId]),
        label: structure.title,
        colorIds: structure.entries.map(entry =>
          addColor(
            ['palette', structure.structureId, 'entry', entry.entryId],
            entry.name,
            [{ modeId: staticMode.id, value: entry.value }],
            entry.evidenceIds,
            true
          )
        ),
        evidenceRefs: refs,
        claimIds: [
          claim(
            ['palette-membership', structure.structureId],
            'Membership follows an explicit source palette heading. It does not establish a scale, role, global primary, or permitted use.',
            refs
          ),
        ],
      };
    });
  for (const gap of snapshot.unsupported) {
    const refs = evidenceFor(gap.evidenceIds, ['inventory-gap', gap.gapId], gap.summary);
    claim(['inventory-gap', gap.gapId], gap.summary, refs, gap.status);
  }
  const inventoryRefs = evidenceFor(
    [],
    ['inventory'],
    `Source scope ${snapshot.scope.kind} (${snapshot.scope.coverage}); ${snapshot.scannedNodeCount} scanned nodes. Captured with ${snapshot.adapterVersion}. Named contexts, roles and authored scales require reviewed evidence.`
  );
  const inventoryClaim = claim(
    ['inventory', 'scope'],
    'This model retains source colors and explicit palette membership. It does not infer application roles, scale ordering, or relationships from names or hue.',
    inventoryRefs,
    'inferred'
  );
  const gaps = claims.filter(item =>
    ['unsupported', 'contradicted', 'unresolved'].includes(item.status)
  );
  return buildColorSystemModelV1({
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: [
      {
        id: sourceId,
        label: options.label,
        sourceHash: snapshot.sourceSnapshotHash,
        ...(options.freshnessMode === 'current-file'
          ? { currentFileContentHash: snapshot.currentFileContentHash }
          : {}),
        version: null,
        locator: options.locator,
        freshnessMode: options.freshnessMode,
        status: 'unknown',
      },
    ],
    evidence,
    claims,
    coverage: [
      {
        sourceId,
        status:
          snapshot.partial ||
          snapshot.cancelled ||
          snapshot.scope.coverage !== 'complete-supported-scope' ||
          gaps.length
            ? 'partial'
            : 'complete',
        evidenceRefs: inventoryRefs,
        unresolvedClaimIds: gaps.map(item => item.id),
        note: 'Coverage applies to the captured inventory scope. Unsupported declarations remain explicit; imported snapshots do not establish current external freshness.',
      },
    ],
    modes,
    colors,
    families,
    scales: [],
    contexts: [
      {
        id: 'context:inventory',
        label: 'Source colors awaiting application context',
        modeIds: modes.map(mode => mode.id),
        evidenceRefs: inventoryRefs,
        claimIds: [inventoryClaim],
      },
    ],
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  });
}
