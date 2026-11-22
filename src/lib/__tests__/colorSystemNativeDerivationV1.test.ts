import { describe, expect, it } from 'vitest';
import {
  assertColorSystemApplicationBlueprintV2Integrity,
  buildColorSystemApplicationBlueprintV2,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemApplicationSystemBlueprintV2Input,
  type ColorSystemCategoricalSelectionV2,
  type ColorSystemVisualizationMarkEvidenceV2,
} from '../colorSystemApplicationBlueprintV2';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../colorSystemBuilderOrchestratorV2';
import { composeColorSystemSectionBlueprintV2 } from '../colorSystemSectionComposerV2';
import {
  assertColorSystemResourceBlueprintV2Integrity,
  buildColorSystemResourceBlueprintV2,
} from '../colorSystemResourceBlueprintV2';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
  normalizeColorSystemSrgbValueV1,
} from '../colorSystemSrgbValueV1';
import { exportColorSystemTokensV2 } from '../colorSystemTokenExportV2';
import {
  BRAND_B,
  chainFromInput,
  genericBrandSourceInput,
  orchestrateGenericSourceInput,
  readyDirections,
} from './helpers/colorSystemGenericBrandPipelineV2';

function markInput(mark: ColorSystemVisualizationMarkEvidenceV2) {
  return {
    order: mark.order,
    label: mark.label,
    ref: mark.ref.kind === 'approved-family-member' ? mark.ref.ref : mark.ref,
    ...(mark.origin === undefined ? {} : { origin: mark.origin }),
  };
}

function categoricalInput(selection: ColorSystemCategoricalSelectionV2) {
  const {
    kind: _kind,
    surfaceResolved: _surface,
    boundaryResolved: _boundary,
    cvdAdvisory: _cvd,
    marks,
    ...input
  } = selection;
  return { ...input, marks: marks.map(markInput) };
}

/** Re-enter the public builder so the changed graphics receive fresh evidence and hashes. */
function applicationInput(
  blueprint: ColorSystemApplicationSystemBlueprintV2
): ColorSystemApplicationSystemBlueprintV2Input {
  const { sequential, diverging } = blueprint.visualization;
  if (!sequential || !diverging || blueprint.interaction) {
    throw new Error('The derivation fixture requires generated charts and no interaction plan.');
  }
  const {
    kind: _sequentialKind,
    surfaceResolved: _sequentialSurface,
    perceptualEvidence: _perceptual,
    marks: sequentialMarks,
    ...sequentialInput
  } = sequential;
  const {
    kind: _divergingKind,
    surfaceResolved: _divergingSurface,
    cvdAdvisory: _divergingCvd,
    midpointVisibility: _midpoint,
    armUniformity: _arms,
    marks: divergingMarks,
    ...divergingInput
  } = diverging;
  return {
    compilerVersion: blueprint.compilerVersion,
    modes: blueprint.modes,
    productGraphics: blueprint.productGraphics.map(
      ({ colors: _colors, accessibilityStatus: _status, ...input }) => input
    ),
    productSemantics: blueprint.productSemantics.map(
      ({ resolved: _resolved, accessibilityStatus: _status, ...input }) => input
    ),
    semanticMeaning: blueprint.semanticMeaning.map(({ policyVersion: _policy, ...input }) => input),
    visualization: {
      categorical: categoricalInput(blueprint.visualization.categorical),
      sequential: { ...sequentialInput, marks: sequentialMarks.map(markInput) },
      diverging: { ...divergingInput, marks: divergingMarks.map(markInput) },
    },
    additionalCategorical: blueprint.additionalCategorical.map(categoricalInput),
    typography: blueprint.typography.map(specimen => ({
      specimenId: specimen.specimenId,
      useCategory: specimen.useCategory,
      mode: specimen.mode,
      pairEvidenceId: specimen.pairEvidenceId,
      fontSizePx: specimen.fontSizePx,
      fontWeight: specimen.fontWeight,
      intendedUse: specimen.intendedUse,
      evidenceIds: specimen.evidenceIds,
    })),
    pairContexts: blueprint.pairEvidence.map(pair => pair.context),
    limitations: blueprint.limitations,
  };
}

