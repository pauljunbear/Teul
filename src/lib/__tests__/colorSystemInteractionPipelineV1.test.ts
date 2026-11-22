import { describe, expect, it } from 'vitest';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../colorSystemBuilderOrchestratorV2';
import { canonicalJson } from '../colorSystemHashing';
import { exportColorSystemTokensV2 } from '../colorSystemTokenExportV2';
import type { ColorSystemInteractionRequirementsV1 } from '../colorSystemInteractionPlanV1';
import { validateColorSystemBuilderV2PluginMessage } from '../colorSystemBuilderV2MessageValidation';
import { buildColorSystemGenericOwnerConfirmationV2 } from '../colorSystemGenericIntentPolicyV2';
import { compileColorSystemGenericPolicyHandoffV2 } from '../colorSystemGenericPolicyHandoffV2';
import {
  BRAND_B,
  chainFromInput,
  genericBrandSourceInput,
  readyDirections,
} from './helpers/colorSystemGenericBrandPipelineV2';

function sourceChain(native = false) {
  const input = genericBrandSourceInput(BRAND_B);
  const surface = input.variables.find(
    variable => variable.variableId === 'variable:text-surface'
  )!;
  const extra = [
    [255, 255, 255],
    [238, 237, 233],
  ].map((channels, index) => ({
    ...surface,
    variableId: `variable:test-surface-${index}`,
    name: `Text / Surface ${index}`,
    valuesByMode: surface.valuesByMode.map(value =>
      value.modeName === 'Light'
        ? {
            ...value,
            rawValue: {
              kind: 'color' as const,
              value: {
                colorSpace: 'srgb' as const,
                components: channels.map(channel => channel / 255) as [number, number, number],
                alpha: 1,
              },
            },
          }
        : value
    ),
  }));
  const variables = input.variables.map(variable =>
    !native || variable.variableId !== 'variable:brand-primary'
      ? variable
      : {
          ...variable,
          valuesByMode: variable.valuesByMode.map(entry =>
            entry.rawValue.kind !== 'color'
              ? entry
              : {
                  ...entry,
                  rawValue: {
                    kind: 'color' as const,
                    value: {
                      ...entry.rawValue.value,
                      components: [
                        entry.rawValue.value.components[0] + 1e-8,
                        entry.rawValue.value.components[1],
                        entry.rawValue.value.components[2],
                      ] as [number, number, number],
                    },
                  },
                }
          ),
        }
  );
  return chainFromInput({ ...input, variables: [...variables, ...extra] });
}

function inputFor(chain: ReturnType<typeof sourceChain>, impossible = false) {
  const sources = [
    'text-surface',
    'test-surface-0',
    'test-surface-1',
    ...(impossible ? ['text-ink'] : []),
  ];
  const requirements: ColorSystemInteractionRequirementsV1 = {
    policyVersion: 'teul-interaction-requirements/v1',
    uses: (['selected', 'link', 'focus', 'border', 'text'] as const).map(role => ({
      role,
      mode: 'Light',
      surfaces: sources.map(id => ({
        kind: 'preserved-source-color',
        stableColorId: `generic-source-color:typography:variable:variable:${id}`,
        mode: 'Light',
      })),
      evidenceIds: ['synthetic:complete-interaction-brief'],
    })),
  };
  return buildColorSystemGenericBuilderOrchestratorV2Input(
    chain.snapshot,
    chain.proposal,
    chain.confirmation,
    chain.handoff,
    {
      application: {
        applicationMode: 'Light',
        surfaceContext: 'light',
        categoricalMarkCount: 5,
        sequentialMarkCount: 5,
        divergingMarkCount: 3,
        interactionRequirements: requirements,
      },
    }
  );
}

