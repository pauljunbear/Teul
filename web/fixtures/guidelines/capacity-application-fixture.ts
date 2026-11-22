import { quantitativeApplicationFixture } from './quantitative-application-fixture';
import type { GuidelineApplicationRequest } from '../../src/lib/guideline/application';
import { buildGuidelineApplicationLayout } from '../../src/lib/guideline/applicationGeometry';
import { capacityBarsRole, capacityBarsUseIds } from '../../src/lib/guideline/capacityBarsGeometry';

/** Public invented data tests persistence, not palette quality or a brand recommendation. */
export function capacityApplicationFixture() {
  const { project, review, id } = quantitativeApplicationFixture();
  const modeId = review.model.modes[0].id;
  const layout: GuidelineApplicationRequest['layout'] = {
    kind: 'chart',
    modeId,
    sourceContextId: 'brand',
    meaning: 'categorical',
    count: 5,
    direction: null,
    capacity: {
      numericVersion: 2,
      sourceRoles: Object.fromEntries(capacityBarsUseIds.map(id => [id, capacityBarsRole(id)])),
      input: {
        version: 'teul.capacity-bars.v1',
        contextId: 'brand',
        modeId,
        viewport: 'wide',
        heading: 'Weekly capacity',
        unit: 'seats',
        records: ['Research', 'Design', 'Engineering', 'Review', 'Support'].map((label, index) => ({
          id: `record-${index}`,
          label,
          booked: 10 + index * 10,
          capacity: 100,
        })),
      },
    },
  };
  const request: GuidelineApplicationRequest = {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
      applicationId: role.applicationId,
      useId: role.useId,
      colorId: id(
        ['ground', 'surface'].includes(role.useId)
          ? 'paper'
          : ['text', 'inset-text', 'track'].includes(role.useId)
            ? 'ink'
            : 'source-blue'
      ),
    })),
  };
  return { project, review, request, id };
}
