import {
  COLOR_SYSTEM_LIBRARY_PRESENTATION_SECTION_ORDER,
  COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION,
  type ColorSystemLibraryPageBlueprint,
  type ColorSystemLibraryPresentationSection,
  type ColorSystemLibraryPresentationSectionKind,
  type ColorSystemLibraryScaleSection,
} from './colorSystemLibraryPage';
import type { ColorSystemOutputBlueprint } from '../lib/colorSystemOutputBlueprint';
import type { ColorSystemProposal } from '../types/colorSystemAudit';

type OutputScaleRecipe = ColorSystemOutputBlueprint['scaleRecipes'][number];

const PRESENTATION_COPY: Readonly<
  Record<ColorSystemLibraryPresentationSectionKind, { title: string; description: string }>
> = {
  primary: {
    title: 'Primary',
    description:
      'Existing source colors are shown in their captured order; Primary remains unchanged.',
  },
  secondary: {
    title: 'Secondary',
    description:
      'Existing source colors and the selected Teul proposal are shown together for review.',
  },
  'product-graphics': {
    title: 'Product Graphics',
    description:
      'Source colors for product graphics and any compiled illustration additions are kept distinct.',
  },
  'data-visualization': {
    title: 'Data Visualization',
    description:
      'Source membership and applied categorical, sequential, and diverging examples share the reviewed chart context.',
  },
  typography: {
    title: 'Typography',
    description:
      'Source text colors are shown separately from generated product-semantic pair receipts. Source Typography remains unassessed unless exact foreground/background context was declared.',
  },
};

function preferredMode(modes: readonly string[]): string {
  const mode = modes.find(candidate => candidate === 'Light') ?? modes[0];
  if (!mode) throw new Error('The compiled output has no usable display mode.');
  return mode;
}

function sourceSectionKind(role: string): ColorSystemLibraryPresentationSectionKind | null {
  const kind = role.startsWith('source-') ? role.slice('source-'.length) : '';
  return COLOR_SYSTEM_LIBRARY_PRESENTATION_SECTION_ORDER.includes(
    kind as ColorSystemLibraryPresentationSectionKind
  )
    ? (kind as ColorSystemLibraryPresentationSectionKind)
    : null;
}

function sectionFor(
  recipe: OutputScaleRecipe,
  output: ColorSystemOutputBlueprint
): ColorSystemLibraryScaleSection {
  if (recipe.namespace === 'data-visualization') return 'data-visualization';
  if (recipe.namespace === 'illustration') return 'product-graphics';
  const tokenIds = new Set(
    recipe.variants.flatMap(variant => variant.swatches.map(swatch => swatch.tokenId))
  );
  const relatedAliases = output.aliases.filter(alias =>
    Object.values(alias.targetsByMode).some(targetId => tokenIds.has(targetId))
  );
  const exactSourceKinds = [
    ...new Set(
      relatedAliases.flatMap(alias => {
        const kind = sourceSectionKind(alias.role);
        return kind ? [kind] : [];
      })
    ),
  ];
  if (exactSourceKinds.length === 1) return exactSourceKinds[0];
  const hasHarmonySuggestion = recipe.variants.some(variant =>
    variant.swatches.some(swatch => {
      const token = output.tokens.find(candidate => candidate.id === swatch.tokenId);
      return Object.values(token?.provenanceByMode ?? {}).some(
        provenance => provenance.kind === 'teul-harmony-generated'
      );
    })
  );
  if (hasHarmonySuggestion) return 'secondary';
  if (relatedAliases.some(alias => alias.role === 'secondary')) return 'secondary';
  if (relatedAliases.some(alias => alias.role === 'primary')) return 'primary';
  if (recipe.namespace === 'product-semantics' || recipe.namespace === 'product-primitives') {
    return 'product-ui';
  }
  return 'primary';
}

function sourceState(state: string | undefined, aliasId: string): { order: number; name: string } {
  const match = /^(\d+)-(.+)$/.exec(state ?? '');
  const order = Number(match?.[1]);
  const name = match?.[2]?.trim();
  if (!Number.isInteger(order) || order < 1 || !name) {
    throw new Error(`Source-section alias "${aliasId}" has no exact ordered source label.`);
  }
  return { order, name };
}

/**
 * Adapts the Figma-agnostic compiler receipt into the bounded visual renderer
 * contract without recomputing a color, alias, or chart decision.
 */