describe('complete interaction pipeline', () => {
  const input = inputFor(sourceChain());
  const result = buildColorSystemGenericBuilderOrchestratorV2(input);

  it('uses one complete state plan across review, aliases and exported token evidence', () => {
    expect(result.status).toBe('ready');
    for (const direction of readyDirections(result).values()) {
      const interaction = direction.application.interaction!;
      expect(interaction.statePlans).toHaveLength(2);
      const primitives = new Map(
        [
          ...direction.resource.collections[0].variables,
          ...direction.resource.collections[1].variables,
        ].map(variable => [variable.recipeId, variable])
      );
      const exported = JSON.parse(exportColorSystemTokensV2(direction.resource).dtcgJson);
      for (const plan of interaction.statePlans) {
        expect(plan.pairs).toHaveLength(9);
        expect(plan.measurements.every(pair => pair.ratio >= pair.minimumRatio)).toBe(true);
        expect(plan.distinction.every(pair => pair.deltaEOK > 0)).toBe(true);
        for (const state of ['hover', 'pressed'] as const) {
          const alias = [
            ...direction.resource.collections[0].variables,
            ...direction.resource.collections[1].variables,
          ].find(variable => variable.name === `semantic/${plan.role}-${state}`)!;
          if (alias.kind !== 'alias') throw new Error('Missing state alias');
          const primitive = primitives.get(alias.aliasesByMode.Light.targetVariableRecipeId)!;
          if (primitive.kind === 'alias') throw new Error('Missing primitive');
          expect(primitive.valuesByMode.Light).toEqual(plan.resolvedStates[state].value);
        }
        const record = direction.resource.tokenNaming.stateTokens.find(
          record => record.role === plan.role && record.mode === 'Light'
        )!;
        expect(record.interaction?.requirementsHash).toBe(interaction.requirementsHash);
        expect(
          exported.$extensions['com.teul'].stateTokens.find(
            (record: { role: string; mode: string }) =>
              record.role === plan.role && record.mode === 'Light'
          ).interaction
        ).toEqual(record.interaction);
        const card = direction.review.recommendedSystem!.productUi.find(
          card => card.id === (plan.role === 'selected' ? 'primary-button' : 'link')
        )!;
        for (const [label, state] of [
          ['Hover', 'hover'],
          ['Pressed', 'pressed'],
        ] as const) {
          expect(
            card.parts
              .find(part => part.label === label)
              ?.values.find(value => value.mode === 'Light')?.hex
          ).toBe(plan.resolvedStates[state].value.hex);
        }
      }
    }
  });

  it('binds requirements in the request and blocks incompatible light and dark grounds before ranking', () => {
    const impossible = inputFor(sourceChain(), true);
    expect(canonicalJson(impossible)).not.toBe(canonicalJson(input));
    const blocked = buildColorSystemGenericBuilderOrchestratorV2(impossible);
    expect(blocked.recommendedDirection).toBeNull();
    expect(blocked.directions.every(direction => direction.status === 'blocked')).toBe(true);
  });

  it('keeps a recorded chart palette without inventing unrequested sequential or diverging ramps', () => {
    const source = genericBrandSourceInput(BRAND_B);
    const variables = source.variables.filter(variable => variable.name.startsWith('Secondary'));
    const chain = chainFromInput({
      ...source,
      variables: [
        ...source.variables,
        ...variables.map((variable, index) => ({
          ...variable,
          variableId: `variable:chart-${index}`,
          name: `Data visualization / Category ${index + 1}`,
        })),
      ],
    });
    const previous = chain.confirmation;
    const confirmation = buildColorSystemGenericOwnerConfirmationV2(
      chain.snapshot,
      chain.proposal,
      {
        displayedSections: previous.displayedSections,
        displayedPlanJson: previous.displayedPlanJson,
        displayedPlanHash: previous.displayedPlanHash,
        sectionDecisions: previous.sectionDecisions.map(section =>
          section.role === 'data-visualization' ? { ...section, disposition: 'preserve' } : section
        ),
        generatedPolarity: null,
        ownerEditedRoles: ['data-visualization'],
        acknowledgedGapIds: previous.acknowledgedGapIds,
        confirmedAt: previous.confirmedAt,
      }
    );
    const handoff = compileColorSystemGenericPolicyHandoffV2(
      chain.snapshot,
      chain.proposal,
      confirmation
    );
    const kept = buildColorSystemGenericBuilderOrchestratorV2(
      buildColorSystemGenericBuilderOrchestratorV2Input(
        chain.snapshot,
        chain.proposal,
        confirmation,
        handoff
      )
    );
    expect(kept.status, canonicalJson(kept.blockers)).toBe('ready');
    expect(kept.brief!.requiredSecondaryJobs).not.toContain('sequential-data');
    for (const direction of readyDirections(kept).values()) {
      expect(direction.application.visualization.sequential).toBeNull();
      expect(direction.application.visualization.diverging).toBeNull();
      expect(direction.application.visualization.categorical.orderSource).toBe('recorded');
      expect(direction.application.visualization.categorical.marks).toHaveLength(2);
      expect(direction.recommendationEvidence.sequentialAdjacentCoefficientOfVariation).toBeNull();
      const exported = exportColorSystemTokensV2(direction.resource);
      expect(exported.cssText).not.toContain('semantic-sequential');
      expect(
        direction.review.sections.find(section => section.role === 'data-visualization')!
          .visualizationSpecimens!.sequential
      ).toBeNull();
    }
  });

  it.each(['Light', 'Dark'] as const)(
    'projects only requested %s mode into review and native resources',
    mode => {
      const chain = sourceChain(true);
      const sourceBefore = canonicalJson(chain);
      const scoped = buildColorSystemGenericBuilderOrchestratorV2(
        buildColorSystemGenericBuilderOrchestratorV2Input(
          chain.snapshot,
          chain.proposal,
          chain.confirmation,
          chain.handoff,
          {
            application: {
              modes: [mode],
              applicationMode: mode,
              surfaceContext: mode === 'Light' ? 'light' : 'dark',
              categoricalMarkCount: 5,
              sequentialMarkCount: 5,
              divergingMarkCount: 3,
            },
          }
        )
      );
      expect(scoped.status, canonicalJson(scoped.blockers)).toBe('ready');
      expect(canonicalJson(chain)).toBe(sourceBefore);
      for (const direction of readyDirections(scoped).values()) {
        expect(direction.resource.output.modes).toEqual([mode]);
        for (const collection of direction.resource.collections) {
          for (const variable of collection.variables) {
            expect(
              Object.keys(
                variable.kind === 'alias' ? variable.aliasesByMode : variable.valuesByMode
              )
            ).toEqual([mode]);
          }
        }
        expect(
          direction.resource.components
            .flatMap(component => component.paintBindings)
            .every(binding => binding.mode === mode)
        ).toBe(true);
        expect(
          direction.review.families
            .flatMap(family => family.colors)
            .every(color => color.mode === mode)
        ).toBe(true);
        expect(
          direction.review.sections
            .flatMap(section => section.colors)
            .every(color => color.mode === mode)
        ).toBe(true);
      }
    }
  );

  it('blocks an absent requested mode without substituting an available mode', () => {
    const chain = sourceChain();
    const scoped = buildColorSystemGenericBuilderOrchestratorV2(
      buildColorSystemGenericBuilderOrchestratorV2Input(
        chain.snapshot,
        chain.proposal,
        chain.confirmation,
        chain.handoff,
        // Exercise the runtime boundary with a mode outside the typed public options.
        { application: { modes: ['Evening'], applicationMode: 'Evening' as 'Light' } }
      )
    );
    expect(scoped.status).toBe('blocked');
    expect(scoped.recommendedDirection).toBeNull();
  });

  it('preserves native source precision through generation, review and CSS without a hex round-trip', () => {
    const native = buildColorSystemGenericBuilderOrchestratorV2(inputFor(sourceChain(true)));
    expect(native.status).toBe('ready');
    const exact = native.brief!.primaryLocks.find(lock => lock.mode === 'Light')!.expectedValue;
    expect(exact.representation?.kind).toBe('native-srgb');
    const message = {
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'test:native-analysis',
      success: true,
      sessionId: 'test:native-session',
      sourceColorCount: 20,
      scannedNodeCount: 0,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: native.recommendedDirection!.directionId,
      selectedDirectionId: native.recommendedDirection!.directionId,
      reviews: [...readyDirections(native).values()].map(direction => direction.review),
      limitations: [],
    };
    expect(validateColorSystemBuilderV2PluginMessage(message)).toMatchObject({ valid: true });
    for (const mutation of ['stale-value', 'wrong-hex', 'unknown-key', 'strip-value'] as const) {
      const altered = structuredClone(message);
      const color = altered.reviews[0]
        .recommendedSystem!.productUi.flatMap(card => card.parts.flatMap(part => part.values))
        .find(value => value.nativeValue !== undefined)!;
      expect(color).toBeDefined();
      if (mutation === 'stale-value') color.nativeValue!.alpha = 0.5;
      if (mutation === 'wrong-hex') color.hex = '#FFFFFF';
      if (mutation === 'unknown-key') Object.assign(color.nativeValue!, { extra: true });
      if (mutation === 'strip-value') delete color.nativeValue;
      expect(validateColorSystemBuilderV2PluginMessage(altered).valid, mutation).toBe(false);
    }
    const stripped = JSON.parse(
      JSON.stringify(message, (key, value) => (key === 'nativeValue' ? undefined : value))
    );
    expect(validateColorSystemBuilderV2PluginMessage(stripped).valid).toBe(false);
    for (const direction of readyDirections(native).values()) {
      const sourceValues = [
        ...direction.resource.collections[0].variables,
        ...direction.resource.collections[1].variables,
      ].flatMap(variable =>
        variable.kind !== 'alias' ? Object.values(variable.valuesByMode) : []
      );
      expect(sourceValues).toContainEqual(exact);
      expect(
        direction.candidate.families.flatMap(family =>
          family.members.flatMap(member => Object.values(member.valuesByMode))
        )
      ).toContainEqual(exact);
      const exported = exportColorSystemTokensV2(direction.resource);
      expect(exported.cssText).toContain(
        `color(srgb ${exact.components.r} ${exact.components.g} ${exact.components.b} / ${exact.alpha})`
      );
      expect(canonicalJson(direction.review)).toContain(exact.representation!.exactValueHash);
      expect(exported.dtcgJson).toContain(String(exact.components.r));
    }
  });
});
