import { describe, expect, it } from 'vitest';
import {
  colorSystemFamilyAnchorHexV2,
  colorSystemFamilyAnchorValueV2,
  composeColorSystemApplicationBlueprintV2,
} from '../colorSystemApplicationComposerV2';
import { composeColorSystemSectionBlueprintV2 } from '../colorSystemSectionComposerV2';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
  type ColorSystemBuilderReadyDirectionV2,
} from '../colorSystemBuilderOrchestratorV2';
import { validateColorSystemBuilderV2PluginMessage } from '../colorSystemBuilderV2MessageValidation';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type GenericColorValueV2,
} from '../colorSystemGenericSourceAdapterV2';
import {
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  type GenericConfirmedSectionDecisionV2,
} from '../colorSystemGenericIntentPolicyV2';
import { compileColorSystemGenericPolicyHandoffV2 } from '../colorSystemGenericPolicyHandoffV2';
import {
  assertColorSystemReviewModelV2Integrity,
  buildColorSystemReviewModelV2,
} from '../colorSystemReviewModelV2';
import { COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3 } from '../colorSystemSecondaryStrategyV3';
import {
  CMYK_UNPROFILED_DISCLAIMER,
  COLOR_SYSTEM_PROPORTION_RULE_V3,
  COLOR_SYSTEM_SURFACES_V3,
  HERO_DISCIPLINE_STATEMENT_V3,
  surfacesForJobs,
} from '../colorSystemSurfaceAdvisoriesV3';
import {
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2, // p4-DE
  COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2,
  colorSystemReviewChartOrderFactV2,
  colorSystemReviewSurfacesFactV2,
} from '../colorSystemApplicationBlueprintV2';
import { colorSystemBrandFamilyIdV2 } from '../colorSystemApplicationComposerV2';
// p3-J: a brand that records its grounds and a six-color chart order by name.
import recordedGroundsFixture from '../../../fixtures/color-builder/recorded-grounds-v2/kestrel.json';

const channel = (value: number): number => value / 255;

function color(red: number, green: number, blue: number): GenericColorValueV2 {
  return {
    colorSpace: 'srgb',
    components: [channel(red), channel(green), channel(blue)],
    alpha: 1,
  };
}

function variable(
  variableId: string,
  name: string,
  light: GenericColorValueV2,
  dark: GenericColorValueV2,
  scopes: readonly string[]
) {
  return {
    variableId,
    name,
    description: name,
    collectionId: 'collection:colors',
    scopes: [...scopes],
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color' as const, value: light },
        resolution: 'literal' as const,
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color' as const, value: dark },
        resolution: 'literal' as const,
      },
    ],
    evidenceIds: ['evidence:variables'],
  };
}

/** The generic builder's minimum source: a chromatic Primary and two exact neutrals in Light and Dark. */
function sourceInput(): ColorSystemGenericSourceSnapshotInputV2 {
  return {
    capturedAt: '2026-08-21T13:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page:colors'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: 'srgb',
    collections: [
      {
        collectionId: 'collection:colors',
        name: 'Colors',
        defaultModeId: 'mode:light',
        modes: [
          { collectionId: 'collection:colors', modeId: 'mode:light', name: 'Light', order: 1 },
          { collectionId: 'collection:colors', modeId: 'mode:dark', name: 'Dark', order: 2 },
        ],
      },
    ],
    variables: [
      variable(
        'variable:brand-primary',
        'Primary / Brand',
        color(51, 102, 204),
        color(102, 153, 255),
        ['ALL_FILLS']
      ),
      variable('variable:text-ink', 'Text / Ink', color(0, 0, 0), color(255, 255, 255), [
        'TEXT_FILL',
      ]),
      variable('variable:text-surface', 'Text / Surface', color(255, 255, 255), color(0, 0, 0), [
        'ALL_FILLS',
      ]),
    ],
    paintStyles: [],
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [
      {
        evidenceId: 'evidence:variables',
        kind: 'figma-resource',
        locator: 'figma://local-variables',
      },
    ],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'No remote library values were imported.',
    scannedNodeCount: 1,
    cancelled: false,
    partial: false,
  };
}

