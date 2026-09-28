import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ColorSystemReviewChartOrderFactV2,
  ColorSystemReviewSurfacesFactV2,
} from '../../lib/colorSystemApplicationBlueprintV2';
import type {
  ColorSystemReviewModelV2,
  ColorSystemReviewRecommendedSystemV2,
  ColorSystemReviewSystemCardV2,
} from '../../lib/colorSystemReviewModelV2';
import {
  CMYK_UNPROFILED_DISCLAIMER,
  COLOR_SYSTEM_PROPORTION_RULE_V3,
  outOfHomeTextAdvisory,
  printTriplet,
} from '../../lib/colorSystemSurfaceAdvisoriesV3';
import { ColorSystemBuilderV2Review } from '../ColorSystemBuilderV2Review';
import { buildColorSystemSrgbValueV1 } from '../../lib/colorSystemSrgbValueV1';
import { buildColorSystemProductGraphicsProjectionV1 } from '../../lib/colorSystemProductGraphicsPlanV1';

/** p4-DE: the boards' Light and Dark grounds and text, shared by the semantic roles and the pairs. */
const BOARD_HEX = {
  Light: { background: '#FFFFFF', surface: '#F6F4F0', text: '#0C0A08', border: '#D7D4CE' },
  Dark: { background: '#0C0A08', surface: '#1E1B18', text: '#F6F4F0', border: '#3D3B37' },
} as const;

/** p6: the words the first screen must never print (RECOMMENDATION-VIEW-SPEC, “Words to retire”). */
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

function semanticRoles(
  directionId: string
): NonNullable<ColorSystemReviewModelV2['semanticRoles']> {
  const color = (
    role: string,
    mode: 'Light' | 'Dark',
    hex: string,
    origin: 'existing' | 'suggested' = 'existing'
  ) => ({
    role: role as NonNullable<ColorSystemReviewModelV2['semanticRoles']>[number]['role'],
    mode,
    tokenName: `semantic/${role}`,
    color: {
      id: `${directionId}-role-${role}-${mode}`,
      name: `${role} ${mode}`,
      mode,
      hex,
      alpha: 1,
      origin,
      jobs: ['product-semantics'],
    },
  });
  return (['Light', 'Dark'] as const).flatMap(mode => [
    color('background', mode, BOARD_HEX[mode].background),
    color('surface', mode, BOARD_HEX[mode].surface),
    color('text', mode, BOARD_HEX[mode].text),
    color('border', mode, BOARD_HEX[mode].border),
    // The primary follows the brand family Sky: Light step 9 and its Dark counterpart.
    color('selected', mode, mode === 'Light' ? '#5683D2' : '#B2C7EB', 'suggested'),
    color('on-selected', mode, mode === 'Light' ? '#FFFFFF' : '#0C0A08'),
    color('link', mode, mode === 'Light' ? '#5683D2' : '#B2C7EB', 'suggested'),
  ]);
}

const HASHES = {
  source: `sha256:${'1'.repeat(64)}`,
  candidate: `sha256:${'2'.repeat(64)}`,
  application: `sha256:${'3'.repeat(64)}`,
  section: `sha256:${'4'.repeat(64)}`,
  review: `sha256:${'5'.repeat(64)}`,
} as const;

function visualizationSpecimens(
  directionId: string
): NonNullable<ColorSystemReviewModelV2['sections'][number]['visualizationSpecimens']> {
  const color = (order: number, hex: string, label: string) => ({
    order,
    label,
    renderedHex: hex,
    color: {
      id: `${directionId}-data-${order}-${hex}`,
      name: label,
      mode: 'Light',
      hex,
      alpha: 1,
      origin: 'suggested' as const,
      jobs: ['categorical-data' as const],
    },
  });
  const surface = {
    id: `${directionId}-surface`,
    name: 'Chart surface',
    mode: 'Light',
    hex: '#FFFFFF',
    alpha: 1,
    origin: 'existing' as const,
    jobs: ['product-ui-surface' as const],
  };
  return {
    categorical: {
      kind: 'categorical',
      selectionId: `${directionId}:categorical`,
      marks: [
        color(1, '#5683D2', 'Category 1'),
        color(2, '#5AB570', 'Category 2'),
        color(3, '#924F35', 'Category 3'),
      ],
      surface,
      evidenceIds: ['categorical-evidence'],
      adjacency: 'separated',
      boundary: null,
      directLabels: true,
      nonColorCue: 'shape',
    },
    sequential: {
      kind: 'sequential',
      selectionId: `${directionId}:sequential`,
      marks: [
        color(1, '#E4EBF6', 'Value 1'),
        color(2, '#B2C7EB', 'Value 2'),
        color(3, '#5683D2', 'Value 3'),
      ],
      surface,
      evidenceIds: ['sequential-evidence'],
      direction: 'light-to-dark',
      axisLabel: 'Value',
      endpointLabels: ['Low', 'High'],
      nonColorCue: 'axis-and-endpoint-labels',
    },
    diverging: {
      kind: 'diverging',
      selectionId: `${directionId}:diverging`,
      marks: [
        color(1, '#924F35', 'Negative 1'),
        color(2, '#F6F4F0', 'Zero'),
        color(3, '#5683D2', 'Positive 1'),
      ],
      surface,
      evidenceIds: ['diverging-evidence'],
      midpointOrder: 2,
      midpointMeaning: 'Zero or neutral midpoint',
      midpointPolarity: 'light',
      zeroReferenceLine: true,
      negativeLabel: 'Negative',
      positiveLabel: 'Positive',
      nonColorCue: 'zero-line-and-sign-labels',
    },
  };
}

function productGraphicsSpecimens(
  directionId: string
): NonNullable<ColorSystemReviewModelV2['sections'][number]['productGraphicsSpecimens']> {
  const jobs = ['product-graphic', 'functional-iconography', 'product-ui-surface'] as const;
  const colors = ['#5683D2', '#924F35', '#B2C7EB'] as const;
  return jobs.map((job, index) => ({
    derivationId: `${directionId}:${job}`,
    job,
    order: index + 1,
    mode: 'Light',
    intendedUse: `${plainProductLabel(job)} application`,
    excludedUses: ['Color-only meaning'],
    assessment: 'informative' as const,
    colors: [
      {
        id: `${directionId}:${job}:color`,
        name: plainProductLabel(job),
        mode: 'Light',
        hex: colors[index],
        alpha: index === 2 ? 0.5 : 1,
        origin: 'suggested' as const,
        jobs: [job === 'product-graphic' ? 'product-graphics' : job],
      },
    ],
    surface: {
      id: `${directionId}:${job}:surface`,
      name: 'White surface',
      mode: 'Light',
      hex: '#FFFFFF',
      alpha: 1,
      origin: 'existing' as const,
      jobs: ['product-ui-surface' as const],
    },
    underlay: null,
    contrast: {
      ratio: 4.2 + index,
      requiredRatio: 3 as const,
      status: 'pass' as const,
      limitation: 'This result applies only to the exact rendered pair.',
      apcaLc: 60.5 + index,
    },
    accessibilityStatus: 'pass' as const,
    nonColorCue: 'direct label and icon shape',
    pairEvidenceIds: [`${directionId}:${job}:pair`],
    evidenceIds: [`${directionId}:${job}:evidence`],
  }));
}

function plainProductLabel(job: string): string {
  return job.replace(/-/g, ' ');
}

/**
 * p6: the recommendation-screen projection for the fixture, in the same words the
 * review model produces: plain names, one “Used for” line per card, values per mode.
 */
function recommendedSystem(directionId: string): ColorSystemReviewRecommendedSystemV2 {
  const value = (mode: 'Light' | 'Dark', hex: string) => ({ mode, hex });
  const both = (light: string, dark: string) => [value('Light', light), value('Dark', dark)];
  const card = (
    id: string,
    name: string,
    origin: ColorSystemReviewSystemCardV2['origin'],
    usedFor: string,
    parts: ColorSystemReviewSystemCardV2['parts']
  ): ColorSystemReviewSystemCardV2 => ({ id, name, origin, usedFor, parts });
  const placement =
    directionId === 'close-harmony'
      ? ['keeps its new accents close to your primary hue', 'close to your primary hue']
      : directionId === 'wide-spectrum'
        ? ['spreads its new accents around the color wheel', 'spread around the color wheel']
        : ['sets its new accents opposite your primary hue', 'opposite your primary hue'];
  const capacity =
    directionId === 'close-harmony' ? 'Two of three series are distinguishable in Dark.' : null;
  return {
    colorCount: 3,
    summary: '3 colors: Solar kept exactly, a warm neutral ramp, 1 new accent.',
    accentPlacement: placement[0],
    alsoConsidered: `One new accent ${placement[1]}; ${
      capacity
        ? 'two of three chart series stay distinguishable in Dark'
        : 'all three chart series stay distinguishable'
    }.`,
    brand: [
      card(
        'primary:solar',
        'Solar',
        'kept-exactly',
        'emphasis, the call to action, tags. Never as a ground.',
        [{ label: 'Solar', values: [value('Light', '#E4F222')] }]
      ),
      card(
        `accent:${directionId}-sky-family`,
        'Sky accent',
        'new',
        'product illustrations; interface surfaces; chart series 1.',
        [{ label: 'Accent', values: both('#5683D2', '#B2C7EB') }]
      ),
      card(
        'marketing-grounds',
        'Marketing grounds and text',
        'kept-exactly',
        'marketing pages and sections; the grounds are Surface on light, Surface on dark.',
        [
          { label: 'Ground', values: both('#FFFFFF', '#0C0A08') },
          { label: 'Text on it', values: both('#0C0A08', '#F6F4F0') },
        ]
      ),
    ],
    productUi: [
      card('background', 'Background', 'kept-exactly', 'page and app backgrounds.', [
        { label: 'Background', values: both('#FFFFFF', '#0C0A08') },
      ]),
      card('surface', 'Card surface', 'new', 'cards, panels and sheets.', [
        { label: 'Surface', values: both('#F6F4F0', '#1E1B18') },
      ]),
      card('text', 'Text', 'kept-exactly', 'headlines and body text.', [
        { label: 'Text', values: both('#0C0A08', '#F6F4F0') },
      ]),
      card('border', 'Borders and dividers', 'new', 'borders, dividers and input outlines.', [
        { label: 'Border', values: both('#D7D4CE', '#3D3B37') },
      ]),
      card('primary-button', 'Primary button', 'from-brand', 'the main action on a screen.', [
        { label: 'Fill', values: both('#5683D2', '#B2C7EB') },
        { label: 'Text on it', values: both('#FFFFFF', '#0C0A08') },
        { label: 'Hover', values: both('#4A74BE', '#A2B9E0') },
        { label: 'Pressed', values: both('#3D62A6', '#8FA9D4') },
      ]),
      card('link', 'Links', 'from-brand', 'inline links.', [
        { label: 'Link', values: both('#5683D2', '#B2C7EB') },
      ]),
      card(
        'selected',
        'Selected state',
        'from-brand',
        'selected rows, active tabs and checked controls.',
        [
          { label: 'Fill', values: both('#5683D2', '#B2C7EB') },
          { label: 'Text on it', values: both('#FFFFFF', '#0C0A08') },
        ]
      ),
    ],
    status: [
      card('status:success', 'Success green', 'new', 'status messages, badges and validation.', [
        { label: 'Fill', values: both('#1C882D', '#1C882D') },
        { label: 'Text on it', values: both('#FFFFFF', '#0C0A08') },
      ]),
      card('status:error', 'Error red', 'new', 'status messages, badges and validation.', [
        { label: 'Fill', values: both('#BD4238', '#BD4238') },
        { label: 'Text on it', values: both('#FFFFFF', '#FFFFFF') },
      ]),
    ],
    chartCapacity: capacity,
    why: {
      kept: 'Solar stays exactly as recorded in every mode and your recorded text and surface colors stay as they are.',
      added:
        'Teul added a warm neutral ramp for backgrounds, surfaces, borders and disabled text; and one new accent (sky) for product illustrations, interface surfaces and chart series.',
      notDone:
        'Teul did not change your recorded colors and did not look up any spot color (the print values are unprofiled estimates); the recommendation is Teul’s and approval stays with the brand owner.',
    },
    familyNames: [
      { familyId: `${directionId}-sky-family`, name: 'Sky accent', tokenPath: 'color/sky' },
      { familyId: `${directionId}-ink-family`, name: 'Ink', tokenPath: 'color/ink' },
      { familyId: `${directionId}-stone-family`, name: 'Neutral ramp', tokenPath: 'color/neutral' },
    ],
  };
}

