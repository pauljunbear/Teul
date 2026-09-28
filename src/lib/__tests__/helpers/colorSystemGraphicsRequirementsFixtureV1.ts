import type {
  ColorSystemBuilderBriefV2,
  ColorSystemProductGraphicsJobV2,
} from '../../colorSystemBuilderV2Contracts';
import type {
  ColorSystemProductGraphicsRequirementsV1,
  ColorSystemGraphicRoleV1,
} from '../../colorSystemProductGraphicsPlanV1';
import { deterministicContentHash } from '../../colorSystemHashing';

export function graphicsRequirementsFixtureV1(
  brief: ColorSystemBuilderBriefV2
): ColorSystemProductGraphicsRequirementsV1 {
  const white = brief.preservedColors.find(
    color => color.valuesByMode.Light?.hex === '#FFFFFF' && color.valuesByMode.Light.alpha === 1
  )!;
  const black = brief.preservedColors.find(color =>
    ['#000000', '#0F0E0C', '#0C0A08'].includes(color.valuesByMode.Light?.hex)
  )!;
  if (!white || !black) throw new Error('Graphics fixture requires recorded white and black.');
  const source = (stableColorId: string) => ({
    kind: 'source' as const,
    ref: { kind: 'preserved-source-color' as const, stableColorId, mode: 'Light' },
  });
  const jobs: readonly ColorSystemProductGraphicsJobV2[] = [
    'product-graphic',
    'functional-iconography',
    'product-ui-surface',
  ];
  const roles: readonly ColorSystemGraphicRoleV1[] = [
    'accent',
    'functional-icon',
    'control-surface',
  ];
  return {
    policyVersion: 'teul-product-graphics-requirements/v1',
    binding: {
      sourceHash: brief.sourceHash,
      sourcePackageHash: brief.sourcePackageHash,
      briefHash: brief.briefHash,
    },
    evidence: [
      {
        id: 'fixture:graphic',
        sourceId: 'fixture',
        sourceHash: deterministicContentHash('graphic-source'),
        locator: 'fixture:graphic-layout',
        status: 'observed',
      },
    ],
    contexts: jobs.map((job, index) => {
      const labelOnSelected = index === 2;
      const label = {
        id: 'label',
        useId: 'label',
        shape: {
          kind: 'rect' as const,
          x: labelOnSelected ? 70 : 190,
          y: 65,
          width: 32,
          height: 16,
        },
        textAlternative: 'Fixture label',
        children: [],
      };
      const mark = {
        id: 'mark',
        useId: 'mark',
        shape: { kind: 'rect' as const, x: 50, y: 45, width: 110, height: 60 },
        children: labelOnSelected ? [label] : [],
      };
      return {
        id: `fixture-${job}`,
        job,
        mode: 'Light',
        evidenceIds: ['fixture:graphic'],
        selection: { kind: 'job-eligible' as const },
        uses: [
          {
            id: 'outer',
            role: 'outer-backdrop' as const,
            assessment: 'decorative' as const,
            paint: source(white.stableColorId),
          },
          {
            id: 'card',
            role: 'card-surface' as const,
            assessment: 'decorative' as const,
            paint: source(white.stableColorId),
          },
          {
            id: 'mark',
            role: roles[index],
            assessment: 'informative' as const,
            paint: { kind: 'selected-member' as const },
          },
          {
            id: 'label',
            role: 'label' as const,
            assessment: 'informative' as const,
            paint: source(labelOnSelected ? white.stableColorId : black.stableColorId),
          },
        ],
        pairs: [
          {
            id: 'mark-on-card',
            foregroundUseId: 'mark',
            backgroundUseId: 'card',
            category: 'non-text' as const,
            fontSizePx: null,
            fontWeight: null,
            useCase: `${job} mark`,
            evidenceIds: ['fixture:graphic'],
          },
          {
            id: 'label',
            foregroundUseId: 'label',
            backgroundUseId: labelOnSelected ? 'mark' : 'card',
            category: 'normal-text' as const,
            fontSizePx: 16,
            fontWeight: 400,
            useCase: `${job} label`,
            evidenceIds: ['fixture:graphic'],
          },
        ],
        geometry: {
          applicationId: `fixture-${job}`,
          width: 320,
          height: 160,
          root: {
            id: 'outer',
            useId: 'outer',
            shape: { kind: 'rect' as const, x: 0, y: 0, width: 320, height: 160 },
            children: [
              {
                id: 'card',
                useId: 'card',
                shape: { kind: 'rect' as const, x: 20, y: 20, width: 280, height: 120 },
                children: [mark, ...(labelOnSelected ? [] : [label])],
              },
            ],
          },
        },
      };
    }),
  };
}
