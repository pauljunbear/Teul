import type { GuidelineAuthoredGradientSelection } from '../lib/guideline/authoredGradient';
import { replayGuidelineRefresh } from '../lib/guideline/refreshReplay';
import type { GuidelineRefreshLineage } from '../lib/guideline/refreshLineage';
import { proposeFigmaRefresh } from '../lib/guideline/nativeRefreshSources';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import type { GuidelineLocalEditor } from '../lib/guideline/useLocalProject';
import { useCallback, useMemo } from 'react';
import type { FigmaCapturePacket } from '../../../services/guideline-intake/src/figmaProtocol';
import {
  createFigmaNativeInventory,
  type FigmaNativeInventory,
} from '../lib/guideline/figmaInventory';
import {
  compileFigmaReview,
  figmaSourceStatements,
  suggestFigmaReview,
  FIGMA_DRAFT_VERSION,
  FIGMA_REVIEW_VERSION,
} from '../lib/guideline/figmaReview';
import { buildFigmaProject, type FigmaProject } from '../lib/guideline/figmaProject';
import { GuidelineSourceReview, type SourceReviewPreparation } from './GuidelineSourceReview';
const actor = { kind: 'user' as const, ref: 'studio:figma-source-review' };
function prepared(
  inventory: FigmaNativeInventory,
  project: FigmaProject | null,
  onRefresh: (
    project: FigmaProject,
    inventory: FigmaNativeInventory,
    lineage: GuidelineRefreshLineage
  ) => void
): SourceReviewPreparation<typeof FIGMA_DRAFT_VERSION, typeof FIGMA_REVIEW_VERSION> {
  return {
    sourceName: 'Figma',
    actor,
    initialDraft: project?.draft ?? suggestFigmaReview(inventory),
    initialProject: project,
    inventory: {
      profilePolicy: 'user-srgb',
      packet: inventory.packet,
      unsupported: inventory.unsupported,
      statements: figmaSourceStatements(inventory),
      declarations: inventory.declarations.map(item => ({
        ...item,
        kindLabel: item.kind === 'variable' ? 'Current variable' : 'Captured node paint',
      })),
      modes: inventory.modes.map(mode => ({
        ...mode,
        detail: mode.collectionId
          ? `${mode.collectionId} / ${mode.nativeModeId}`
          : 'One working binding for captured paints; no source light/dark mode is inferred.',
      })),
    },
    applyReview: draft => compileFigmaReview(inventory, draft, actor),
    saveProject: input => buildFigmaProject({ capture: inventory.packet, ...input }),
    replayRefresh: async (lineage, input, signal) =>
      replayGuidelineRefresh(
        lineage,
        {
          kind: 'figma',
          inventory,
          project: await buildFigmaProject({ capture: inventory.packet, ...input }),
        },
        signal
      ),
    prepareRefresh: async (raw, draft) => {
      const next = await createFigmaNativeInventory(raw);
      const proposal = proposeFigmaRefresh(inventory, draft, next);
      const project = await buildFigmaProject({
        capture: next.packet,
        draft: proposal.draft,
        review: null,
        selection: null,
      });
      return {
        proposal,
        source: { kind: 'figma', project, inventory: next },
        publish: lineage => onRefresh(project, next, lineage),
      };
    },
  };
}
export function GuidelineFigmaReview({
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
  packet: FigmaCapturePacket;
  incoming: FigmaCapturePacket | null;
  onRejectRefresh: () => void;
  onRefresh: (
    project: FigmaProject,
    inventory: FigmaNativeInventory,
    lineage: GuidelineRefreshLineage
  ) => void;
  local?: GuidelineLocalEditor;
  initialOutputs?: GuidelineSelectedOutputs;
  initialRefreshLineage?: GuidelineRefreshLineage | null;
  initialGradientSelection?: GuidelineAuthoredGradientSelection | null;
  initialProject?: FigmaProject | null;
  initialInventory?: FigmaNativeInventory | null;
}) {
  const prepare = useCallback(
    async () => prepared(await createFigmaNativeInventory(packet), null, onRefresh),
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
      sourceName="Figma"
    />
  );
}
