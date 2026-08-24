import type { ColorModuleCoverage, ColorSystemProposal } from '../types/colorSystemAudit';

export const COLOR_SYSTEM_INTENDED_SURFACES = [
  'product-primitives',
  'product-semantics',
  'marketing',
  'data-visualization',
  'illustration',
] as const;

export type ColorSystemIntendedSurface = (typeof COLOR_SYSTEM_INTENDED_SURFACES)[number];

const MODULES_BY_SURFACE: Readonly<
  Record<ColorSystemIntendedSurface, readonly ColorModuleCoverage['module'][]>
> = {
  'product-primitives': ['product-primitives'],
  'product-semantics': ['product-primitives', 'product-semantics'],
  marketing: ['brand-marketing'],
  'data-visualization': ['data-visualization'],
  illustration: ['illustration'],
};

export function isColorSystemIntendedSurface(value: string): value is ColorSystemIntendedSurface {
  return (COLOR_SYSTEM_INTENDED_SURFACES as readonly string[]).includes(value);
}

export function uncoveredIntendedSurfaces(
  proposal: Pick<ColorSystemProposal, 'moduleCoverage'>,
  surfaces: readonly string[]
): Array<{ surface: string; module?: ColorModuleCoverage['module']; status: string }> {
  return surfaces.flatMap(surface => {
    if (!isColorSystemIntendedSurface(surface)) {
      return [{ surface, status: 'unsupported' }];
    }
    return MODULES_BY_SURFACE[surface].flatMap(module => {
      const coverage = proposal.moduleCoverage.find(entry => entry.module === module);
      return coverage?.status === 'covered'
        ? []
        : [{ surface, module, status: coverage?.status ?? 'unknown' }];
    });
  });
}

export function assertIntendedSurfaceCoverage(
  proposal: Pick<ColorSystemProposal, 'moduleCoverage'>,
  surfaces: readonly string[]
): void {
  if (surfaces.length === 0) {
    throw new Error('At least one intended surface must be confirmed.');
  }
  const uncovered = uncoveredIntendedSurfaces(proposal, surfaces);
  if (uncovered.length > 0) {
    throw new Error(
      `Selected objectives are not covered by this proposal: ${uncovered
        .map(entry => `${entry.surface} (${entry.status})`)
        .join(', ')}.`
    );
  }
}