function reviewModel(
  directionId = 'balanced-contrast',
  directionLabel = 'Balanced contrast'
): ColorSystemReviewModelV2 {
  const rating = (section: ColorSystemReviewModelV2['sections'][number]['role']) => ({
    section,
    dimensions: [
      {
        id: `${section}-measured-check`,
        label: section === 'typography' ? 'Text contrast' : 'Color separation',
        measuredValue: section === 'typography' ? 7.2 : 0.12,
        threshold: section === 'typography' ? 4.5 : 0.08,
        unit: section === 'typography' ? 'to 1' : 'Delta E OK',
        evidenceIds: [`${section}-rating-evidence`],
      },
    ],
    limitation: 'This measurement applies only to the named example and display profile.',
  });
  return {
    schemaVersion: 'teul-color-system-review-model/v2',
    directionId,
    directionLabel,
    directionDecision: {
      promise:
        directionId === 'close-harmony'
          ? 'Stay closest to the existing palette.'
          : 'Balance continuity with useful distinction.',
      bestFor:
        directionId === 'close-harmony'
          ? 'Restrained product surfaces.'
          : 'Product, graphics, and data visualization.',
      tradeoff:
        directionId === 'close-harmony'
          ? 'Less categorical separation.'
          : 'Less restrained than Close Harmony.',
      authority: 'teul-recommendation',
      ownerAcceptance: false,
    },
    status: 'ready-to-create',
    headline: `${directionLabel} color system`,
    summary: 'Primary stays unchanged while Secondary and its application examples are rebuilt.',
    unchanged: ['14 Primary colors remain exact.', 'Typography remains source-owned.'],
    proposed: ['11 Secondary families.', 'Product and data examples built from approved colors.'],
    importantLimitations: [
      'Screen calibration and ambient light remain outside the plugin’s control.',
    ],
    families: [
      {
        id: `${directionId}-sky-family`,
        name: 'Sky',
        prominence: 'accent',
        reason: 'Sky supports product graphics without replacing the locked Primary.',
        jobs: ['product-graphics', 'product-ui-surface'],
        kind: 'accent',
        anchorHex: '#5683D2',
        colors: [
          {
            id: `${directionId}-sky-6`,
            name: 'Sky 6',
            mode: 'Light',
            hex: '#5683D2',
            alpha: 1,
            origin: 'suggested',
            jobs: ['product-graphics'],
          },
          {
            id: `${directionId}-sky-4-dark`,
            name: 'Sky 4',
            mode: 'Dark',
            hex: '#B2C7EB',
            alpha: 1,
            origin: 'suggested',
            jobs: ['product-ui-surface'],
          },
        ],
      },
      {
        id: `${directionId}-ink-family`,
        name: 'Ink',
        prominence: 'supporting',
        reason: 'Ink reproduces the confirmed text color exactly.',
        jobs: ['marketing-accent'],
        kind: 'derived',
        anchorHex: '#0C0A08',
        colors: [
          {
            id: `${directionId}-ink-9`,
            name: 'Ink 9',
            mode: 'Light',
            hex: '#0C0A08',
            alpha: 1,
            origin: 'suggested',
            jobs: ['marketing-accent'],
          },
          {
            id: `${directionId}-ink-9-dark`,
            name: 'Ink 9',
            mode: 'Dark',
            hex: '#F6F4F0',
            alpha: 1,
            origin: 'suggested',
            jobs: ['marketing-accent'],
          },
        ],
      },
      // p4-DE: a measured neutral ramp; the marketing board's footer strip is built from it.
      {
        id: `${directionId}-stone-family`,
        name: 'Stone',
        prominence: 'supporting',
        reason: 'Stone is the measured neutral ramp that carries surfaces and borders.',
        jobs: ['product-ui-surface'],
        kind: 'neutral',
        anchorHex: '#D7D4CE',
        colors: (['Light', 'Dark'] as const).flatMap(mode =>
          [
            [BOARD_HEX[mode].surface, 'Stone 1'],
            [BOARD_HEX[mode].border, 'Stone 6'],
            [BOARD_HEX[mode].text, 'Stone 12'],
          ].map(([hex, name], index) => ({
            id: `${directionId}-stone-${index + 1}`,
            name,
            mode,
            hex,
            alpha: 1,
            origin: 'suggested' as const,
            jobs: ['product-ui-surface' as const],
          }))
        ),
      },
    ],
    // p4-DE: the resolved product roles the preview boards read.
    semanticRoles: semanticRoles(directionId),
    // p6: the same colors grouped by use for the first screen.
    recommendedSystem: recommendedSystem(directionId),
    why: {
      familyAnchorSeparation: {
        minimum: directionId === 'close-harmony' ? 0.09 : 0.19,
        threshold: 0.08,
      },
      meanSourceAdjustment: 0.021,
      gamutMappedSteps: 4,
      requiredPairs: { passing: 40, total: 40 },
      meaningRoles: { inRange: 5, total: 6 },
      sequentialAdjacentCoefficientOfVariation: 0.21,
      chartSeparation: {
        minimum: 0.11,
        threshold: 0.08,
        normal: 0.19,
        protan: 0.12,
        deutan: 0.11,
        tritan: 0.15,
      },
      meanAnchorSeparation: 0.23,
      sourceContinuity: 0.1,
      basisStatements: [
        '40 of 40 required pairs pass.',
        '5 of 6 meaning roles sit inside their hue range.',
        'Minimum modeled chart separation 0.110 Delta E OK.',
        'These are this direction’s own measurements. Teul’s recommendation ranks every direction on them; it is not owner acceptance.',
      ],
      // p3-B: Light and Dark repeat the same sentence, so the Why block prints it once.
      meaningSources: [
        {
          role: 'success',
          mode: 'Light',
          source: 'reserve',
          family: 'Reserve green',
          statement: 'success: conventional green added because your palette has none.',
        },
        {
          role: 'success',
          mode: 'Dark',
          source: 'reserve',
          family: 'Reserve green',
          statement: 'success: conventional green added because your palette has none.',
        },
        {
          role: 'focus',
          mode: 'Light',
          source: 'brand',
          family: 'Sky',
          statement: 'focus: follows your brand family “Sky”.',
        },
      ],
    },
    proportionRule: COLOR_SYSTEM_PROPORTION_RULE_V3,
    brandSurfaces: {
      version: 'teul-color-system-surface-advisories/v3',
      surfaces: ['screen-product', 'screen-marketing', 'print', 'out-of-home'],
      families: [
        {
          id: `${directionId}-sky-family`,
          name: 'Sky',
          hex: '#5683D2',
          surfaces: ['screen-product'],
        },
        {
          id: `${directionId}-ink-family`,
          name: 'Ink',
          hex: '#0C0A08',
          surfaces: ['screen-product', 'screen-marketing', 'print', 'out-of-home'],
        },
      ],
      advisories: [
        {
          id: `${directionId}-sky-family`,
          surface: 'screen-product',
          severity: 'warning',
          code: 'HERO_AS_WASH',
          message:
            'Light surface resolves to the hero family “Sky” (#5683D2), a large fill. The primary is your hero. Keep it for emphasis; the neutral ramp carries surfaces. (Teul policy default.)',
        },
        {
          id: `${directionId}-sky-family`,
          surface: 'screen-product',
          severity: 'info',
          code: 'HERO_SHARE_EXCEEDED',
          message:
            'In Light the hero family “Sky” (#5683D2) carries 2 meaning roles (focus, selected); Teul’s declared share is 1. The primary is your hero. Keep it for emphasis; the neutral ramp carries surfaces. (Teul policy default.)',
        },
        {
          id: `${directionId}-sky-family`,
          surface: 'print',
          severity: 'info',
          code: 'PRINT_TRIPLET',
          message: 'Print triplet for Sky: screen #5683D2 (canonical); spot not supplied.',
        },
        {
          id: `${directionId}-sky-family`,
          surface: 'print',
          severity: 'warning',
          code: 'PRINT_SATURATED_SCREEN_COLOR',
          message:
            '#5683D2 is highly saturated on screen (OKLCH chroma 0.214, above Teul’s 0.2 threshold). Expect visible drift in CMYK.',
        },
        {
          id: `${directionId}-ink-family`,
          surface: 'print',
          severity: 'info',
          code: 'PRINT_TRIPLET',
          message: 'Print triplet for Ink: screen #0C0A08 (canonical); spot not supplied.',
        },
        // p4-DE: the real out-of-home findings for the body pair, so the boards can be checked against them.
        ...outOfHomeTextAdvisory('#0C0A08', '#FFFFFF').map(finding => ({
          id: 'body-light',
          surface: finding.surface,
          severity: finding.severity,
          code: finding.code,
          message: finding.message,
        })),
      ],
      printTriplets: [
        {
          colorId: `${directionId}-sky-family`,
          name: 'Sky',
          screenHex: '#5683D2',
          cmyk: { c: 59, m: 37, y: 0, k: 18, totalInk: 114 },
          spot: null,
          canonical: 'screen',
          note: 'No spot color was supplied, so the screen value #5683D2 is canonical.',
        },
        {
          colorId: `${directionId}-ink-family`,
          name: 'Ink',
          screenHex: '#0C0A08',
          cmyk: { c: 0, m: 17, y: 33, k: 95, totalInk: 145 },
          spot: null,
          canonical: 'screen',
          note: 'No spot color was supplied, so the screen value #0C0A08 is canonical.',
        },
      ],
      cmykDisclaimer: CMYK_UNPROFILED_DISCLAIMER,
    },
    sections: [
      {
        role: 'primary',
        title: 'Primary',
        changeLabel: 'Kept exactly as supplied',
        disposition: 'preserve',
        guidance: 'The brand Primary remains unchanged.',
        colors: [
          {
            id: 'solar',
            name: 'Solar',
            mode: 'Light',
            hex: '#E4F222',
            alpha: 1,
            origin: 'existing',
            jobs: ['brand-primary'],
          },
        ],
        exampleLabels: ['Locked Brand Primary'],
        ratings: rating('primary'),
        cardBoundary: 'black-inside-1px',
        productGraphicsSpecimens: null,
        visualizationSpecimens: null,
      },
      {
        role: 'secondary',
        title: 'Secondary',
        changeLabel: 'New recommendation',
        disposition: 'rebuild',
        guidance: 'A rebuilt supporting palette for product and marketing jobs.',
        colors: [
          {
            id: `${directionId}-sky-6`,
            name: 'Sky 6',
            mode: 'Light',
            hex: '#5683D2',
            alpha: 1,
            origin: 'suggested',
            jobs: ['marketing-accent'],
          },
        ],
        exampleLabels: ['Secondary Family Range'],
        ratings: rating('secondary'),
        cardBoundary: 'none',
        productGraphicsSpecimens: null,
        visualizationSpecimens: null,
      },
      {
        role: 'product-graphics',
        title: 'Product Graphics',
        changeLabel: 'Built from the recommended Secondary',
        disposition: 'derive',
        guidance: 'Examples use only colors approved for product graphics.',
        colors: [
          {
            id: `${directionId}-sky-4-alpha`,
            name: 'Sky surface',
            mode: 'Light',
            hex: '#B2C7EB',
            alpha: 0.5,
            origin: 'suggested',
            jobs: ['product-graphics'],
          },
        ],
        exampleLabels: ['Product Card', 'Functional Icon', 'Product Surface'],
        ratings: rating('product-graphics'),
        cardBoundary: 'none',
        productGraphicsSpecimens: productGraphicsSpecimens(directionId),
        visualizationSpecimens: null,
      },
      {
        role: 'data-visualization',
        title: 'Data Visualization',
        changeLabel: 'Built from the recommended Secondary',
        disposition: 'derive',
        guidance: 'Categorical, sequential, and diverging examples are evaluated separately.',
        colors: [
          {
            id: `${directionId}-green-7`,
            name: 'Green 7',
            mode: 'Light',
            hex: '#5AB570',
            alpha: 1,
            origin: 'suggested',
            jobs: ['categorical-data'],
          },
        ],
        exampleLabels: ['Composer:Categorical', 'Composer:Diverging'],
        ratings: rating('data-visualization'),
        cardBoundary: 'none',
        productGraphicsSpecimens: null,
        visualizationSpecimens: visualizationSpecimens(directionId),
      },
      {
        role: 'typography',
        title: 'Typography',
        changeLabel: 'Kept exactly as supplied',
        disposition: 'preserve',
        guidance: 'Exact foreground and background pairs are checked in their declared modes.',
        colors: [
          {
            id: 'primary-type',
            name: 'Primary text',
            mode: 'Light',
            hex: '#0C0A08',
            alpha: 1,
            origin: 'existing',
            jobs: ['rendered-text-pair'],
          },
        ],
        exampleLabels: ['Body Text On Light'],
        ratings: rating('typography'),
        cardBoundary: 'none',
        productGraphicsSpecimens: null,
        visualizationSpecimens: null,
        textPairs: [
          {
            id: 'body-light',
            useCategory: 'primary-body',
            mode: 'Light',
            foreground: {
              id: 'primary-type',
              name: 'Primary text',
              mode: 'Light',
              hex: '#0C0A08',
              alpha: 1,
              origin: 'existing',
              jobs: ['rendered-text-pair'],
            },
            background: {
              id: 'surface',
              name: 'Surface',
              mode: 'Light',
              hex: '#FFFFFF',
              alpha: 1,
              origin: 'existing',
              jobs: ['rendered-text-pair'],
            },
            ratio: 17.4,
            threshold: 4.5,
            status: 'pass',
            apcaLc: 104.2,
          },
        ],
      },
    ],
    technicalReceipt: {
      sourceHash: HASHES.source,
      candidateHash: HASHES.candidate,
      applicationBlueprintHash: HASHES.application,
      sectionBlueprintHash: HASHES.section,
    },
    reviewModelHash: HASHES.review,
  };
}

