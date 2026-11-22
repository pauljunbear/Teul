import { syntheticColorSystemModelInputV1 } from '../../../src/lib/__tests__/fixtures/colorSystemModelV1Fixture';
import { buildColorSystemModelV1 } from '../../../src/lib/colorSystemModelV1';
import { buildColorSystemApplicationRequirementsV1 } from '../../../src/lib/colorSystemApplicationRequirementsV1';
import {
  assessColorSystemApplicationGeometryV1,
  hashColorSystemGeometryApplicationsV1,
  measureColorSystemApplicationGeometryBoardsV1,
} from '../../../src/lib/colorSystemApplicationGeometryV1';
import { compileGradientV2 } from '../../../src/lib/colorSystemGradientCompilerV2';
import {
  parseGradientDesignV2,
  type GradientDesignV2,
} from '../../../src/lib/colorSystemGradientDesignV2';
import { assessGradientDesignFidelityV2 } from '../../../src/lib/colorSystemGradientFidelityV2';
import {
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../../../src/lib/colorSystemAuthoringExecutionV1';
import { buildColorSystemDesignContentV1 } from '../../../src/lib/colorSystemDesignContentV1';
import {
  parseColorSystemRecipeV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
} from '../../../src/lib/colorSystemRecipeV1';
import { buildCompositionPanelGeometry } from '../../src/lib/guideline/compositionPanelGeometry';
import { serializeGuidelineGeometrySvgs } from '../../src/lib/guideline/geometrySvg';
import { guidelineHash } from '../../src/lib/guideline/review';

/** Invented development data; this does not import, render or evaluate a held-out brand case. */
export async function mixedPaintCompositionFixture(
  modeId: 'Day' | 'Night' = 'Day',
  retainedPaint?: GradientDesignV2
) {
  const raw = syntheticColorSystemModelInputV1();
  const source = buildColorSystemModelV1({
    ...raw,
    rules: [],
    adoptions: [],
    claims: raw.claims.map(claim => ({ ...claim, ruleIds: [] })),
    contexts: [
      ...raw.contexts,
      ...['brand', 'gradient:brand'].map(id => ({ ...raw.contexts[0], id, label: id })),
    ],
    evidence: [
      ...raw.evidence,
      {
        ...raw.evidence[0],
        id: 'evidence:sample',
        description:
          'Accepted rendered sRGB approximation: synthetic gradient-only disclosure test.',
      },
    ],
    colors: raw.colors.map(color =>
      color.id === 'blue-deep'
        ? { ...color, evidenceRefs: [...color.evidenceRefs, 'evidence:sample'] }
        : color
    ),
  });
  const panel = buildCompositionPanelGeometry({
    id: 'composition',
    contextId: 'brand',
    modeId,
    width: 400,
    height: 360,
    heading: 'A clearer direction',
    body: 'Keep the source colours visible. Compare the text and gradient in one complete composition.',
    sourceRoles: { ground: 'canvas', heading: 'heading', body: 'body' },
  });
  const paint = retainedPaint
    ? parseGradientDesignV2(retainedPaint)
    : compileGradientV2({
        sourceModelHash: source.modelHash,
        briefHash: guidelineHash(panel.input),
        angleDegrees: 137,
        route: { space: 'oklab' },
        stops: ['blue-deep', 'warm'].map((sourceColorId, position) => ({
          position,
          locked: true,
          sourceColorId,
          value: source.colors.find(color => color.id === sourceColorId)!.valuesByMode[modeId],
        })),
      });
  const fidelity = assessGradientDesignFidelityV2(paint);
  if (fidelity.status !== 'pass')
    throw new Error(`Development gradient fidelity: ${fidelity.reason}`);
  const board = panel.boards[0];
  const boards = measureColorSystemApplicationGeometryBoardsV1([
    {
      ...board,
      width: 800,
      root: {
        ...board.root,
        shape: { kind: 'rect', x: 0, y: 0, width: 800, height: 360 },
        children: [
          ...board.root.children,
          {
            id: 'composition:gradient',
            useId: 'decoration',
            textAlternative: 'Decorative source-colour gradient',
            shape: { kind: 'rect', x: 400, y: 0, width: 400, height: 360 },
            children: [],
          },
        ],
      },
    },
  ]);
  const area = (useId: string) => boards.areas.find(item => item.useId === useId)!.area;
  const requirements = buildColorSystemApplicationRequirementsV1({
    ...panel.requirements,
    templates: panel.requirements.templates.map(template => ({
      ...template,
      uses: template.uses.map(use => ({ ...use, area: area(use.id) })),
      gradients: [
        {
          id: 'decoration',
          role: 'decoration',
          sourceRole: 'illustration',
          paint,
          area: area('decoration'),
        },
      ],
    })),
  });
  const direction: ColorSystemAuthoringDirectionV1 = {
    version: 'teul.authoring-direction.v1',
    id: 'mixed-development',
    generation: {
      kind: 'apply',
      proposal: {
        version: 'teul.color-system-proposal.v1',
        id: 'mixed-source-apply',
        sourceModelHash: source.modelHash,
        brief: {
          briefHash: guidelineHash(panel.input),
          operation: 'apply',
          contextIds: ['brand'],
          modeIds: [modeId],
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
          algorithmId: 'synthetic:mixed-source-apply',
          algorithmVersion: '1',
          policyHash: guidelineHash(
            'Apply exact synthetic source paints; retain constructed gradient separately.'
          ),
          inputHash: guidelineHash(requirements),
          sourceColorIds: ['paper', 'ink', 'blue-deep', 'warm'],
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
      version: 'teul.model-composition.v1',
      modelHash: source.modelHash,
      requirementsHash: guidelineHash(requirements),
      maximumNodes: 64,
      maximumSolutions: 1,
      groups: [
        {
          id: 'composition',
          options: [
            {
              id: 'assigned',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : 'ink',
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [],
  };
  const execution = await executeColorSystemAuthoringDirectionV1(source, direction);
  if (execution.status !== 'ready') throw new Error(`Mixed fixture is ${execution.status}.`);
  const candidate = execution.candidates[0];
  const applications = candidate.applications.applications.map(item => item.application);
  const content = buildColorSystemDesignContentV1(source, applications);
  const recipe = parseColorSystemRecipeV1({
    schemaVersion: 'teul.color-system-recipe.v4',
    id: 'mixed-development',
    label: 'Synthetic mixed composition',
    source: { model: source, intake: 'guideline-json' },
    direction,
    selection: {
      model: source,
      applications,
      contentHash: content.contentHash,
      executionReceiptHash: execution.receipt.receiptHash,
    },
    locks: [],
  });
  const recipeJson = serializeColorSystemRecipeV1(recipe);
  const replay = await replayColorSystemRecipeV1(JSON.parse(recipeJson));
  if (replay.status !== 'matched') throw new Error(`Mixed recipe replay is ${replay.status}.`);
  const geometry = assessColorSystemApplicationGeometryV1(source, applications, {
    version: 'teul.application-geometry.v1',
    modelHash: source.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: boards.boards,
    artwork: panel.artwork,
  });
  const svg = serializeGuidelineGeometrySvgs(
    source,
    geometry,
    'Synthetic composition',
    panel.artwork.notes
  )[0].svg;
  return { modeId, source, panel, paint, fidelity, execution, recipeJson, replay, geometry, svg };
}