function orchestrate(source: ColorSystemGenericSourceSnapshotInputV2 = sourceInput()) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(source);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const sectionDecisions = proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition: section.disposition,
    jobs: section.jobs,
    sourceRefIds: section.sourceRefIds,
    status: 'owner-confirmed' as const,
    evidenceIds: [`owner-decision:${section.role}`],
  })) as GenericConfirmedSectionDecisionV2[];
  const displayedPlan = {
    kind: 'generic-plan-wire',
    sections: proposal.sections,
    generationPolicyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
    contributionIds: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  };
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ownerEditedRoles: [],
    generatedPolarity: {
      policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
      negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
      positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
      status: 'owner-confirmed' as const,
      evidenceIds: ['owner-decision:generated-diverging-polarity'],
    },
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-08-21T14:00:00.000Z',
  });
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  const input = buildColorSystemGenericBuilderOrchestratorV2Input(
    snapshot,
    proposal,
    confirmation,
    handoff,
    {
      application: {
        applicationMode: 'Light',
        surfaceContext: 'light',
        categoricalMarkCount: 5,
        sequentialMarkCount: 5,
        divergingMarkCount: 3,
      },
    }
  );
  const result = buildColorSystemGenericBuilderOrchestratorV2(input);
  const ready = result.directions.filter(
    (direction): direction is ColorSystemBuilderReadyDirectionV2 => direction.status === 'ready'
  );
  if (!result.brief || ready.length === 0) {
    throw new Error(`No ready direction: ${JSON.stringify(result.blockers)}`);
  }
  return { result, brief: result.brief, ready };
}

const fixture = orchestrate();

