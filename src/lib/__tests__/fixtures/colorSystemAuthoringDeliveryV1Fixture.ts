/** Public invented native values. Runs the actual engine; no prepared candidate or delivery output. */
import { syntheticColorSystemModelInputV1 } from './colorSystemModelV1Fixture';
import { buildColorSystemModelV1 } from '../../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../colorSystemSrgbValueV1';
import { canonicalJson, deterministicContentHash } from '../../colorSystemHashing';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../colorSystemApplicationRequirementsV1';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../../colorSystemAuthoringExecutionV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../../colorSystemProposalV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../colorSystemModelCompositionV1';
import { buildColorSystemDesignContentV1 } from '../../colorSystemDesignContentV1';
import { COLOR_SYSTEM_RECIPE_V1_SCHEMA, parseColorSystemRecipeV1 } from '../../colorSystemRecipeV1';
import {
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
  hashColorSystemGeometryApplicationsV1,
  type ColorSystemApplicationGeometryPlanV1,
} from '../../colorSystemApplicationGeometryV1';

export const AUTHORING_DELIVERY_FIXTURE_MODES_V1 = ['Day', 'Night', 'day', 'Contrast'] as const;
export const AUTHORING_DELIVERY_HOSTILE_LABEL_V1 = '</style>/* "\\\n<&\u2028\u2029';

export interface ColorSystemAuthoringDeliveryFixtureOptionsV1 {
  readonly hostileLabels?: boolean;
  readonly applicationCount?: number;
  readonly marksPerApplication?: number;
  readonly markColorId?: 'ink' | 'blue';
  readonly markAlpha?: number;
  readonly reversePair?: boolean;
  readonly declaredAreaDelta?: number;
  readonly omitAreas?: boolean;
  readonly colorCount?: number;
  readonly colorLabel?: string;
}

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));

