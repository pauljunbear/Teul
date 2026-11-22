/** Actual decorative paint; anchors never stand in for its continuous visible area. */
import {
  parseColorSystemFinalGradientPaintV1,
  type ColorSystemFinalGradientPaintV1,
} from './colorSystemFinalGradientPaintV1';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import type { ColorSystemScopedRuleV1, ColorSystemSelectorV1 } from './colorSystemModelV1';

export interface ColorSystemDecorativeGradientUseV1 {
  readonly id: string;
  readonly role: 'decoration';
  readonly sourceRole?: string;
  readonly paint: ColorSystemFinalGradientPaintV1;
  readonly area?: number;
}

const retained = new WeakSet<object>();

export function readColorSystemDecorativeGradientsV1(
  raw: unknown
): readonly ColorSystemDecorativeGradientUseV1[] {
  if (raw && typeof raw === 'object' && retained.has(raw))
    return raw as readonly ColorSystemDecorativeGradientUseV1[];
  const value = snapshotColorSystemInertJsonV1(raw, {
    maximumBytes: 512_000,
    maximumDepth: 26,
    maximumNodes: 220_128,
  });
  if (!Array.isArray(value) || value.length < 1 || value.length > 4)
    throw new Error('Use one through four explicit decorative gradient paints.');
  const text = (input: unknown) => {
    if (typeof input !== 'string' || !input.trim() || input.length > 128)
      throw new Error('Gradient use identities must be nonblank and bounded.');
    return input;
  };
  const result = value.map(item => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some(key => !['id', 'role', 'sourceRole', 'paint', 'area'].includes(key))
    )
      throw new Error('Decorative gradient use contains unsupported fields.');
    const use = item as Record<string, unknown>;
    if (use.role !== 'decoration')
      throw new Error('A decorative gradient cannot act as text or a solid ground.');
    if (
      use.area !== undefined &&
      (typeof use.area !== 'number' || !Number.isFinite(use.area) || use.area <= 0)
    )
      throw new Error('Gradient area must be a positive finite measured footprint.');
    return Object.freeze({
      id: text(use.id),
      role: 'decoration' as const,
      ...(use.sourceRole === undefined ? {} : { sourceRole: text(use.sourceRole) }),
      paint: parseColorSystemFinalGradientPaintV1(use.paint),
      ...(use.area === undefined ? {} : { area: use.area as number }),
    });
  });
  Object.freeze(result);
  retained.add(result);
  return result;
}

/** Unmeasured continuous contributions remain unknown. This never rewrites the source rule. */
export function colorSystemRuleNeedsGradientMeasurementV1(
  rule: ColorSystemScopedRuleV1,
  gradients: readonly ColorSystemDecorativeGradientUseV1[]
): boolean {
  if (!gradients.length) return false;
  const roles = new Set(gradients.map(use => use.sourceRole ?? use.role));
  const touches = (selectors: readonly ColorSystemSelectorV1[]) =>
    selectors.some(selector => selector.role === undefined || roles.has(selector.role));
  switch (rule.kind) {
    case 'prominence':
      return true; // Even a solid-only numerator needs the whole board denominator.
    case 'palette-membership':
      return rule.force !== 'prohibition' || touches(rule.operands.members);
    case 'color-count':
      return touches(rule.operands.members);
    case 'role-binding':
      return roles.has(rule.operands.role);
    case 'required-partner':
      return (
        ((rule.operands.subjectRole === undefined || roles.has(rule.operands.subjectRole)) &&
          touches(rule.operands.subject)) ||
        ((rule.operands.partnerRole === undefined || roles.has(rule.operands.partnerRole)) &&
          touches(rule.operands.partner))
      );
    case 'allowed-pair':
    case 'forbidden-pair':
      return (
        (rule.kind === 'allowed-pair' && rule.operands.relation === 'co-present') ||
        touches(rule.operands.left) ||
        touches(rule.operands.right)
      );
  }
}
