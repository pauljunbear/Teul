import {
  buildGroupedReportGeometry,
  type GroupedReportInput,
} from '../../src/lib/guideline/groupedReportGeometry';
import { quantitativeMatrixModel } from './quantitative-matrix-fixture';
import {
  assessColorSystemApplicationGeometryV1,
  hashColorSystemGeometryApplicationsV1,
} from '../../../src/lib/colorSystemApplicationGeometryV1';
import { compileColorSystemApplicationRequirementsV1 } from '../../../src/lib/colorSystemApplicationRequirementsV1';
import { serializeGuidelineGeometrySvgs } from '../../src/lib/guideline/geometrySvg';

/** Invented development content; no reserved case or human judgment. */
export function groupedReportInput(viewport: 'wide' | 'narrow' = 'wide'): GroupedReportInput {
  return {
    version: 'teul.grouped-report.v1',
    contextId: 'product',
    modeId: 'Day',
    viewport,
    heading: 'Quarterly activity',
    unit: 'requests',
    linkLabel: 'View full report',
    axisMaximum: 100,
    periods: [
      { id: 'period-1', label: 'Q1' },
      { id: 'period-2', label: 'Q2' },
    ],
    categories: ['Collection', 'Review', 'Approval', 'Payment'].map((label, i) => ({
      id: `category-${i + 1}`,
      label,
      values: [20 + i * 10, 30 + i * 10],
    })),
  };
}
export function groupedReportProof(viewport: 'wide' | 'narrow' = 'wide') {
  const input = groupedReportInput(viewport),
    composition = buildGroupedReportGeometry(input),
    model = quantitativeMatrixModel();
  const applications = composition.requirements.templates.map(template => ({
    ...template,
    uses: template.uses.map(use => ({
      ...use,
      colorId: ['ground', 'surface', 'focus-fill'].includes(use.id)
        ? 'paper'
        : use.id.startsWith('category-')
          ? 'source-blue'
          : 'ink',
    })),
  }));
  const plan = {
    version: composition.geometryVersion,
    modelHash: model.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: composition.boards,
    artwork: composition.artwork,
  };
  const geometry = assessColorSystemApplicationGeometryV1(model, applications, plan);
  const assessment = compileColorSystemApplicationRequirementsV1(
    model,
    composition.requirements
  ).evaluate(geometry.measuredApplications);
  if (!assessment.eligible) throw new Error('Synthetic report failed its requirements.');
  const svg = serializeGuidelineGeometrySvgs(
    model,
    geometry,
    'Synthetic grouped report',
    composition.artwork.notes
  )[0].svg;
  return { input, composition, model, applications, plan, geometry, assessment, svg };
}
