// Color Styles Creation for Figma Backend
// Creates Figma color styles from a color system

import { hexToFigmaRgb } from './figmaHelpers';
import { getOrderedScaleKeys, stepToStyleSuffix } from '../lib/colorExport';
import { isExactRadixScale } from '../lib/radixColors';
import { isSemanticColorPolicyCurrent } from '../lib/semanticColorPolicy';
import type { CreateStylesData } from '../types/colorSystem';
import type { ColorCollisionPolicy } from './colorSystemCollision';
import { isTeulColorResource, markTeulColorResource } from './colorResourceOwnership';
export type { CreateStylesData } from '../types/colorSystem';

// ============================================
// Type Definitions
// ============================================

interface RequestedStyle {
  name: string;
  hex: string;
  color: RGB;
  description?: string;
}

interface UpdatedStyleSnapshot {
  style: PaintStyle;
  name: string;
  description: string;
  paints: readonly Paint[];
}

export interface ColorStyleReport {
  styleCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  warnings: string[];
}

type SemanticMode = 'light' | 'dark';

function getDeclaredSemanticTokens(scalesData: CreateStylesData, mode: SemanticMode) {
  if (scalesData.scaleMethod !== 'wcag-constrained') return [];
  const report = scalesData.semanticPolicy?.modes[mode];
  return report ? Object.values(report.tokens) : [];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Color style creation failed';
}