export function adaptColorSystemLibraryPageBlueprint(
  output: ColorSystemOutputBlueprint,
  proposal: ColorSystemProposal,
  systemName: string,
  pageName: string
): ColorSystemLibraryPageBlueprint {
  if (output.sourceHash !== proposal.sourceHash || output.proposalHash !== proposal.proposalHash) {
    throw new Error('The visual library blueprint does not match the approved proposal receipts.');
  }
  const mode = preferredMode(output.modes);
  const tokens = output.tokens.map(token => {
    const valuesByMode = Object.fromEntries(
      Object.entries(token.valuesByMode).map(([valueMode, hex]) => {
        const provenance = token.provenanceLabelsByMode[valueMode];
        if (!provenance) {
          throw new Error(`Compiled token "${token.id}" has no ${valueMode} provenance.`);
        }
        return [
          valueMode,
          {
            hex,
            ownership: provenance.startsWith('Source preserved')
              ? ('source' as const)
              : ('teul-suggested' as const),
            provenance,
          },
        ];
      })
    );
    if (Object.keys(valuesByMode).length === 0) {
      throw new Error(`Compiled token "${token.id}" has no displayable value.`);
    }
    return {
      id: token.id,
      name: token.name,
      valuesByMode,
    };
  });
  const tokenById = new Map(tokens.map(token => [token.id, token]));
  const aliases = output.aliases.map((alias, order) => {
    const displayMode =
      alias.targetsByMode[mode] !== undefined ? mode : Object.keys(alias.targetsByMode)[0];
    if (!displayMode) {
      throw new Error(`Compiled alias "${alias.id}" has no displayable target.`);
    }
    const targetsByMode = Object.fromEntries(
      Object.entries(alias.targetsByMode).map(([targetMode, targetTokenId]) => {
        const target = tokenById.get(targetTokenId)?.valuesByMode[targetMode];
        if (!target) {
          throw new Error(
            `Compiled alias "${alias.id}" cannot resolve ${targetMode} to "${targetTokenId}".`
          );
        }
        return [targetMode, { targetTokenId, hex: target.hex }];
      })
    );
    return {
      id: alias.id,
      name: alias.name,
      role: alias.role,
      ...(alias.state ? { state: alias.state } : {}),
      displayMode,
      targetsByMode,
      order,
    };
  });
  const scales = output.scaleRecipes.map((recipe, order) => {
    const variants = recipe.variants
      .filter(variant => variant.swatches.length > 1)
      .map(variant => ({
        id: variant.id,
        mode: variant.mode,
        steps: variant.swatches.map(swatch => ({
          label: String(swatch.step),
          tokenId: swatch.tokenId,
        })),
      }));
    if (variants.length === 0) {
      throw new Error(`Compiled scale "${recipe.id}" has no reusable multi-step display variant.`);
    }
    const provenanceLabels = [
      ...new Set(
        recipe.variants.flatMap(variant => variant.swatches.map(swatch => swatch.provenanceLabel))
      ),
    ];
    return {
      id: recipe.id,
      name: recipe.name,
      description:
        provenanceLabels.length <= 1
          ? (provenanceLabels[0] ?? 'Approved color-system scale')
          : `${variants.length} reviewed mode variants · ${provenanceLabels.length} pinned step receipts`,
      section: sectionFor(recipe, output),
      order,
      variants,
    };
  });
  const charts = output.chartSpecimens.map((chart, order) => {
    const evidence = chart.evidence;
    if (!evidence) {
      throw new Error(
        `Chart "${chart.id}" has no hash-bound accessibility and separation evidence.`
      );
    }
    const testedSurface = evidence.surfaceEvidence.filter(pair => pair.status === 'tested');
    const ratios = testedSurface.flatMap(pair => (pair.ratio === undefined ? [] : [pair.ratio]));
    const thresholds = testedSurface.flatMap(pair =>
      pair.threshold === undefined ? [] : [pair.threshold]
    );
    if (ratios.length !== testedSurface.length || thresholds.length !== testedSurface.length) {
      throw new Error(`Chart "${chart.id}" has incomplete surface-contrast receipts.`);
    }
    const condition = {
      normal: 'normal',
      'protan condition': 'protan',
      'deutan condition': 'deutan',
      'severe tritanomaly approximation': 'severe-tritan',
    } as const;
    return {
      id: chart.id,
      name: `${chart.kind.charAt(0).toUpperCase()}${chart.kind.slice(1)} specimen`,
      kind: chart.kind,
      context: [
        chart.chartType,
        chart.mode,
        chart.markType,
        chart.adjacency,
        chart.kind === 'diverging' ? chart.divergingMidpoint : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      nonColorCue: `${chart.declaredNonColorCue}; rendered with direct labels`,
      mode: chart.mode,
      surfaceHex: chart.surfaceHex,
      ...(chart.boundaryHex ? { boundaryHex: chart.boundaryHex } : {}),
      adjacency: chart.adjacency ?? 'separated-marks',
      ...(chart.markType ? { markType: chart.markType } : {}),
      order,
      evidence: {
        surfacePairCount: evidence.surfaceEvidence.length,
        testedSurfacePairCount: testedSurface.length,
        passedSurfacePairCount: testedSurface.filter(pair => pair.pass === true).length,
        minimumSurfaceContrastRatio: Math.min(...ratios),
        maximumSurfaceThreshold: Math.max(...thresholds),
        separationScope: evidence.separationScope,
        separation: evidence.separationEvidence.map(item => ({
          condition: condition[item.condition],
          minimumDeltaEOK: item.minimumDeltaEOK,
          threshold: item.threshold,
          pass: true as const,
        })),
        orderingPass: true as const,
        evaluationHash: evidence.evaluationHash,
      },
      marks: chart.marks.map(mark => ({
        aliasId: mark.aliasId,
        targetTokenId: mark.targetTokenId,
        label: mark.label,
        hex: mark.hex,
      })),
    };
  });
  const aliasesById = new Map(aliases.map(alias => [alias.id, alias]));
  const scaleContainsSuggestion = (scale: (typeof scales)[number]): boolean =>
    scale.variants.some(variant =>
      variant.steps.some(step =>
        Object.values(tokenById.get(step.tokenId)?.valuesByMode ?? {}).some(
          value => value.ownership === 'teul-suggested'
        )
      )
    );
  const presentationSections: ColorSystemLibraryPresentationSection[] =
    COLOR_SYSTEM_LIBRARY_PRESENTATION_SECTION_ORDER.map((kind, order) => {
      const sourceSwatches = output.aliases
        .filter(alias => sourceSectionKind(alias.role) === kind)
        .map(alias => {
          const adapted = aliasesById.get(alias.id);
          if (!adapted)
            throw new Error(`Adapted source-section alias "${alias.id}" is unavailable.`);
          const { name, order: sourceOrder } = sourceState(alias.state, alias.id);
          const target = adapted.targetsByMode[adapted.displayMode];
          const tokenValue = target
            ? tokenById.get(target.targetTokenId)?.valuesByMode[adapted.displayMode]
            : undefined;
          if (!target || !tokenValue || tokenValue.ownership !== 'source') {
            throw new Error(`Source-section alias "${alias.id}" does not resolve to source color.`);
          }
          return {
            aliasId: adapted.id,
            targetTokenId: target.targetTokenId,
            name,
            mode: adapted.displayMode,
            hex: target.hex,
            order: sourceOrder,
          };
        })
        .sort(
          (left, right) => left.order - right.order || left.aliasId.localeCompare(right.aliasId)
        );
      const candidateScales = scales.filter(
        scale => scale.section === kind && scaleContainsSuggestion(scale)
      );
      const multiStepScales = candidateScales.filter(scale =>
        scale.variants.some(variant => variant.steps.length >= 3)
      );
      const suggestedScaleIds =
        kind === 'data-visualization'
          ? []
          : (multiStepScales.length > 0 ? multiStepScales : candidateScales).map(scale => scale.id);
      const copy = PRESENTATION_COPY[kind];
      return {
        kind,
        title: copy.title,
        description: copy.description,
        order,
        sourceSwatches,
        suggestedScaleIds,
        chartIds: kind === 'data-visualization' ? charts.map(chart => chart.id) : [],
      };
    });
  return {
    schemaVersion: COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION,
    systemName,
    pageName,
    sourceHash: output.sourceHash,
    proposalHash: output.proposalHash,
    strategyId: proposal.builderEvidence?.candidateId ?? proposal.strategy,
    blueprintHash: output.outputBlueprintHash,
    tokens,
    aliases,
    scales,
    presentationSections,
    semanticPairEvidence: {
      assessment: output.semanticPairEvidence.assessment,
      declaredPairCount: output.semanticPairEvidence.declaredPairCount,
      testedPairCount: output.semanticPairEvidence.testedPairCount,
      passedPairCount: output.semanticPairEvidence.passedPairCount,
      failedPairCount: output.semanticPairEvidence.failedPairCount,
      unsupportedPairCount: output.semanticPairEvidence.unsupportedPairCount,
      ...(output.semanticPairEvidence.minimumTestedContrastRatio !== undefined
        ? {
            minimumTestedContrastRatio: output.semanticPairEvidence.minimumTestedContrastRatio,
          }
        : {}),
      pairIds: [...output.semanticPairEvidence.pairIds],
    },
    charts,
  };
}
