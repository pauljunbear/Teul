import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { guidelineHash } from './review';
import {
  previewGuidelineExtension,
  reviewGuidelineExtension,
  type GuidelineExtensionReview,
} from './extension';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  type GuidelineApplicationRequest,
} from './application';
import {
  buildGuidelineApplicationLayout,
  type GuidelineApplicationLayoutInput,
} from './applicationGeometry';

function fixture(closed = false) {
  const link = { evidenceRefs: [], claimIds: [] };
  const scope = {
    ...link,
    contextIds: ['brand', 'product'],
    modeIds: ['Source'],
    origin: 'inferred' as const,
  };
  const input: ColorSystemModelInputV1 = {
    schemaVersion: 'teul.color-system-model.v1',
    sources: [
      {
        id: 'source',
        label: 'Invented source',
        sourceHash: guidelineHash('source'),
        version: '1',
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [],
    coverage: [
      {
        sourceId: 'source',
        status: 'complete',
        evidenceRefs: [],
        unresolvedClaimIds: [],
        note: 'Synthetic fixture only.',
      },
    ],
    claims: [],
    modes: [{ id: 'Source', label: 'Source' }],
    colors: [
      ['pale', 0.9],
      ['middle', 0.2],
      ['deep', 0.1],
      ['paper', 1],
    ].map(([id, v]) => ({
      ...link,
      id: String(id),
      label: String(id),
      sourceId: 'source',
      valuesByMode: {
        Source: buildColorSystemSrgbValueV1({ r: Number(v), g: Number(v), b: Number(v) }),
      },
    })),
    families: [{ ...link, id: 'stone', label: 'Stone', colorIds: ['pale', 'middle', 'deep'] }],
    scales: [
      {
        ...link,
        id: 'stone-scale',
        familyId: 'stone',
        label: 'Uneven authored scale',
        slots: [
          { id: 'Mist', position: 2 },
          { id: 'Stone', position: 25 },
          { id: 'Coal', position: 87 },
        ],
        modes: [
          {
            modeId: 'Source',
            anchors: [
              { slotId: 'Mist', colorId: 'pale' },
              { slotId: 'Stone', colorId: 'middle' },
              { slotId: 'Coal', colorId: 'deep' },
            ],
          },
        ],
      },
    ],
    contexts: ['brand', 'product'].map(id => ({ ...link, id, label: id, modeIds: ['Source'] })),
    brandConstraintsByContext: [],
    rules: [
      {
        ...scope,
        id: 'partner',
        label: 'Keep the middle anchor visible',
        kind: 'required-partner',
        force: 'requirement',
        operands: {
          subject: [{ kind: 'family', id: 'stone' }],
          partner: [{ kind: 'color', id: 'middle' }],
        },
      },
      {
        ...scope,
        contextIds: ['brand'],
        id: 'dominance',
        label: 'Middle leads pale',
        kind: 'prominence',
        force: 'requirement',
        operands: {
          kind: 'ordered-groups',
          groups: [[{ kind: 'color', id: 'middle' }], [{ kind: 'color', id: 'pale' }]],
        },
      },
      ...(closed
        ? [
            {
              ...scope,
              id: 'closed',
              label: 'Only this palette',
              kind: 'palette-membership' as const,
              force: 'requirement' as const,
              operands: {
                members: ['pale', 'middle', 'deep', 'paper'].map(id => ({
                  kind: 'color' as const,
                  id,
                })),
              },
            },
          ]
        : []),
    ],
    adoptions: [],
    conflicts: [],
  };
  const model = buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'user', ref: 'fixture-user' },
        authorityRef: 'fixture',
        decisionRef: 'review-source',
      }))
    ),
  });
  return {
    model,
    reviewHash: guidelineHash({ source: model.modelHash, decision: 'review-source' }),
  };
}
function request(
  layout: GuidelineApplicationLayoutInput = { kind: 'product', modeId: 'Source' }
): GuidelineApplicationRequest {
  return {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(({ applicationId, useId }) => ({
      applicationId,
      useId,
      colorId:
        useId === 'ground' || useId === 'label'
          ? 'paper'
          : useId === 'secondary'
            ? 'pale'
            : useId === 'accent'
              ? 'deep'
              : 'middle',
    })),
  };
}
async function extension() {
  const review = fixture();
  const extensionRequest = {
    context: 'product' as const,
    modeId: 'Source',
    scaleId: 'stone-scale',
    additions: [{ slotId: 'new-shade', position: 56 }],
    lightnessOrder: 'decreasing' as const,
  };
  const initial = await previewGuidelineExtension(review, extensionRequest);
  if (initial.construction?.status !== 'proposed') throw new Error('Expected construction');
  const decision: GuidelineExtensionReview = {
    reviewedProposalHash: initial.construction.proposal.proposalHash,
    decisions: [
      {
        ruleId: 'partner',
        status: 'accepted',
        actor: { kind: 'user', ref: 'fixture-user' },
        authorityRef: 'fixture-extension',
        decisionRef: 'explicit-review',
      },
    ],
  };
  const preview = await reviewGuidelineExtension(review, extensionRequest, decision);
  const input = request();
  return {
    review,
    initial,
    decision,
    preview,
    input: {
      ...input,
      extension: {
        preview,
        decision,
        anchorColorId: 'middle',
        purpose: 'product-semantics' as const,
      },
      assignments: input.assignments.map(item =>
        item.applicationId === 'hover' && item.useId === 'action'
          ? { ...item, colorId: preview.generatedBindings[0].colorId }
          : item
      ),
    },
  };
}

