import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import capture from '../../../fixtures/guidelines/website-capture.json';
import legacyFigma from '../../../fixtures/guidelines/figma-project-v1.json';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { createWebsiteInventory, parseWebsiteSrgb } from './websiteInventory';
import { buildWebsiteModel, websiteSourceStatements } from './websiteModel';
import {
  compileWebsiteReview,
  suggestWebsiteReview,
  parseWebsiteReviewDraft,
} from './websiteReview';
import { buildWebsiteProject, readWebsiteProject } from './websiteProject';
import { readFigmaProject } from './figmaProject';
import { createGuidelineModeGradient } from './modeGradient';
import { guidelineModeGradientExports } from './gradientExport';
import { guidelineOperationIssues } from './review';
import { previewGuidelineExtension } from './extension';
import { colorSystemValueNoticesV1 } from '../../../../src/lib/colorSystemValueProvenanceV1';

const actor = { kind: 'user' as const, ref: 'test:website-review' };
const at = '2026-09-25T15:00:00.000Z';
const seal = (raw: typeof capture) => {
  const { contentHash: _hash, ...content } = raw;
  return {
    ...content,
    contentHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(content)).digest('hex')}`,
  };
};
async function setup() {
  const inventory = await createWebsiteInventory(capture);
  const draft = suggestWebsiteReview(inventory);
  draft.modeIds = [inventory.modes[0].id];
  const accent = inventory.declarations.find(item => item.property === '--accent')!;
  const text = inventory.declarations.find(
    item =>
      item.kind === 'computed-usage' && item.property === 'color' && item.value?.hex === '#141E28'
  )!;
  draft.colors = [accent, text].map(item => ({
    declarationId: item.id,
    label: item.property,
    family: 'Working colors',
  }));
  draft.statements = draft.statements.map(item => ({
    ...item,
    meaning: 'not-a-rule',
    reason: 'Label or fixture content; no additional color rule.',
  }));
  const restriction = websiteSourceStatements(inventory).find(item =>
    item.text.includes('Do not use gradients')
  )!;
  draft.statements = draft.statements.map(item =>
    item.observationId === restriction.id
      ? {
          ...item,
          meaning: 'no-gradients',
          scope: 'product',
          reason: 'Retain the restriction for product use.',
        }
      : item
  );
  draft.scopeDecision = {
    accepted: true,
    reason: 'Observed selected region only; authored brand approval is unverified.',
  };
  draft.scales = [
    {
      id: 'scale:working',
      label: 'Working scale',
      family: 'Working colors',
      slots: [
        { id: 'first', position: 0 },
        { id: 'last', position: 2 },
      ],
      modes: [
        {
          modeId: draft.modeIds[0],
          anchors: [
            { slotId: 'first', declarationId: accent.id },
            { slotId: 'last', declarationId: text.id },
          ],
        },
      ],
      evidenceRefs: [accent.id, text.id],
    },
  ];
  return { inventory, draft };
}

describe('website evidence, review and portable use', () => {
  it('preserves names, exact value groups, occurrences and source authority separately', async () => {
    const inventory = await createWebsiteInventory(capture);
    const accent = inventory.declarations.find(item => item.property === '--accent')!;
    const link = inventory.declarations.find(item => item.property === '--link')!;
    expect(accent.id).not.toBe(link.id);
    expect(accent.value).toEqual(link.value);
    const group = inventory.valueGroups.find(item => item.declarationIds.includes(accent.id))!;
    expect(group.declarationIds).toContain(link.id);
    expect(new Set(inventory.declarations.map(item => item.recordId)).size).toBe(
      inventory.declarations.length
    );
    expect(inventory.sources[0].sourceHash).toBe(capture.contentHash);
    expect(inventory.sources[0].sourceHash).not.toBe(capture.documentHash);
    expect(inventory.sources[0].status).toBe('unknown');
    const excluded = new Set(capture.elements.filter(item => item.excluded).map(item => item.id));
    expect(inventory.declarations.some(item => excluded.has(item.elementId))).toBe(false);
    expect(
      inventory.declarations.some(item => item.gap && item.literal.startsWith('color(display-p3'))
    ).toBe(true);
  });
  it('admits complete numeric CSS with native precision and never mines unsupported expressions', () => {
    const first = parseWebsiteSrgb('color(srgb 0.123456789012345 0.4 0.5 / 0.875)')!;
    expect(first.components.r).toBe(0.123456789012345);
    expect(first.alpha).toBe(0.875);
    const second = parseWebsiteSrgb('color(srgb 0.123456789012346 0.4 0.5 / 0.875)')!;
    expect(first.hex).toBe(second.hex);
    expect(first.representation?.exactValueHash).not.toBe(second.representation?.exactValueHash);
    for (const literal of [
      'RGB: 18,110,120',
      'color(display-p3 .1 .2 .3)',
      'linear-gradient(red,#abcdef)',
      'rgb(300 0 0)',
      'var(--a,#abc)',
      '1px 2px #fff',
    ])
      expect(parseWebsiteSrgb(literal)).toBeNull();
  });
  it('keeps every statement independent of selected colors and blocks unresolved meaning', async () => {
    const { inventory, draft } = await setup();
    expect(() => parseWebsiteReviewDraft(inventory, { ...draft, statements: [] })).toThrow(
      'cannot be omitted'
    );
    draft.statements[0].meaning = 'needs-interpretation';
    const review = compileWebsiteReview(inventory, draft, actor, at);
    expect(guidelineOperationIssues(review, 'extend', 'brand').length).toBeGreaterThan(0);
    expect(() =>
      buildWebsiteModel(inventory, {
        captureHash: capture.contentHash,
        declarationIds: draft.colors.map(item => item.declarationId),
        modeIds: draft.modeIds,
        profileDecision: {
          captureHash: capture.contentHash,
          interpretation: 'srgb',
          actor,
          decidedAt: at,
        },
      })
    ).toThrow('cannot be reinterpreted');
  });
  it('extends the source while retaining website qualifications and source anchors', async () => {
    const { inventory, draft } = await setup();
    const review = compileWebsiteReview(inventory, draft, actor, at);
    expect(
      guidelineOperationIssues(review, 'gradient', 'product', draft.modeIds[0]).length
    ).toBeGreaterThan(0);
    const extended = await previewGuidelineExtension(review, {
      context: 'brand',
      scaleId: 'scale:working',
      modeId: draft.modeIds[0],
      additions: [{ slotId: 'middle', position: 1 }],
      lightnessOrder: 'none',
    });
    expect(extended.status).toBe('proposed');
    const project = await buildWebsiteProject({
      capture: inventory.packet,
      draft,
      review,
      selection: null,
    });
    const outputs = { extension: { preview: extended, decision: null }, application: null };
    const reopened = await readAnyGuidelineProject(
      await serializeGuidelineWorkspace(JSON.stringify(project), outputs)
    );
    if (reopened.status !== 'opened') throw new Error('Fixture');
    expect(reopened.value.kind).toBe('website');
    expect(reopened.value.outputs).toEqual(outputs);
    for (const color of review.model.colors)
      expect(
        extended.workingModel!.colors.find(item => item.id === color.id)?.valuesByMode
      ).toEqual(color.valuesByMode);
    const generated = extended.workingModel!.colors.filter(
      item => !review.model.colors.some(source => source.id === item.id)
    );
    expect(
      colorSystemValueNoticesV1(
        extended.workingModel!,
        generated.map(item => item.id)
      ).join(' ')
    ).toContain('observed website CSS values');
  });
  it('replays offline to byte-identical output and rejects changed decisions or embedded output', async () => {
    const { inventory, draft } = await setup();
    const review = compileWebsiteReview(inventory, draft, actor, at);
    const selection = createGuidelineModeGradient(
      review,
      'brand',
      draft.modeIds[0],
      draft.colors[0].declarationId,
      draft.colors[1].declarationId,
      120
    );
    const exports = guidelineModeGradientExports(review, selection);
    expect(JSON.stringify(exports)).toContain('Observed website CSS value');
    const project = await buildWebsiteProject({
      capture: inventory.packet,
      draft,
      review,
      selection,
    });
    const reopened = await readWebsiteProject(JSON.parse(JSON.stringify(project)));
    expect(reopened.status).toBe('opened');
    if (reopened.status !== 'opened') throw new Error('Expected open');
    expect(reopened.project).toEqual(project);
    expect(
      guidelineModeGradientExports(reopened.project.review!, reopened.project.selection!)
    ).toEqual(exports);
    const changed = structuredClone(project);
    changed.draft.colors[0].label = 'Changed after applying';
    await expect(readWebsiteProject(changed)).rejects.toThrow('differs');
    const tampered = structuredClone(project);
    Object.assign(tampered.review!.model.colors[0], { label: 'Invented saved model' });
    await expect(readWebsiteProject(tampered)).rejects.toThrow('differs');
    expect(await readWebsiteProject({ schemaVersion: 'teul.website-project.v999' })).toEqual({
      status: 'read-only',
      version: 'teul.website-project.v999',
    });
  });
  it('invalidates old decisions when rendered CSS changes despite identical HTML', async () => {
    const { draft } = await setup();
    const changed = structuredClone(capture);
    changed.customProperties[0].value = '#AA0022';
    const inventory = await createWebsiteInventory(seal(changed));
    expect(inventory.packet.documentHash).toBe(capture.documentHash);
    expect(() => parseWebsiteReviewDraft(inventory, draft)).toThrow('different source capture');
    await expect(createWebsiteInventory(changed)).rejects.toThrow('HASH_MISMATCH');
  });
  it('fails capacity without dropping retained source statements or inventing an environment', async () => {
    const { inventory, draft } = await setup();
    expect(() =>
      buildWebsiteModel(inventory, {
        captureHash: capture.contentHash,
        declarationIds: draft.colors.map(item => item.declarationId),
        modeIds: ['Dark'],
        profileDecision: null,
      })
    ).toThrow('observed environment');
    const changed = structuredClone(capture);
    const base = changed.elements.find(item => !item.excluded)!;
    changed.elements = Array.from({ length: 512 }, (_, index) => ({
      ...base,
      id: `text:${index}`,
      locator: `body > div:nth-child(${index + 1})`,
      text: `Rule ${index}`,
    }));
    changed.scope = { inspected: 512, matched: 512, truncated: false };
    changed.usages = [{ ...changed.usages[0], elementId: 'text:0' }];
    changed.customProperties = [];
    const large = await createWebsiteInventory(seal(changed));
    expect(() =>
      buildWebsiteModel(large, {
        captureHash: large.packet.contentHash,
        declarationIds: [large.declarations[0].id],
        modeIds: [large.modes[0].id],
        profileDecision: null,
      })
    ).toThrow('model limit');
  });
  it('preserves an actual pre-refactor Figma project and saved gradient without migration', async () => {
    const result = await readFigmaProject(legacyFigma);
    expect(result.status).toBe('opened');
    if (result.status === 'opened') expect(result.project).toEqual(legacyFigma);
  });
});
