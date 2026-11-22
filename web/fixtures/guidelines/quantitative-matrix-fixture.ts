import {
  buildQuantitativeMatrixGeometry,
  type QuantitativeMatrixInput,
} from '../../src/lib/guideline/quantitativeMatrixGeometry';
import { syntheticColorSystemModelInputV1 } from '../../../src/lib/__tests__/fixtures/colorSystemModelV1Fixture';
import { buildColorSystemModelV1 } from '../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import {
  assessColorSystemApplicationGeometryV1,
  hashColorSystemGeometryApplicationsV1,
} from '../../../src/lib/colorSystemApplicationGeometryV1';
import { compileColorSystemApplicationRequirementsV1 } from '../../../src/lib/colorSystemApplicationRequirementsV1';
import { serializeGuidelineGeometrySvgs } from '../../src/lib/guideline/geometrySvg';

export function quantitativeMatrixProof(viewport: 'wide' | 'narrow') {
  const input = quantitativeMatrixInput(viewport);
  const model = quantitativeMatrixModel();
  const composition = buildQuantitativeMatrixGeometry(input);
  const applications = composition.requirements.templates.map(template => ({
    ...template,
    uses: template.uses.map(use => ({
      ...use,
      colorId:
        use.id === 'ground'
          ? 'paper'
          : use.id === 'text'
            ? 'ink'
            : use.id.startsWith('bin-')
              ? `step-${Number(use.id.slice(4)) + 5}`
              : use.id.startsWith('original-')
                ? 'source-blue'
                : use.id,
    })),
  }));
  const geometry = assessColorSystemApplicationGeometryV1(model, applications, {
    version: composition.geometryVersion,
    modelHash: model.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: composition.boards,
    artwork: composition.artwork,
  });
  const assessment = compileColorSystemApplicationRequirementsV1(
    model,
    composition.requirements
  ).evaluate(geometry.measuredApplications);
  if (!assessment.eligible) throw new Error('Synthetic matrix fixture failed its requirements.');
  const svg = serializeGuidelineGeometrySvgs(
    model,
    geometry,
    'Synthetic quantitative matrix',
    composition.artwork.notes
  )[0].svg;
  return { input, model, composition, applications, geometry, assessment, svg };
}

export function quantitativeMatrixModel() {
  const original = syntheticColorSystemModelInputV1();
  const rgb = (r: number, g: number, b: number) => buildColorSystemSrgbValueV1({ r, g, b });
  const color = (id: string, value: ReturnType<typeof rgb>) => ({
    id,
    label: id,
    sourceId: original.sources[0].id,
    valuesByMode: { Day: value },
    evidenceRefs: ['evidence:values'],
    claimIds: ['claim:values'],
  });
  return buildColorSystemModelV1({
    ...original,
    claims: original.claims.filter(claim => claim.id === 'claim:values'),
    contexts: [
      {
        id: 'product',
        label: 'Synthetic quantitative display',
        modeIds: ['Day'],
        evidenceRefs: ['evidence:values'],
        claimIds: ['claim:values'],
      },
    ],
    modes: [{ id: 'Day', label: 'Day' }],
    colors: [
      color('paper', rgb(1, 1, 1)),
      color('ink', rgb(0, 0, 0)),
      color('source-blue', rgb(66 / 255, 103 / 255, 165 / 255)),
      ...Array.from({ length: 12 }, (_, index) => {
        const channel = (240 - index * 18) / 255;
        return color(`step-${index + 1}`, rgb(channel * 0.8, channel * 0.9, channel));
      }),
    ],
    families: [],
    scales: [],
    rules: [],
    adoptions: [],
  });
}

/** Invented development content. No reserved source, recommendation or human rating. */
export function quantitativeMatrixInput(
  viewport: 'wide' | 'narrow' = 'wide'
): QuantitativeMatrixInput {
  return {
    version: 'teul.quantitative-matrix.v1',
    contextId: 'product',
    modeId: 'Day',
    viewport,
    heading: 'Daily activity',
    unit: 'requests',
    columns: ['Collection', 'Review', 'Approval', 'Payment', 'Archive'].map((label, index) => ({
      id: `column-${index}`,
      label,
    })),
    rows: ['Morning', 'Afternoon', 'Evening'].map((label, index) => ({
      id: `row-${index}`,
      label,
      values: Array.from({ length: 5 }, (_, i) => (((i + index) % 5) + 1) * 20),
    })),
    barSeries: { kind: 'matrix-row', rowId: 'row-0' },
    domain: [0, 100],
    bins: Array.from({ length: 5 }, (_, i) => ({ minimum: i * 20 + 1, maximum: (i + 1) * 20 })),
    direction: 'light-to-dark',
    evidence: {
      steps: Array.from({ length: 12 }, (_, i) => ({ step: i + 1, colorId: `step-${i + 1}` })),
      originals: [{ colorId: 'source-blue', label: 'Source blue', valueLabel: '#4267A5' }],
    },
  };
}