function colorsMatch(a: RGB, b: RGB): boolean {
  const tolerance = 1e-6;
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

function hasBoundVariables(boundVariables: object | undefined): boolean {
  return boundVariables !== undefined && Object.keys(boundVariables).length > 0;
}

function styleMatchesRequestedPaint(style: PaintStyle, requestedColor: RGB): boolean {
  if (hasBoundVariables(style.boundVariables)) return false;
  if (style.paints.length !== 1) return false;

  const paint = style.paints[0];
  return (
    paint.type === 'SOLID' &&
    paint.visible !== false &&
    (paint.opacity === undefined || paint.opacity === 1) &&
    (paint.blendMode === undefined || paint.blendMode === 'NORMAL') &&
    !hasBoundVariables(paint.boundVariables) &&
    colorsMatch(paint.color, requestedColor)
  );
}

function rollbackStyles(
  createdStyles: PaintStyle[],
  updatedStyles: UpdatedStyleSnapshot[]
): string[] {
  const failures: string[] = [];

  for (const style of [...createdStyles].reverse()) {
    try {
      style.remove();
    } catch (error) {
      failures.push(`style "${style.name}" removal failed`);
      console.error('Failed to roll back color style:', error);
    }
  }
  for (const snapshot of [...updatedStyles].reverse()) {
    try {
      snapshot.style.name = snapshot.name;
      snapshot.style.description = snapshot.description;
      snapshot.style.paints = snapshot.paints;
    } catch (error) {
      failures.push(`style "${snapshot.name}" restoration failed`);
      console.error('Failed to roll back updated color style:', error);
    }
  }
  return failures;
}

let colorStyleCreationQueue: Promise<void> = Promise.resolve();

// ============================================
// Main Public Function
// ============================================

/**
 * Create Figma color styles from a color system
 * Naming convention: [System Name]/[Mode]/[Role]/[Step]
 * e.g., "Brand Colors/Light/Primary/800"
 */
async function createColorStylesOperation(
  scalesData: CreateStylesData,
  systemName: string,
  collisionPolicy: ColorCollisionPolicy
): Promise<ColorStyleReport> {
  if (
    scalesData.scaleMethod === 'wcag-constrained' &&
    !isSemanticColorPolicyCurrent(
      scalesData.scales.light,
      scalesData.scales.dark,
      scalesData.semanticPolicy
    )
  ) {
    throw new Error('WCAG-constrained semantic token policy is stale or invalid');
  }

  const existingStyles = await figma.getLocalPaintStylesAsync();
  const existingStylesByName = new Map<string, PaintStyle[]>();
  for (const style of existingStyles) {
    const stylesWithName = existingStylesByName.get(style.name) ?? [];
    stylesWithName.push(style);
    existingStylesByName.set(style.name, stylesWithName);
  }

  // Collect all styles to create (batch processing for better performance)
  const queuedStyles = new Map<string, RequestedStyle>();
  let existingNameSkips = 0;
  let duplicateNameSkips = 0;

  // Helper to queue a style for creation
  const queueStyle = (styleName: string, hex: string, description?: string) => {
    const requestedStyle = {
      name: styleName,
      hex,
      color: hexToFigmaRgb(hex),
      description,
    };
    const queuedStyle = queuedStyles.get(styleName);

    if (queuedStyle) {
      if (!colorsMatch(queuedStyle.color, requestedStyle.color)) {
        throw new Error(
          `Color style conflict for "${styleName}": duplicate queued name requests both ${queuedStyle.hex} and ${hex}`
        );
      }

      duplicateNameSkips++;
      return;
    }

    queuedStyles.set(styleName, requestedStyle);
  };

  // Queue scale styles
  const queueScaleStyles = (scales: CreateStylesData['scales']['light'], modePath: string) => {
    for (const key of getOrderedScaleKeys(scales)) {
      const scale = scales[key];
      if (scale) {
        for (const step of scale.steps) {
          const styleName = `${modePath}/${scale.role}/${stepToStyleSuffix(step.step)}`;
          const sourceLabel =
            scale.method === 'Radix Colors' &&
            !isExactRadixScale(scale.sourceVersion, scale.sourceFamily, scale.mode, scale.steps)
              ? 'Unverified color scale'
              : scale.method;
          const description = [
            sourceLabel,
            scale.profile,
            scale.validation
              ? scale.validation.valid
                ? 'Generated scale validation passed'
                : 'Generated scale validation failed'
              : undefined,
          ]
            .filter(Boolean)
            .join(' · ');
          queueStyle(styleName, step.hex, description || undefined);
        }
      }
    }
  };

  // Queue light mode styles
  const lightPath = scalesData.includeDarkMode ? `${systemName}/Light` : systemName;
  queueScaleStyles(scalesData.scales.light, lightPath);

  // Queue dark mode styles if available
  if (scalesData.includeDarkMode && scalesData.scales.dark) {
    const darkPath = `${systemName}/Dark`;
    queueScaleStyles(scalesData.scales.dark, darkPath);
  }

  // Queue semantic aliases. Constrained systems only expose policy-declared aliases.
  const lightScales = scalesData.scales.light;
  const basePath = scalesData.includeDarkMode ? `${systemName}/Light` : systemName;
  const lightSemanticTokens = getDeclaredSemanticTokens(scalesData, 'light');
  const darkSemanticTokens = getDeclaredSemanticTokens(scalesData, 'dark');
  const isConstrained = scalesData.scaleMethod === 'wcag-constrained';

  if (isConstrained) {
    const queueDeclaredTokens = (
      tokens: ReturnType<typeof getDeclaredSemanticTokens>,
      modePath: string
    ) => {
      for (const token of tokens) {
        queueStyle(
          `${modePath}/Semantic/${token.name}`,
          token.value,
          `WCAG-constrained semantic token · ${token.source.scale} step ${token.source.step}`
        );
      }
    };

    queueDeclaredTokens(lightSemanticTokens, basePath);
    if (scalesData.includeDarkMode) {
      queueDeclaredTokens(darkSemanticTokens, `${systemName}/Dark`);
    }
  }

  const semanticAliases = [
    // Backgrounds
    { name: 'bg-app', scale: 'neutral', step: 1 },
    { name: 'bg-subtle', scale: 'neutral', step: 2 },
    { name: 'bg-muted', scale: 'neutral', step: 3 },
    // Foreground/Text
    { name: 'text-primary', scale: 'neutral', step: 12 },
    { name: 'text-secondary', scale: 'neutral', step: 11 },
    { name: 'text-muted', scale: 'neutral', step: 9 },
    // Borders
    { name: 'border-subtle', scale: 'neutral', step: 6 },
    { name: 'border-default', scale: 'neutral', step: 7 },
    { name: 'border-strong', scale: 'neutral', step: 8 },
  ];

  if (!isConstrained) {
    for (const alias of semanticAliases) {
      const scale = lightScales[alias.scale as keyof typeof lightScales];
      if (scale) {
        const step = scale.steps.find(s => s.step === alias.step);
        if (step) {
          queueStyle(`${basePath}/Semantic/${alias.name}`, step.hex);
        }
      }
    }

    // Queue primary color semantic aliases if available
    if (lightScales.primary) {
      const primaryAliases = [
        { name: 'primary-bg', step: 3 },
        { name: 'primary-bg-hover', step: 4 },
        { name: 'primary-solid', step: 9 },
        { name: 'primary-solid-hover', step: 10 },
        { name: 'primary-text', step: 11 },
      ];

      for (const alias of primaryAliases) {
        const step = lightScales.primary.steps.find(s => s.step === alias.step);
        if (step) {
          queueStyle(`${basePath}/Semantic/${alias.name}`, step.hex);
        }
      }
    }
  }

  const stylesToCreate: RequestedStyle[] = [];
  const stylesToUpdate: Array<{ style: PaintStyle; request: RequestedStyle }> = [];
  for (const requestedStyle of queuedStyles.values()) {
    const sameNameStyles = existingStylesByName.get(requestedStyle.name);
    if (!sameNameStyles) {
      stylesToCreate.push(requestedStyle);
      continue;
    }

    if (sameNameStyles.length > 1) {
      throw new Error(`Multiple local color styles are named "${requestedStyle.name}"`);
    }
    if (collisionPolicy !== 'update-local') {
      throw new Error(`Color style collision for "${requestedStyle.name}"`);
    }
    const existingStyle = sameNameStyles[0];
    if (!isTeulColorResource(existingStyle)) {
      throw new Error(
        `Color style "${requestedStyle.name}" is not marked as Teul-owned. Choose Create copy.`
      );
    }
    if (!styleMatchesRequestedPaint(existingStyle, requestedStyle.color)) {
      stylesToUpdate.push({ style: existingStyle, request: requestedStyle });
      continue;
    }
    if (existingStyle.description !== (requestedStyle.description ?? '')) {
      stylesToUpdate.push({ style: existingStyle, request: requestedStyle });
      continue;
    }

    existingNameSkips++;
  }

  // Create all styles in batches for better performance
  const BATCH_SIZE = 20;
  let created = 0;
  const createdStyles: PaintStyle[] = [];
  const updatedStyles: UpdatedStyleSnapshot[] = [];

  try {
    for (let i = 0; i < stylesToCreate.length; i += BATCH_SIZE) {
      const batch = stylesToCreate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(({ name, color, description }) => {
          const style = figma.createPaintStyle();
          createdStyles.push(style);
          style.name = name;
          if (description) style.description = description;
          style.paints = [{ type: 'SOLID', color }];
          markTeulColorResource(style);
          created++;
          return Promise.resolve();
        })
      );
    }

    for (const { style, request } of stylesToUpdate) {
      updatedStyles.push({
        style,
        name: style.name,
        description: style.description,
        paints: [...style.paints],
      });
      style.name = request.name;
      style.description = request.description ?? '';
      style.paints = [{ type: 'SOLID', color: request.color }];
    }

    return {
      styleCount: queuedStyles.size,
      createdCount: created,
      updatedCount: stylesToUpdate.length,
      skippedCount: existingNameSkips + duplicateNameSkips,
      warnings: [],
    };
  } catch (error) {
    const rollbackFailures = rollbackStyles(createdStyles, updatedStyles);
    if (rollbackFailures.length > 0) {
      throw new Error(`${getErrorMessage(error)}; rollback failed: ${rollbackFailures.join('; ')}`);
    }
    throw error;
  }
}

export function createColorStyles(
  scalesData: CreateStylesData,
  systemName: string,
  collisionPolicy: ColorCollisionPolicy = 'cancel'
): Promise<ColorStyleReport> {
  const creation = colorStyleCreationQueue.then(() =>
    createColorStylesOperation(scalesData, systemName, collisionPolicy)
  );
  colorStyleCreationQueue = creation.then(
    () => undefined,
    () => undefined
  );
  return creation;
}
