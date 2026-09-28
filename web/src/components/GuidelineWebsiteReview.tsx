import type { GuidelineAuthoredGradientSelection } from '../lib/guideline/authoredGradient';
import { replayGuidelineRefresh } from '../lib/guideline/refreshReplay';
import type { GuidelineRefreshLineage } from '../lib/guideline/refreshLineage';
import { proposeWebsiteRefresh } from '../lib/guideline/nativeRefreshSources';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import type { GuidelineLocalEditor } from '../lib/guideline/useLocalProject';
import { useCallback, useMemo } from 'react';
import type { WebsiteCapturePacket } from '../../../services/guideline-intake/src/websiteProtocol';
import { createWebsiteInventory, type WebsiteInventory } from '../lib/guideline/websiteInventory';
import { websiteSourceStatements } from '../lib/guideline/websiteModel';
import {
  compileWebsiteReview,
  suggestWebsiteReview,
  WEBSITE_DRAFT_VERSION,
  WEBSITE_REVIEW_VERSION,
} from '../lib/guideline/websiteReview';
import { buildWebsiteProject, type WebsiteProject } from '../lib/guideline/websiteProject';
import { GuidelineSourceReview, type SourceReviewPreparation } from './GuidelineSourceReview';

const actor = { kind: 'user' as const, ref: 'studio:website-source-review' };
function prepared(
  inventory: WebsiteInventory,
  project: WebsiteProject | null,
  onRefresh: (
    project: WebsiteProject,
    inventory: WebsiteInventory,
    lineage: GuidelineRefreshLineage
  ) => void
): SourceReviewPreparation<typeof WEBSITE_DRAFT_VERSION, typeof WEBSITE_REVIEW_VERSION> {
  return {
    sourceName: 'Website',
    actor,
    initialDraft: project?.draft ?? suggestWebsiteReview(inventory),
    initialProject: project,
    inventory: {
      profilePolicy: 'css-defined',
      packet: inventory.packet,
      unsupported: inventory.unsupported,
      statements: websiteSourceStatements(inventory),
      declarations: inventory.declarations.map(item => ({
        ...item,
        kindLabel:
          item.kind === 'custom-property'
            ? 'Observed custom property'
            : 'Observed element property',
        observations: [
          {
            modeId: inventory.modes[0].id,
            value: item.value ? { ...item.value.components, alpha: item.value.alpha } : null,
            gap: item.gap,
          },
        ],
      })),
      modes: inventory.modes.map(mode => ({
        ...mode,
        detail:
          'One captured viewport and browser preference. This does not establish authored light and dark modes.',
      })),
    },
    applyReview: draft => compileWebsiteReview(inventory, draft, actor),
    saveProject: input => buildWebsiteProject({ capture: inventory.packet, ...input }),
    replayRefresh: async (lineage, input, signal) =>
      replayGuidelineRefresh(
        lineage,
        {
          kind: 'website',
          inventory,
          project: await buildWebsiteProject({ capture: inventory.packet, ...input }),
        },
        signal
      ),
    prepareRefresh: async (raw, draft) => {
      const next = await createWebsiteInventory(raw);
      const proposal = proposeWebsiteRefresh(inventory, draft, next);
      const project = await buildWebsiteProject({
        capture: next.packet,
        draft: proposal.draft,
        review: null,
        selection: null,
      });
      return {
        proposal,
        source: { kind: 'website', project, inventory: next },
        publish: lineage => onRefresh(project, next, lineage),
      };
    },
  };
}
export function GuidelineWebsiteReview({
  packet,
  incoming,
  onRejectRefresh,
  onRefresh,
  local,
  initialOutputs = EMPTY_GUIDELINE_OUTPUTS,
  initialRefreshLineage = null,
  initialGradientSelection = null,
  initialProject = null,
  initialInventory = null,
}: {
  packet: WebsiteCapturePacket;
  incoming: WebsiteCapturePacket | null;
  onRejectRefresh: () => void;
  onRefresh: (
    project: WebsiteProject,
    inventory: WebsiteInventory,
    lineage: GuidelineRefreshLineage
  ) => void;
  local?: GuidelineLocalEditor;
  initialOutputs?: GuidelineSelectedOutputs;
  initialRefreshLineage?: GuidelineRefreshLineage | null;
  initialGradientSelection?: GuidelineAuthoredGradientSelection | null;
  initialProject?: WebsiteProject | null;
  initialInventory?: WebsiteInventory | null;
}) {
  const prepare = useCallback(
    async () => prepared(await createWebsiteInventory(packet), null, onRefresh),
    [packet, onRefresh]
  );
  const initial = useMemo(
    () =>
      initialProject && initialInventory
        ? prepared(initialInventory, initialProject, onRefresh)
        : null,
    [initialProject, initialInventory, onRefresh]
  );
  return (
    <GuidelineSourceReview
      incoming={incoming}
      onRejectRefresh={onRejectRefresh}
      initialOutputs={initialOutputs}
      initialRefreshLineage={initialRefreshLineage}
      initialGradientSelection={initialGradientSelection}
      prepare={prepare}
      initialPreparation={initial}
      local={local}
      sourceName="Website"
    />
  );
}
