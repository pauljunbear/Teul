import { quantitativeApplicationFixture } from './quantitative-application-fixture';
import { groupedReportInput } from './grouped-report-fixture';
import type { GuidelineApplicationRequest } from '../../src/lib/guideline/application';
import { buildGuidelineApplicationLayout } from '../../src/lib/guideline/applicationGeometry';
import {
  groupedReportRole,
  groupedReportUseIds,
} from '../../src/lib/guideline/groupedReportGeometry';

/** Invented development content and paints; this is not a palette recommendation. */
export function groupedReportApplicationFixture() {
  const { project, review, id } = quantitativeApplicationFixture();
  const modeId = review.model.modes[0].id;
  const layout: GuidelineApplicationRequest['layout'] = {
    kind: 'chart',
    modeId,
    sourceContextId: 'brand',
    meaning: 'categorical',
    count: 4,
    direction: null,
    report: {
      numericVersion: 2,
      sourceRoles: Object.fromEntries(groupedReportUseIds.map(id => [id, groupedReportRole(id)])),
      input: { ...groupedReportInput(), contextId: 'brand', modeId },
    },
  };
  const request: GuidelineApplicationRequest = {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
      applicationId: role.applicationId,
      useId: role.useId,
      colorId: id(
        ['ground', 'surface', 'focus-fill'].includes(role.useId)
          ? 'paper'
          : role.useId.startsWith('category-')
            ? 'source-blue'
            : 'ink'
      ),
    })),
  };
  return { project, review, request, id };
}
