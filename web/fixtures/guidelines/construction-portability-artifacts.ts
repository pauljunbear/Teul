import { contextPaintsExtensionFixture } from './context-paints-fixture';
import {
  assessGuidelineApplication,
  guidelineApplicationContextProposal,
  exportGuidelineApplication,
  readGuidelineApplication,
} from '../../src/lib/guideline/application';
import { createGuidelineRuleDecision } from '../../src/lib/guideline/extensionRuleReview';
import {
  createGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
} from '../../src/lib/guideline/authoringDraft';
import { applicationDraftFromRequest } from '../../src/lib/guideline/applicationDraft';
import {
  serializeGuidelineWorkspace,
  readAnyGuidelineProject,
} from '../../src/lib/guideline/projectCodec';

/** Public synthetic fixture: real construction, scoped reviews, native context, and exports. */
async function reviewedApplication(blocked = false, numericVersion: 1 | 2 = 2) {
  const f = await contextPaintsExtensionFixture(numericVersion === 2 ? 2 : undefined);
  const request = {
    ...f.request,
    assignments: f.request.assignments.map(a =>
      blocked && a.useId === 'ground'
        ? { ...a, colorId: f.request.assignments.find(item => item.useId === 'mark-1')!.colorId }
        : a.useId === 'mark-1'
          ? { ...a, colorId: f.request.extension.preview.generatedBindings[0].colorId }
          : a
    ),
  };
  const pending = await assessGuidelineApplication(f.review, request);
  const proposal = guidelineApplicationContextProposal(pending)!;
  const contextReview = createGuidelineRuleDecision(
    f.review.reviewHash,
    proposal,
    Object.fromEntries(proposal.pendingRuleIds.map(id => [id, 'accepted']))
  );
  const application = await assessGuidelineApplication(f.review, { ...request, contextReview });
  return { f, application };
}

export async function constructionPortabilityBlockedEvidence() {
  const { application } = await reviewedApplication(true);
  if (
    application.status !== 'infeasible' ||
    !application.assessment ||
    application.assessment.eligible
  )
    throw new Error('Expected the failing contrast example to remain infeasible.');
  return { execution: application.execution, assessment: application.assessment };
}

/** Public synthetic fixture: actual construction, scoped reviews, native context, and exports. */
export async function constructionPortabilityArtifacts(numericVersion: 1 | 2 = 2) {
  const { f, application } = await reviewedApplication(false, numericVersion);
  if (application.status !== 'ready' || !application.recipe)
    throw new Error('Expected an exportable synthetic application.');
  const authoring = createGuidelineAuthoringDraft(f.review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: applicationDraftFromRequest(application.request),
  });
  const outputs = {
    extension: { preview: f.request.extension.preview, decision: f.request.extension.decision },
    application,
    authoring,
    designBrief: authoring.briefs.application!,
  };
  const sourceJson = JSON.stringify(f.project);
  const workspace = await serializeGuidelineWorkspace(sourceJson, outputs);
  const exports = await exportGuidelineApplication(application);
  return { sourceJson, workspace, exports };
}

export async function reopenConstructionPortabilityArtifacts(
  packet: Awaited<ReturnType<typeof constructionPortabilityArtifacts>>
) {
  const first = await readAnyGuidelineProject(packet.workspace);
  const opened = await readAnyGuidelineProject(packet.workspace); // Cold replay, after consuming any serialization cache.
  if (
    first.status !== 'opened' ||
    opened.status !== 'opened' ||
    !opened.value.project.review ||
    !opened.value.outputs.application
  )
    throw new Error('Expected a supported workspace.');
  const standalone = await readGuidelineApplication(
    packet.exports.applicationJson,
    opened.value.project.review
  );
  return {
    workspaceExports: await exportGuidelineApplication(opened.value.outputs.application),
    applicationExports: await exportGuidelineApplication(standalone),
    authoring: opened.value.outputs.authoring,
    sourceModelHash: opened.value.project.review.model.modelHash,
  };
}