function sourceInput(native: boolean) {
  const input = genericBrandSourceInput(BRAND_B);
  return {
    ...input,
    variables: input.variables.map(variable =>
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
    ),
  };
}

describe('native derivations and declared surface evidence', () => {
  it.each([false, true])(
    'rebuilds alpha identity in every mode and preserves exact export values (native source: %s)',
    native => {
      const result = orchestrateGenericSourceInput(sourceInput(native));
      expect(result.status).toBe('ready');
      const direction = [...readyDirections(result).values()][0];
      const brief = result.brief!;
      const profile = result.presentationProfile!;
      const strategySet = result.strategySet!;
      const locked = brief.primaryLocks.find(lock => lock.mode === 'Light')!.expectedValue;
      expect(locked.representation?.kind).toBe(native ? 'native-srgb' : undefined);
      const family = direction.candidate.families.find(item =>
        item.members.some(
          member => JSON.stringify(member.valuesByMode.Light) === JSON.stringify(locked)
        )
      )!;
      const member = family.members.find(
        item => JSON.stringify(item.valuesByMode.Light) === JSON.stringify(locked)
      )!;
      const input = applicationInput(direction.application);
      const derivationId = input.productGraphics[2].derivationId;
      const application = buildColorSystemApplicationBlueprintV2(brief, direction.candidate, {
        ...input,
        pairContexts: input.pairContexts.filter(
          pair => !input.productGraphics[2].pairEvidenceIds.includes(pair.id)
        ),
        productGraphics: input.productGraphics.map((specimen, index) =>
          index === 2
            ? {
                ...specimen,
                sourceRefs: [
                  {
                    familyId: family.stableFamilyId,
                    memberId: member.stableMemberId,
                    mode: 'Light',
                  },
                ],
                transform: { kind: 'alpha', alpha: 1 / 3 },
                assessment: 'decorative',
                pairEvidenceIds: [],
                nonColorCue: null,
              }
            : specimen
        ),
      });
      expect(application.status).toBe('ready');
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(brief, direction.candidate, application)
      ).not.toThrow();
      const section = composeColorSystemSectionBlueprintV2(
        brief,
        direction.candidate,
        application,
        profile
      );
      const resource = buildColorSystemResourceBlueprintV2(
        brief,
        strategySet,
        direction.candidate,
        application,
        section,
        profile,
        {
          compilerVersion: 'native-derivation-regression/v1',
          systemId: 'synthetic-brand-b',
          outputName: 'Synthetic Brand B',
        }
      );
      expect(() =>
        assertColorSystemResourceBlueprintV2Integrity(
          brief,
          strategySet,
          direction.candidate,
          application,
          section,
          profile,
          resource
        )
      ).not.toThrow();
      const derivation = resource.collections[0].variables.find(
        variable =>
          variable.origin.kind === 'application-derivation' &&
          variable.origin.derivationId === derivationId
      )!;
      if (derivation.origin.kind !== 'application-derivation')
        throw new Error('Missing derivation.');
      const sourceVariableRecipeId = derivation.origin.sourceVariableRecipeId;
      const source = resource.collections[0].variables.find(
        variable => variable.recipeId === sourceVariableRecipeId
      )!;
      const alias = resource.collections[1].variables.find(
        variable => variable.aliasesByMode.Light.targetVariableRecipeId === derivation.recipeId
      )!;
      const exported = exportColorSystemTokensV2(resource);
      const json = JSON.parse(exported.dtcgJson);
      const token = derivation.name.split('/').reduce((node, part) => node[part], json);
      expect(resource.output.modes).toEqual(['Dark', 'Light']);
      for (const mode of resource.output.modes) {
        const original = member.valuesByMode[mode];
        const expected = buildColorSystemSrgbValueV1(original.components, original.alpha / 3);
        const value = derivation.valuesByMode[mode];
        expect(source.valuesByMode[mode]).toEqual(original);
        expect(value).toEqual(expected);
        expect(normalizeColorSystemSrgbValueV1(value)).toEqual(value);
        expect(value.representation).toEqual({
          kind: 'native-srgb',
          exactValueHash: colorSystemExactSrgbValueHashV1(original.components, original.alpha / 3),
        });
        expect(value.representation!.exactValueHash).not.toBe(
          original.representation?.exactValueHash
        );
        expect(alias.aliasesByMode[mode].targetVariableRecipeId).toBe(derivation.recipeId);
        const tokenValue =
          mode === 'Light' ? token.$value : token.$extensions['com.teul'].modes[mode].$value;
        expect(tokenValue).toEqual({
          colorSpace: 'srgb',
          components: [original.components.r, original.components.g, original.components.b],
          alpha: original.alpha / 3,
          hex: original.hex,
        });
        const selector = mode === 'Light' ? ':root {' : ':root[data-color-mode="dark"] {';
        const css = exported.cssText.split(selector)[1].split('}')[0];
        expect(css).toContain(
          `--${derivation.name.split('/').join('-')}: color(srgb ${original.components.r} ${original.components.g} ${original.components.b} / ${original.alpha / 3});`
        );
      }
      expect(application.productGraphics[2].colors[0].appliedValue).toEqual(
        derivation.valuesByMode.Light
      );
    }
  );

  it('keeps structural background and surface evidence bound when text also has to pass on gold', () => {
    const chain = chainFromInput(genericBrandSourceInput(BRAND_B));
    const gold = {
      kind: 'preserved-source-color' as const,
      stableColorId: 'generic-source-color:secondary:variable:variable:secondary-1',
      mode: 'Light',
    };
    const result = buildColorSystemGenericBuilderOrchestratorV2(
      buildColorSystemGenericBuilderOrchestratorV2Input(
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
            interactionRequirements: {
              policyVersion: 'teul-interaction-requirements/v1',
              uses: [
                {
                  role: 'text',
                  mode: 'Light',
                  surfaces: [gold],
                  evidenceIds: ['synthetic:text-on-gold'],
                },
              ],
            },
          },
        }
      )
    );
    expect(result.status).toBe('ready');
    for (const direction of readyDirections(result).values()) {
      const application = direction.application;
      const text = application.productSemantics.find(
        role => role.mode === 'Light' && role.role === 'text'
      )!;
      for (const name of ['background', 'surface'] as const) {
        const role = application.productSemantics.find(
          role => role.mode === 'Light' && role.role === name
        )!;
        const pair = application.pairEvidence.find(
          pair => pair.context.id === role.pairEvidenceIds[0]
        )!;
        expect(role.ref).not.toEqual(gold);
        expect(pair.context.background).toEqual(role.ref);
        expect(pair.context.foreground).toEqual(text.ref);
        expect(pair.status).toBe('pass');
        expect(pair.ratio).toBeGreaterThanOrEqual(4.5);
      }
      const requiredPair = application.pairEvidence.find(
        pair => pair.context.id === 'composer:interaction:Light:text:1'
      )!;
      expect(text.pairEvidenceIds).toContain(requiredPair.context.id);
      expect(requiredPair.context.background).toEqual(gold);
      expect(requiredPair.background.value.hex).toBe('#D9A441');
      expect(requiredPair.context.foreground).toEqual(text.ref);
      expect(requiredPair.status).toBe('pass');
      expect(requiredPair.ratio).toBeGreaterThanOrEqual(4.5);
      expect(direction.resource.applicationBlueprintHash).toBe(
        application.applicationBlueprintHash
      );
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(
          result.brief!,
          direction.candidate,
          application
        )
      ).not.toThrow();
    }
  });
});