/** Four case-sensitive authored modes, sparse paint domains, arbitrary families and fractional slots. */
export async function syntheticColorSystemAuthoringDeliveryV1Fixture(
  options: ColorSystemAuthoringDeliveryFixtureOptionsV1 = {}
) {
  const modeIds = [...AUTHORING_DELIVERY_FIXTURE_MODES_V1];
  const input = syntheticColorSystemModelInputV1();
  const native = buildColorSystemSrgbValueV1(
    { r: -0, g: 0.12345678901234566, b: 0.9876543210987654 },
    0.3456789012345679
  );
  let source = buildColorSystemModelV1({
    ...input,
    sources: input.sources.map(source => ({
      ...source,
      label: 'Public invented four-mode authored delivery',
      sourceHash: hash('public authored delivery fixture, four explicit modes, v1'),
    })),
    evidence: input.evidence
      .filter(item => item.id === 'evidence:values')
      .map(item => ({
        ...item,
        description:
          'Exact invented native paints in four authored modes; no historical authority.',
      })),
    coverage: input.coverage.map(item => ({ ...item, evidenceRefs: ['evidence:values'] })),
    claims: input.claims.filter(item => item.id === 'claim:values'),
    modes: modeIds.map(id => ({
      id,
      label: options.hostileLabels ? AUTHORING_DELIVERY_HOSTILE_LABEL_V1 : id,
    })),
    colors: [
      ...input.colors.map(color => ({
        ...color,
        label: options.hostileLabels ? AUTHORING_DELIVERY_HOSTILE_LABEL_V1 : color.label,
        valuesByMode: Object.fromEntries(
          modeIds.map((modeId, index) => {
            const light = index % 2 === 0;
            const value =
              color.id === 'paper' || color.id === 'ink'
                ? buildColorSystemSrgbValueV1(
                    (color.id === 'paper') === light
                      ? { r: 0.9712345678901234, g: 0.9812345678901234, b: 0.9912345678901234 }
                      : {
                          r: 0.0123456789012345,
                          g: 0.0234567890123456,
                          b: 0.0345678901234567,
                        }
                  )
                : color.valuesByMode[light ? 'Day' : 'Night'];
            return [
              modeId,
              options.markAlpha !== undefined && color.id === (options.markColorId ?? 'ink')
                ? buildColorSystemSrgbValueV1(value.components, options.markAlpha)
                : value,
            ];
          })
        ),
      })),
      {
        id: 'unused-native-alpha',
        label: 'Unused exact native alpha and signed zero',
        sourceId: input.sources[0].id,
        valuesByMode: Object.fromEntries(modeIds.map(modeId => [modeId, native])),
        evidenceRefs: ['evidence:values'],
        claimIds: ['claim:values'],
      },
      {
        id: 'sparse-day',
        label: 'Authored only in Day',
        sourceId: input.sources[0].id,
        valuesByMode: {
          Day: buildColorSystemSrgbValueV1({
            r: 0.7123456789012345,
            g: 0.3123456789012345,
            b: 0.11234567890123456,
          }),
        },
        evidenceRefs: ['evidence:values'],
        claimIds: ['claim:values'],
      },
    ],
    scales: input.scales.map(scale => ({
      ...scale,
      slots: scale.slots.map((slot, index) => ({ ...slot, position: [0, 1.25, 4.5, 9.75][index] })),
      modes: modeIds.map((modeId, index) => ({
        modeId,
        anchors: scale.modes[index % 2].anchors,
      })),
    })),
    contexts: input.contexts.map(context => ({
      ...context,
      label: options.hostileLabels ? AUTHORING_DELIVERY_HOSTILE_LABEL_V1 : context.label,
      modeIds,
      evidenceRefs: ['evidence:values'],
      claimIds: ['claim:values'],
    })),
    rules: [],
    adoptions: [],
  });
  if (options.colorCount !== undefined || options.colorLabel !== undefined) {
    const colorCount = options.colorCount ?? source.colors.length;
    if (!Number.isInteger(colorCount) || colorCount < source.colors.length || colorCount > 256)
      throw new Error('Synthetic delivery fixture exceeds its fixed color bound.');
    const { modelHash: _modelHash, ...model } = source;
    source = buildColorSystemModelV1({
      ...model,
      colors: [
        ...model.colors,
        ...Array.from({ length: colorCount - model.colors.length }, (_, index) => ({
          ...model.colors[0],
          id: `extra:${index}`,
        })),
      ].map(color => ({ ...color, label: options.colorLabel ?? color.label })),
    });
  }
  const applicationCount = options.applicationCount ?? 4;
  const markCount = options.marksPerApplication ?? 1;
  if (
    !Number.isInteger(applicationCount) ||
    applicationCount < 4 ||
    applicationCount > 8 ||
    !Number.isInteger(markCount) ||
    markCount < 1 ||
    markCount > 127
  )
    throw new Error('Synthetic delivery fixture exceeds its fixed application bounds.');
  const width = markCount === 1 ? 100 : 1000;
  const markWidth = markCount === 1 ? 40 : 4;
  const markArea = markWidth * 24;
  const markIds = Array.from({ length: markCount }, (_, index) =>
    markCount === 1 ? 'mark' : `mark:${index}`
  );
  const area = (value: number) =>
    options.omitAreas ? {} : { area: value + (options.declaredAreaDelta ?? 0) };
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: Array.from({ length: applicationCount }, (_, index) => ({
      id: `application:${index}`,
      contextId: 'interface',
      modeId: modeIds[index % modeIds.length],
      uses: [
        { id: 'ground', role: 'ground', ...area(width * 80 - markCount * markArea) },
        ...markIds.map(id => ({ id, role: 'mark', ...area(markArea) })),
      ],
      pairs: markIds.map(id => ({
        id: `${id}-on-ground`,
        foregroundUseId: options.reversePair ? 'ground' : id,
        backgroundUseId: options.reversePair ? id : 'ground',
        contrast: { minimum: 3, assessment: 'required' },
      })),
    })),
    distinctions: [],
  });
  const direction: ColorSystemAuthoringDirectionV1 = {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'authored-delivery-direction',
    generation: {
      kind: 'apply',
      proposal: {
        version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
        id: 'authored-delivery-proposal',
        sourceModelHash: source.modelHash,
        brief: {
          briefHash: hash('Public four-mode exact authored delivery'),
          operation: 'apply',
          contextIds: ['interface'],
          modeIds,
          permissions: {
            addColors: false,
            addFamilies: false,
            addScales: false,
            addRules: false,
            editFamilyIds: [],
            editScaleIds: [],
            replaceRuleIds: [],
          },
        },
        derivation: {
          algorithmId: 'source-apply',
          algorithmVersion: '1',
          policyHash: hash('Exact source application policy'),
          inputHash: source.modelHash,
          sourceColorIds: ['paper', options.markColorId ?? 'ink'],
          sourceScaleIds: [],
        },
        colors: [],
        families: [],
        scales: [],
        rules: [],
        exceptions: [],
      },
    },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelHash: source.modelHash,
      requirementsHash: hash(requirements),
      maximumNodes: 64,
      maximumSolutions: 1,
      groups: [
        {
          id: 'exact-application-paints',
          options: [
            {
              id: 'source-native-pairs',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : (options.markColorId ?? 'ink'),
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [],
  };
  const execution = await executeColorSystemAuthoringDirectionV1(source, direction, {
    isCancelled: () => false,
    yield: async () => {},
  });
  const selected = execution.candidates[0];
  if (execution.status !== 'ready' || !selected?.eligible)
    throw new Error(`Actual synthetic delivery execution is ${execution.status}.`);
  const model = selected.proposal.workingModel;
  const applications = selected.applications.applications.map(item => item.application);
  const recipe = parseColorSystemRecipeV1({
    schemaVersion: COLOR_SYSTEM_RECIPE_V1_SCHEMA,
    id: 'synthetic-authored-delivery',
    label: options.hostileLabels
      ? AUTHORING_DELIVERY_HOSTILE_LABEL_V1
      : 'Four authored modes, no Primary role',
    source: { model: source, intake: 'guideline-json' },
    direction,
    selection: {
      model,
      applications,
      contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
      executionReceiptHash: execution.receipt.receiptHash,
    },
    locks: [],
  });
  const geometry: ColorSystemApplicationGeometryPlanV1 = {
    version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
    modelHash: model.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: applications.map(application => ({
      applicationId: application.id,
      width,
      height: 80,
      root: {
        id: `${application.id}:ground`,
        useId: 'ground',
        shape: { kind: 'rect', x: 0, y: 0, width, height: 80 },
        children: markIds.map((useId, index) => ({
          id: `${application.id}:${useId}`,
          useId,
          textAlternative: `Authored ${useId} in ${application.modeId}`,
          shape: {
            kind: 'rect',
            x: markCount === 1 ? 20 : 8 + index * 6,
            y: 28,
            width: markWidth,
            height: 24,
          },
          children: [],
        })),
      },
    })),
  };
  return { source, direction, execution, recipe, applications, geometry };
}