describe('ColorSystemBuilderV2Review', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    container.remove();
  });

  function render(
    overrides: Partial<React.ComponentProps<typeof ColorSystemBuilderV2Review>> = {}
  ) {
    const balanced = reviewModel();
    const close = reviewModel('close-harmony', 'Close harmony');
    const props: React.ComponentProps<typeof ColorSystemBuilderV2Review> = {
      models: [balanced, close],
      recommendedDirectionId: balanced.directionId,
      selectedDirectionId: balanced.directionId,
      onSelectDirection: vi.fn(),
      onCreate: vi.fn(),
      creating: false,
      ...overrides,
    };
    act(() => root.render(<ColorSystemBuilderV2Review {...props} />));
    return props;
  }

  function details(): HTMLDetailsElement {
    const element = container.querySelector<HTMLDetailsElement>('[data-teul-details]');
    if (!element) throw new Error('Missing Details disclosure.');
    return element;
  }

  /** p6: everything after the decision mounts only while the one Details disclosure is open. */
  function openDetails() {
    const element = details();
    act(() => {
      element.open = true;
      element.dispatchEvent(new Event('toggle'));
    });
  }

  function precedes(left: Node | null | undefined, right: Node | null | undefined): boolean {
    return Boolean(
      left && right && left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }

  function closeDetails() {
    const element = details();
    act(() => {
      element.open = false;
      element.dispatchEvent(new Event('toggle'));
    });
  }

  function acknowledgementInputs(): HTMLInputElement[] {
    return ['#teul-v2-ack-current-file', '#teul-v2-ack-manual-publication'].map(selector => {
      const input = container.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`Missing acknowledgement: ${selector}`);
      return input;
    });
  }

  /** Ticks both real acknowledgements; Create stays disabled until they are. */
  function acknowledge() {
    for (const input of acknowledgementInputs()) {
      if (!input.checked) act(() => input.click());
    }
  }

  function createFooter(): HTMLElement {
    const footer = container.querySelector<HTMLElement>(
      'footer[aria-label="Create reviewed color system"]'
    );
    if (!footer) throw new Error('Missing Create footer.');
    return footer;
  }

  /** Sets a controlled field's value through the native setter so React's value tracker sees the change. */
  function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype = Object.getPrototypeOf(element) as object;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor?.set) throw new Error('The element has no native value setter.');
    descriptor.set.call(element, value);
  }

  // ------------------------------------------------------------------
  // p6: the first screen leads with the decision
  // ------------------------------------------------------------------

  it('leads with the decision: the recommendation, the count sentence, and four groups by use in order', () => {
    render();
    expect(container.querySelector('#teul-v2-review-title')?.textContent).toBe(
      'Teul recommends Balanced contrast.'
    );
    expect(container.querySelector('[data-teul-system-summary]')?.textContent).toBe(
      '3 colors: Solar kept exactly, a warm neutral ramp, 1 new accent.'
    );
    const headings = Array.from(
      container.querySelectorAll<HTMLElement>('[data-teul-group] > h3')
    ).map(heading => heading.textContent);
    expect(headings).toEqual(['Brand & marketing', 'Product UI', 'Status', 'Charts']);
    // The groups come before Also considered, Why this system, Details and Create, in that order.
    const groups = container.querySelectorAll('[data-teul-group]');
    const also = container.querySelector('[data-teul-also-considered]');
    const why = container.querySelector('[data-teul-why-system]');
    expect(precedes(groups[3], also)).toBe(true);
    expect(precedes(also, why)).toBe(true);
    expect(precedes(why, details())).toBe(true);
    expect(precedes(details(), createFooter())).toBe(true);
    expect(details().open).toBe(false);
    // First-screen labels are 13 px or larger; group headings are 15 px.
    for (const heading of Array.from(
      container.querySelectorAll<HTMLElement>('[data-teul-group] > h3')
    )) {
      expect(Number.parseFloat(heading.style.fontSize)).toBeGreaterThanOrEqual(15);
    }
    for (const name of Array.from(
      container.querySelectorAll<HTMLElement>('[data-teul-card] > div > strong')
    )) {
      expect(Number.parseFloat(name.style.fontSize)).toBeGreaterThanOrEqual(13);
    }
  });

  it('prints none of the retired words on the first screen, while Details still carries them', () => {
    render();
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelector('footer[aria-label="Create reviewed color system"]')?.remove();
    // Direction names are proper names; they may say “Spectrum” without it being a heading.
    const text = (clone.textContent ?? '')
      .replace(/Balanced contrast|Close harmony|Wide spectrum/g, '')
      .toLowerCase();
    for (const word of RETIRED_WORDS) {
      expect(text, `retired word “${word}”`).not.toContain(word.toLowerCase());
    }
    for (const heading of Array.from(clone.querySelectorAll('h2, h3, h4, legend'))) {
      expect(heading.textContent?.toLowerCase()).not.toContain('spectrum');
    }
    // Family reasons and the measured numbers live in Details.
    openDetails();
    expect(container.textContent).toContain('ΔEOK');
    expect(container.textContent).toContain('anchor');
  });

  it('gives every card a plain name, a written origin tag and one “Used for:” line', () => {
    render();
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-teul-card]'));
    expect(cards.length).toBe(12);
    for (const card of cards) {
      expect(card.textContent).toContain('Used for:');
    }
    const primary = container.querySelector('[data-teul-card="primary:solar"]');
    expect(primary?.querySelector('[data-teul-origin]')?.textContent).toBe('Kept exactly');
    expect(primary?.textContent).toContain(
      'Used for: emphasis, the call to action, tags. Never as a ground.'
    );
    const accent = container.querySelector(
      '[data-teul-card="accent:balanced-contrast-sky-family"]'
    );
    expect(accent?.querySelector('strong')?.textContent).toBe('Sky accent');
    expect(accent?.querySelector('[data-teul-origin]')?.textContent).toBe('New');
    expect(accent?.textContent).toContain(
      'Used for: product illustrations; interface surfaces; chart series 1.'
    );
    expect(
      container.querySelector('[data-teul-card="primary-button"] [data-teul-origin]')?.textContent
    ).toBe('From your brand');
    // Status cards are named by role and the hue the fill actually has.
    expect(
      Array.from(container.querySelectorAll('[data-teul-group="status"] [data-teul-card] strong'))
        .map(name => name.textContent)
        .filter(name => name !== 'Used for:')
    ).toEqual(['Success green', 'Error red']);
  });

  it('shows Light and Dark side by side when they differ and once when the value is shared', () => {
    render();
    const background = container.querySelector('[data-teul-card="background"] [data-teul-part]');
    const backgroundSwatches = Array.from(background?.querySelectorAll('[role="img"]') ?? []);
    expect(backgroundSwatches.map(swatch => swatch.getAttribute('aria-label'))).toEqual([
      'Background, Light, #FFFFFF',
      'Background, Dark, #0C0A08',
    ]);
    expect(backgroundSwatches.map(swatch => (swatch as HTMLElement).style.background)).toEqual([
      'rgb(255, 255, 255)',
      'rgb(12, 10, 8)',
    ]);
    const successFill = container.querySelector(
      '[data-teul-card="status:success"] [data-teul-part="Fill"]'
    );
    const fillSwatches = Array.from(successFill?.querySelectorAll('[role="img"]') ?? []);
    expect(fillSwatches.map(swatch => swatch.getAttribute('aria-label'))).toEqual([
      'Success green, Fill, Light and Dark, #1C882D',
    ]);
    expect(successFill?.textContent).toContain('Light and Dark #1C882D');
    // The primary button carries fill, text on it, hover and pressed.
    expect(
      Array.from(
        container.querySelectorAll('[data-teul-card="primary-button"] [data-teul-part]')
      ).map(part => part.getAttribute('data-teul-part'))
    ).toEqual(['Fill', 'Text on it', 'Hover', 'Pressed']);
  });

  it('keeps the recorded palette without rendering unrequested ramps or invented evenness', () => {
    const kept = reviewModel();
    const charts = kept.sections.find(section => section.role === 'data-visualization')!;
    charts.disposition = 'preserve';
    charts.visualizationSpecimens!.sequential = null;
    charts.visualizationSpecimens!.diverging = null;
    kept.why!.sequentialAdjacentCoefficientOfVariation = null;
    render({ models: [kept] });
    expect(container.querySelectorAll('[data-teul-chart-series-item]')).toHaveLength(3);
    expect(container.querySelector('[data-teul-chart-strip]')).toBeNull();
    expect(container.querySelectorAll('[data-teul-chart-legend]')).toHaveLength(1);
    expect(container.textContent).toContain(
      'Source palette kept. Unrequested chart examples are omitted.'
    );
    openDetails();
    expect(container.querySelector('[data-teul-specimen-kind="categorical"]')).not.toBeNull();
    expect(container.querySelector('[data-teul-specimen-kind="sequential"]')).toBeNull();
    expect(container.querySelector('[data-teul-specimen-kind="diverging"]')).toBeNull();
    expect(container.querySelectorAll('[data-teul-chart-legend="categorical"]')).toHaveLength(2);
    expect(container.querySelector('[data-teul-chart-legend="sequential"]')).toBeNull();
    expect(container.querySelector('[data-teul-chart-legend="diverging"]')).toBeNull();
    expect(container.textContent).toContain('Not requested; source palette kept');
    expect(container.textContent).not.toContain('0.000 coefficient of variation');
  });

  it('labels native hex as an approximation while painting the exact source channels', () => {
    const model = reviewModel();
    const card = model.recommendedSystem!.brand[0];
    const nativeValue = buildColorSystemSrgbValueV1({ r: 0.7, g: 0.8, b: 0.3 });
    card.parts[0].values = [{ mode: 'Light', hex: nativeValue.hex, nativeValue }];
    render({ models: [model] });
    const rendered = container.querySelector(`[data-teul-card="${card.id}"]`)!;
    expect(rendered.textContent).toContain(`≈ ${nativeValue.hex}`);
    expect(rendered.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      `≈ ${nativeValue.hex}`
    );
    expect(rendered.querySelector('[role="img"]')?.getAttribute('style')).toContain(
      'color(srgb 0.7 0.8 0.3)'
    );
  });

  it.each(['sequential', 'diverging'] as const)('omits only an unrequested %s chart', absent => {
    const model = reviewModel();
    const charts = model.sections.find(section => section.role === 'data-visualization')!;
    charts.disposition = 'preserve';
    charts.visualizationSpecimens![absent] = null;
    if (absent === 'sequential') model.why!.sequentialAdjacentCoefficientOfVariation = null;
    render({ models: [model] });
    const present = absent === 'sequential' ? 'diverging' : 'sequential';
    expect(container.querySelector(`[data-teul-chart-strip="${absent}"]`)).toBeNull();
    expect(container.querySelector(`[data-teul-chart-strip="${present}"]`)).not.toBeNull();
    openDetails();
    expect(container.querySelector(`[data-teul-specimen-kind="${absent}"]`)).toBeNull();
    expect(container.querySelector(`[data-teul-specimen-kind="${present}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-teul-chart-legend="${absent}"]`)).toBeNull();
  });

  it('paints translucent native chart marks on their declared ground without a hex round-trip', () => {
    const model = reviewModel();
    const specimens = model.sections.find(
      section => section.role === 'data-visualization'
    )!.visualizationSpecimens!;
    const nativeValue = buildColorSystemSrgbValueV1({ r: 0.7, g: 0.8, b: 0.3 }, 0.5);
    for (const specimen of [specimens.categorical, specimens.sequential!, specimens.diverging!]) {
      Object.assign(specimen.marks[0].color, { hex: nativeValue.hex, alpha: 0.5, nativeValue });
    }
    render({ models: [model] });
    const paint = 'color(srgb 0.85 0.9 0.65)';
    expect(
      container
        .querySelector('[data-teul-chart-series-item="1"] [role="img"]')
        ?.getAttribute('style')
    ).toContain(paint);
    expect(
      container
        .querySelector('[data-teul-chart-strip="sequential"] [role="img"] > span')
        ?.getAttribute('style')
    ).toContain(paint);
    openDetails();
    for (const kind of ['categorical', 'sequential', 'diverging']) {
      expect(
        container
          .querySelector(`[data-teul-specimen-kind="${kind}"] [role="img"]`)
          ?.getAttribute('style')
      ).toContain(paint);
      const legends = container.querySelectorAll(`[data-teul-chart-legend="${kind}"]`);
      expect(legends).toHaveLength(2);
      legends.forEach(legend => {
        expect(legend.querySelector('[data-teul-legend-paint]')?.getAttribute('style')).toContain(
          paint
        );
      });
    }
  });

  it('shows the exact ordered chart labels and paints in nearby summary and specimen legends', () => {
    const model = reviewModel();
    const specimens = model.sections.find(
      section => section.role === 'data-visualization'
    )!.visualizationSpecimens!;
    specimens.categorical.marks[0].label = 'Recorded category — label';
    render({ models: [model] });
    expect(container.querySelectorAll('[data-teul-chart-legend]')).toHaveLength(3);
    openDetails();
    for (const specimen of [specimens.categorical, specimens.sequential!, specimens.diverging!]) {
      const legends = container.querySelectorAll(`[data-teul-chart-legend="${specimen.kind}"]`);
      expect(legends).toHaveLength(2);
      legends.forEach(legend => {
        expect(legend.querySelector('ol')?.getAttribute('aria-label')).toBe(
          `${specimen.kind} chart legend`
        );
        const entries = Array.from(legend.querySelectorAll('[data-teul-legend-order]'));
        expect(entries.map(entry => Number(entry.getAttribute('data-teul-legend-order')))).toEqual(
          specimen.marks.map(mark => mark.order)
        );
        expect(entries.map(entry => entry.textContent)).toEqual(
          specimen.marks.map(mark => mark.label)
        );
        expect(
          entries.map(entry =>
            entry.querySelector('[data-teul-legend-paint]')?.getAttribute('data-teul-legend-paint')
          )
        ).toEqual(specimen.marks.map(mark => mark.color.id));
        entries.forEach((entry, index) => {
          const expected = document.createElement('span');
          expected.style.background = specimen.marks[index].renderedHex;
          expect(
            entry.querySelector<HTMLElement>('[data-teul-legend-paint]')?.style.background
          ).toBe(expected.style.background);
        });
      });
    }
  });

  it('numbers the chart series, shows both ramps as strips, and states an unmet request in words', () => {
    render();
    const series = Array.from(container.querySelectorAll('[data-teul-chart-series-item]'));
    expect(series.map(item => item.textContent)).toEqual([
      'Series 1#5683D2',
      'Series 2#5AB570',
      'Series 3#924F35',
    ]);
    expect(
      container
        .querySelector('[data-teul-chart-strip="sequential"] [role="img"]')
        ?.getAttribute('aria-label')
    ).toBe('Sequential ramp: #E4EBF6, #B2C7EB, #5683D2');
    expect(
      container.querySelector('[data-teul-chart-strip="diverging"] [role="img"]')?.children
    ).toHaveLength(3);
    // Balanced contrast met its request; Close harmony did not, and says so in words.
    expect(container.querySelector('[data-teul-chart-capacity]')).toBeNull();
    render({ selectedDirectionId: 'close-harmony' });
    expect(container.querySelector('[data-teul-chart-capacity]')?.textContent).toBe(
      'Two of three series are distinguishable in Dark.'
    );
  });

  it('lists exactly the other ready directions under Also considered and swaps on selection', () => {
    const onSelectDirection = vi.fn();
    const balanced = reviewModel();
    const close = reviewModel('close-harmony', 'Close harmony');
    const wide = reviewModel('wide-spectrum', 'Wide spectrum');
    render({ models: [balanced, close, wide], onSelectDirection });
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-teul-also-considered] [data-teul-direction-option]'
      )
    );
    expect(rows.map(row => row.getAttribute('data-teul-direction-option'))).toEqual([
      'close-harmony',
      'wide-spectrum',
    ]);
    expect(container.querySelector('input[value="balanced-contrast"]')).toBeNull();
    // Each row: name, its accent swatches, one sentence.
    expect(rows[0]?.querySelector('strong')?.textContent).toBe('Close harmony');
    expect(
      Array.from(rows[0]?.querySelectorAll('[role="group"] [role="img"]') ?? []).map(swatch =>
        swatch.getAttribute('aria-label')
      )
    ).toEqual(['Sky accent #5683D2']);
    expect(rows[0]?.textContent).toContain(
      'One new accent close to your primary hue; two of three chart series stay distinguishable in Dark.'
    );
    expect(rows[1]?.textContent).toContain('spread around the color wheel');
    const radios = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name="teul-v2-color-system-direction"]')
    );
    expect(radios.map(radio => radio.value)).toEqual(['close-harmony', 'wide-spectrum']);
    expect(radios.every(radio => !radio.checked)).toBe(true);
    act(() => radios[1]?.click());
    expect(onSelectDirection).toHaveBeenLastCalledWith('wide-spectrum');

    // Showing an alternative keeps the recommendation in the title and offers it back, tagged.
    render({
      models: [balanced, close, wide],
      onSelectDirection,
      selectedDirectionId: 'wide-spectrum',
    });
    expect(container.querySelector('#teul-v2-review-title')?.textContent).toBe(
      'Teul recommends Balanced contrast.'
    );
    expect(container.querySelector('[data-teul-showing]')?.textContent).toBe(
      'Showing Wide spectrum. Select Balanced contrast under Also considered to return to the recommendation.'
    );
    const offered = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-teul-also-considered] [data-teul-direction-option]'
      )
    );
    expect(offered.map(row => row.getAttribute('data-teul-direction-option'))).toEqual([
      'balanced-contrast',
      'close-harmony',
    ]);
    expect(offered[0]?.textContent).toContain('Recommended');
    expect(offered[1]?.textContent).not.toContain('Recommended');
    // A single ready direction has nothing to compare.
    render({ models: [balanced] });
    expect(container.querySelector('[data-teul-also-considered]')).toBeNull();
  });

  it('explains why in four sentences without numbers, composing the difference from every direction', () => {
    render();
    const sentences = Array.from(container.querySelectorAll('[data-teul-why-system] li')).map(
      item => item.textContent ?? ''
    );
    expect(sentences).toHaveLength(4);
    expect(sentences[0]).toBe(
      'Solar stays exactly as recorded in every mode and your recorded text and surface colors stay as they are.'
    );
    expect(sentences[1]).toContain('Teul added a warm neutral ramp');
    expect(sentences[2]).toBe(
      'New accent placement differs: Balanced contrast sets its new accents opposite your primary hue, Close harmony keeps its new accents close to your primary hue; Teul ranked Balanced contrast first using the same checks.'
    );
    expect(sentences[3]).toContain('approval stays with the brand owner');
    expect(sentences.join(' ')).not.toMatch(/\d/);
  });

  it('falls back to the data names and skips the grouped screen when a model carries no projection', () => {
    const bare = { ...reviewModel(), recommendedSystem: undefined };
    delete (bare as { recommendedSystem?: unknown }).recommendedSystem;
    render({ models: [bare, reviewModel('close-harmony', 'Close harmony')] });
    expect(container.querySelector('#teul-v2-review-title')?.textContent).toBe(
      'Teul recommends Balanced contrast.'
    );
    expect(container.querySelector('[data-teul-system-summary]')).toBeNull();
    expect(container.querySelector('[data-teul-group="brand"]')).toBeNull();
    // Charts come from the specimens and still render; Why this system needs the projection.
    expect(container.querySelector('[data-teul-group="charts"]')).not.toBeNull();
    expect(container.querySelector('[data-teul-why-system]')).toBeNull();
    openDetails();
    expect(container.querySelector('[aria-label="Sky Light scale"]')).not.toBeNull();
    expect(container.querySelector('[data-teul-family-token-path]')).toBeNull();
    expect(container.textContent).toContain('Create this system');
  });

  // ------------------------------------------------------------------
  // Details: everything that exists today, after the decision
  // ------------------------------------------------------------------

  it('lists what a Replace plan did not carry inside Details, and shows no such panel otherwise (p5-A)', () => {
    render();
    openDetails();
    expect(container.querySelector('[data-teul-replaced-summary]')).toBeNull();

    const replacedModel: ColorSystemReviewModelV2 = {
      ...reviewModel(),
      replaced: {
        statements: ['Secondary: replaced; 2 recorded colors are not carried into the new system.'],
        colors: [
          {
            id: 'variable:gold',
            name: 'Secondary / Gold',
            section: 'secondary',
            mode: 'Light',
            hex: '#D9A441',
          },
          {
            id: 'variable:terracotta',
            name: 'Secondary / Terracotta',
            section: 'secondary',
            mode: 'Light',
            hex: '#B5533C',
          },
        ],
      },
    };
    closeDetails();
    render({
      models: [replacedModel],
      recommendedDirectionId: replacedModel.directionId,
      selectedDirectionId: replacedModel.directionId,
    });
    // Collapsed by default, so nothing about it is on the first screen.
    expect(container.querySelector('[data-teul-replaced-summary]')).toBeNull();
    openDetails();
    const panel = container.querySelector('[data-teul-replaced-summary]');
    expect(panel?.textContent).toContain('Replaced, not carried');
    expect(panel?.textContent).toContain(
      'Secondary: replaced; 2 recorded colors are not carried into the new system.'
    );
    expect(panel?.textContent).toContain('Secondary / Gold · Light #D9A441');
    expect(panel?.textContent).toContain('Secondary / Terracotta · Light #B5533C');
  });

  it('keeps the five sections in order inside Details with plain family names, token paths and ratings', () => {
    render();
    openDetails();

    const sectionTitles = Array.from(
      container.querySelectorAll<HTMLElement>('article[aria-labelledby^="teul-review-section-"] h3')
    ).map(element => element.textContent);
    expect(sectionTitles).toEqual([
      'Primary',
      'Secondary',
      'Product Graphics',
      'Data Visualization',
      'Typography',
    ]);
    expect(container.textContent).toContain('Primary stays locked');
    expect(container.textContent).toContain('Teul proposes');
    expect(container.textContent).toContain('Why these Secondary families');
    // Generated families print their plain names; the brand-derived family keeps its recorded name.
    expect(container.querySelector('[aria-label="Sky accent Light scale"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Sky accent Dark scale"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Ink Light scale"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Neutral ramp Light scale"]')).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll('[data-teul-family-token-path]')).map(
        item => item.textContent
      )
    ).toEqual([
      'Tokens color/sky/1 to color/sky/1, in the order shown.',
      'Tokens color/ink/1 to color/ink/1, in the order shown.',
      'Tokens color/neutral/1 to color/neutral/3, in the order shown.',
    ]);
    expect(container.textContent).toContain('Intended for: Product Graphics, Product UI Surface');
    expect(container.querySelector('[aria-label="Secondary colors"]')).toBeNull();
    expect(container.textContent).toContain('Generated chart examples');
    expect(container.textContent).toContain('Generated product-use examples');
    expect(container.textContent).toContain('not copied source artwork or brand approval');
    expect(container.querySelector('[aria-label="Product Graphics colors"]')).toBeNull();
    expect(container.textContent).toContain('on #FFFFFF');
    expect(container.textContent).toContain('passes 3:1 non-text check');
    expect(
      Array.from(container.querySelectorAll('[data-teul-product-specimen]')).map(specimen =>
        specimen.getAttribute('data-teul-product-specimen')
      )
    ).toEqual(['product-graphic', 'iconography', 'product-surface']);
    expect(
      Array.from(container.querySelectorAll('[data-teul-product-specimen]')).map(specimen =>
        specimen.getAttribute('aria-label')
      )
    ).toEqual([
      expect.stringContaining('#5683D2'),
      expect.stringContaining('#924F35'),
      expect.stringContaining('#B2C7EB'),
    ]);
    expect(container.textContent).toContain('Category 1');
    expect(container.textContent).toContain('Zero or neutral midpoint');
    expect(container.querySelectorAll('[data-teul-specimen-kind]')).toHaveLength(3);
    expect(container.querySelector('[aria-label="Zero reference line"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Composer:');
    // The old “Examples:” line printed internal ids; it is gone.
    expect(container.textContent).not.toContain('Examples:');
    expect(container.textContent).toContain('Measured checks');
    expect(container.textContent).toContain('Required limit: 4.5 to 1');
    expect(container.textContent).toContain('#E4F222 · 100% opacity · Light · Existing');
    expect(container.textContent).toContain('#B2C7EB · 50% opacity');
    expect(container.querySelector('[aria-label*="#B2C7EB, 50% opacity"]')).not.toBeNull();
    expect(container.textContent).not.toContain('product-ui-surface');
  });

  it('renders every declared graphic layer and pair in the shared geometry with native alpha applied once', () => {
    const model = reviewModel();
    const specimens = model.sections.find(
      section => section.role === 'product-graphics'
    )!.productGraphicsSpecimens!;
    const nativeValue = buildColorSystemSrgbValueV1({ r: 0.7, g: 0.8, b: 0.3 }, 0.5);
    for (const specimen of specimens) {
      const selected = {
        ...specimen.colors[0],
        name: 'Selected control',
        hex: nativeValue.hex,
        alpha: 0.5,
        nativeValue,
      };
      const surface = specimen.surface!;
      const colors = [
        { ...surface, name: 'Outer backdrop', hex: '#E4EBF6' },
        surface,
        selected,
        { ...surface, name: 'Label ink', hex: '#000000' },
      ];
      const projection = buildColorSystemProductGraphicsProjectionV1(
        {
          applicationId: specimen.derivationId,
          width: 240,
          height: 140,
          root: {
            id: 'outer',
            useId: 'outer',
            shape: { kind: 'rect', x: 0, y: 0, width: 240, height: 140 },
            children: [
              {
                id: 'card',
                useId: 'card',
                shape: { kind: 'rect', x: 16, y: 16, width: 208, height: 108 },
                children: [
                  {
                    id: 'control',
                    useId: 'selected',
                    shape: { kind: 'rect', x: 40, y: 40, width: 100, height: 40 },
                    children: [
                      {
                        id: 'glyphs',
                        useId: 'label',
                        textAlternative: 'Continue <exact label>',
                        shape: {
                          kind: 'compound-polygon',
                          fillRule: 'evenodd',
                          contours: [
                            [
                              { x: 52, y: 50 },
                              { x: 72, y: 50 },
                              { x: 72, y: 70 },
                              { x: 52, y: 70 },
                            ],
                          ],
                        },
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          provenance: 'declared-context',
          requirementsHash: HASHES.source,
          contextId: specimen.derivationId,
          uses: [
            {
              id: 'outer',
              role: 'outer-backdrop',
              assessment: 'decorative',
              ref: { kind: 'preserved-source-color', stableColorId: 'outer', mode: 'Light' },
            },
            {
              id: 'card',
              role: 'card-surface',
              assessment: 'decorative',
              ref: { kind: 'preserved-source-color', stableColorId: 'card', mode: 'Light' },
            },
            {
              id: 'selected',
              role:
                specimen.job === 'product-ui-surface'
                  ? 'control-surface'
                  : specimen.job === 'functional-iconography'
                    ? 'functional-icon'
                    : 'accent',
              assessment: 'informative',
              ref: { kind: 'preserved-source-color', stableColorId: 'selected', mode: 'Light' },
            },
            {
              id: 'label',
              role: 'label',
              assessment: 'informative',
              ref: { kind: 'preserved-source-color', stableColorId: 'label', mode: 'Light' },
            },
          ],
          pairs: [
            {
              pairEvidenceId: 'selected-card',
              foregroundUseId: 'selected',
              backgroundUseId: 'card',
              underlayUseId: null,
            },
            {
              pairEvidenceId: 'label-selected',
              foregroundUseId: 'label',
              backgroundUseId: 'selected',
              underlayUseId: 'card',
            },
          ],
        }
      );
      specimen.rendering = {
        ...projection,
        uses: projection.uses.map(({ ref: _ref, ...use }, index) => ({
          ...use,
          color: colors[index],
        })),
        pairs: projection.pairs.map(pair => ({ ...pair, contrast: specimen.contrast! })),
      };
    }
    specimens[0].renderingLimitation =
      'Exact legacy pair display only; source-specific spatial permission is unassessed.';
    render({ models: [model] });
    openDetails();
    const graphics = Array.from(container.querySelectorAll('svg[data-teul-graphic-context]'));
    expect(graphics).toHaveLength(3);
    expect(container.textContent).toContain('source-specific spatial permission is unassessed.');
    expect(container.textContent).toContain(
      'An internal control surface tested with its declared labels and surroundings.'
    );
    for (const [index, svg] of graphics.entries()) {
      const plan = specimens[index].rendering!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 240 140');
      expect(svg.getAttribute('data-teul-graphic-layout')).toBe(plan.layoutHash);
      expect(svg.getAttribute('data-teul-graphic-requirements')).toBe(HASHES.source);
      expect(
        Array.from(svg.children).map(node => node.getAttribute('data-teul-graphic-node'))
      ).toEqual(plan.nodes.map(node => node.id));
      const selected = svg.querySelector('[data-teul-graphic-use="selected"]')!;
      expect(selected.getAttribute('fill')).toBe('color(srgb 0.7 0.8 0.3 / 0.5)');
      expect(selected.getAttribute('opacity')).toBeNull();
      expect(selected.getAttribute('x')).toBe('40');
      expect(selected.getAttribute('width')).toBe('100');
      const label = svg.querySelector('path')!;
      expect(label.getAttribute('d')).toBe('M0 0 L20 0 L20 20 L0 20 Z');
      expect(label.getAttribute('transform')).toBe('translate(52 50)');
      expect(label.getAttribute('fill-rule')).toBe('evenodd');
      expect(label.querySelector('title')!.textContent).toBe('Continue <exact label>');
      expect(svg.querySelectorAll('text, image, foreignObject')).toHaveLength(0);
      const pair = svg
        .closest('figure')!
        .querySelector('[data-teul-graphic-pair="label-selected"]')!;
      expect(pair.getAttribute('data-teul-graphic-background')).toBe('selected');
      expect(pair.getAttribute('data-teul-graphic-underlay')).toBe('card');
      expect(pair.textContent).toContain('Label ink on Selected control');
    }
  });

  it('keeps ambiguous legacy graphics explicitly unsupported rather than inventing application geometry', () => {
    const model = reviewModel();
    const specimens = model.sections.find(
      section => section.role === 'product-graphics'
    )!.productGraphicsSpecimens!;
    specimens[0].rendering = null;
    specimens[0].renderingLimitation =
      'Legacy graphic has multiple exact contexts. Rebuild before Create.';
    render({ models: [model] });
    openDetails();
    const graphic = container.querySelector('[data-teul-product-specimen="product-graphic"]')!;
    expect(graphic.querySelector('svg')).toBeNull();
    expect(graphic.textContent).toContain(
      'Legacy graphic has multiple exact contexts. Rebuild before Create.'
    );
  });

  it('uses semantic direction controls and delegates selection and Create without posting messages', () => {
    const onSelectDirection = vi.fn();
    const onCreate = vi.fn();
    const postMessage = vi.spyOn(window.parent, 'postMessage');
    const props = render({ onSelectDirection, onCreate });

    const close = container.querySelector<HTMLInputElement>('input[value="close-harmony"]');
    expect(close).not.toBeNull();
    expect(close?.closest('[data-teul-also-considered]')).not.toBeNull();
    act(() => close?.focus());
    expect(document.activeElement).toBe(close);
    act(() => close?.click());
    expect(onSelectDirection).toHaveBeenCalledWith('close-harmony');

    const create = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Create this system'
    );
    expect(create).toBeDefined();
    acknowledge();
    act(() => create?.click());
    expect(onCreate).toHaveBeenCalledWith(props.models[0], {
      currentFileAcknowledged: true,
      manualPublicationAcknowledged: true,
    });
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it('keeps recommendation separate from approval and compares the directions inside Details', () => {
    render();
    expect(container.querySelector('[data-teul-selected-direction-authority]')?.textContent).toBe(
      'Teul recommendation · brand-owner approval still required'
    );
    expect(container.querySelector('[data-teul-direction-comparison]')).toBeNull();
    openDetails();
    const comparison = container.querySelector('[data-teul-direction-comparison]');
    const balancedRow = comparison?.querySelector('[data-teul-direction-row="balanced-contrast"]');
    const closeRow = comparison?.querySelector('[data-teul-direction-row="close-harmony"]');
    expect(balancedRow?.textContent).toContain('Balance continuity with useful distinction.');
    expect(balancedRow?.textContent).toContain('Teul recommendation · showing');
    expect(balancedRow?.textContent).toContain(
      'Best for: Product, graphics, and data visualization.'
    );
    expect(balancedRow?.textContent).toContain('Tradeoff: Less restrained than Close Harmony.');
    expect(closeRow?.textContent).toContain('Stay closest to the existing palette.');
    expect(closeRow?.textContent).toContain('Teul proposal');
    expect(closeRow?.textContent).not.toContain('showing');
    // The table is read-only; selection happens under Also considered.
    expect(comparison?.querySelector('input')).toBeNull();
    const ownership = container.querySelector('[data-teul-ownership-summary]');
    expect(precedes(ownership, comparison)).toBe(true);
  });

  it('keeps Teul recommendation and owner approval visible after selecting an alternative', () => {
    render({ selectedDirectionId: 'close-harmony' });
    expect(container.querySelector('#teul-v2-review-title')?.textContent).toBe(
      'Teul recommends Balanced contrast.'
    );
    expect(container.querySelector('[data-teul-showing]')?.textContent).toContain(
      'Showing Close harmony.'
    );
    const authority = container.querySelector('[data-teul-selected-direction-authority]');
    expect(authority?.textContent).toContain('Selected Teul proposal');
    expect(authority?.textContent).toContain('Teul recommends Balanced contrast');
    expect(authority?.textContent).toContain('brand-owner approval still required');
    expect(details().open).toBe(false);
    openDetails();
    expect(
      container
        .querySelector('[data-teul-direction-row="close-harmony"]')
        ?.getAttribute('data-teul-selected')
    ).toBe('true');
  });

  it('places one non-sticky Create action after the collapsed Details and all review evidence', () => {
    render();
    const action = createFooter();
    expect(details().open).toBe(false);
    expect(precedes(details(), action)).toBe(true);
    openDetails();
    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('article[aria-labelledby^="teul-review-section-"]')
    );
    const limitations = container.querySelector<HTMLElement>(
      '[aria-labelledby="teul-v2-review-limitations"]'
    );
    const technicalDetails = container.querySelector<HTMLElement>('[data-teul-technical-details]');
    const createButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button')
    ).filter(button => button.textContent === 'Create this system');

    expect(sections).toHaveLength(5);
    expect(limitations).not.toBeNull();
    expect(technicalDetails).not.toBeNull();
    expect(createButtons).toHaveLength(1);
    expect(precedes(sections[4] ?? null, action)).toBe(true);
    expect(precedes(limitations, action)).toBe(true);
    expect(precedes(technicalDetails, action)).toBe(true);
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(action.style.position).toBe('');
    expect(action.style.bottom).toBe('');
    expect(action.dataset.state).toBe('awaiting-acknowledgement');
    const acknowledgements = action.querySelector('[data-teul-create-acknowledgements]');
    expect(precedes(acknowledgements, createButtons[0] ?? null)).toBe(true);
    acknowledge();
    expect(action.dataset.state).toBe('ready');
  });

  it('exposes focusable ready, loading, and blocked Create states to assistive technology', () => {
    render();
    acknowledge();

    let action = container.querySelector<HTMLElement>(
      'footer[aria-label="Create reviewed color system"]'
    );
    let create = action?.querySelector<HTMLButtonElement>('button') ?? null;
    let description = container.querySelector<HTMLElement>('#teul-v2-create-description');
    expect(action?.dataset.state).toBe('ready');
    expect(create?.disabled).toBe(false);
    expect(create?.getAttribute('aria-busy')).toBe('false');
    expect(create?.getAttribute('aria-describedby')).toBe('teul-v2-create-description');
    expect(description?.getAttribute('role')).toBe('status');
    expect(description?.textContent).toContain('Ready to create an editable copy');
    act(() => create?.focus());
    expect(document.activeElement).toBe(create);
    expect(container.querySelector('style')?.textContent).toContain('button:focus-visible');

    render({ creating: true });
    action = container.querySelector<HTMLElement>(
      'footer[aria-label="Create reviewed color system"]'
    );
    create = action?.querySelector<HTMLButtonElement>('button') ?? null;
    description = container.querySelector<HTMLElement>('#teul-v2-create-description');
    expect(action?.dataset.state).toBe('loading');
    expect(create?.disabled).toBe(true);
    expect(create?.getAttribute('aria-busy')).toBe('true');
    expect(create?.textContent).toBe('Creating system…');
    expect(description?.textContent).toContain('Creating the reviewed system');

    render({
      creating: false,
      blocker: {
        title: 'Source changed',
        message: 'Analyze the current file again before creating this system.',
      },
    });
    action = container.querySelector<HTMLElement>(
      'footer[aria-label="Create reviewed color system"]'
    );
    create = action?.querySelector<HTMLButtonElement>('button') ?? null;
    const alert = container.querySelector<HTMLElement>('#teul-v2-review-blocker[role="alert"]');
    expect(action?.dataset.state).toBe('blocked');
    expect(create?.disabled).toBe(true);
    expect(create?.getAttribute('aria-describedby')).toContain('teul-v2-review-blocker');
    expect(alert?.textContent).toContain('Source changed');
    // The alert sits next to Create, after Details.
    expect(precedes(details(), alert)).toBe(true);
    expect(precedes(alert, action)).toBe(true);
    expect(container.querySelector('#teul-v2-create-description')?.textContent).toContain(
      'Resolve the issue above before Create.'
    );
  });

  it('keeps every hash out of the default view and reveals them inside Details', () => {
    render();
    expect(details().open).toBe(false);
    for (const hash of Object.values(HASHES)) {
      expect(container.textContent).not.toContain(hash);
    }
    openDetails();
    expect(container.querySelector('[data-teul-technical-details]')?.textContent).toContain(
      'Source fingerprint'
    );
    for (const hash of Object.values(HASHES)) {
      expect(container.textContent).toContain(hash);
    }
  });

  it('shows actionable blocked, loading, and empty states and prevents Create', () => {
    const onCreate = vi.fn();
    render({
      onCreate,
      blocker: {
        title: 'Source changed',
        message: 'Analyze the current file again before creating this system.',
      },
    });
    const blockedButton = createFooter().querySelector<HTMLButtonElement>('button');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Source changed');
    expect(blockedButton?.disabled).toBe(true);
    act(() => blockedButton?.click());
    expect(onCreate).not.toHaveBeenCalled();

    render({ onCreate, blocker: null, creating: true });
    expect(container.textContent).toContain('Creating system…');
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('true');

    render({ models: [], selectedDirectionId: null, blocker: null, creating: false });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Resolve the color and intent evidence, then analyze again.'
    );
  });

  it('requires both plain-language acknowledgements before Create enables', () => {
    const onCreate = vi.fn();
    render({ onCreate });
    const footer = createFooter();
    const boxes = Array.from(footer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const labels = boxes.map(box =>
      footer.querySelector(`label[for="${box.id}"]`)?.textContent?.trim()
    );
    const create = Array.from(footer.querySelectorAll('button')).find(
      button => button.textContent === 'Create this system'
    );
    const description = () =>
      container.querySelector('#teul-v2-create-description')?.textContent ?? '';

    expect(labels).toEqual([
      'Create in the current Figma file',
      'I understand publishing to a library is a separate manual step',
    ]);
    expect(boxes.map(box => box.checked)).toEqual([false, false]);
    expect(create?.disabled).toBe(true);
    expect(footer.dataset.state).toBe('awaiting-acknowledgement');
    expect(description()).toContain('Tick both boxes to enable Create');
    act(() => create?.click());
    expect(onCreate).not.toHaveBeenCalled();

    act(() => boxes[0]?.click());
    expect(create?.disabled).toBe(true);
    act(() => boxes[1]?.click());
    expect(create?.disabled).toBe(false);
    expect(footer.dataset.state).toBe('ready');
    expect(description()).toContain('Ready to create an editable copy');

    act(() => create?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[1]).toEqual({
      currentFileAcknowledged: true,
      manualPublicationAcknowledged: true,
    });

    act(() => boxes[0]?.click());
    expect(create?.disabled).toBe(true);
    expect(footer.dataset.state).toBe('awaiting-acknowledgement');
  });

  it('shows a blocker reference below the plain headline', () => {
    render({
      blocker: {
        title: 'Create could not continue',
        message: 'A created variable did not match its reviewed value.',
        reference: 'HEX_MISMATCH',
      },
    });
    const alert = container.querySelector<HTMLElement>('#teul-v2-review-blocker');
    expect(alert?.querySelector('strong')?.textContent).toBe('Create could not continue');
    const reference = alert?.querySelector<HTMLElement>('[data-teul-error-reference]');
    expect(reference?.textContent).toBe('Reference: HEX_MISMATCH');
    expect(reference?.style.fontSize).toBe('12px');

    render({ blocker: 'HEX_MISMATCH: A created variable did not match its reviewed value.' });
    const stringAlert = container.querySelector<HTMLElement>('#teul-v2-review-blocker');
    expect(stringAlert?.querySelector('span')?.textContent).toBe(
      'A created variable did not match its reviewed value.'
    );
    expect(stringAlert?.querySelector('[data-teul-error-reference]')?.textContent).toBe(
      'Reference: HEX_MISMATCH'
    );
  });

  it('compares every direction side by side in Details with real anchor swatches, plainly named', () => {
    const balanced = reviewModel();
    const close = reviewModel('close-harmony', 'Close harmony');
    const wide = reviewModel('wide-spectrum', 'Wide spectrum');
    render({ models: [balanced, close, wide] });
    openDetails();

    const table = container.querySelector('table[data-teul-direction-table]');
    expect(table).not.toBeNull();
    expect(table?.getAttribute('aria-label')).toBe(
      'Directions compared: family anchors, promise, and measures'
    );
    const rows = Array.from(table?.querySelectorAll<HTMLElement>('tbody tr') ?? []);
    expect(rows.map(row => row.getAttribute('data-teul-direction-row'))).toEqual([
      'balanced-contrast',
      'close-harmony',
      'wide-spectrum',
    ]);
    expect(rows.map(row => row.getAttribute('data-teul-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    for (const row of rows) {
      const swatches = Array.from(row.querySelectorAll<HTMLElement>('[role="group"] [role="img"]'));
      expect(swatches).toHaveLength(balanced.families.length);
      // Brand-derived families lead the strip, then accents, then the neutral ramp, by plain name.
      expect(swatches.map(swatch => swatch.getAttribute('aria-label'))).toEqual([
        'Ink #0C0A08',
        'Sky accent #5683D2',
        'Neutral ramp #D7D4CE',
      ]);
      expect(swatches.map(swatch => swatch.style.background)).toEqual([
        'rgb(12, 10, 8)',
        'rgb(86, 131, 210)',
        'rgb(215, 212, 206)',
      ]);
      expect(row.textContent).toContain('Ink #0C0A08 · Sky accent #5683D2');
      expect(row.querySelector('[data-teul-direction-measures]')?.textContent).toContain(
        '5/6 meaning roles in range · chart separation 0.11 · ramp evenness 0.21 · 4 steps gamut-mapped'
      );
    }
    expect(rows[0]?.textContent).toContain('anchors ≥ 0.19 ΔEOK');
    expect(rows[1]?.textContent).toContain('anchors ≥ 0.09 ΔEOK');
    expect(rows[0]?.textContent).toContain('Balance continuity with useful distinction.');
    expect(rows[1]?.textContent).toContain('Stay closest to the existing palette.');

    render({ models: [balanced, close, wide], selectedDirectionId: 'close-harmony' });
    openDetails();
    expect(
      container
        .querySelector('[data-teul-direction-row="close-harmony"]')
        ?.getAttribute('data-teul-selected')
    ).toBe('true');
  });

  it('shows the why behind the selected direction as numbers with a one-sentence definition each', () => {
    render();
    expect(container.querySelector('[data-teul-why]')).toBeNull();
    openDetails();
    const why = container.querySelector<HTMLElement>('[data-teul-why]');
    expect(why).not.toBeNull();
    const text = why?.textContent ?? '';
    expect(text).toContain('Why this direction');
    expect(text).toContain(
      'ΔEOK is the distance between two colors in OKLab; about 0.02 is the smallest difference most people notice.'
    );
    expect(text).toContain('Family anchor separation0.190 ΔEOK · needs at least 0.08');
    expect(text).toContain('Source-to-generated adjustment0.021 ΔEOK on average');
    expect(text).toContain('Gamut-mapped steps4 of the Light and Dark steps');
    expect(text).toContain('Required pairs passing40 of 40');
    expect(text).toContain('Meaning roles in range5 of 6');
    expect(text).toContain('Sequential ramp evenness0.210 coefficient of variation');
    expect(text).toContain(
      'Modeled chart separation0.110 ΔEOK · needs at least 0.08 · protan 0.120 · deutan 0.110 · tritan 0.150 · typical 0.190'
    );
    expect(text).toContain('Mean anchor separation0.230 ΔEOK');
    expect(text).toContain('Source continuity0.100 ΔEOK');
    expect(text).toContain('with simulated red-, green- and blue-weak vision');
    const statements = Array.from(
      why?.querySelectorAll('[data-teul-basis-statements] li') ?? []
    ).map(item => item.textContent);
    expect(statements).toEqual([
      '40 of 40 required pairs pass.',
      '5 of 6 meaning roles sit inside their hue range.',
      'Minimum modeled chart separation 0.110 Delta E OK.',
      'These are this direction’s own measurements. Teul’s recommendation ranks every direction on them; it is not owner acceptance.',
    ]);
    const comparison = container.querySelector('[data-teul-direction-comparison]');
    const limitations = container.querySelector('[aria-labelledby="teul-v2-review-limitations"]');
    expect(precedes(comparison, why)).toBe(true);
    expect(precedes(why, limitations)).toBe(true);
  });

  it('states whose grounds the surfaces are and whether the chart order is recorded, one line each', () => {
    // p3-I: the facts travel on `why` once the review model projects them; the block
    // prints them verbatim above the measured numbers and omits them when absent.
    const surfaces: ColorSystemReviewSurfacesFactV2 = {
      source: 'observed-claim',
      groundNames: ['Surface Gray', 'Surface Black'],
      statement: 'Surfaces: your recorded grounds (Surface Gray, Surface Black)',
    };
    const chartOrder: ColorSystemReviewChartOrderFactV2 = {
      source: 'recorded',
      recordedCount: 6,
      warnings: [
        'Marks 2 and 3 (“02 Red” and “03 Amber”) fall below the 0.08 ΔEOK floor under deuteranopia (0.013).',
      ],
      statement: 'Chart order: your recorded order (6 colors)',
    };
    const withFacts = (model: ColorSystemReviewModelV2): ColorSystemReviewModelV2 => ({
      ...model,
      why: { ...model.why!, surfaces, chartOrder } as ColorSystemReviewModelV2['why'],
    });
    const balanced = withFacts(reviewModel());
    render({ models: [balanced, reviewModel('close-harmony', 'Close harmony')] });
    openDetails();
    const why = container.querySelector<HTMLElement>('[data-teul-why]');
    expect(why?.querySelector('[data-teul-why-surfaces]')?.textContent).toBe(
      'Surfaces: your recorded grounds (Surface Gray, Surface Black)'
    );
    const order = why?.querySelector<HTMLElement>('[data-teul-why-chart-order]');
    expect(order?.textContent).toContain('Chart order: your recorded order (6 colors)');
    expect(
      Array.from(order?.querySelectorAll('[data-teul-why-chart-order-warnings] li') ?? []).map(
        item => item.textContent
      )
    ).toEqual(chartOrder.warnings);
    // The facts come before the measured numbers so the answer is read first.
    const numbers = why?.querySelector('dl');
    const facts = why?.querySelector('[data-teul-why-facts]');
    expect(precedes(facts, numbers)).toBe(true);
    const generated = withFacts(reviewModel());
    (generated.why as unknown as { chartOrder: ColorSystemReviewChartOrderFactV2 }).chartOrder = {
      source: 'generated',
      recordedCount: 0,
      warnings: [],
      statement: 'Chart order: generated',
    };
    render({ models: [generated, reviewModel('close-harmony', 'Close harmony')] });
    openDetails();
    expect(container.querySelector('[data-teul-why-chart-order]')?.textContent).toBe(
      'Chart order: generated'
    );
    expect(container.querySelector('[data-teul-why-chart-order-warnings]')).toBeNull();
    // Without the facts the block simply omits the lines.
    render();
    openDetails();
    expect(container.querySelector('[data-teul-why-facts]')).toBeNull();
  });

  it('renders brand surfaces with per-family reach, coded advisories, the verbatim CMYK disclaimer, and no spot value', () => {
    render();
    openDetails();
    const surfaces = container.querySelector<HTMLElement>('[data-teul-brand-surfaces]');
    expect(surfaces).not.toBeNull();
    const text = surfaces?.textContent ?? '';
    expect(text).toContain('Brand surfaces');
    const sky = surfaces?.querySelector(
      '[data-teul-family-surfaces="balanced-contrast-sky-family"]'
    );
    const ink = surfaces?.querySelector(
      '[data-teul-family-surfaces="balanced-contrast-ink-family"]'
    );
    // p6: the generated family prints its plain name; the data name stays on the wire.
    expect(sky?.textContent).toBe('Sky accentScreen product');
    expect(ink?.textContent).toBe('InkScreen productScreen marketingPrintOut-of-home');
    expect(sky?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Sky accent #5683D2'
    );
    const codes = Array.from(surfaces?.querySelectorAll('[data-teul-advisory-code]') ?? []).map(
      item => item.getAttribute('data-teul-advisory-code')
    );
    expect(codes).toEqual([
      'HERO_AS_WASH',
      'HERO_SHARE_EXCEEDED',
      'PRINT_SATURATED_SCREEN_COLOR',
      'OOH_TEXT_CONTRAST_MEETS_MINIMUM',
      'OOH_DIGITAL_BOARD_WHITE_GROUND',
    ]);
    expect(text).toContain('Warning · PRINT_SATURATED_SCREEN_COLOR');
    expect(text).toContain('Note · OOH_TEXT_CONTRAST_MEETS_MINIMUM');
    expect(surfaces?.querySelector('[data-teul-cmyk-disclaimer]')?.textContent).toBe(
      CMYK_UNPROFILED_DISCLAIMER
    );
    const triplets = Array.from(surfaces?.querySelectorAll('[data-teul-print-triplet]') ?? []);
    expect(triplets).toHaveLength(2);
    expect(triplets[0]?.textContent).toContain('Sky accent');
    expect(triplets[0]?.textContent).toContain('Screen #5683D2 (canonical)');
    expect(triplets[0]?.textContent).toContain('CMYK estimate C59 M37 Y0 K18 · total ink 114%');
    expect(triplets[0]?.textContent).toContain('Spot color: not supplied (owner-provided only)');
    // p4-DE: the only place the word appears is the system option of the owner's spot field;
    // outside those fields no spot system is ever named.
    const withoutSpotFields = surfaces?.cloneNode(true) as HTMLElement;
    withoutSpotFields.querySelectorAll('[data-teul-spot-field]').forEach(field => field.remove());
    expect(withoutSpotFields.textContent).not.toMatch(/pantone/i);
    expect(text.match(/pantone/gi)).toHaveLength(
      surfaces?.querySelectorAll('[data-teul-spot-field]').length ?? -1
    );
    // The triplet cards carry the print triplet; the advisory list does not repeat it.
    expect(text).not.toContain('Print triplet for Sky');
  });

  it('offers the spot field only to families that reach print or out-of-home, and typing makes the spot canonical', () => {
    const props = render();
    openDetails();
    const surfaces = container.querySelector<HTMLElement>('[data-teul-brand-surfaces]');
    // Sky reaches the product screen only; Ink travels to print and out-of-home.
    expect(
      surfaces?.querySelector('[data-teul-spot-field="balanced-contrast-sky-family"]')
    ).toBeNull();
    const field = surfaces?.querySelector<HTMLElement>(
      '[data-teul-spot-field="balanced-contrast-ink-family"]'
    );
    expect(field).not.toBeNull();
    const system = field?.querySelector<HTMLSelectElement>(
      'select[aria-label="Spot system for Ink"]'
    );
    const name = field?.querySelector<HTMLInputElement>(
      'input[aria-label="Spot color name for Ink"]'
    );
    const finish = field?.querySelector<HTMLSelectElement>(
      'select[aria-label="Spot finish for Ink"]'
    );
    expect(system?.value).toBe('pantone');
    expect(name?.maxLength).toBe(40);
    expect(finish?.value).toBe('none');
    const card = surfaces?.querySelector<HTMLElement>(
      '[data-teul-print-triplet="balanced-contrast-ink-family"]'
    );
    expect(card?.getAttribute('data-teul-print-canonical')).toBe('screen');
    expect(card?.textContent).toContain('Screen #0C0A08 (canonical)');

    // Whitespace alone is not a spot reference.
    act(() => {
      setNativeValue(name!, '   ');
      name!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(card?.getAttribute('data-teul-print-canonical')).toBe('screen');

    act(() => {
      setNativeValue(name!, ' Test spot 01 ');
      name!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      setNativeValue(finish!, 'coated');
      finish!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const expected = printTriplet('#0C0A08', {
      system: 'pantone',
      name: 'Test spot 01',
      finish: 'coated',
      source: 'owner-supplied',
    });
    expect(expected.canonical).toBe('spot');
    expect(card?.getAttribute('data-teul-print-canonical')).toBe('spot');
    expect(card?.textContent).toContain('Screen #0C0A08CMYK');
    expect(card?.textContent).not.toContain('Screen #0C0A08 (canonical)');
    expect(card?.textContent).toContain(
      'Spot color: Pantone Test spot 01 (coated) · owner-supplied and canonical'
    );
    expect(card?.querySelector('[data-teul-print-note]')?.textContent).toBe(expected.note);
    // Sky's card is untouched.
    expect(
      surfaces
        ?.querySelector('[data-teul-print-triplet="balanced-contrast-sky-family"]')
        ?.getAttribute('data-teul-print-canonical')
    ).toBe('screen');

    // The trimmed reference rides Create as the third argument, keyed by family id, even after
    // Details is closed again: the draft lives with the review, not with the disclosure.
    act(() => {
      details().open = false;
      details().dispatchEvent(new Event('toggle'));
    });
    acknowledge();
    act(() => createFooter().querySelector('button')?.click());
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onCreate).mock.calls[0]?.[2]).toEqual({
      'balanced-contrast-ink-family': {
        system: 'pantone',
        name: 'Test spot 01',
        finish: 'coated',
        source: 'owner-supplied',
      },
    });
  });

  it('keeps a system change and a typed name that arrive before the next render', () => {
    const props = render();
    openDetails();
    const field = container.querySelector<HTMLElement>(
      '[data-teul-spot-field="balanced-contrast-ink-family"]'
    );
    const system = field?.querySelector<HTMLSelectElement>(
      'select[aria-label="Spot system for Ink"]'
    );
    const name = field?.querySelector<HTMLInputElement>(
      'input[aria-label="Spot color name for Ink"]'
    );
    if (!system || !name) throw new Error('Missing spot controls.');
    // Both events inside one act: the second edit must not overwrite the first.
    act(() => {
      setNativeValue(system, 'other');
      system.dispatchEvent(new Event('change', { bubbles: true }));
      setNativeValue(name, 'House Blue 4');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(system.value).toBe('other');
    expect(name.value).toBe('House Blue 4');
    const card = container.querySelector(
      '[data-teul-print-triplet="balanced-contrast-ink-family"]'
    );
    expect(card?.textContent).toContain('Spot color: House Blue 4 · owner-supplied and canonical');
    acknowledge();
    act(() => createFooter().querySelector('button')?.click());
    expect(vi.mocked(props.onCreate).mock.calls[0]?.[2]).toEqual({
      'balanced-contrast-ink-family': {
        system: 'other',
        name: 'House Blue 4',
        finish: 'none',
        source: 'owner-supplied',
      },
    });
  });

  it('sends Create without a spot map when nothing was typed', () => {
    const props = render();
    acknowledge();
    act(() => createFooter().querySelector('button')?.click());
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onCreate).mock.calls[0]).toHaveLength(2);
  });

  it('renders marketing and out-of-home boards for Light and Dark from the resolved roles', () => {
    render();
    openDetails();
    const boards = container.querySelector<HTMLElement>('[data-teul-preview-boards]');
    expect(boards).not.toBeNull();
    expect(boards?.textContent).toContain('Preview boards');
    // The boards follow Brand surfaces, which follows the proportion rule.
    const brand = container.querySelector('[data-teul-brand-surfaces]');
    expect(precedes(brand, boards)).toBe(true);
    for (const mode of ['Light', 'Dark'] as const) {
      const marketing = boards?.querySelector<HTMLElement>(
        `[data-teul-preview-board="marketing"][data-teul-mode="${mode}"]`
      );
      expect(marketing).not.toBeNull();
      // Ground is the review's background token; the call to action is semantic/selected.
      expect(
        marketing
          ?.querySelector('[data-teul-preview-ground]')
          ?.getAttribute('data-teul-preview-hex')
      ).toBe(BOARD_HEX[mode].background);
      const cta = marketing?.querySelector<HTMLElement>('[data-teul-preview-cta]');
      expect(cta?.getAttribute('data-teul-preview-hex')).toBe(
        mode === 'Light' ? '#5683D2' : '#B2C7EB'
      );
      expect(cta?.style.background).toBe(
        mode === 'Light' ? 'rgb(86, 131, 210)' : 'rgb(178, 199, 235)'
      );
      expect(cta?.style.color).toBe(mode === 'Light' ? 'rgb(255, 255, 255)' : 'rgb(12, 10, 8)');
      expect(cta?.textContent).toBe('Call to action');
      // Headline in the text role, tag in the leading accent (Sky), body in supporting text,
      // footer strip from the neutral ramp (Stone).
      expect(
        marketing?.querySelector<HTMLElement>('[data-teul-preview-headline]')?.style.color
      ).toBe(mode === 'Light' ? 'rgb(12, 10, 8)' : 'rgb(246, 244, 240)');
      expect(
        marketing?.querySelector('[data-teul-preview-tag]')?.getAttribute('data-teul-preview-hex')
      ).toBe(mode === 'Light' ? '#5683D2' : '#B2C7EB');
      const footer = marketing?.querySelector('[data-teul-preview-footer]');
      expect(footer?.getAttribute('aria-label')).toBe('Footer · neutral ramp Stone, 3 steps');
      expect(footer?.children).toHaveLength(3);
      // Every chip names its token and hex.
      const chips = Array.from(marketing?.querySelectorAll('[data-teul-preview-chip]') ?? []).map(
        chip => chip.textContent ?? ''
      );
      expect(chips).toContain(`Ground · semantic/background · ${BOARD_HEX[mode].background}`);
      expect(chips).toContain(
        `Call to action · semantic/selected · ${mode === 'Light' ? '#5683D2' : '#B2C7EB'}`
      );
      expect(chips).toContain(
        `Text on the call to action · semantic/on-selected · ${mode === 'Light' ? '#FFFFFF' : '#0C0A08'}`
      );
      // The leading accent is Sky's anchor member in the mode: the Light anchor “Sky 6”, and in
      // Dark the family's Dark colour, since the fixture's Dark member carries a different id.
      expect(chips).toContain(
        mode === 'Light'
          ? 'Tag · leading accent · Sky 6 · #5683D2'
          : 'Tag · leading accent · Sky 4 · #B2C7EB'
      );
      expect(
        chips.some(chip => chip.startsWith('Stone 1 ') && chip.includes(' to Stone 12 '))
      ).toBe(true);
      // jsdom lays nothing out, so the share is reported as unmeasured rather than invented.
      expect(marketing?.querySelector('[data-teul-preview-share]')?.textContent).toBe(
        'Primary area: not measured in this view.'
      );

      const ooh = boards?.querySelector<HTMLElement>(
        `[data-teul-preview-board="out-of-home"][data-teul-mode="${mode}"]`
      );
      expect(ooh).not.toBeNull();
      const textLine = ooh?.querySelector('[data-teul-preview-ooh-line="text"]');
      const primaryLine = ooh?.querySelector('[data-teul-preview-ooh-line="primary"]');
      expect(textLine?.getAttribute('data-teul-preview-bg')).toBe(BOARD_HEX[mode].background);
      expect(textLine?.getAttribute('data-teul-preview-fg')).toBe(BOARD_HEX[mode].text);
      expect(primaryLine?.getAttribute('data-teul-preview-bg')).toBe(
        mode === 'Light' ? '#5683D2' : '#B2C7EB'
      );
      expect(primaryLine?.getAttribute('data-teul-preview-fg')).toBe(
        mode === 'Light' ? '#FFFFFF' : '#0C0A08'
      );
      // The printed contrast is the advisory module's own ratio for the same pair.
      const expected = outOfHomeTextAdvisory(BOARD_HEX[mode].text, BOARD_HEX[mode].background);
      const check = ooh?.querySelector('[data-teul-preview-ooh-check="text"]');
      expect(Number(check?.getAttribute('data-teul-preview-ooh-ratio'))).toBe(
        expected[0]?.evidence.ratio
      );
      expect(check?.textContent).toContain(
        `semantic/text on semantic/background · ${expected[0]?.evidence.ratio}:1`
      );
      const codes = Array.from(check?.querySelectorAll('[data-teul-preview-ooh-code]') ?? []).map(
        item => item.getAttribute('data-teul-preview-ooh-code')
      );
      expect(codes).toEqual(expected.map(finding => finding.code));
    }
    // In Light the text-on-ground pair is the review's own body pair, so the board's ratio
    // equals the ratio printed in Brand surfaces and the white-ground note fires on both.
    const lightCheck = boards?.querySelector('[data-teul-preview-ooh-check="text"]');
    const brandAdvisory = reviewModel().brandSurfaces?.advisories.find(
      advisory => advisory.code === 'OOH_TEXT_CONTRAST_MEETS_MINIMUM'
    );
    const advisoryRatio = /measures (\d+(?:\.\d+)?):1/.exec(brandAdvisory?.message ?? '')?.[1];
    expect(advisoryRatio).toBeDefined();
    expect(lightCheck?.getAttribute('data-teul-preview-ooh-ratio')).toBe(advisoryRatio);
    expect(lightCheck?.textContent).toContain('Warning · OOH_DIGITAL_BOARD_WHITE_GROUND');
    expect(lightCheck?.textContent).toContain('make the white a 10% black');
  });

  it('measures the primary’s share of the marketing board from the rendered element sizes', () => {
    const rect = (width: number, height: number): DOMRect =>
      ({
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.hasAttribute('data-teul-preview-cta')) return rect(96, 32);
        if (this.hasAttribute('data-teul-preview-ground')) return rect(400, 250);
        return rect(0, 0);
      });
    try {
      render();
      openDetails();
      const shares = Array.from(container.querySelectorAll('[data-teul-preview-share]'));
      expect(shares).toHaveLength(2);
      for (const share of shares) {
        // 96 × 32 of 400 × 250 = 3.1 %, within the declared ≤ 20 % brand-primary share.
        expect(share.getAttribute('data-teul-preview-share-value')).toBe('3.1');
        expect(share.textContent).toBe(
          'Primary area: 3.1 % of the board, measured from the rendered call to action · declared share ≤ 20 %.'
        );
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('declares the proportion rule above Brand surfaces, prints where each meaning role comes from, and shows the hero advisories', () => {
    render();
    openDetails();
    const rule = container.querySelector<HTMLElement>('[data-teul-proportion-rule]');
    expect(rule).not.toBeNull();
    const text = rule?.textContent ?? '';
    expect(text).toContain('How much of each');
    expect(text).toContain(COLOR_SYSTEM_PROPORTION_RULE_V3.statement);
    expect(rule?.querySelector('[data-teul-proportion-tier="neutral"]')?.textContent).toBe(
      'Neutral · 60–80 %Background, Surface, Text, Border, Disabled'
    );
    expect(
      rule?.querySelector('[data-teul-proportion-tier="brand primary"]')?.textContent
    ).toContain('Brand Primary · ≤ 20 %');
    expect(rule?.querySelector('[data-teul-proportion-tier="status"]')?.textContent).toContain(
      'Status · status only'
    );
    expect(rule?.querySelector('[data-teul-proportion-note]')?.textContent).toBe(
      `${COLOR_SYSTEM_PROPORTION_RULE_V3.note} Authority: Teul policy default.`
    );
    const sources = Array.from(
      rule?.querySelectorAll('[data-teul-proportion-sources] li') ?? []
    ).map(item => item.textContent);
    expect(sources).toEqual(COLOR_SYSTEM_PROPORTION_RULE_V3.sources.map(source => source.label));
    // The compared sources have no public page, so nothing is rendered as a link.
    expect(rule?.querySelector('a')).toBeNull();
    expect(text).toContain('no link is given');

    const why = container.querySelector('[data-teul-why]');
    const brand = container.querySelector('[data-teul-brand-surfaces]');
    expect(precedes(why, rule)).toBe(true);
    expect(precedes(rule, brand)).toBe(true);

    const meaningSources = Array.from(
      container.querySelectorAll('[data-teul-meaning-sources] li')
    ).map(item => item.textContent);
    expect(meaningSources).toEqual([
      'success: conventional green added because your palette has none.',
      'focus: follows your brand family “Sky”.',
    ]);
    expect(why?.textContent).toContain('Where each meaning role comes from');

    const brandText = brand?.textContent ?? '';
    expect(brandText).toContain('Screen product');
    expect(brandText).toContain('Warning · HERO_AS_WASH');
    expect(brandText).toContain('Note · HERO_SHARE_EXCEEDED');
    expect(brandText).toContain(
      'The primary is your hero. Keep it for emphasis; the neutral ramp carries surfaces.'
    );
  });

  it('shows WCAG on every rendered pair and keeps APCA Lc supplementary inside Technical details', () => {
    render();
    openDetails();
    const pairs = Array.from(container.querySelectorAll<HTMLElement>('[data-teul-text-pair]'));
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.textContent).toContain('Primary Body · Light');
    expect(pairs[0]?.textContent).toContain('#0C0A08 on #FFFFFF');
    expect(pairs[0]?.textContent).toContain('17.40:1 · passes 4.5:1 WCAG check');
    const specimen = pairs[0]?.querySelector<HTMLElement>('[role="img"]');
    expect(specimen?.getAttribute('aria-label')).toBe('Primary text #0C0A08 on Surface #FFFFFF');
    expect(specimen?.style.color).toBe('rgb(12, 10, 8)');
    expect(specimen?.style.background).toBe('rgb(255, 255, 255)');
    // APCA stays inside Technical details, after the rendered pairs.
    const readings = container.querySelector<HTMLElement>(
      '[data-teul-technical-details] [data-teul-pair-readings]'
    );
    expect(precedes(pairs[0], readings)).toBe(true);
    expect(readings?.textContent).toContain('the WCAG ratio is the gate; APCA Lc is supplementary');
    const items = Array.from(readings?.querySelectorAll('li') ?? []).map(item => item.textContent);
    expect(items).toEqual([
      'Product Graphic · Light · WCAG 4.20:1 · APCA Lc (supplementary) 60.5',
      'Functional Iconography · Light · WCAG 5.20:1 · APCA Lc (supplementary) 61.5',
      'Product UI Surface · Light · WCAG 6.20:1 · APCA Lc (supplementary) 62.5',
      'Primary Body · Light · WCAG 17.40:1 · APCA Lc (supplementary) 104.2',
    ]);
    // Nothing about APCA reaches the first screen.
    closeDetails();
    expect(container.textContent).not.toContain('APCA');
    expect(container.textContent).not.toContain('104.2');
  });

  it('reports categorical capacity only when the composer supplies it', () => {
    render();
    openDetails();
    expect(container.querySelector('[data-teul-categorical-capacity]')).toBeNull();
    expect(container.textContent).not.toContain('Requested');

    const withCapacity = reviewModel();
    const dataVisualization = withCapacity.sections[3];
    if (!dataVisualization.visualizationSpecimens) throw new Error('Missing specimens.');
    dataVisualization.visualizationSpecimens.categoricalCapacity = [
      { mode: 'Light', requestedMarkCount: 5, achievedMarkCount: 5, limitation: null },
      {
        mode: 'Dark',
        requestedMarkCount: 5,
        achievedMarkCount: 3,
        limitation: 'Only three marks stay 3:1 on the Dark surface.',
      },
    ];
    render({ models: [withCapacity, reviewModel('close-harmony', 'Close harmony')] });
    openDetails();
    const items = Array.from(container.querySelectorAll('[data-teul-categorical-capacity] li')).map(
      item => item.textContent
    );
    expect(items).toEqual([
      'Requested 5, achieved 5 in Light.',
      'Requested 5, achieved 3 in Dark: Only three marks stay 3:1 on the Dark surface.',
    ]);
  });

  it('keeps every inline font size at or above 12px, first screen and Details alike', () => {
    render();
    openDetails();
    expect(container.querySelector('#teul-data-viz-specimens-title')).not.toBeNull();
    expect(container.querySelector('#teul-product-graphics-specimens-title')).not.toBeNull();
    const sizes = Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map(element => element.style.fontSize)
      .filter(size => size !== '')
      .map(size => Number.parseFloat(size));
    expect(sizes.length).toBeGreaterThan(60);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it('supports the dark theme without changing the content contract', () => {
    render({ isDark: true });
    const region = container.querySelector<HTMLElement>('.teul-v2-review');
    expect(region?.style.colorScheme).toBe('dark');
    expect(region?.textContent).toContain('Teul recommends Balanced contrast.');
    expect(region?.textContent).toContain('Create this system');
  });
});
