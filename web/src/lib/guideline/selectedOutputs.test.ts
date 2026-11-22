import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
} from './selectedOutputs';
import { previewGuidelineExtension, reviewGuidelineExtension } from './extension';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
} from './application';
import { buildGuidelineApplicationLayout } from './applicationGeometry';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
} from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';

async function fixture() {
  const source = await readAnyGuidelineProject(JSON.stringify(figma));
  if (source.status !== 'opened' || !source.value.project.review) throw new Error('Fixture');
  const review = source.value.project.review;
  const modeId = review.model.modes[0].id;
  const request = {
    context: 'brand' as const,
    modeId,
    scaleId: review.model.scales[0].id,
    additions: [{ slotId: '500', position: 1 }],
    lightnessOrder: 'none' as const,
  };
  const layout = { kind: 'product' as const, modeId };
  const roles = buildGuidelineApplicationLayout(layout).roles;
  const dark = review.model.colors.find(color => color.label === 'Dark')!.id;
  const light = review.model.colors.find(color => color.label === 'Light')!.id;
  const assignments = roles.map(role => ({
    applicationId: role.applicationId,
    useId: role.useId,
    colorId: ['ground', 'label', 'focus-outer'].includes(role.useId) ? light : dark,
  }));
  return { source, review, request, layout, assignments, dark, light };
}

