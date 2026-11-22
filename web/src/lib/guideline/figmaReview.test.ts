import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { FIGMA_CAPTURE_VERSION } from '../../../../services/guideline-intake/src/figmaProtocol';
import { createFigmaNativeInventory } from './figmaInventory';
import {
  compileFigmaReview,
  suggestFigmaReview,
  parseFigmaReviewDraft,
  figmaSourceStatements,
} from './figmaReview';
import { buildFigmaProject, readFigmaProject } from './figmaProject';
import { createGuidelineModeGradient } from './modeGradient';
import { previewGuidelineExtension } from './extension';
import { guidelineOperationIssues } from './review';
import { colorSystemValueNoticesV1 } from '../../../../src/lib/colorSystemValueProvenanceV1';

const actor = { kind: 'user' as const, ref: 'test:local-reviewer' };
const at = '2026-09-25T13:00:00.000Z';
const hash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`;
async function setup() {
  const source = {
    schemaVersion: FIGMA_CAPTURE_VERSION,
    request: {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'ABC',
      version: 'revision-7',
      nodeIds: ['1:2'],
      includeVariables: false,
    },
    capturedAt: at,
    file: { name: 'Native scale', requestedVersion: 'revision-7', returnedVersion: 'revision-7' },
    profile: 'unverified',
    roots: [
      {
        id: '1:2',
        styles: {},
        document: {
          id: '1:2',
          name: 'Primary ramp',
          type: 'FRAME',
          children: [
            {
              id: '1:3',
              name: 'Light',
              type: 'RECTANGLE',
              fills: [{ type: 'SOLID', color: { r: 0.85, g: 0.9, b: 0.95 } }],
            },
            {
              id: '1:4',
              name: 'Dark',
              type: 'RECTANGLE',
              fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 } }],
            },
            {
              id: '1:5',
              name: 'Restriction',
              type: 'TEXT',
              characters: 'Never use gradients in product.',
            },
          ],
        },
      },
    ],
    variables: {
      status: 'not-requested',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {},
      collections: {},
    },
    gaps: [{ scope: 'document', code: 'FIGMA_PROFILE_UNVERIFIED', retryAfterSeconds: null }],
  };
  const inventory = await createFigmaNativeInventory({ ...source, contentHash: hash(source) });
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = [inventory.modes[0].id];
  draft.colors = inventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: 'Primary',
  }));
  draft.profileDecision = {
    captureHash: draft.captureHash,
    interpretation: 'srgb',
    actor,
    decidedAt: at,
  };
  draft.scopeDecision = {
    accepted: true,
    reason: 'Selected brand scale only; source profile interpretation retained.',
  };
  draft.statements[0] = {
    ...draft.statements[0],
    meaning: 'no-gradients',
    scope: 'product',
    reason: 'Applies to product artwork.',
  };
  draft.scales = [
    {
      id: 'scale:primary',
      label: 'Primary',
      family: 'Primary',
      slots: [
        { id: '100', position: 0 },
        { id: '900', position: 2 },
      ],
      modes: [
        {
          modeId: draft.modeIds[0],
          anchors: draft.colors.map((color, i) => ({
            slotId: i === 0 ? '100' : '900',
            declarationId: color.declarationId,
          })),
        },
      ],
      evidenceRefs: draft.colors.map(item => item.declarationId),
    },
  ];
  return { inventory, draft };
}
async function mixedNativeSetup() {
  const { inventory: original, draft: originalDraft } = await setup();
  const { contentHash: _hash, ...source } = original.packet;
  const nativeSource = {
    ...source,
    request: { ...source.request, includeVariables: true },
    variables: {
      status: 'captured',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {
        light: {
          id: 'light',
          name: 'Variable light',
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: { day: { r: 0.85, g: 0.9, b: 0.95, a: 1 } },
        },
        dark: {
          id: 'dark',
          name: 'Variable dark',
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: { day: { r: 0.123456789012345, g: 0.2, b: 0.3, a: 1 } },
        },
      },
      collections: {
        brand: {
          id: 'brand',
          name: 'Brand',
          modes: [{ modeId: 'day', name: 'Day' }],
          defaultModeId: 'day',
        },
      },
    },
  };
  const inventory = await createFigmaNativeInventory({
    ...nativeSource,
    contentHash: hash(nativeSource),
  });
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = inventory.modes.map(item => item.id);
  draft.colors = inventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: 'Primary',
  }));
  draft.profileDecision = { ...originalDraft.profileDecision!, captureHash: draft.captureHash };
  draft.scopeDecision = originalDraft.scopeDecision;
  draft.statements = draft.statements.map(statement => ({
    ...statement,
    meaning: 'no-gradients',
    scope: 'product',
    reason: 'Captured product restriction.',
  }));
  return { inventory, draft };
}
describe('native review and portable project', () => {
  it('groups paints and variables in one family with separate source-bound review claims', async () => {
    const { inventory, draft } = await mixedNativeSetup();
    const review = compileFigmaReview(inventory, draft, actor, at);
    const family = review.model.families[0];
    expect(family.colorIds).toHaveLength(4);
    expect(family.claimIds).toHaveLength(2);
    const claims = review.model.claims.filter(item => family.claimIds.includes(item.id));
    expect(new Set(claims.map(item => item.sourceId)).size).toBe(2);
    for (const claim of claims) {
      expect(claim.status).toBe('inferred');
      expect(claim.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of claim.evidenceRefs)
        expect(review.model.evidence.find(item => item.id === ref)?.sourceId).toBe(claim.sourceId);
    }
    expect(claims.flatMap(item => item.evidenceRefs).sort()).toEqual(
      [...family.evidenceRefs].sort()
    );
    const project = await buildFigmaProject({
      capture: inventory.packet,
      draft,
      review,
      selection: null,
    });
    const opened = await readFigmaProject(JSON.parse(JSON.stringify(project)));
    expect(opened.status).toBe('opened');
    if (opened.status === 'opened') expect(opened.project).toEqual(project);
  });
  it('retains node text alongside variable-scale evidence without assigning it to the variable source', async () => {
    const { inventory, draft } = await mixedNativeSetup();
    const variables = inventory.declarations.filter(item => item.kind === 'variable');
    draft.colors = draft.colors.filter(item =>
      variables.some(variable => variable.id === item.declarationId)
    );
    draft.modeIds = inventory.modes
      .filter(item => item.nativeModeId === 'day')
      .map(item => item.id);
    draft.scales = [
      {
        id: 'scale:variables',
        label: 'Variable scale',
        family: 'Primary',
        slots: [
          { id: '100', position: 0 },
          { id: '900', position: 2 },
        ],
        modes: [
          {
            modeId: draft.modeIds[0],
            anchors: variables.map((item, index) => ({
              slotId: index === 0 ? '100' : '900',
              declarationId: item.id,
            })),
          },
        ],
        evidenceRefs: [...variables.map(item => item.id), draft.statements[0].observationId],
      },
    ];
    const review = compileFigmaReview(inventory, draft, actor, at);
    const scale = review.model.scales[0];
    expect(scale.claimIds).toHaveLength(2);
    const claims = review.model.claims.filter(item => scale.claimIds.includes(item.id));
    expect(new Set(claims.map(item => item.sourceId)).size).toBe(2);
    expect(claims.flatMap(item => item.evidenceRefs).sort()).toEqual(
      [...scale.evidenceRefs].sort()
    );
    for (const claim of claims)
      for (const ref of claim.evidenceRefs)
        expect(review.model.evidence.find(item => item.id === ref)?.sourceId).toBe(claim.sourceId);
    expect(
      review.model.colors.some(
        item => item.valuesByMode[draft.modeIds[0]]?.components.r === 0.123456789012345
      )
    ).toBe(true);
    expect(guidelineOperationIssues(review, 'gradient', 'product', draft.modeIds[0])).toEqual([
      expect.stringContaining('Never use gradients'),
    ]);
  });
  it('keeps a closed palette bound to the available members of each scoped native mode', async () => {
    const { inventory, draft } = await mixedNativeSetup();
    draft.statements[0].meaning = 'closed-palette';
    const review = compileFigmaReview(inventory, draft, actor, at);
    expect(review.model.rules).toHaveLength(2);
    for (const rule of review.model.rules) {
      expect(rule.kind).toBe('palette-membership');
      expect(rule.modeIds).toHaveLength(1);
      if (rule.kind !== 'palette-membership') throw new Error('Expected palette restriction');
      expect(rule.operands.members).toHaveLength(2);
      for (const member of rule.operands.members)
        expect(
          review.model.colors.find(item => item.id === member.id)?.valuesByMode[rule.modeIds[0]]
        ).toBeDefined();
      expect(
        guidelineOperationIssues(review, 'gradient', 'product', rule.modeIds[0]).length
      ).toBeGreaterThan(0);
    }
    draft.statements[0].modeIds = ['figma:captured-paints'];
    const scoped = compileFigmaReview(inventory, draft, actor, at);
    expect(scoped.model.rules).toHaveLength(1);
    expect(scoped.model.rules[0].modeIds).toEqual(['figma:captured-paints']);
    expect(
      guidelineOperationIssues(scoped, 'gradient', 'product', 'figma:captured-paints').length
    ).toBeGreaterThan(0);
    const variableMode = inventory.modes.find(item => item.nativeModeId === 'day')!.id;
    expect(guidelineOperationIssues(scoped, 'gradient', 'product', variableMode)).toEqual([]);
    draft.colors = draft.colors.filter(
      item =>
        inventory.declarations.find(declaration => declaration.id === item.declarationId)?.kind ===
        'variable'
    );
    await expect(
      buildFigmaProject({ capture: inventory.packet, draft, review: null, selection: null })
    ).resolves.toBeDefined();
    expect(() => compileFigmaReview(inventory, draft, actor, at)).toThrow(
      'Each selected mode needs a selected native declaration.'
    );
  });
  it('rejects enum coercion instead of dropping captured restrictions', async () => {
    const { inventory, draft } = await setup();
    for (const field of ['meaning', 'scope'] as const) {
      const altered = structuredClone(draft) as unknown as Record<string, unknown>;
      const statements = altered.statements as Record<string, unknown>[];
      statements[0][field] = [statements[0][field]];
      expect(() => parseFigmaReviewDraft(inventory, altered)).toThrow(
        'Unsupported source statement interpretation'
      );
      await expect(
        buildFigmaProject({
          capture: inventory.packet,
          draft: altered as unknown as typeof draft,
          review: null,
          selection: null,
        })
      ).rejects.toThrow('Unsupported source statement interpretation');
    }
  });
  it('extends a reviewed native source scale without replacing its anchors or qualifications', async () => {
    const { inventory, draft } = await setup();
    const review = compileFigmaReview(inventory, draft, actor, at);
    expect(review.model.sources.every(item => item.status === 'unknown')).toBe(true);
    expect(review.model.coverage.every(item => item.status === 'partial')).toBe(true);
    expect(guidelineOperationIssues(review, 'extend', 'brand')).toEqual([]);
    const result = await previewGuidelineExtension(review, {
      context: 'brand',
      scaleId: 'scale:primary',
      modeId: draft.modeIds[0],
      additions: [{ slotId: '500', position: 1 }],
      lightnessOrder: 'none',
    });
    expect(result.status).toBe('proposed');
    expect(result.generatedBindings).toHaveLength(1);
    for (const color of review.model.colors)
      expect(result.workingModel!.colors.find(item => item.id === color.id)?.valuesByMode).toEqual(
        color.valuesByMode
      );
    const generated = result.workingModel!.colors.filter(
      item => !review.model.colors.some(source => source.id === item.id)
    );
    expect(
      colorSystemValueNoticesV1(
        result.workingModel!,
        generated.map(item => item.id)
      ).join(' ')
    ).toContain('source profile is unverified');
  });
  it('retains the captured restriction and blocks the prohibited scope after review', async () => {
    const { inventory, draft } = await setup();
    const review = compileFigmaReview(inventory, draft, actor, at);
    expect(guidelineOperationIssues(review, 'gradient', 'product')).toEqual([
      expect.stringContaining('Never use gradients'),
    ]);
    expect(guidelineOperationIssues(review, 'gradient', 'brand')).toEqual([]);
    const [first, last] = draft.colors.map(item => item.declarationId);
    expect(() =>
      createGuidelineModeGradient(review, 'product', draft.modeIds[0], first, last, 120)
    ).toThrow();
    expect(
      createGuidelineModeGradient(review, 'brand', draft.modeIds[0], first, last, 120).design.stops
    ).toHaveLength(2);
    expect(
      review.model.evidence.some(item => item.description === 'Never use gradients in product.')
    ).toBe(true);
  });
  it('requires every source statement, explicit scope acceptance and reasons for exclusions', async () => {
    const { inventory, draft } = await setup();
    expect(() => parseFigmaReviewDraft(inventory, { ...draft, statements: [] })).toThrow(
      'cannot be omitted'
    );
    expect(() =>
      compileFigmaReview(
        inventory,
        { ...draft, scopeDecision: { accepted: false, reason: '' } },
        actor,
        at
      )
    ).toThrow('partial evidence');
    expect(() =>
      compileFigmaReview(
        inventory,
        { ...draft, statements: [{ ...draft.statements[0], meaning: 'not-a-rule', reason: '' }] },
        actor,
        at
      )
    ).toThrow('Explain why');
    const pending = compileFigmaReview(
      inventory,
      {
        ...draft,
        statements: [{ ...draft.statements[0], meaning: 'needs-interpretation', scope: 'all' }],
      },
      actor,
      at
    );
    expect(guidelineOperationIssues(pending, 'extend', 'brand').length).toBeGreaterThan(0);
  });
  it('adopts a source relationship through the shared compiler and rejects missing operands', async () => {
    const { inventory, draft } = await setup();
    draft.statements[0] = {
      ...draft.statements[0],
      meaning: 'relationship',
      definition: {
        kind: 'required-partner',
        force: 'requirement',
        operands: {
          subject: [{ kind: 'color', id: draft.colors[0].declarationId }],
          partner: [{ kind: 'family', id: 'Primary' }],
        },
      },
    };
    const review = compileFigmaReview(inventory, draft, actor, at);
    expect(review.model.rules[0].kind).toBe('required-partner');
    expect(review.model.adoptions[0].status).toBe('accepted');
    expect(review.model.rules[0].origin).toBe('inferred');
    draft.statements[0].definition = {
      kind: 'role-binding',
      force: 'requirement',
      operands: {
        role: 'accent',
        presence: 'required',
        members: [{ kind: 'color', id: 'missing' }],
      },
    };
    expect(() => compileFigmaReview(inventory, draft, actor, at)).toThrow('excluded');
  });
  it('does not invent a value for an excluded native mode or scale anchor', async () => {
    const { inventory, draft } = await setup();
    const changed = structuredClone(draft);
    changed.scales[0].modes[0].modeId = 'missing';
    expect(() => parseFigmaReviewDraft(inventory, changed)).toThrow('source modes');
    changed.scales[0].modes[0].modeId = draft.modeIds[0];
    changed.colors.pop();
    expect(() => compileFigmaReview(inventory, changed, actor, at)).toThrow('excluded color');
    expect(() =>
      compileFigmaReview(inventory, { ...draft, profileDecision: null }, actor, at)
    ).toThrow('included value');
  });
  it('reopens the exact selected result and rejects stale decisions, paint and injected fields', async () => {
    const { inventory, draft } = await setup();
    const review = compileFigmaReview(inventory, draft, actor, at);
    const selection = createGuidelineModeGradient(
      review,
      'brand',
      draft.modeIds[0],
      draft.colors[0].declarationId,
      draft.colors[1].declarationId,
      120
    );
    const project = await buildFigmaProject({
      capture: inventory.packet,
      draft,
      review,
      selection,
    });
    const opened = await readFigmaProject(JSON.parse(JSON.stringify(project)));
    expect(opened.status).toBe('opened');
    if (opened.status === 'opened') expect(opened.project).toEqual(project);
    const stale = JSON.parse(JSON.stringify(project));
    stale.draft.colors[0].label = 'Changed label';
    await expect(readFigmaProject(stale)).rejects.toThrow('current decisions');
    const altered = JSON.parse(JSON.stringify(project));
    altered.selection.design.angleDegrees = 5;
    await expect(readFigmaProject(altered)).rejects.toThrow();
    const injected = JSON.parse(JSON.stringify(project));
    injected.review.model.writeToFigma = true;
    await expect(readFigmaProject(injected)).rejects.toThrow();
    expect(await readFigmaProject({ schemaVersion: 'teul.figma-project.v999' })).toEqual({
      status: 'read-only',
      version: 'teul.figma-project.v999',
    });
  });
  it('saves an unfinished draft without manufacturing review or output authority', async () => {
    const { inventory } = await setup();
    const draft = suggestFigmaReview(inventory);
    const project = await buildFigmaProject({
      capture: inventory.packet,
      draft,
      review: null,
      selection: null,
    });
    expect((await readFigmaProject(project)).status).toBe('opened');
    expect(project.review).toBeNull();
    expect(figmaSourceStatements(inventory)).toHaveLength(1);
  });
});
