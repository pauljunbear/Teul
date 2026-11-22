import { nativeGradientComparisonFixture } from './native-gradient-comparison-fixture';
import { sourceSetPdf } from './source-set-fixture';
import { buildFigmaProject } from '../../src/lib/guideline/figmaProject';
import { serializeGuidelineWorkspace } from '../../src/lib/guideline/projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from '../../src/lib/guideline/selectedOutputs';
import {
  applySourceSetReview,
  prepareSourceSetEntry,
  type SourceSetDraft,
} from '../../src/lib/guideline/sourceSet';
import { serializeSourceSetProject } from '../../src/lib/guideline/sourceSetProject';
import { createGuidelineContinuousGradient } from '../../src/lib/guideline/authoredGradient';
import { canonicalIntakeJson } from '../../../services/guideline-intake/src/protocol';
import { hashCanonical } from '../../src/lib/guideline/intakeClient';
import { createFigmaNativeInventory } from '../../src/lib/guideline/figmaInventory';
import { suggestFigmaReview, compileFigmaReview } from '../../src/lib/guideline/figmaReview';

/** Public synthetic inputs for production UI proof; no brand or human acceptance. */
export async function nativeGradientWorkspaceFixture() {
  const value = await nativeGradientComparisonFixture();
  const project = await buildFigmaProject({
    capture: value.inventory.packet,
    draft: value.review.decision.draft,
    review: value.review,
    selection: null,
  });
  const sourceProjectJson = JSON.stringify(project, null, 2);
  const singleJson = await serializeGuidelineWorkspace(
    sourceProjectJson,
    EMPTY_GUIDELINE_OUTPUTS,
    null,
    undefined,
    null,
    value.selection
  );
  const prepared = await prepareSourceSetEntry(sourceProjectJson, 'native-member');
  const companion = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'pdf-member');
  const draft: SourceSetDraft = {
    entries: [prepared.entry, companion.entry],
    subjects: [...prepared.subjects, ...companion.subjects],
    scope: 'brand',
    resolutions: [],
  };
  const review = await applySourceSetReview(draft, {
    actor: value.review.decision.actor,
    reviewedAt: value.review.decision.reviewedAt,
  });
  const modeId = review.model.modes[0].id;
  const black = review.model.colors.find(color => color.valuesByMode[modeId]?.components.r === 0)!;
  const selection = createGuidelineContinuousGradient(review, {
    modeId,
    scope: 'brand',
    angle: 43.5,
    route: { space: 'oklab' },
    stops: [0, 1].map(position => ({ colorId: black.id, position, locked: true })),
  });
  const combinedJson = await serializeSourceSetProject({
    draft,
    review,
    outputs: EMPTY_GUIDELINE_OUTPUTS,
    gradientSelection: selection,
  });
  const { contentHash: _hash, ...changed } = structuredClone(value.inventory.packet);
  const children = changed.roots[0].document.children as Record<string, any>[];
  children[0].fills[0].gradientHandlePositions[2].x += 0.01;
  const changedCapture = {
    ...changed,
    contentHash: await hashCanonical(canonicalIntakeJson(changed)),
  };
  const changedInventory = await createFigmaNativeInventory(changedCapture);
  const changedDraft = suggestFigmaReview(changedInventory);
  changedDraft.modeIds = changedInventory.modes.map(mode => mode.id);
  changedDraft.colors = changedInventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: 'Synthetic',
  }));
  changedDraft.profileDecision = {
    captureHash: changedCapture.contentHash,
    interpretation: 'srgb',
    actor: value.review.decision.actor,
    decidedAt: changedCapture.capturedAt,
  };
  changedDraft.scopeDecision = {
    accepted: true,
    reason: 'Synthetic changed-gradient source only.',
  };
  const changedReview = compileFigmaReview(
    changedInventory,
    changedDraft,
    value.review.decision.actor,
    changedCapture.capturedAt
  );
  const changedProject = await buildFigmaProject({
    capture: changedCapture,
    draft: changedDraft,
    review: changedReview,
    selection: null,
  });
  return {
    singleJson,
    sourceProjectJson,
    combinedJson,
    changedCaptureJson: JSON.stringify(changedCapture),
    changedSourceProjectJson: JSON.stringify(changedProject),
    sourceModeId: draft.entries[0].modeId,
  };
}