describe('selected guideline outputs', () => {
  it('keeps source bytes unchanged and restores exact extension, application and gradient', async () => {
    const f = await fixture();
    const extension = {
      preview: await previewGuidelineExtension(f.review, f.request),
      decision: null,
    };
    const application = await assessGuidelineApplication(f.review, {
      layout: f.layout,
      assignments: f.assignments,
      extension: null,
    });
    expect(extension.preview.status).toBe('proposed');
    expect(application.recipe).not.toBeNull();
    const sourceBytes = ` \n${JSON.stringify(figma)}\n`;
    const outputs = { extension, application };
    const json = await serializeGuidelineWorkspace(sourceBytes, outputs);
    expect(JSON.parse(json).sourceProjectJson).toBe(sourceBytes);
    const reopened = await readAnyGuidelineProject(json);
    if (reopened.status !== 'opened') throw new Error('Not opened');
    expect(reopened.value.outputs).toEqual(outputs);
    expect(reopened.value.project.selection).toEqual(figma.selection);
    expect(await exportGuidelineApplication(reopened.value.outputs.application!)).toEqual(
      await exportGuidelineApplication(application)
    );
    expect(await serializeGuidelineWorkspace(sourceBytes, EMPTY_GUIDELINE_OUTPUTS)).toBe(
      sourceBytes
    );
  });

  it('retains a completed failed paint assessment without granting export', async () => {
    const f = await fixture();
    const application = await assessGuidelineApplication(f.review, {
      layout: f.layout,
      assignments: f.assignments.map(item => ({ ...item, colorId: f.dark })),
      extension: null,
    });
    expect(application.recipe).toBeNull();
    const saved = { extension: null, application };
    const restored = await readGuidelineSelectedOutputs(storedGuidelineOutputs(saved), f.review);
    expect(restored).toEqual(saved);
    await expect(exportGuidelineApplication(restored.application!)).rejects.toThrow();
  });

  it('restores pending rules and recorded renewals without inventing acceptance', async () => {
    const f = await fixture();
    const { modelHash: _, ...input } = f.review.model;
    input.rules = [
      {
        id: 'family-membership',
        label: 'Keep family membership',
        kind: 'required-partner',
        force: 'requirement',
        contextIds: ['brand'],
        modeIds: [f.request.modeId],
        origin: 'inferred',
        evidenceRefs: [],
        claimIds: [],
        operands: {
          subject: [{ kind: 'family', id: input.scales[0].familyId }],
          partner: [{ kind: 'color', id: f.dark }],
        },
      },
    ];
    input.adoptions = buildColorSystemRuleAdoptionsV1(input, [
      {
        ruleId: 'family-membership',
        status: 'accepted',
        actor: { kind: 'user', ref: 'fixture' },
        authorityRef: 'fixture',
        decisionRef: 'fixture',
      },
    ]);
    const review = {
      model: buildColorSystemModelV1(input),
      reviewHash: guidelineHash('rule fixture'),
    };
    const preview = await previewGuidelineExtension(review, f.request);
    expect(preview.pendingRuleIds).toEqual(['family-membership']);
    const pending = await readGuidelineSelectedOutputs(
      { extension: { preview, decision: null }, application: null },
      review
    );
    expect(pending.extension?.preview.pendingRuleIds).toEqual(['family-membership']);
    if (preview.construction?.status !== 'proposed') throw new Error('Expected proposal');
    const decision = {
      reviewedProposalHash: preview.construction.proposal.proposalHash,
      decisions: preview.pendingRuleIds.map(ruleId => ({
        ruleId,
        status: 'accepted' as const,
        actor: { kind: 'user' as const, ref: 'fixture' },
        authorityRef: review.reviewHash,
        decisionRef: guidelineHash(ruleId),
      })),
    };
    const renewed = await reviewGuidelineExtension(review, f.request, decision);
    const restored = await readGuidelineSelectedOutputs(
      { extension: { preview: renewed, decision }, application: null },
      review
    );
    expect(restored.extension).toEqual({ preview: renewed, decision });
    expect(restored.extension?.preview.pendingRuleIds).toEqual([]);
    await expect(
      readGuidelineSelectedOutputs(
        { extension: { preview: renewed, decision: null }, application: null },
        review
      )
    ).rejects.toThrow();
  });

  it('replays the application embedded extension independently of the standalone extension', async () => {
    const f = await fixture();
    const a = { preview: await previewGuidelineExtension(f.review, f.request), decision: null };
    const b = {
      preview: await previewGuidelineExtension(f.review, {
        ...f.request,
        additions: [{ slotId: '350', position: 0.5 }],
      }),
      decision: null,
    };
    const layout = {
      kind: 'brand' as const,
      modeId: f.request.modeId,
      layout: 'split' as const,
      primaryShare: 60,
    };
    const application = await assessGuidelineApplication(f.review, {
      layout,
      assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
        applicationId: role.applicationId,
        useId: role.useId,
        colorId: f.dark,
      })),
      extension: { ...b, anchorColorId: f.dark, purpose: 'brand-primary' },
    });
    const saved = { extension: a, application };
    expect(await readGuidelineSelectedOutputs(storedGuidelineOutputs(saved), f.review)).toEqual(
      saved
    );
    expect(application.request.extension?.preview.requestHash).not.toBe(a.preview.requestHash);
  });

  it('rejects rehashed application receipts that change selected paint, geometry or exportability', async () => {
    const f = await fixture();
    const application = await assessGuidelineApplication(f.review, {
      layout: f.layout,
      assignments: f.assignments,
      extension: null,
    });
    const stored = storedGuidelineOutputs({ extension: null, application });
    for (const change of [
      { ...stored.application!, exportable: false },
      { ...stored.application!, status: 'infeasible' },
      { ...stored.application!, model: null },
      { ...stored.application!, geometry: null },
      { ...stored.application!, execute: 'trust-cached-result' },
    ])
      await expect(
        readGuidelineSelectedOutputs({ extension: null, application: change }, f.review)
      ).rejects.toThrow('differs');
  });

  it('rejects altered outcomes, source mismatch, missing review, unknown fields and cancellation', async () => {
    const f = await fixture();
    const saved = {
      extension: { preview: await previewGuidelineExtension(f.review, f.request), decision: null },
      application: null,
    };
    await expect(readGuidelineSelectedOutputs(saved, null)).rejects.toThrow();
    await expect(
      readGuidelineSelectedOutputs({ ...saved, execute: 'anything' }, f.review)
    ).rejects.toThrow();
    await expect(
      readGuidelineSelectedOutputs(saved, { ...f.review, reviewHash: guidelineHash('changed') })
    ).rejects.toThrow();
    const altered = {
      ...saved,
      extension: {
        ...saved.extension,
        preview: { ...saved.extension.preview, pendingRuleIds: ['fabricated'] },
      },
    };
    await expect(readGuidelineSelectedOutputs(altered, f.review)).rejects.toThrow();
    const cancelled = {
      ...saved,
      extension: {
        ...saved.extension,
        preview: { ...saved.extension.preview, status: 'cancelled' },
      },
    };
    await expect(readGuidelineSelectedOutputs(cancelled, f.review)).rejects.toThrow('cancelled');
    await expect(
      readGuidelineSelectedOutputs(saved, f.review, AbortSignal.abort())
    ).rejects.toThrow();
    const json = await serializeGuidelineWorkspace(JSON.stringify(figma), saved);
    const raw = JSON.parse(json);
    raw.sourceProjectJson += ' ';
    await expect(readAnyGuidelineProject(JSON.stringify(raw))).rejects.toThrow('integrity');
    expect(
      await readAnyGuidelineProject('{"schemaVersion":"teul.guideline-workspace.v999"}')
    ).toEqual({ status: 'read-only', version: 'teul.guideline-workspace.v999' });
  });
});