describe('ColorSystemReviewModelV2 measured review fields', () => {
  it('projects only requested modes without altering the complete source and candidate', () => {
    const direction = fixture.ready[0];
    const before = canonicalJson({ brief: fixture.brief, candidate: direction.candidate });
    const composed = composeColorSystemApplicationBlueprintV2(fixture.brief, direction.candidate, {
      modes: ['Light'],
      applicationMode: 'Light',
      surfaceContext: 'light',
      categoricalMarkCount: 5,
      sequentialMarkCount: 5,
      divergingMarkCount: 3,
    });
    if (composed.status !== 'ready') throw new Error(JSON.stringify(composed));
    const section = composeColorSystemSectionBlueprintV2(
      fixture.brief,
      direction.candidate,
      composed.blueprint,
      fixture.result.presentationProfile!
    );
    const review = buildColorSystemReviewModelV2(fixture.brief, direction.candidate, section);
    const modes: string[] = [];
    const collect = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if ('mode' in value && typeof value.mode === 'string') modes.push(value.mode);
      Object.values(value).forEach(collect);
    };
    collect(review);
    expect(new Set(modes)).toEqual(new Set(['Light']));
    expect(review.proposed[0]).toContain('explicit Light values');
    expect(canonicalJson({ brief: fixture.brief, candidate: direction.candidate })).toBe(before);
    expect(direction.candidate.families[0].members[0].valuesByMode.Dark).toBeDefined();
  });

  it('keeps exact review and recommendation separation parity for non-byte native anchors', () => {
    const source = sourceInput();
    source.variables = source.variables.map(variable =>
      variable.variableId === 'variable:brand-primary'
        ? {
            ...variable,
            valuesByMode: variable.valuesByMode.map(mode => {
              if (mode.rawValue.kind !== 'color') return mode;
              return {
                ...mode,
                rawValue: {
                  kind: 'color' as const,
                  value: {
                    ...mode.rawValue.value,
                    components: [
                      0.2003,
                      mode.rawValue.value.components[1],
                      mode.rawValue.value.components[2],
                    ] as const,
                  },
                },
              };
            }),
          }
        : variable
    );
    const native = orchestrate(source);
    for (const direction of native.ready) {
      expect(
        direction.candidate.families.some(
          family => colorSystemFamilyAnchorValueV2(family).representation
        )
      ).toBe(true);
      expect(direction.review.why!.meanAnchorSeparation).toBe(
        direction.recommendationEvidence.meanAnchorSeparationDeltaEOK
      );
    }
  });

  it('mirrors the orchestrator’s recommendation evidence in the why block of every ready direction', () => {
    for (const direction of fixture.ready) {
      const why = direction.review.why;
      const evidence = direction.recommendationEvidence;
      if (!why) throw new Error(`${direction.directionId} has no why block.`);
      expect(why.requiredPairs).toEqual({
        passing: evidence.requiredPairsPassing,
        total: evidence.requiredPairsTotal,
      });
      expect(why.meaningRoles).toEqual({
        inRange: evidence.meaningRolesInRange,
        total: evidence.meaningRolesTotal,
      });
      expect(why.chartSeparation.minimum).toBe(evidence.minimumModeledChartSeparation);
      expect(why.chartSeparation.threshold).toBe(0.08);
      expect(
        Math.min(
          why.chartSeparation.normal,
          why.chartSeparation.protan,
          why.chartSeparation.deutan,
          why.chartSeparation.tritan
        )
      ).toBe(why.chartSeparation.minimum);
      expect(why.sequentialAdjacentCoefficientOfVariation).toBe(
        evidence.sequentialAdjacentCoefficientOfVariation
      );
      expect(why.meanAnchorSeparation).toBe(evidence.meanAnchorSeparationDeltaEOK);
      expect(why.sourceContinuity).toBe(evidence.sourceContinuityDeltaEOK);
      const separation = direction.candidate.measures.find(
        measure => measure.id === 'minimum-family-anchor-separation'
      );
      expect(why.familyAnchorSeparation.minimum).toBe(separation?.measuredValue ?? null);
      expect(why.familyAnchorSeparation.threshold).toBe(
        COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3
      );
      expect(why.meanSourceAdjustment).toBe(
        direction.candidate.measures.find(measure => measure.id === 'mean-source-adjustment')
          ?.measuredValue ?? null
      );
      expect(why.gamutMappedSteps).toBe(
        direction.candidate.measures.find(measure => measure.id === 'gamut-mapped-mode-steps')
          ?.measuredValue ?? null
      );
      expect(why.basisStatements[0]).toMatch(/^\d+ of \d+ required pairs pass\.$/);
      expect(why.basisStatements[1]).toMatch(
        /^\d+ of \d+ meaning roles sit inside their hue range\.$/
      );
      expect(why.basisStatements[2]).toMatch(
        /^Minimum modeled chart separation \d\.\d{3} Delta E OK\.$/
      );
      expect(why.basisStatements[why.basisStatements.length - 1]).toContain('not owner acceptance');
    }
  });

  it('prints the same measured statements the recommendation ranks on', () => {
    const recommendation = fixture.result.recommendedDirection;
    if (!recommendation) throw new Error('No recommendation.');
    const recommended = fixture.ready.find(
      direction => direction.directionId === recommendation.directionId
    );
    const statements = recommended?.review.why?.basisStatements ?? [];
    expect(statements.length).toBe(7);
    for (const statement of statements.slice(0, 6)) {
      expect(recommendation.basisStatements).toContain(statement);
    }
  });

  it('reads every family’s kind and exact Light step-9 anchor for the comparison strip', () => {
    for (const direction of fixture.ready) {
      expect(direction.review.families.length).toBe(direction.candidate.families.length);
      direction.review.families.forEach((family, index) => {
        expect(['derived', 'accent', 'neutral', 'reserve']).toContain(family.kind);
        expect(family.anchorHex).toBe(
          colorSystemFamilyAnchorHexV2(direction.candidate.families[index]).toUpperCase()
        );
      });
    }
  });

  it('runs surface advisories over every family anchor and the rendered typography pairs', () => {
    for (const direction of fixture.ready) {
      const surfaces = direction.review.brandSurfaces;
      if (!surfaces) throw new Error(`${direction.directionId} has no brand surfaces.`);
      expect(surfaces.version).toBe('teul-color-system-surface-advisories/v3');
      expect(surfaces.surfaces).toEqual([...COLOR_SYSTEM_SURFACES_V3]);
      expect(surfaces.cmykDisclaimer).toBe(CMYK_UNPROFILED_DISCLAIMER);
      expect(surfaces.printTriplets.length).toBe(direction.candidate.families.length);
      expect(surfaces.families.length).toBe(direction.candidate.families.length);
      for (const triplet of surfaces.printTriplets) {
        expect(triplet.spot).toBeNull();
        expect(triplet.canonical).toBe('screen');
        expect(triplet.cmyk.totalInk).toBe(
          triplet.cmyk.c + triplet.cmyk.m + triplet.cmyk.y + triplet.cmyk.k
        );
        expect(triplet.note).toContain('No spot color was supplied');
      }
      const marketingFamily = surfaces.families.find(family =>
        direction.candidate.jobEligibility.some(
          entry => entry.ref.familyId === family.id && entry.jobs.includes('marketing-accent')
        )
      );
      if (!marketingFamily) throw new Error('No family is eligible for marketing accents.');
      for (const surface of surfacesForJobs(['marketing-accent'])) {
        expect(marketingFamily.surfaces).toContain(surface);
      }
      for (const family of surfaces.families) {
        for (const surface of family.surfaces) expect(COLOR_SYSTEM_SURFACES_V3).toContain(surface);
      }
      const printTriplets = surfaces.advisories.filter(
        advisory => advisory.code === 'PRINT_TRIPLET'
      );
      expect(printTriplets.length).toBe(direction.candidate.families.length);
      // Every distinct rendered typography pair (by hex) reaches the out-of-home text check once.
      const typographyPairIds = new Set(
        direction.application.typography.map(specimen => specimen.pairEvidenceId)
      );
      const distinctHexPairs = new Set(
        direction.application.pairEvidence
          .filter(evidence => typographyPairIds.has(evidence.context.id))
          .map(evidence => `${evidence.foreground.value.hex}:${evidence.background.value.hex}`)
      );
      const outOfHomeText = surfaces.advisories.filter(advisory =>
        advisory.code.startsWith('OOH_TEXT_CONTRAST')
      );
      expect(outOfHomeText.length).toBe(distinctHexPairs.size);
      expect(outOfHomeText.length).toBeLessThan(typographyPairIds.size);
      for (const advisory of outOfHomeText) expect(typographyPairIds.has(advisory.id)).toBe(true);
      const printed = [
        ...surfaces.advisories.map(advisory => advisory.message),
        ...surfaces.printTriplets.map(triplet => triplet.note),
      ].join(' ');
      expect(printed).not.toMatch(/pantone/i);
    }
  });

  it('carries every rendered typography pair with its WCAG ratio and supplementary APCA Lc', () => {
    for (const direction of fixture.ready) {
      const typography = direction.review.sections.find(section => section.role === 'typography');
      const pairs = typography?.textPairs ?? [];
      expect(pairs.length).toBe(direction.application.typography.length);
      expect(pairs.length).toBeGreaterThan(0);
      direction.application.typography.forEach((specimen, index) => {
        const pair = pairs[index];
        const evidence = direction.application.pairEvidence.find(
          item => item.context.id === specimen.pairEvidenceId
        );
        expect(pair.id).toBe(specimen.specimenId);
        expect(pair.ratio).toBe(specimen.ratio);
        expect(pair.threshold).toBe(specimen.threshold);
        expect(pair.status).toBe(specimen.status);
        expect(pair.apcaLc).toBe(evidence?.apcaLc ?? null);
        expect(pair.foreground.hex).toMatch(/^#[0-9A-F]{6}$/);
      });
      for (const section of direction.review.sections) {
        if (section.role !== 'typography') expect(section.textPairs).toBeUndefined();
      }
      const product = direction.review.sections.find(
        section => section.role === 'product-graphics'
      );
      for (const specimen of product?.productGraphicsSpecimens ?? []) {
        if (!specimen.contrast) continue;
        const evidence = direction.application.pairEvidence.find(item =>
          specimen.pairEvidenceIds.includes(item.context.id)
        );
        expect(specimen.contrast.apcaLc).toBe(evidence?.apcaLc ?? null);
      }
    }
  });

  it('omits categorical capacity until the composer reports requested and achieved marks', () => {
    for (const direction of fixture.ready) {
      const dataVisualization = direction.review.sections.find(
        section => section.role === 'data-visualization'
      );
      const reported = direction.application.visualization.categorical as {
        requestedMarkCount?: unknown;
        achievedMarkCount?: unknown;
      };
      if (
        typeof reported.requestedMarkCount === 'number' &&
        typeof reported.achievedMarkCount === 'number'
      ) {
        expect(dataVisualization?.visualizationSpecimens?.categoricalCapacity?.[0]).toMatchObject({
          mode: 'Light',
          requestedMarkCount: reported.requestedMarkCount,
          achievedMarkCount: reported.achievedMarkCount,
        });
      } else {
        expect(dataVisualization?.visualizationSpecimens?.categoricalCapacity).toBeUndefined();
      }
    }
  });

  it('declares the proportion rule and where each meaning role comes from on every ready direction', () => {
    // p3-B: the rule is a constant Teul policy default, never measured from the file; the
    // meaning-source list mirrors the blueprint's semanticMeaning one to one.
    for (const direction of fixture.ready) {
      expect(direction.review.proportionRule).toEqual(COLOR_SYSTEM_PROPORTION_RULE_V3);
      const sources = direction.review.why?.meaningSources ?? [];
      expect(sources.length).toBe(direction.application.semanticMeaning.length);
      expect(sources.length).toBeGreaterThan(0);
      direction.application.semanticMeaning.forEach((item, index) => {
        expect(sources[index]).toMatchObject({
          role: item.role,
          mode: item.mode,
          source: item.meaningSource,
        });
        expect(sources[index].statement.startsWith(`${item.role}:`)).toBe(true);
        expect(sources[index].statement).toContain(
          item.meaningSource === 'nearest'
            ? 'see warning'
            : item.meaningSource === 'reserve'
              ? 'because your palette has none'
              : sources[index].family
        );
      });
      // P3-A adds a conventional status reserve wherever the palette owns no hue in a meaning
      // range; exactly those families are marked, and only those.
      for (const family of direction.review.families) {
        if (family.kind === 'reserve') {
          expect(['success', 'warning', 'error', 'information']).toContain(family.statusReserve);
        } else {
          expect(family.statusReserve).toBeUndefined();
        }
      }
      expect(direction.review.families.some(family => family.kind === 'reserve')).toBe(
        direction.application.semanticMeaning.some(item => item.meaningSource === 'reserve')
      );
    }
  });

  it('judges hero discipline on the product screen from the real role bindings', () => {
    for (const direction of fixture.ready) {
      const surfaces = direction.review.brandSurfaces;
      if (!surfaces) throw new Error(`${direction.directionId} has no brand surfaces.`);
      const hero = surfaces.advisories.filter(advisory => advisory.code.startsWith('HERO_'));
      for (const advisory of hero) {
        expect(advisory.surface).toBe('screen-product');
        expect(advisory.message).toContain(HERO_DISCIPLINE_STATEMENT_V3);
      }
      // The composer never hands a large fill to the hero, so the wash warning cannot fire.
      expect(hero.filter(advisory => advisory.code === 'HERO_AS_WASH')).toEqual([]);
      // The share note fires exactly for the modes where more than one meaning role follows
      // the brand family (focus, selected and a distinct-hue link do so by design).
      const brand = colorSystemBrandFamilyIdV2(fixture.brief, direction.candidate);
      for (const mode of new Set(direction.application.productSemantics.map(role => role.mode))) {
        const heroMeaningRoles = direction.application.productSemantics.filter(
          role =>
            role.mode === mode &&
            (COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2 as readonly string[]).includes(role.role) &&
            role.ref.kind === 'approved-family-member' &&
            role.ref.ref.familyId === brand
        );
        const expected = brand !== null && heroMeaningRoles.length > 1;
        expect(
          hero.some(
            advisory =>
              advisory.code === 'HERO_SHARE_EXCEEDED' &&
              advisory.id === brand &&
              advisory.message.startsWith(`In ${mode} `)
          ),
          `${direction.directionId}/${mode}`
        ).toBe(expected);
      }
    }
  });

  it('validates on the wire, rebuilds identically, and keeps the integrity assertion green', () => {
    const recommendation = fixture.result.recommendedDirection;
    if (!recommendation) throw new Error('No recommendation.');
    const message = {
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:measured',
      success: true,
      sessionId: 'session-measured',
      sourceColorCount: 3,
      scannedNodeCount: 1,
      resolvedUsageScope: 'whole-file',
      recommendedDirectionId: recommendation.directionId,
      selectedDirectionId: recommendation.directionId,
      reviews: fixture.ready.map(direction => direction.review),
      limitations: [],
    };
    const validation = validateColorSystemBuilderV2PluginMessage(message);
    expect(validation.valid).toBe(true);
    for (const direction of fixture.ready) {
      const rebuilt = buildColorSystemReviewModelV2(
        fixture.brief,
        direction.candidate,
        direction.section
      );
      expect(rebuilt.reviewModelHash).toBe(direction.review.reviewModelHash);
      expect(() =>
        assertColorSystemReviewModelV2Integrity(
          fixture.brief,
          direction.candidate,
          direction.section,
          direction.review
        )
      ).not.toThrow();
    }
  });
  it('projects every resolved product role per mode for the preview boards', () => {
    // p4-DE: the boards read `semanticRoles`; each entry is the blueprint's resolved value
    // under the alias path the resource compiler gives it, so a board shows the created token.
    for (const direction of fixture.ready) {
      const roles = direction.review.semanticRoles;
      if (!roles) throw new Error(`${direction.directionId} has no semantic roles.`);
      expect(roles.length).toBe(
        direction.application.modes.length * COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length
      );
      const aliasNames = new Set(
        direction.resource.collections[1].variables.map(variable => variable.name)
      );
      for (const entry of roles) {
        const resolved = direction.application.productSemantics.find(
          role => role.role === entry.role && role.mode === entry.mode
        );
        if (!resolved) throw new Error(`${entry.role} ${entry.mode} is not in the blueprint.`);
        expect(entry.tokenName).toBe(`semantic/${entry.role}`);
        expect(aliasNames.has(entry.tokenName)).toBe(true);
        expect(entry.color.mode).toBe(entry.mode);
        expect(entry.color.hex).toBe(resolved.resolved.value.hex);
        expect(entry.color.alpha).toBe(resolved.resolved.value.alpha);
      }
      // Mode order is the blueprint's, and within a mode the declared role order.
      expect(roles.map(entry => entry.mode)).toEqual(
        direction.application.modes.flatMap(mode =>
          COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.map(() => mode)
        )
      );
      // The primary is never the ground: the CTA token and the board ground differ in every mode.
      for (const mode of direction.application.modes) {
        const ground = roles.find(entry => entry.role === 'background' && entry.mode === mode);
        const selected = roles.find(entry => entry.role === 'selected' && entry.mode === mode);
        expect(ground?.color.hex).not.toBe(selected?.color.hex);
      }
    }
  });

  it('projects whose grounds the surfaces are and whether the chart order is recorded', () => {
    // p3-J, landing p3-I §1: both facts are read from the blueprint by the exported readers and
    // copied onto the why block; nothing is stored twice.
    for (const direction of fixture.ready) {
      const why = direction.review.why!;
      expect(why.surfaces).toEqual(
        colorSystemReviewSurfacesFactV2(fixture.brief, direction.application)
      );
      expect(why.chartOrder).toEqual(colorSystemReviewChartOrderFactV2(direction.application));
      // The generic black/white source records no chart set: Teul's own hue-first order.
      expect(why.chartOrder).toEqual({
        source: 'generated',
        recordedCount: 0,
        warnings: [],
        statement: 'Chart order: generated',
      });
      expect(why.surfaces!.statement.startsWith('Surfaces: ')).toBe(true);
    }

    const kestrel = orchestrate(
      recordedGroundsFixture as unknown as ColorSystemGenericSourceSnapshotInputV2
    );
    for (const direction of kestrel.ready) {
      const why = direction.review.why!;
      expect(why.surfaces).toEqual({
        source: 'observed-claim',
        groundNames: ['Surface Gray', 'Surface Black'],
        statement: 'Surfaces: your recorded grounds (Surface Gray, Surface Black)',
      });
      // Five of the six recorded colors are reproduced exactly; Harbor is a skipped
      // near-duplicate of Kestrel Teal in the plan and the warning names it.
      expect(why.chartOrder).toMatchObject({
        source: 'recorded',
        recordedCount: 5,
        statement: 'Chart order: your recorded order (5 colors)',
      });
      expect(why.chartOrder!.warnings[0]).toContain('“Data Viz / 01 Harbor” #4F7F9A');
      expect(why.chartOrder).toEqual(colorSystemReviewChartOrderFactV2(direction.application));
    }
    // Both shapes validate on the wire.
    const recommendation = kestrel.result.recommendedDirection;
    if (!recommendation) throw new Error('No recommendation.');
    const validation = validateColorSystemBuilderV2PluginMessage({
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:recorded-chart',
      success: true,
      sessionId: 'session-recorded-chart',
      sourceColorCount: 30,
      scannedNodeCount: 1,
      resolvedUsageScope: 'whole-file',
      recommendedDirectionId: recommendation.directionId,
      selectedDirectionId: recommendation.directionId,
      reviews: kestrel.ready.map(direction => direction.review),
      limitations: [],
    });
    expect(validation.valid).toBe(true);
  });

  // ------------------------------------------------------------------
  // p6: the recommendation view
  // ------------------------------------------------------------------

  const RETIRED_WORDS = [
    'analogous',
    'complementary',
    'reserve',
    'anchor',
    'ΔEOK',
    'hue offset',
    'territory',
    'contribution',
    'gamut-mapped',
    'CoV',
    'derived scale',
  ];
  const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const stepOf = (role: string) => Number(/^step-(\d+)$/.exec(role)?.[1]);

  it('names every family plainly and prints the token path the resource blueprint creates', () => {
    for (const direction of fixture.ready) {
      const system = direction.review.recommendedSystem;
      if (!system) throw new Error(`${direction.directionId} has no recommendedSystem.`);
      expect(system.familyNames.map(entry => entry.familyId)).toEqual(
        direction.review.families.map(family => family.id)
      );
      for (const family of direction.review.families) {
        const named = system.familyNames.find(entry => entry.familyId === family.id);
        const planned = direction.resource.tokenNaming.families.find(
          entry => entry.familyId === family.id
        );
        if (!named || !planned) throw new Error(`${family.id} is missing a name plan.`);
        // The path is the blueprint's own slug, de-duplicated the same way (yellow, yellow-2).
        expect(named.tokenPath).toBe(`color/${planned.slug}`);
        if (planned.basis === 'hue-family') {
          expect(named.name.startsWith(`${capitalize(planned.hueFamily ?? '')} accent`)).toBe(true);
          expect(planned.slug.endsWith('-2') ? named.name.endsWith(' 2') : true).toBe(true);
        } else if (planned.basis === 'neutral') {
          expect(named.name).toBe('Neutral ramp');
        } else if (planned.basis === 'status-reserve') {
          expect(named.name.split(' ')[0]).toBe(capitalize(family.statusReserve ?? ''));
          expect(named.name.split(' ')).toHaveLength(2);
        } else {
          expect(named.name).toBe(family.name);
        }
        for (const word of RETIRED_WORDS) {
          expect(named.name.toLowerCase()).not.toContain(word.toLowerCase());
        }
      }
    }
  });

  it('counts the system in one sentence and describes it without a single retired word or measure', () => {
    for (const direction of fixture.ready) {
      const system = direction.review.recommendedSystem!;
      const families = direction.review.families;
      const accents = families.filter(family => family.kind === 'accent');
      const reserves = families.filter(family => family.kind === 'reserve');
      expect(system.colorCount).toBe(families.length);
      expect(system.summary).toBe(
        `${families.length} colors: Primary / Brand kept exactly, a cool neutral ramp, ${accents.length} new ${
          accents.length === 1 ? 'accent' : 'accents'
        }, ${reserves.length} status colors.`
      );
      const prose = [
        system.summary,
        system.accentPlacement,
        system.alsoConsidered,
        system.chartCapacity ?? '',
        system.why.kept,
        system.why.added,
        system.why.notDone,
        ...[...system.brand, ...system.productUi, ...system.status].flatMap(card => [
          card.name,
          card.usedFor,
          ...card.parts.map(part => part.label),
        ]),
      ]
        .join(' ')
        .toLowerCase();
      for (const word of RETIRED_WORDS) {
        expect(prose, `retired word “${word}” in ${direction.directionId}`).not.toMatch(
          new RegExp(`\\b${word.toLowerCase()}\\b`)
        );
      }
      // Number words carry the counts; digits appear only in the count sentence.
      expect(system.why.kept + system.why.added + system.why.notDone).not.toMatch(/\d/);
      expect(system.alsoConsidered).not.toMatch(/\d/);
      // The kept sentence names the recorded primary; the added sentence names every hue word.
      expect(system.why.kept).toContain('Primary / Brand stays exactly as recorded');
      for (const family of accents) {
        const hue = direction.resource.tokenNaming.families.find(
          entry => entry.familyId === family.id
        )?.hueFamily;
        expect(system.why.added).toContain(hue ?? '');
      }
      expect(system.why.notDone).toContain('approval stays with the brand owner');
    }
  });

  it('names a preserved Primary ground by its tested use without inventing a background prohibition', () => {
    const input = sourceInput();
    input.variables = input.variables.map(item =>
      item.variableId === 'variable:text-surface'
        ? { ...item, name: 'Primary / Surface', description: 'Primary / Surface' }
        : item
    );
    const withPrimaryGround = orchestrate(input);
    for (const direction of withPrimaryGround.ready) {
      const ground = direction.review.semanticRoles!.find(item => item.role === 'background')!;
      const primary = direction.review.sections[0].colors.find(
        color => color.id === ground.color.id
      );
      expect(primary).toBeDefined();
      const card = direction.review.recommendedSystem!.brand.find(
        item => item.id === `primary:${primary!.id}`
      )!;
      expect(card.usedFor).toContain('Tested in this proposal for');
      expect(card.usedFor).toContain('background');
      expect(card.usedFor).not.toContain('Never');
    }
  });

  it('groups the cards by use, with the primary kept exactly and every accent named by hue with its jobs', () => {
    for (const direction of fixture.ready) {
      const system = direction.review.recommendedSystem!;
      const primary = direction.review.sections[0].colors;
      const primaryCard = system.brand.find(card => card.id.startsWith('primary:'));
      expect(primaryCard).toMatchObject({
        name: primary[0].name,
        origin: 'kept-exactly',
      });
      const actualRoles = [
        ...new Set(
          direction.review
            .semanticRoles!.filter(item => item.color.id === primary[0].id)
            .map(item => item.role)
        ),
      ].sort();
      expect(primaryCard?.usedFor).toBe(
        actualRoles.length
          ? `Preserved source color. Tested in this proposal for ${actualRoles.map(role => role.replace(/-/g, ' ')).join(', ')}.`
          : 'Preserved source color; no tested product use assigned in this proposal.'
      );
      expect(primaryCard?.usedFor).not.toContain('Never as a ground');
      expect(primaryCard?.parts[0].values).toEqual(
        [...primary]
          .sort((left, right) => (left.mode === 'Light' ? -1 : right.mode === 'Light' ? 1 : 0))
          .map(color => ({ mode: color.mode, hex: color.hex }))
      );
      const accents = direction.review.families.filter(family => family.kind === 'accent');
      const marks = direction.review.sections[3].visualizationSpecimens!.categorical.marks;
      for (const family of accents) {
        const card = system.brand.find(item => item.id === `accent:${family.id}`);
        if (!card) throw new Error(`${family.name} has no card.`);
        expect(card.origin).toBe('new');
        expect(card.usedFor.startsWith('Used for')).toBe(false);
        expect(card.usedFor.endsWith('.')).toBe(true);
        // Every job the family carries appears as a use; its chart series are numbered.
        const memberIds = new Set(family.colors.map(color => color.id));
        const series = marks.filter(mark => memberIds.has(mark.color.id)).map(mark => mark.order);
        if (series.length > 0) expect(card.usedFor).toContain(`chart series ${series.join(', ')}`);
        if (family.jobs.includes('functional-iconography')) expect(card.usedFor).toContain('icons');
        if (family.jobs.includes('product-ui-surface')) {
          expect(card.usedFor).toContain('interface surfaces');
        }
        // The card's value is the family's Light step-9 anchor in every mode.
        expect(card.parts[0].values.find(value => value.mode === 'Light')?.hex).toBe(
          family.anchorHex
        );
      }
      const grounds = system.brand.find(card => card.id === 'marketing-grounds');
      expect(grounds?.name).toBe('Proposed surfaces and text');
      expect(grounds?.usedFor).toContain('tested product backgrounds and text');
      expect(grounds?.usedFor).not.toContain('marketing');
      expect(grounds?.parts.map(part => part.label)).toEqual(['Ground', 'Text on it']);
      expect(grounds?.usedFor).toContain('Text / Surface on light, Text / Surface on dark');
      // Product UI: the spec's cards, in its order, each part resolving to the semantic role's value.
      expect(system.productUi.map(card => card.id)).toEqual([
        'background',
        'surface',
        'text',
        'muted-text',
        'disabled',
        'border',
        'primary-button',
        'form-field',
        'link',
        'selected',
      ]);
      const roleHex = (role: string, mode: string) =>
        direction.review.semanticRoles!.find(item => item.role === role && item.mode === mode)!
          .color.hex;
      for (const mode of direction.application.modes) {
        const background = system.productUi.find(card => card.id === 'background')!;
        expect(background.parts[0].values.find(value => value.mode === mode)?.hex).toBe(
          roleHex('background', mode)
        );
        const form = system.productUi.find(card => card.id === 'form-field')!;
        expect(form.parts.map(part => part.label)).toEqual(['Background', 'Border', 'Focus ring']);
        expect(form.parts[2].values.find(value => value.mode === mode)?.hex).toBe(
          roleHex('focus', mode)
        );
      }
      // Status: the four roles named by their actual hue; destructive only when it differs from error.
      expect(system.status.map(card => card.name)).toEqual([
        'Success green',
        'Warning orange',
        'Error red',
        'Information blue',
      ]);
      for (const card of system.status) {
        const role = card.id.slice('status:'.length);
        expect(card.parts.map(part => part.label)).toEqual(['Fill', 'Text on it']);
        for (const value of card.parts[0].values) {
          expect(value.hex).toBe(roleHex(role, value.mode));
        }
        for (const value of card.parts[1].values) {
          expect(value.hex).toBe(roleHex(`on-${role}`, value.mode));
        }
      }
    }
  });

  it('shows the hover and pressed values the resource blueprint aliases for the primary button', () => {
    for (const direction of fixture.ready) {
      const system = direction.review.recommendedSystem!;
      const button = system.productUi.find(card => card.id === 'primary-button');
      if (!button) throw new Error('No primary button card.');
      expect(button.parts.map(part => part.label)).toEqual([
        'Fill',
        'Text on it',
        'Hover',
        'Pressed',
      ]);
      const records = direction.resource.tokenNaming.stateTokens.filter(
        record => record.role === 'selected'
      );
      expect(records.length).toBe(direction.application.modes.length);
      for (const record of records) {
        const plan = direction.resource.tokenNaming.families.find(
          entry => entry.slug === record.familySlug
        );
        const family = direction.candidate.families.find(
          item => item.stableFamilyId === plan?.familyId
        );
        if (!family) throw new Error(`No family for slug ${record.familySlug}.`);
        const hexAt = (step: number) =>
          family.members.find(member => stepOf(member.role) === step)?.valuesByMode[record.mode]
            .hex;
        expect(
          button.parts[2].values.find(value => value.mode === record.mode)?.hex,
          `hover ${record.mode}`
        ).toBe(hexAt(record.hoverStep));
        expect(
          button.parts[3].values.find(value => value.mode === record.mode)?.hex,
          `pressed ${record.mode}`
        ).toBe(hexAt(record.pressedStep));
      }
    }
  });

  it('states an unmet chart request in words, once per shortfall, and stays silent when every series fits', () => {
    for (const direction of fixture.ready) {
      const system = direction.review.recommendedSystem!;
      const capacity =
        direction.review.sections[3].visualizationSpecimens!.categoricalCapacity ?? [];
      const short = capacity.filter(item => item.achievedMarkCount < item.requestedMarkCount);
      if (short.length === 0) {
        expect(system.chartCapacity).toBeNull();
        expect(system.alsoConsidered).toContain('all five chart series stay distinguishable');
      } else {
        // The generic fixture's Close Harmony supports three of the five requested series in both modes.
        expect(system.chartCapacity).toBe(
          'Three of five series are distinguishable in Light and Dark.'
        );
        expect(system.alsoConsidered).toContain(
          'three of five chart series stay distinguishable in Light and Dark'
        );
      }
      expect(system.alsoConsidered.endsWith('.')).toBe(true);
    }
    // One direction describes itself for the others' Also considered rows in one sentence each.
    const placements = fixture.ready.map(
      direction => direction.review.recommendedSystem!.accentPlacement
    );
    expect(new Set(placements).size).toBe(placements.length);
  });
});
