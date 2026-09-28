// TASK-001 source-to-application feasibility proof. Not a general interpreter or product UI.
// Raw source, provisional decisions and previews remain in the ignored release directory.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [pdfPath = '../release/guideline-proof/katalon.pdf'] = process.argv.slice(2);
const output = resolve('../release/guideline-proof/katalon-application');
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, 'receipt.json'),
  JSON.stringify({ status: 'running', startedAt: new Date().toISOString() })
);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const load = file => server.ssrLoadModule(`/@fs/${resolve('../src/lib', file)}`);
const escape = text =>
  String(text).replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]
  );
try {
  const start = performance.now();
  const { openGuidelinePdf, capturePdfPages } = await server.ssrLoadModule(
    '/src/lib/guideline/pdf.ts'
  );
  const { buildColorSystemModelV1, buildColorSystemRuleAdoptionsV1 } =
    await load('colorSystemModelV1.ts');
  const { buildColorSystemSrgbValueV1, colorSystemSrgbToCssV1 } = await load(
    'colorSystemSrgbValueV1.ts'
  );
  const { hexToRgb } = await load('utils.ts');
  const { canonicalJson, deterministicContentHash } = await load('colorSystemHashing.ts');
  const { buildColorSystemProposalV1 } = await load('colorSystemProposalV1.ts');
  const { buildColorSystemConstructionProposalV1 } = await load(
    'colorSystemConstructionProposalV1.ts'
  );
  const { executeColorSystemAuthoringDirectionV1 } = await load(
    'colorSystemAuthoringExecutionV1.ts'
  );
  const { buildColorSystemApplicationRequirementsV1, compileColorSystemApplicationRequirementsV1 } =
    await load('colorSystemApplicationRequirementsV1.ts');
  const { compileColorSystemRelationshipsV1 } = await load('colorSystemRelationshipsV1.ts');
  const {
    measureColorSystemApplicationGeometryBoardsV1,
    assessColorSystemApplicationGeometryV1,
    hashColorSystemGeometryApplicationsV1,
  } = await load('colorSystemApplicationGeometryV1.ts');
  const { suggestGuidelineReview, compileGuidelineReview, guidelineOperationIssues } =
    await server.ssrLoadModule('/src/lib/guideline/review.ts');
  const hash = input => deterministicContentHash(canonicalJson(input));
  const pdf = await openGuidelinePdf(
    new Uint8Array(await readFile(resolve(pdfPath))),
    'Katalon Brand Guidelines'
  );
  let capture;
  try {
    assert.equal(
      pdf.sha256,
      'sha256:b2643fb178108c0dde036c851cc9bcd6a6c1c3e62e4d851d4d01099a292a085d',
      'Fixture revision changed; inspect before updating the interpretation.'
    );
    capture = await capturePdfPages(pdf, [7, 8, 9, 10, 11, 12]);
  } finally {
    await pdf.close();
  }
  const observations = capture.observations;
  const byId = new Map(observations.map(item => [item.id, item]));
  const refs = new Set();
  const selectText = (page, index) => {
    const item = byId.get(`pdf:b2643fb178108c0d:${page}:${index}:text`);
    assert.equal(item?.kind, 'text');
    refs.add(item.id);
    return item.id;
  };
  const familySpecs = [
    { id: 'slate', name: 'Blue Slate', page: 8, x: 664, firstY: 540, primary: '#43509B' },
    { id: 'lilac', name: 'Luminous Lilac', page: 8, x: 1281, firstY: 540, primary: '#5959EB' },
    { id: 'forest', name: 'Forest Forward', page: 9, x: 1533, firstY: 680, primary: '#0F8461' },
  ];
  const sourceId = 'source:katalon';
  const colors = [];
  function sourceColor(id, label, observation, labelRef) {
    assert.equal(observation?.kind, 'color');
    refs.add(observation.id);
    observation.evidenceRefs.forEach(ref => refs.add(ref));
    if (labelRef) refs.add(labelRef);
    const channels = hexToRgb(observation.value);
    return {
      id,
      label,
      sourceId,
      valuesByMode: {
        Source: buildColorSystemSrgbValueV1({
          r: channels.r / 255,
          g: channels.g / 255,
          b: channels.b / 255,
        }),
      },
      evidenceRefs: [observation.id, ...(labelRef ? [labelRef] : [])],
      claimIds: [],
    };
  }
  // This geometry association is fixture-specific and manually inspected. It is not a learned extractor.
  for (const spec of familySpecs) {
    for (let step = 100; step <= 900; step += 100) {
      const label = observations.find(
        item =>
          item.kind === 'text' &&
          item.text === `${spec.name} ${step}` &&
          item.locator.page === spec.page &&
          Math.abs(item.locator.bounds[0] - spec.x) < 2 &&
          item.locator.bounds[1] > spec.firstY
      );
      assert.ok(label, `Missing reviewed label ${spec.name} ${step}`);
      const matches = observations.filter(
        item =>
          item.kind === 'color' &&
          item.locator.page === spec.page &&
          item.locator.bounds[0] > spec.x &&
          item.locator.bounds[0] < spec.x + 500 &&
          Math.abs(item.locator.bounds[1] - label.locator.bounds[1]) < 5
      );
      assert.equal(matches.length, 1, `Ambiguous numeric association ${label.text}`);
      if (step === 600) assert.equal(matches[0].value, spec.primary);
      colors.push(sourceColor(`${spec.id}:${step}`, label.text, matches[0], label.id));
    }
  }
  for (const [id, value] of [
    ['white', '#FFFFFF'],
    ['black', '#000000'],
  ]) {
    colors.push(
      sourceColor(
        id,
        id,
        observations.find(
          item => item.kind === 'color' && item.locator.page === 10 && item.value === value
        )
      )
    );
  }
  const partnerEvidence = [15, 16, 17, 18, 19].map(i => selectText(8, i));
  const forestEvidence = [12, 13, 14, 15, 16].map(i => selectText(9, i));
  const dominanceEvidence = [8, 9, 10, 11].map(i => selectText(7, i));
  const gradientEvidence = [selectText(7, 4)];
  const ctaEvidence = [8, 9, 10, 11].map(i => selectText(9, i));
  const backgroundEvidence = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52].map(i =>
    selectText(11, i)
  );
  const rule = (id, label, kind, force, contextIds, evidenceRefs, operands) => ({
    id,
    label,
    kind,
    force,
    contextIds,
    modeIds: ['Source'],
    origin: 'inferred',
    evidenceRefs,
    claimIds: [`claim:${id}`],
    operands,
  });
  const rules = [
    ...familySpecs.map(spec =>
      rule(
        `partner:${spec.id}`,
        `Shades of ${spec.name} retain its primary in the composition`,
        'required-partner',
        'requirement',
        ['brand', 'product'],
        spec.id === 'forest' ? forestEvidence : partnerEvidence,
        {
          subject: [{ kind: 'family', id: spec.id }],
          partner: [{ kind: 'color', id: `${spec.id}:600` }],
        }
      )
    ),
    rule(
      'dominance',
      'Blue Slate is more prominent than Luminous Lilac',
      'prominence',
      'requirement',
      ['brand'],
      dominanceEvidence,
      {
        kind: 'ordered-groups',
        groups: [[{ kind: 'family', id: 'slate' }], [{ kind: 'family', id: 'lilac' }]],
      }
    ),
    rule(
      'cta',
      'Forest Forward for calls to action',
      'role-binding',
      'preference',
      ['product'],
      ctaEvidence,
      { role: 'action', members: [{ kind: 'family', id: 'forest' }], presence: 'if-present' }
    ),
    rule(
      'background',
      'Avoid black backgrounds',
      'role-binding',
      'prohibition',
      ['brand', 'product'],
      backgroundEvidence,
      { role: 'ground', members: [{ kind: 'color', id: 'black' }], presence: 'if-present' }
    ),
  ];
  const actor = { kind: 'agent', ref: 'task001:manual-source-review' };
  const input = {
    schemaVersion: 'teul.color-system-model.v1',
    sources: [
      {
        id: sourceId,
        label: capture.identity.label,
        sourceHash: capture.identity.sha256,
        version: null,
        locator: 'https://katalon.com/hubfs/Brand%20Guidelines.pdf',
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [...refs].map(id => {
      const item = byId.get(id);
      return {
        id,
        sourceId,
        locator: canonicalJson(item.locator),
        status: 'observed',
        description: item.kind === 'text' ? item.text : item.literal,
      };
    }),
    coverage: [
      {
        sourceId,
        status: 'partial',
        evidenceRefs: [...refs],
        unresolvedClaimIds: ['claim:gradient-ban'],
        note: 'Manual agent interpretation for a development proof. Three of six chromatic families and white/black; pages7–12 only. Product scope and interpolation permission are provisional interpretations, not brand-owner decisions. Palette proportions are treated as an illustrative hierarchy, not mandatory ratios.',
      },
    ],
    claims: [
      ...rules.map(item => ({
        id: `claim:${item.id}`,
        sourceId,
        text: item.label,
        status: 'inferred',
        evidenceRefs: item.evidenceRefs,
        contextIds: item.contextIds,
        ruleIds: [item.id],
        modeIds: ['Source'],
      })),
      {
        id: 'claim:gradient-ban',
        sourceId,
        text: 'No gradients in the brand',
        status: 'unsupported',
        evidenceRefs: gradientEvidence,
        contextIds: ['gradient:brand', 'gradient:product'],
        ruleIds: [],
        modeIds: ['Source'],
      },
    ],
    modes: [{ id: 'Source', label: 'Source values; no dark mode asserted' }],
    colors,
    families: familySpecs.map(spec => ({
      id: spec.id,
      label: spec.name,
      colorIds: colors.filter(color => color.id.startsWith(`${spec.id}:`)).map(color => color.id),
      evidenceRefs: [],
      claimIds: [],
    })),
    scales: familySpecs.map(spec => ({
      id: `scale:${spec.id}`,
      familyId: spec.id,
      label: spec.name,
      slots: Array.from({ length: 9 }, (_, i) => ({
        id: `step:${(i + 1) * 100}`,
        position: (i + 1) * 100,
      })),
      modes: [
        {
          modeId: 'Source',
          anchors: Array.from({ length: 9 }, (_, i) => ({
            slotId: `step:${(i + 1) * 100}`,
            colorId: `${spec.id}:${(i + 1) * 100}`,
          })),
        },
      ],
      evidenceRefs: [],
      claimIds: [],
    })),
    contexts: ['product', 'brand', 'gradient:brand', 'gradient:product'].map(id => ({
      id,
      label: id,
      modeIds: ['Source'],
      evidenceRefs: [],
      claimIds: [],
    })),
    brandConstraintsByContext: [],
    rules,
    adoptions: [],
    conflicts: [],
  };
  input.adoptions = buildColorSystemRuleAdoptionsV1(
    input,
    rules.map(item => ({
      ruleId: item.id,
      status: 'accepted',
      actor,
      authorityRef: 'task001:provisional-source-reading',
      decisionRef: hash([capture.captureHash, item]),
    }))
  );
  const source = buildColorSystemModelV1(input);
  const run = { isCancelled: () => false, yield: async () => {} };
  const pair = (foregroundUseId, backgroundUseId, minimum = 4.5, assessment = 'required') => ({
    id: `${foregroundUseId}/${backgroundUseId}`,
    foregroundUseId,
    backgroundUseId,
    contrast: { minimum, assessment },
  });
  const use = (id, area) => ({ id, role: id, ...(area === undefined ? {} : { area }) });
  const brandRects = [
    { id: 'primary', x: 40, y: 50, width: 300, height: 160 },
    { id: 'secondary', x: 370, y: 50, width: 180, height: 80 },
    { id: 'progress-a', x: 370, y: 160, width: 140, height: 50 },
    { id: 'progress-b', x: 580, y: 140, width: 90, height: 70 },
  ];
  const brandBoards = [
    {
      applicationId: 'brand',
      width: 800,
      height: 260,
      root: {
        id: 'canvas',
        useId: 'ground',
        shape: { kind: 'rect', x: 0, y: 0, width: 800, height: 260 },
        children: brandRects.map(({ id, ...shape }) => ({
          id,
          useId: id,
          shape: { kind: 'rect', ...shape },
          children: [],
        })),
      },
    },
  ];
  const measuredBrand = measureColorSystemApplicationGeometryBoardsV1(brandBoards);
  const requirementsFor = context =>
    buildColorSystemApplicationRequirementsV1({
      schemaVersion: 'teul.application-requirements.v1',
      distinctions: [],
      templates:
        context === 'product'
          ? ['rest', 'hover', 'pressed', 'focus', 'disabled'].map(state => ({
              id: state,
              contextId: 'product',
              modeId: 'Source',
              uses: [
                'ground',
                'heading',
                'action',
                'label',
                'primary',
                ...(state === 'focus' ? ['focus-ring'] : []),
              ].map(id => use(id)),
              pairs: [
                pair('heading', 'ground'),
                pair('primary', 'ground', 4.5),
                pair('label', 'action', 4.5, state === 'disabled' ? 'inactive-exempt' : 'required'),
                pair('action', 'ground', 3, state === 'disabled' ? 'inactive-exempt' : 'required'),
                ...(state === 'focus' ? [pair('focus-ring', 'ground', 3)] : []),
              ],
            }))
          : [
              {
                id: 'brand',
                contextId: 'brand',
                modeId: 'Source',
                uses: measuredBrand.areas.map(item => use(item.useId, item.area)),
                pairs: [
                  pair('primary', 'ground', 3, 'advisory'),
                  pair('secondary', 'ground', 3, 'advisory'),
                  pair('progress-a', 'ground', 3, 'advisory'),
                  pair('progress-b', 'ground', 3, 'advisory'),
                ],
              },
            ],
    });
  async function direction(context) {
    const familyId = context === 'product' ? 'forest' : 'slate';
    const scaleId = `scale:${familyId}`;
    const newSteps = context === 'product' ? [650, 750] : [250, 550];
    const sourceScale = source.scales.find(item => item.id === scaleId);
    const brief = {
      briefHash: hash({ context, familyId, newSteps, source: source.modelHash }),
      operation: 'extend',
      contextIds: [context],
      modeIds: ['Source'],
      permissions: {
        addColors: true,
        addFamilies: false,
        addScales: false,
        addRules: false,
        editFamilyIds: [familyId],
        editScaleIds: [scaleId],
        replaceRuleIds: [],
      },
    };
    const structureProposal = {
      version: 'teul.color-system-proposal.v1',
      id: `structure:${context}`,
      sourceModelHash: source.modelHash,
      brief,
      derivation: {
        algorithmId: 'task001:authored-midpoints',
        algorithmVersion: '1',
        policyHash: hash('Preserve every source slot; fill only explicit interior positions'),
        inputHash: hash(newSteps),
        sourceColorIds: sourceScale.modes[0].anchors.map(a => a.colorId),
        sourceScaleIds: [scaleId],
      },
      colors: [],
      families: [],
      scales: [
        {
          id: scaleId,
          familyId,
          label: sourceScale.label,
          slots: [
            ...sourceScale.slots,
            ...newSteps.map(position => ({ id: `step:${position}`, position })),
          ].sort((a, b) => a.position - b.position),
          modes: sourceScale.modes,
        },
      ],
      rules: [],
      exceptions: [],
    };
    const structure = buildColorSystemProposalV1(source, structureProposal);
    const constructionBrief = {
      schemaVersion: 'teul.scale-construction-brief.v1',
      modelHash: structure.workingModel.modelHash,
      contextId: context,
      changeMode: 'extend',
      decision: {
        actor,
        authorityRef: 'task001:proposed-intermediate-shades',
        decisionRef: hash(brief),
      },
      scales: [
        {
          scaleId,
          modeId: 'Source',
          requiredSlotIds: structureProposal.scales[0].slots.map(slot => slot.id),
          fillSlotIds: newSteps.map(step => `step:${step}`),
          lightnessOrder: 'decreasing',
          endpoints: [],
        },
      ],
    };
    const intent = {
      version: 'teul.construction-proposal.v1',
      id: `extension:${context}`,
      sourceModelHash: source.modelHash,
      brief,
    };
    const generation = {
      kind: 'construction',
      brief: constructionBrief,
      intent,
      structureProposal,
    };
    const preview = await buildColorSystemConstructionProposalV1(
      source,
      constructionBrief,
      intent,
      run,
      structureProposal
    );
    assert.equal(preview.status, 'proposed');
    assert.equal(preview.generatedBindings.length, 2);
    const generated = (requestedScale, step) => {
      const binding = preview.generatedBindings.find(
        item => item.scaleId === requestedScale && item.slotId === `step:${step}`
      );
      assert.ok(binding, 'Requested generated binding is missing');
      return binding.colorId;
    };
    const requirements = requirementsFor(context);
    const assignments = requirements.templates.flatMap(template => {
      const paints =
        context === 'product'
          ? {
              ground: 'white',
              heading: 'black',
              primary: 'forest:600',
              'focus-ring': 'forest:900',
              action:
                template.id === 'hover'
                  ? generated(scaleId, 650)
                  : template.id === 'pressed'
                    ? generated(scaleId, 750)
                    : template.id === 'disabled'
                      ? 'forest:200'
                      : 'forest:600',
              label: template.id === 'disabled' ? 'forest:900' : 'white',
            }
          : {
              ground: 'white',
              heading: 'black',
              primary: 'slate:600',
              secondary: 'lilac:600',
              'progress-a': generated(scaleId, 250),
              'progress-b': generated(scaleId, 550),
            };
      return template.uses.map(item => ({
        applicationId: template.id,
        useId: item.id,
        colorId: paints[item.id],
      }));
    });
    const request = {
      version: 'teul.authoring-direction.v1',
      id: `katalon:${context}`,
      generation,
      requirements,
      composition: {
        version: 'teul.model-composition.v1',
        modelBinding: 'generated-model',
        requirementsHash: hash(requirements),
        maximumNodes: 128,
        maximumSolutions: 1,
        groups: [{ id: 'actual-applications', options: [{ id: 'proposed', assignments }] }],
      },
      units: [
        {
          id: `unit:${context}`,
          contextId: context,
          familyId,
          scaleId,
          prominence: context === 'brand' ? 'leading' : 'accent',
          jobs: [context === 'brand' ? 'brand-primary' : 'product-semantics'],
          anchors: [{ modeId: 'Source', colorId: `${familyId}:600` }],
        },
      ],
      provisionalRuleReview: {
        version: 'teul.provisional-source-rule-review.v1',
        sourceModelHash: source.modelHash,
        generationRequestHash: hash(generation),
        briefContractHash: hash(brief),
        decisionScope: 'whole-source-predicates',
        contextIds: [context],
        modeIds: ['Source'],
        ruleIds: source.rules
          .filter(item => item.contextIds.includes(context))
          .map(item => item.id),
        actor,
        authorityRef: 'task001:provisional-unchanged-predicates',
        decisionRef: hash([context, generation]),
      },
    };
    const result = await executeColorSystemAuthoringDirectionV1(source, request, run);
    if (result.status !== 'ready')
      console.log(
        JSON.stringify(
          {
            context,
            status: result.status,
            diagnostics: result.diagnostics,
            composition: result.composition,
            assessments: result.assessments,
          },
          null,
          2
        )
      );
    assert.equal(result.status, 'ready');
    const candidate = result.candidates[0];
    for (const color of source.colors)
      assert.deepEqual(
        color.valuesByMode.Source,
        candidate.proposal.workingModel.colors.find(item => item.id === color.id).valuesByMode
          .Source
      );
    for (const scale of source.scales) {
      const actual = candidate.proposal.workingModel.scales.find(item => item.id === scale.id);
      for (const slot of scale.slots)
        assert.deepEqual(
          actual.slots.find(item => item.id === slot.id),
          slot
        );
      for (const anchor of scale.modes[0].anchors)
        assert.deepEqual(
          actual.modes[0].anchors.find(item => item.slotId === anchor.slotId),
          anchor
        );
    }
    const apps = candidate.applications.applications.map(item => item.application);
    // Removing the primary from an actual hover state must fail even with rest shown elsewhere.
    const mutation = structuredClone(apps);
    const target = mutation.find(item => item.id === (context === 'product' ? 'hover' : 'brand'));
    target.uses.find(item => item.id === 'primary').colorId = 'white';
    const rejected = compileColorSystemApplicationRequirementsV1(
      candidate.proposal.workingModel,
      requirements
    ).evaluate(mutation);
    assert.equal(rejected.eligible, false);
    assert.ok(
      rejected.applications.some(item =>
        item.rules.some(rule => rule.kind === 'required-partner' && rule.status === 'fail')
      )
    );
    let geometry = null;
    let dominanceRejected = null;
    if (context === 'brand') {
      geometry = assessColorSystemApplicationGeometryV1(candidate.proposal.workingModel, apps, {
        version: 'teul.application-geometry.v1',
        modelHash: candidate.proposal.workingModel.modelHash,
        applicationsHash: hashColorSystemGeometryApplicationsV1(apps),
        boards: brandBoards,
      });
      const dominantLilac = structuredClone(apps[0]);
      dominantLilac.uses.find(item => item.id === 'secondary').area = 100000;
      dominanceRejected = compileColorSystemRelationshipsV1(
        candidate.proposal.workingModel
      ).evaluate(dominantLilac);
      assert.equal(dominanceRejected.eligible, false);
      assert.ok(
        dominanceRejected.rules.some(item => item.ruleId === 'dominance' && item.status === 'fail')
      );
    }
    const pendingRequest = structuredClone(request);
    delete pendingRequest.provisionalRuleReview;
    const pending = await executeColorSystemAuthoringDirectionV1(source, pendingRequest, run);
    assert.equal(pending.status, 'blocked');
    assert.ok(pending.diagnostics.some(item => item.code === 'SOURCE_RULE_REVIEW_REQUIRED'));
    return {
      request,
      result,
      negative: rejected,
      geometry,
      dominanceRejected,
      pendingRuleReview: pending,
    };
  }
  const product = await direction('product');
  const brand = await direction('brand');
  const impossibleRequest = structuredClone(product.request);
  for (const template of impossibleRequest.requirements.templates) {
    for (const pair of template.pairs)
      if (pair.foregroundUseId === 'label' && pair.contrast.assessment === 'required')
        pair.contrast.minimum = 21;
  }
  impossibleRequest.composition.requirementsHash = hash(impossibleRequest.requirements);
  const impossible = await executeColorSystemAuthoringDirectionV1(source, impossibleRequest, run);
  assert.equal(impossible.status, 'infeasible');
  assert.equal(impossible.candidates.length, 0);
  const banned = compileColorSystemRelationshipsV1(source).evaluate({
    id: 'blocked-gradient',
    contextId: 'gradient:brand',
    modeId: 'Source',
    uses: [
      { id: 'first', role: 'gradient-stop', colorId: 'slate:600' },
      { id: 'last', role: 'gradient-stop', colorId: 'lilac:600' },
    ],
    pairs: [],
  });
  assert.equal(banned.eligible, false);
  assert.ok(banned.unresolvedClaimIds.includes('claim:gradient-ban'));
  // Exercise the current UI preflight too, without pretending it has the richer manual interpretation.
  const draft = suggestGuidelineReview(capture);
  const ban = draft.rules.find(item => item.observationId === gradientEvidence[0]);
  assert.ok(ban);
  ban.meaning = 'no-gradients';
  ban.scope = 'all';
  const reviewed = compileGuidelineReview(capture, draft, actor);
  const banClaim = reviewed.model.claims.find(item =>
    item.evidenceRefs.includes(gradientEvidence[0])
  );
  assert.ok(banClaim);
  assert.deepEqual(banClaim.contextIds, ['gradient:brand', 'gradient:product']);
  assert.ok(
    guidelineOperationIssues(reviewed, 'gradient', 'brand').includes(
      `Review required: ${banClaim.text}`
    )
  );
  const cssFor = (proof, applicationId, useId) => {
    const candidate = proof.result.candidates[0];
    const app = candidate.applications.applications.find(
      item => item.application.id === applicationId
    ).application;
    const colorId = app.uses.find(item => item.id === useId).colorId;
    return colorSystemSrgbToCssV1(
      candidate.proposal.workingModel.colors.find(item => item.id === colorId).valuesByMode.Source
    );
  };
  const p = (state, role) => cssFor(product, state, role);
  const b = role => cssFor(brand, 'brand', role);
  const cards = ['rest', 'hover', 'pressed', 'focus', 'disabled']
    .map(
      state =>
        `<article><p class="state">${state}</p><div class="card" style="color:${p(state, 'heading')};background:${p(state, 'ground')}"><span class="status" style="color:${p(state, 'primary')}">● Ready to run</span><h2>Checkout flow</h2><p>12 checks · Last run passed</p><button ${state === 'disabled' ? 'disabled' : ''} style="background:${p(state, 'action')};color:${p(state, 'label')};${state === 'focus' ? `outline:3px solid ${p(state, 'focus-ring')};outline-offset:3px` : ''}">Run test</button></div></article>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="260" viewBox="0 0 800 260"><title>Blue Slate leads with Luminous Lilac and two proposed shades</title><rect width="800" height="260" fill="${b('ground')}"/>${brandRects.map(rect => `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${b(rect.id)}"/>`).join('')}</svg>`;
  const sourceSteps = familySpecs
    .map(
      spec =>
        `<section><h3>${escape(spec.name)} · nine unchanged source steps</h3><div class="swatches">${source.colors
          .filter(color => color.id.startsWith(`${spec.id}:`))
          .map(
            color =>
              `<div><span style="background:${colorSystemSrgbToCssV1(color.valuesByMode.Source)}"></span><small>${color.id.split(':')[1]}</small></div>`
          )
          .join('')}</div></section>`
    )
    .join('');
  const receipts = [product, brand].map(proof => ({
    id: proof.result.id,
    status: proof.result.status,
    qualified: proof.result.qualified,
    receiptHash: proof.result.receipt.receiptHash,
    sourceAnchorsPreserved: 29,
    sourceScaleStepsPreserved: 27,
    generatedColors: proof.result.generation.result.generatedBindings.length,
    requiredPairs: proof.result.candidates[0].applications.applications
      .flatMap(item => item.pairs)
      .filter(item => item.assessment === 'required').length,
    primaryRemovalRejected: !proof.negative.eligible,
  }));
  const summary = {
    status: 'passed',
    infeasibleBriefRejected: true,
    version: 'teul.guideline-application-proof.v1',
    sourceHash: capture.identity.sha256,
    captureHash: capture.captureHash,
    sourceModelHash: source.modelHash,
    durationMs: Math.round(performance.now() - start),
    receipts,
    gradientBanPreserved: true,
    limitations: [
      'Manual agent interpretation; not assisted-reading proof or human acceptance.',
      'Proposed interpolation permission, not brand-owner approval.',
      'One public development fixture; no held-out quality claim.',
      'No dark mode invented.',
      'Direct engine construction; this harness does not exercise Studio review controls.',
      'SVG is a portable proof; native Figma destination untested.',
    ],
  };
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guideline to application proof</title><style>body{margin:0;padding:48px;background:#f5f5f3;color:#202020;font:16px/1.5 Arial,sans-serif}main{max-width:1180px;margin:auto}h1{font-size:36px;line-height:1.1}h2{font-size:20px;margin:16px 0 4px}h3{font-size:16px}header p{max-width:760px}.eyebrow,.state{font-size:12px;letter-spacing:.08em;text-transform:uppercase}.cards{display:flex;gap:16px;flex-wrap:wrap}.cards article{flex:1;min-width:195px}.card{padding:24px;border-radius:12px;box-shadow:0 0 0 1px #dededb}.card p{font-size:13px}.status{font-size:13px}button{border:0;border-radius:6px;min-height:40px;padding:10px 20px;font:600 14px Arial;margin-top:12px}.composition{margin:40px 0}.composition svg{max-width:100%;height:auto}.swatches{display:flex;gap:6px;max-width:720px}.swatches>div{flex:1}.swatches span{display:block;height:48px}.swatches small{display:block;margin-top:5px;font-size:11px}footer{margin-top:40px;font-size:13px}code{overflow-wrap:anywhere}@media(max-width:600px){body{padding:24px}.cards article{min-width:100%}}</style><main><header><p class="eyebrow">Teul · Development proof · Agent interpretation</p><h1>Keep the system. Add what is missing.</h1><p>Katalon’s source colors stay exact. Two intermediate Forest Forward shades supply hover and pressed states. Two Blue Slate shades support a brand composition. Each state keeps its primary color visible. These are proposals awaiting designer review.</p></header><section><h2>Product states</h2><div class="cards">${cards}</div></section><section class="composition"><h2>Brand composition</h2><p>Source Blue Slate leads. Source Luminous Lilac supports it. The two smaller Blue Slate shapes use proposed shades.</p>${svg}</section>${sourceSteps}<footer><p>29 exact source colors preserved. 27 authored scale steps preserved. Four additions across two applications. Removing the primary from the hover state or brand composition fails the source rule. Gradient requests remain blocked.</p><p>This is a construction and rule-enforcement proof. Visual quality, source interpretation, product permission and native Figma delivery are not human-approved.</p><p>Source: <a href="https://katalon.com/hubfs/Brand%20Guidelines.pdf">Katalon Brand Guidelines</a>, pages 7–12.</p></footer></main></html>`;
  await mkdir(output, { recursive: true });
  for (const [name, value] of Object.entries({ capture, source, product, brand, impossible }))
    await writeFile(resolve(output, `${name}.json`), JSON.stringify(value, null, 2));
  await writeFile(resolve(output, 'preview.html'), html);
  await writeFile(resolve(output, 'brand-composition.svg'), svg);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(resolve(output, 'preview.html')).href);
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    const paints = await page.locator('.card').evaluateAll(nodes => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const pixel = color => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      return nodes.map(node => {
        const button = node.querySelector('button');
        return {
          ground: pixel(getComputedStyle(node).backgroundColor),
          heading: pixel(getComputedStyle(node.querySelector('h2')).color),
          primary: pixel(getComputedStyle(node.querySelector('.status')).color),
          action: pixel(getComputedStyle(button).backgroundColor),
          label: pixel(getComputedStyle(button).color),
          'focus-ring': pixel(getComputedStyle(button).outlineColor),
          disabled: button.disabled,
        };
      });
    });
    const candidate = product.result.candidates[0];
    for (const [index, state] of ['rest', 'hover', 'pressed', 'focus', 'disabled'].entries()) {
      const application = candidate.applications.applications.find(
        item => item.application.id === state
      ).application;
      for (const { id: role } of application.uses) {
        const colorId = application.uses.find(item => item.id === role).colorId;
        const value = candidate.proposal.workingModel.colors.find(item => item.id === colorId)
          .valuesByMode.Source;
        assert.ok(
          ['r', 'g', 'b'].every(
            (channel, i) =>
              Math.abs(Math.round(value.components[channel] * 255) - paints[index][role][i]) <= 1
          ),
          'Computed role paint must match assessed native paint.'
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    assert.deepEqual(errors, []);
    summary.browser = {
      computedProductRolePaintsMatch: true,
      mobileOverflow: false,
      errors,
      limits:
        'CSS computed colors read back through a canvas; screenshots captured and inspected separately. SVG source shares measured geometry and assessed paints; destination rendering is not qualified.',
    };
  } finally {
    await browser.close();
  }
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, output }, null, 2));
} catch (error) {
  await writeFile(
    resolve(output, 'receipt.json'),
    JSON.stringify(
      { status: 'failed', error: error instanceof Error ? error.message : 'Unknown failure' },
      null,
      2
    )
  );
  throw error;
} finally {
  await server.close();
}