it('saves source-derived scales and actual applications with exact paint and rejects format downgrade', async () => {
  const f = await fixture();
  const request = {
    kind: 'new-scale' as const,
    context: 'product' as const,
    modeId: f.layout.modeId,
    scaleId: 'derived:dark',
    familyId: f.review.model.families.find(item => item.colorIds.includes(f.dark))?.id ?? null,
    anchorColorId: f.dark,
    label: 'Derived ink',
    polarity: 'light' as const,
  };
  const extension = { preview: await previewGuidelineExtension(f.review, request), decision: null };
  expect(extension.preview.status).toBe('proposed');
  const actionId = extension.preview.generatedBindings.find(
    binding => binding.slotId === 'step:10'
  )!.colorId;
  const application = await assessGuidelineApplication(f.review, {
    layout: f.layout,
    assignments: f.assignments.map(item =>
      item.useId === 'action' ? { ...item, colorId: actionId } : item
    ),
    extension: { ...extension, anchorColorId: f.dark, purpose: 'product-semantics' },
  });
  expect(application.recipe).not.toBeNull();
  const saved = await serializeGuidelineWorkspace(JSON.stringify(figma), {
    extension,
    application,
  });
  expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v8');
  // Consume the one-shot serialization validation, then force a full independent read.
  await readAnyGuidelineProject(saved);
  const reopened = await readAnyGuidelineProject(saved);
  if (reopened.status !== 'opened') throw Error('not opened');
  expect(reopened.value.outputs.extension).toEqual(extension);
  const exports = await exportGuidelineApplication(application);
  expect(await exportGuidelineApplication(reopened.value.outputs.application!)).toEqual(exports);
  expect(JSON.parse(exports.applicationJson).schemaVersion).toBe('teul.guideline-application.v2');
  expect((await readGuidelineApplication(exports.applicationJson, f.review)).applications).toEqual(
    application.applications
  );
  const oldApplication = JSON.parse(exports.applicationJson);
  oldApplication.schemaVersion = 'teul.guideline-application.v1';
  await expect(readGuidelineApplication(JSON.stringify(oldApplication), f.review)).rejects.toThrow(
    'require V2'
  );
  const { bundleHash: _, ...content } = JSON.parse(saved);
  content.schemaVersion = 'teul.guideline-workspace.v7';
  await expect(
    readAnyGuidelineProject(JSON.stringify({ ...content, bundleHash: guidelineHash(content) }))
  ).rejects.toThrow('newer project');
  const altered = JSON.parse(saved);
  altered.outputs.extension.preview.workingModel.colors[0].label = 'Forged';
  const { bundleHash: __, ...changed } = altered;
  await expect(
    readAnyGuidelineProject(JSON.stringify({ ...changed, bundleHash: guidelineHash(changed) }))
  ).rejects.toThrow('Saved extension differs');
});
