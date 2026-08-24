import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorSystemReviewModelV2 } from '../../lib/colorSystemReviewModelV2';
import { ColorSystemBuilderV2Review } from '../ColorSystemBuilderV2Review';

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
    ],
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

  it('shows actual colors in the familiar five-section order with plain explanations and ratings', () => {
    render();

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
    expect(container.querySelectorAll('[data-teul-family-overview]')).toHaveLength(1);
    expect(container.textContent).toContain('Intended for: Product Graphics, Product UI Surface');
    expect(container.querySelector('[aria-label="Secondary colors"]')).toBeNull();
    expect(container.querySelector('[aria-label="Sky Light scale"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Sky Dark scale"]')).not.toBeNull();
    expect(container.textContent).toContain('Generated chart examples');
    expect(container.textContent).toContain('Generated product-use examples');
    expect(container.textContent).toContain('not copied source artwork or brand approval');
    expect(container.textContent).not.toContain('Actual chart examples');
    expect(container.textContent).not.toContain('Actual product examples');
    expect(container.querySelector('[aria-label="Product Graphics colors"]')).toBeNull();
    expect(container.textContent).toContain('on #FFFFFF');
    expect(container.textContent).toContain('passes 3:1 non-text check');
    expect(
      Array.from(container.querySelectorAll('[data-teul-product-specimen]')).map(specimen =>
        specimen.getAttribute('data-teul-product-specimen')
      )
    ).toEqual(['product-graphic', 'iconography', 'product-surface']);
    expect(container.querySelectorAll('[data-teul-product-specimen][aria-label]')).toHaveLength(3);
    expect(
      Array.from(container.querySelectorAll('[data-teul-product-specimen]')).map(specimen =>
        specimen.getAttribute('aria-label')
      )
    ).toEqual([
      expect.stringContaining('#5683D2'),
      expect.stringContaining('#924F35'),
      expect.stringContaining('#B2C7EB'),
    ]);
    expect(container.textContent).toContain('Categorical');
    expect(container.textContent).toContain('Sequential');
    expect(container.textContent).toContain('Diverging');
    expect(container.textContent).toContain('Category 1');
    expect(container.textContent).toContain('Zero or neutral midpoint');
    expect(container.querySelectorAll('[data-teul-specimen-kind]')).toHaveLength(3);
    expect(container.querySelector('[aria-label="Zero reference line"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Composer:');
    expect(container.textContent).toContain('Measured checks');
    expect(container.textContent).toContain('Required limit: 4.5 to 1');
    expect(container.textContent).toContain('#E4F222 · 100% opacity');
    expect(container.textContent).toContain('#B2C7EB · 50% opacity');
    expect(container.querySelector('[aria-label*="#B2C7EB, 50% opacity"]')).not.toBeNull();
    expect(container.textContent).not.toContain('product-ui-surface');
  });

  it('uses semantic direction controls and delegates selection and Create without posting messages', () => {
    const onSelectDirection = vi.fn();
    const onCreate = vi.fn();
    const postMessage = vi.spyOn(window.parent, 'postMessage');
    const props = render({ onSelectDirection, onCreate });

    const comparison = container.querySelector<HTMLDetailsElement>(
      '[data-teul-direction-comparison]'
    );
    const comparisonSummary = comparison?.querySelector<HTMLElement>('summary') ?? null;
    expect(comparison).not.toBeNull();
    expect(comparison?.open).toBe(false);
    expect(comparisonSummary?.textContent).toContain('Compare alternatives');
    act(() => comparisonSummary?.focus());
    expect(document.activeElement).toBe(comparisonSummary);
    act(() => {
      if (!comparison) return;
      comparison.open = true;
      comparison.dispatchEvent(new Event('toggle'));
    });

    const close = container.querySelector<HTMLInputElement>('input[value="close-harmony"]');
    expect(close).not.toBeNull();
    act(() => close?.focus());
    expect(document.activeElement).toBe(close);
    act(() => close?.click());
    expect(onSelectDirection).toHaveBeenCalledWith('close-harmony');

    const create = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Create this system'
    );
    expect(create).toBeDefined();
    act(() => create?.click());
    expect(onCreate).toHaveBeenCalledWith(props.models[0]);
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it('explains how each direction differs and keeps recommendation separate from approval', () => {
    render();

    const ownership = container.querySelector('[data-teul-ownership-summary]');
    const selectedDirection = container.querySelector('[data-teul-selected-direction]');
    const selectedAuthority = container.querySelector('[data-teul-selected-direction-authority]');
    const comparison = container.querySelector<HTMLDetailsElement>(
      '[data-teul-direction-comparison]'
    );
    const choices = comparison?.querySelector('fieldset') ?? null;
    expect(selectedDirection?.textContent).toContain('Balanced contrast color system');
    expect(selectedDirection?.textContent).toContain('Recommended');
    expect(selectedAuthority?.textContent).toBe(
      'Teul recommendation · brand-owner approval still required'
    );
    expect(comparison?.open).toBe(false);
    expect(comparison?.querySelector('summary')?.textContent).toContain('Compare alternatives');
    act(() => {
      if (!comparison) return;
      comparison.open = true;
      comparison.dispatchEvent(new Event('toggle'));
    });
    const balanced = container.querySelector<HTMLInputElement>('input[value="balanced-contrast"]');
    const close = container.querySelector<HTMLInputElement>('input[value="close-harmony"]');
    const balancedCard = balanced?.closest('label');
    const closeCard = close?.closest('label');
    expect(balancedCard?.textContent).toContain('Balance continuity with useful distinction.');
    expect(balancedCard?.textContent).toContain('Best for:');
    expect(balancedCard?.textContent).toContain('Tradeoff:');
    expect(balancedCard?.textContent).toContain('brand-owner approval still required');
    expect(closeCard?.textContent).toContain('Stay closest to the existing palette.');
    expect(closeCard?.textContent).toContain('Teul proposal');
    expect(closeCard?.textContent).toContain('brand-owner approval still required');
    expect(closeCard?.textContent).not.toEqual(balancedCard?.textContent);
    expect(ownership).not.toBeNull();
    expect(choices).not.toBeNull();
    expect(
      Boolean(
        ownership &&
        choices &&
        ownership.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });

  it('keeps Teul recommendation and owner approval visible after selecting an alternative', () => {
    render({ selectedDirectionId: 'close-harmony' });

    const selectedDirection = container.querySelector('[data-teul-selected-direction]');
    const selectedAuthority = container.querySelector('[data-teul-selected-direction-authority]');
    const comparison = container.querySelector<HTMLDetailsElement>(
      '[data-teul-direction-comparison]'
    );
    expect(selectedDirection?.textContent).toContain('Close harmony color system');
    expect(selectedDirection?.textContent).not.toContain('Recommended');
    expect(selectedAuthority?.textContent).toContain('Selected Teul proposal');
    expect(selectedAuthority?.textContent).toContain('Teul recommends Balanced contrast');
    expect(selectedAuthority?.textContent).toContain('brand-owner approval still required');
    expect(comparison?.open).toBe(false);
  });

  it('places one non-sticky Create action after all review evidence and technical details', () => {
    render();

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('article[aria-labelledby^="teul-review-section-"]')
    );
    const limitations = container.querySelector<HTMLElement>(
      '[aria-labelledby="teul-v2-review-limitations"]'
    );
    const technicalDetails = container.querySelector<HTMLDetailsElement>(
      '[data-teul-technical-details]'
    );
    const action = container.querySelector<HTMLElement>(
      'footer[aria-label="Create reviewed color system"]'
    );
    const createButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button')
    ).filter(button => button.textContent === 'Create this system');
    const precedes = (left: Node | null, right: Node | null) =>
      Boolean(
        left && right && left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
      );

    expect(sections).toHaveLength(5);
    expect(limitations).not.toBeNull();
    expect(technicalDetails).not.toBeNull();
    expect(action).not.toBeNull();
    expect(createButtons).toHaveLength(1);
    expect(precedes(sections[4] ?? null, action)).toBe(true);
    expect(precedes(limitations, action)).toBe(true);
    expect(precedes(technicalDetails, action)).toBe(true);
    expect(action?.style.position).toBe('');
    expect(action?.style.bottom).toBe('');
    expect(action?.dataset.state).toBe('ready');
  });

  it('exposes focusable ready, loading, and blocked Create states to assistive technology', () => {
    render();

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
    expect(container.querySelector('#teul-v2-create-description')?.textContent).toContain(
      'Creation is unavailable'
    );
  });

  it('keeps every hash out of the default view and reveals them in one disclosure', () => {
    render();

    const details = container.querySelector<HTMLDetailsElement>('[data-teul-technical-details]');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    for (const hash of Object.values(HASHES)) {
      expect(container.textContent).not.toContain(hash);
    }

    act(() => {
      if (!details) return;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(container.textContent).toContain('Source fingerprint');
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
    const blockedButton = container.querySelector<HTMLButtonElement>('button');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Source changed');
    expect(blockedButton?.disabled).toBe(true);
    act(() => blockedButton?.click());
    expect(onCreate).not.toHaveBeenCalled();

    render({ onCreate, blocker: null, creating: true });
    expect(container.textContent).toContain('Creating system…');
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('true');

    render({ models: [], selectedDirectionId: null, blocker: null, creating: false });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Analyze the source again'
    );
  });

  it('supports the dark theme without changing the content contract', () => {
    render({ isDark: true });
    const region = container.querySelector<HTMLElement>('.teul-v2-review');
    expect(region?.style.colorScheme).toBe('dark');
    expect(region?.textContent).toContain('Create this system');
  });
});