describe('source-bound guideline applications', () => {
  it('applies a closed source palette unchanged and replays exact CSS, SVG and recipe delivery', async () => {
    const review = fixture(true),
      before = JSON.stringify(review);
    const result = await assessGuidelineApplication(review, request());
    expect(result.status).toBe('ready');
    expect(result.qualified).toBe(false);
    expect(result.applications.map(item => item.id)).toEqual([
      'rest',
      'hover',
      'pressed',
      'focus',
      'disabled',
    ]);
    expect(result.model).toEqual(review.model);
    expect(result.assessment?.eligible).toBe(true);
    expect(result.recipe?.source.model).toEqual(review.model);
    const exported = await exportGuidelineApplication(result);
    expect(exported.svgs).toHaveLength(5);
    expect(exported.svgs.every(item => item.svg.includes('<svg'))).toBe(true);
    expect(exported.cssText).toContain('--');
    expect(exported.dtcgJson).toContain('"colorSpace":"srgb"');
    const reopened = await readGuidelineApplication(exported.applicationJson, review);
    expect(reopened.recipe).toEqual(result.recipe);
    expect((await exportGuidelineApplication(reopened)).applicationJson).toBe(
      exported.applicationJson
    );
    expect(JSON.stringify(review)).toBe(before);
    const forged = JSON.parse(exported.applicationJson);
    forged.recipe.selection.executionReceiptHash = guidelineHash('forged');
    await expect(readGuidelineApplication(JSON.stringify(forged), review)).rejects.toThrow(
      'recomputed'
    );
    await expect(
      readGuidelineApplication(exported.applicationJson, {
        ...review,
        reviewHash: guidelineHash('newer-review'),
      })
    ).rejects.toThrow('changed source');
    await expect(exportGuidelineApplication(structuredClone(result))).rejects.toThrow('Assess');
  });

  it('keeps the actual failed hover state when its required partner is missing', async () => {
    const input = request();
    const bad = {
      ...input,
      assignments: input.assignments.map(item =>
        item.applicationId === 'hover'
          ? { ...item, colorId: item.useId === 'action' ? 'deep' : 'paper' }
          : item
      ),
    };
    const result = await assessGuidelineApplication(fixture(), bad);
    expect(result.status).toBe('infeasible');
    expect(result.applications).toHaveLength(5);
    expect(
      result.assessment?.applications
        .find(item => item.application.id === 'hover')
        ?.rules.find(rule => rule.ruleId === 'partner')?.status
    ).toBe('fail');
    expect(
      result.assessment?.applications.find(item => item.application.id === 'rest')?.eligible
    ).toBe(true);
    expect(result.geometry).not.toBeNull();
    expect(result.recipe).toBeNull();
    await expect(exportGuidelineApplication(result)).rejects.toThrow('feasible');
  });

  it('reports contrast failure on the actual label/action pair without hiding the paints', async () => {
    const input = request();
    const result = await assessGuidelineApplication(fixture(), {
      ...input,
      assignments: input.assignments.map(item =>
        item.applicationId === 'pressed' && item.useId === 'label'
          ? { ...item, colorId: 'middle' }
          : item
      ),
    });
    expect(result.status).toBe('infeasible');
    const state = result.assessment!.applications.find(item => item.application.id === 'pressed')!;
    expect(state.pairs.some(pair => pair.ratio === 1 && pair.status === 'fail')).toBe(true);
    expect(
      result.applications
        .find(item => item.id === 'pressed')
        ?.uses.find(item => item.id === 'label')?.colorId
    ).toBe('middle');
  });

  it('re-executes construction from the original source and explicit renewal', async () => {
    const { review, input } = await extension();
    const result = await assessGuidelineApplication(review, input);
    expect(result.status).toBe('ready');
    expect(result.execution?.generation?.kind).toBe('construction');
    expect(result.recipe?.direction.generation.kind).toBe('construction');
    for (const color of review.model.colors)
      expect(result.model?.colors.find(item => item.id === color.id)).toEqual(color);
    for (const anchor of review.model.scales[0].modes[0].anchors)
      expect(result.model?.scales[0].modes[0].anchors).toContainEqual(anchor);
    expect(result.recipe?.source.model.modelHash).toBe(review.model.modelHash);
    expect(result.model?.modelHash).not.toBe(review.model.modelHash);
    const exported = await exportGuidelineApplication(result);
    expect((await readGuidelineApplication(exported.applicationJson, review)).recipe).toEqual(
      result.recipe
    );
  });

  it('blocks an extension pending renewal and rejects changed or forged extension inputs', async () => {
    const { review, input, initial } = await extension();
    const pending = await assessGuidelineApplication(review, {
      ...input,
      extension: {
        preview: initial,
        decision: null,
        anchorColorId: 'middle',
        purpose: 'product-semantics' as const,
      },
    });
    expect(pending.status).toBe('blocked');
    expect(pending.assessment?.eligible).toBe(false);
    expect(pending.applications).toHaveLength(5);
    const modified = structuredClone(input);
    (modified.extension!.preview as unknown as { pendingRuleIds: string[] }).pendingRuleIds = [
      'invented',
    ];
    await expect(assessGuidelineApplication(review, modified)).rejects.toThrow('extension changed');
    await expect(
      assessGuidelineApplication(review, {
        ...input,
        extension: {
          ...input.extension,
          anchorColorId: input.extension.preview.generatedBindings[0].colorId,
        },
      })
    ).rejects.toThrow('original anchor');
    const agent = structuredClone(input);
    (agent.extension!.decision!.decisions[0].actor as { kind: string }).kind = 'agent';
    await expect(assessGuidelineApplication(review, agent)).rejects.toThrow('explicit user');
    const stale = structuredClone(input);
    (stale.extension!.preview as { reviewHash: string }).reviewHash = guidelineHash('stale');
    await expect(assessGuidelineApplication(review, stale)).rejects.toThrow('different source');
  });

  it('uses actual layout proportions when assessing brand dominance', async () => {
    const good = await assessGuidelineApplication(
      fixture(),
      request({ kind: 'brand', modeId: 'Source', layout: 'split', primaryShare: 75 })
    );
    const bad = await assessGuidelineApplication(
      fixture(),
      request({ kind: 'brand', modeId: 'Source', layout: 'split', primaryShare: 25 })
    );
    expect(good.status).toBe('ready');
    expect(bad.status).toBe('infeasible');
    expect(
      bad.assessment!.applications[0].rules.find(item => item.ruleId === 'dominance')?.status
    ).toBe('fail');
    expect(good.geometry?.layoutHash).not.toBe(bad.geometry?.layoutHash);
  });

  it('hard rejects incomplete paints, missing numeric modes, unknown scopes and accessors', async () => {
    const review = fixture(),
      input = request();
    await expect(
      assessGuidelineApplication(review, { ...input, assignments: input.assignments.slice(1) })
    ).rejects.toThrow('every actual paint');
    await expect(
      assessGuidelineApplication(review, {
        ...input,
        assignments: input.assignments.map((item, i) =>
          i ? item : { ...item, colorId: 'missing' }
        ),
      })
    ).rejects.toThrow('numeric');
    await expect(
      assessGuidelineApplication(review, {
        ...input,
        layout: { kind: 'product', modeId: 'Invented' },
      })
    ).rejects.toThrow('context and mode');
    await expect(
      assessGuidelineApplication(review, {
        ...input,
        layout: { kind: 'unknown', modeId: 'Source' },
      } as unknown as GuidelineApplicationRequest)
    ).rejects.toThrow();
    const hostile = { ...input };
    Object.defineProperty(hostile, 'extension', {
      get: () => {
        throw new Error('Accessor executed');
      },
      enumerable: true,
    });
    await expect(assessGuidelineApplication(review, hostile)).rejects.not.toThrow(
      'Accessor executed'
    );
  });

  it('cancels without an exportable candidate and captures caller edits before async hooks', async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await assessGuidelineApplication(fixture(), request(), controller.signal);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.recipe).toBeNull();
    const { review, input } = await extension();
    const operation = assessGuidelineApplication(review, input);
    (input.assignments[0] as { colorId: string }).colorId = 'missing';
    const result = await operation;
    expect(result.status).toBe('ready');
    expect(result.request.assignments[0].colorId).toBe('paper');
    const signal = new AbortController();
    signal.abort();
    await expect(exportGuidelineApplication(result, signal.signal)).rejects.toThrow('cancelled');
  });
});
