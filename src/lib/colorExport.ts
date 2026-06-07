// Color System Export Utilities
// Extracted from ColorSystemModal.tsx

// ============================================
// Types
// ============================================

import type { ColorScaleValidation } from './colorScale';
import { doesRadixSourceInputMatchFamily, isExactRadixScale } from './radixColors';
import type {
  SemanticColorModeReport,
  SemanticColorPolicyReport,
  SemanticColorToken,
} from './semanticColorPolicy';
import { isSemanticColorPolicyCurrent } from './semanticColorPolicy';

export interface ExportScale {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
  profile?: 'sRGB';
  method?: 'Teul OKLCH v2' | 'Radix Colors';
  mode?: 'light' | 'dark';
  validation?: ColorScaleValidation;
  sourceVersion?: string;
  sourceFamily?: string;
  sourceInputHex?: string;
}

export interface ExportScales {
  primary?: ExportScale;
  secondary?: ExportScale;
  tertiary?: ExportScale;
  accent?: ExportScale;
  neutral: ExportScale;
  [key: string]: ExportScale | undefined;
}

export type ExportSemanticPolicy = SemanticColorPolicyReport;

interface ExactRadixExportMetadata {
  packageName: '@radix-ui/colors';
  version: string;
  matchedFamilies?: string[];
}

export interface ColorExportOptions {
  scaleMethod?: 'custom' | 'radix-match' | 'wcag-constrained';
  /**
   * Constrained semantic output is intentionally opt-in. The policy generator
   * owns validation; this module serializes its resolved tokens and report.
   */
  semanticPolicy?: ExportSemanticPolicy;
}

interface ExportScaleData {
  name: string;
  role: string;
  colors: Record<string, string>;
  profile?: 'sRGB';
  method?: 'Teul OKLCH v2' | 'Radix Colors';
  mode?: 'light' | 'dark';
  validation?: ColorScaleValidation;
  sourceVersion?: string;
  sourceFamily?: string;
  sourceInputHex?: string;
}

interface ExportJSONData {
  name: string;
  generatedAt: string;
  generator: string;
  light: Record<string, ExportScaleData>;
  dark?: Record<string, ExportScaleData>;
  metadata?: {
    exactRadix?: ExactRadixExportMetadata;
  };
  semanticPolicy?: ExportSemanticPolicy;
}

// ============================================
// Helper Functions
// ============================================

// Export and Figma style suffixes are separate backward-compatibility contracts.
// Figma style suffix 1000 historically means step 11; export suffix 1000 means step 12.
export function stepToVarSuffix(step: number): string {
  const mapping: Record<number, string> = {
    1: '50',
    2: '100',
    3: '200',
    4: '300',
    5: '400',
    6: '500',
    7: '600',
    8: '700',
    9: '800',
    10: '900',
    11: '950',
    12: '1000',
  };
  return mapping[step] || step.toString();
}

export function stepToStyleSuffix(step: number): string {
  const mapping: Record<number, string> = {
    1: '50',
    2: '100',
    3: '200',
    4: '300',
    5: '400',
    6: '500',
    7: '600',
    8: '700',
    9: '800',
    10: '900',
    11: '1000',
    12: '1100',
  };
  return mapping[step] || step.toString();
}

const BASE_SCALE_ORDER = ['primary', 'secondary', 'tertiary', 'accent'] as const;

export function getOrderedScaleKeys(scales: Record<string, unknown>): string[] {
  const presentKeys = Object.keys(scales).filter(key => scales[key] !== undefined);
  const roleOrder = new Map(BASE_SCALE_ORDER.map((role, index) => [role, index]));
  const parseRoleKey = (key: string) => {
    const match = /^(primary|secondary|tertiary|accent)(\d+)?$/.exec(key);
    return match
      ? {
          role: roleOrder.get(match[1] as (typeof BASE_SCALE_ORDER)[number]) ?? 0,
          variant: match[2] ? Number(match[2]) : 1,
        }
      : null;
  };
  const remainingKeys = presentKeys
    .filter(key => key !== 'neutral')
    .sort((first, second) => {
      const parsedFirst = parseRoleKey(first);
      const parsedSecond = parseRoleKey(second);
      if (parsedFirst && parsedSecond) {
        return parsedFirst.role - parsedSecond.role || parsedFirst.variant - parsedSecond.variant;
      }
      if (parsedFirst) return -1;
      if (parsedSecond) return 1;
      return first.localeCompare(second);
    });

  return presentKeys.includes('neutral') ? [...remainingKeys, 'neutral'] : remainingKeys;
}

export function systemNameToTokenPrefix(systemName: string): string {
  const normalized = systemName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'teul-color-system';
}

function semanticTokenToSuffix(tokenName: string): string {
  const normalized = tokenName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'token';
}

function getExactRadixLabel(metadata: ExactRadixExportMetadata): string {
  return `${metadata.packageName} v${metadata.version}`;
}

function deriveExactRadixMetadata(
  scales: ExportScales,
  darkScales: ExportScales | undefined
): ExactRadixExportMetadata | undefined {
  const allScales = [...Object.values(scales), ...Object.values(darkScales ?? {})].filter(
    (scale): scale is ExportScale => scale !== undefined
  );
  if (allScales.length === 0 || allScales.some(scale => !isVerifiedExactRadixScale(scale))) {
    return undefined;
  }

  const exactScales = allScales.filter(scale => Boolean(scale.sourceVersion || scale.sourceFamily));
  const versions = [...new Set(exactScales.flatMap(scale => scale.sourceVersion ?? []))];
  const matchedFamilies = [...new Set(exactScales.flatMap(scale => scale.sourceFamily ?? []))];
  if (versions.length !== 1) return undefined;

  return {
    packageName: '@radix-ui/colors',
    version: versions[0],
    matchedFamilies: matchedFamilies.length > 0 ? matchedFamilies : undefined,
  };
}

function isVerifiedExactRadixScale(scale: ExportScale): boolean {
  return (
    scale.method === 'Radix Colors' &&
    isExactRadixScale(scale.sourceVersion, scale.sourceFamily, scale.mode, scale.steps)
  );
}

function buildExportMetadataComments(metadata: ExactRadixExportMetadata, prefix = ''): string {
  let comments = `${prefix}Exact Radix Colors: ${getExactRadixLabel(metadata)}\n`;
  if (metadata.matchedFamilies?.length) {
    comments += `${prefix}Matched families: ${metadata.matchedFamilies.join(', ')}\n`;
  }
  return comments;
}

function buildScaleSourceComment(scale: ExportScale): string | undefined {
  if (
    !isVerifiedExactRadixScale(scale) ||
    (!scale.sourceVersion && !scale.sourceFamily && !scale.sourceInputHex)
  ) {
    return undefined;
  }

  const details: string[] = [];
  if (scale.sourceVersion) {
    details.push(`@radix-ui/colors v${scale.sourceVersion}`);
  }
  if (scale.sourceFamily) {
    details.push(`matched family ${scale.sourceFamily}`);
  }
  if (doesRadixSourceInputMatchFamily(scale.sourceInputHex, scale.sourceFamily)) {
    details.push(`source input ${scale.sourceInputHex}`);
  }
  return details.join(' · ');
}

function buildSemanticCSSVariables(
  tokens: Record<string, SemanticColorToken>,
  prefix: string
): string {
  let css = '';
  for (const [tokenName, token] of Object.entries(tokens)) {
    css += `  --${prefix}-semantic-${semanticTokenToSuffix(tokenName)}: ${token.value};\n`;
  }
  return css;
}

function buildSemanticColorObject(
  tokens: Record<string, SemanticColorToken>
): Record<string, string> {
  return Object.entries(tokens).reduce(
    (colors, [tokenName, token]) => {
      colors[semanticTokenToSuffix(tokenName)] = token.value;
      return colors;
    },
    {} as Record<string, string>
  );
}

function buildSemanticVariableObject(
  tokens: Record<string, SemanticColorToken>,
  prefix: string
): Record<string, string> {
  return Object.keys(tokens).reduce(
    (colors, tokenName) => {
      const suffix = semanticTokenToSuffix(tokenName);
      colors[suffix] = `var(--${prefix}-semantic-${suffix})`;
      return colors;
    },
    {} as Record<string, string>
  );
}

function buildSemanticVariableDeclarations(
  tokens: Record<string, SemanticColorToken>,
  prefix: string
): Record<string, string> {
  return Object.entries(tokens).reduce(
    (declarations, [tokenName, token]) => {
      declarations[`--${prefix}-semantic-${semanticTokenToSuffix(tokenName)}`] = token.value;
      return declarations;
    },
    {} as Record<string, string>
  );
}

function getSemanticPolicyReports(semanticPolicy: ExportSemanticPolicy | undefined): {
  light?: SemanticColorModeReport;
  dark?: SemanticColorModeReport;
} {
  if (!semanticPolicy) return {};
  return semanticPolicy.modes;
}

function assertExportPolicyCurrent(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  options: ColorExportOptions | undefined
): void {
  const semanticPolicy = options?.semanticPolicy;
  if (options?.scaleMethod === 'wcag-constrained' && !semanticPolicy) {
    throw new Error('WCAG-constrained export requires a current passing semantic token policy');
  }
  if (semanticPolicy && !isSemanticColorPolicyCurrent(scales, darkScales, semanticPolicy)) {
    throw new Error('WCAG-constrained semantic token policy is stale or invalid');
  }
}

function buildWCAGReportComments(
  report: SemanticColorModeReport,
  policy: ExportSemanticPolicy
): string {
  let comments = `/* WCAG-constrained semantic token report */\n`;
  comments += `/* Scope: declared semantic token pairings only; not whole-product WCAG conformance. */\n`;
  comments += `/* Policy: ${policy.standard} · ${policy.level} · ${report.mode} · ${report.valid ? 'PASS' : 'FAIL'} */\n`;
  for (const pairing of report.pairings) {
    const id = `${pairing.foregroundToken}-on-${pairing.backgroundToken}`;
    comments += `/* ${pairing.pass ? 'PASS' : 'FAIL'} ${id}: ${pairing.foregroundToken} on ${pairing.backgroundToken} · ${pairing.ratio.toFixed(2)}:1 / ${pairing.minimumRatio.toFixed(2)}:1 · ${pairing.category} · ${pairing.useCase} */\n`;
  }
  return comments;
}

// ============================================
// Export Functions
// ============================================

// Export as CSS custom properties
export function exportAsCSS(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string,
  options?: ColorExportOptions
): string {
  assertExportPolicyCurrent(scales, darkScales, options);
  const prefix = systemNameToTokenPrefix(systemName);
  const exactRadix = deriveExactRadixMetadata(scales, darkScales);
  const semanticReports = getSemanticPolicyReports(options?.semanticPolicy);
  let css = `/* ${systemName} Color System */\n`;
  css += `/* Generated with Teul */\n\n`;
  if (exactRadix) {
    css += buildExportMetadataComments(exactRadix, '/* ').replace(/\n/g, ' */\n');
    css += `\n`;
  }

  css += `:root {\n`;

  // Light mode variables
  for (const key of getOrderedScaleKeys(scales)) {
    const scale = scales[key];
    if (scale) {
      css += `  /* ${scale.role} */\n`;
      css += `  /* ${scale.method ?? 'Unspecified source'}${scale.profile ? ` · ${scale.profile}` : ''} */\n`;
      const sourceComment = buildScaleSourceComment(scale);
      if (sourceComment) css += `  /* ${sourceComment} */\n`;
      for (const step of scale.steps) {
        css += `  --${prefix}-${key}-${stepToVarSuffix(step.step)}: ${step.hex};\n`;
      }
      css += `\n`;
    }
  }
  css += `}\n`;

  // Dark mode variables
  if (darkScales) {
    css += `\n/* Dark Mode */\n`;
    css += `[data-theme="dark"],\n.dark {\n`;
    for (const key of getOrderedScaleKeys(darkScales)) {
      const scale = darkScales[key];
      if (scale) {
        css += `  /* ${scale.role} */\n`;
        const sourceComment = buildScaleSourceComment(scale);
        if (sourceComment) css += `  /* ${sourceComment} */\n`;
        for (const step of scale.steps) {
          css += `  --${prefix}-${key}-${stepToVarSuffix(step.step)}: ${step.hex};\n`;
        }
        css += `\n`;
      }
    }
    css += `}\n`;
  }

  if (semanticReports.light || semanticReports.dark) {
    css += `\n/* WCAG-constrained semantic tokens */\n`;
    if (semanticReports.light) {
      css += `:root {\n`;
      css += buildSemanticCSSVariables(semanticReports.light.tokens, prefix);
      css += `}\n`;
    }

    if (semanticReports.dark) {
      css += `\n[data-theme="dark"],\n.dark {\n`;
      css += buildSemanticCSSVariables(semanticReports.dark.tokens, prefix);
      css += `}\n`;
    }

    for (const report of [semanticReports.light, semanticReports.dark]) {
      if (report && options?.semanticPolicy) {
        css += `\n${buildWCAGReportComments(report, options.semanticPolicy)}`;
      }
    }
  }

  return css;
}

// Export as Tailwind config
export function exportAsTailwind(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string,
  options?: ColorExportOptions
): string {
  assertExportPolicyCurrent(scales, darkScales, options);
  const prefix = systemNameToTokenPrefix(systemName);
  const exactRadix = deriveExactRadixMetadata(scales, darkScales);
  const semanticReports = getSemanticPolicyReports(options?.semanticPolicy);
  const buildColorObject = (scalesData: ExportScales): Record<string, Record<string, string>> => {
    const colors: Record<string, Record<string, string>> = {};

    for (const key of getOrderedScaleKeys(scalesData)) {
      const scale = scalesData[key];
      if (scale) {
        colors[key] = {};
        for (const step of scale.steps) {
          colors[key][stepToVarSuffix(step.step)] = step.hex;
        }
      }
    }
    return colors;
  };

  const lightColors = buildColorObject(scales);
  if (semanticReports.light) {
    lightColors.semantic = buildSemanticVariableObject(semanticReports.light.tokens, prefix);
  }

  let config = `// ${systemName} - Tailwind CSS Config\n`;
  config += `// Generated with Teul\n\n`;
  if (exactRadix) {
    config += buildExportMetadataComments(exactRadix, '// ');
    config += `\n`;
  }
  config += `module.exports = {\n`;
  config += `  theme: {\n`;
  config += `    extend: {\n`;
  config += `      colors: ${JSON.stringify(lightColors, null, 8)
    .replace(/"/g, "'")
    .split('\n')
    .map((line, i) => (i === 0 ? line : '      ' + line))
    .join('\n')},\n`;
  config += `    },\n`;
  config += `  },\n`;
  if (options?.semanticPolicy || exactRadix) {
    const teulMetadata = {
      exactRadix,
      semanticColorPolicy: options?.semanticPolicy,
    };
    config += `  teul: ${JSON.stringify(teulMetadata, null, 4)
      .replace(/"/g, "'")
      .split('\n')
      .map((line, i) => (i === 0 ? line : '  ' + line))
      .join('\n')},\n`;
  }
  if (semanticReports.light || semanticReports.dark) {
    const baseThemes = {
      ...(semanticReports.light
        ? { ':root': buildSemanticVariableDeclarations(semanticReports.light.tokens, prefix) }
        : {}),
      ...(semanticReports.dark
        ? {
            '.dark': buildSemanticVariableDeclarations(semanticReports.dark.tokens, prefix),
          }
        : {}),
    };
    config += `  plugins: [\n`;
    config += `    function teulSemanticThemes({ addBase }) {\n`;
    config += `      addBase(${JSON.stringify(baseThemes, null, 8)
      .replace(/"/g, "'")
      .split('\n')
      .map((line, i) => (i === 0 ? line : '      ' + line))
      .join('\n')});\n`;
    config += `    },\n`;
    config += `  ],\n`;
  }
  config += `};\n`;

  if (darkScales || semanticReports.dark) {
    const darkColors = darkScales ? buildColorObject(darkScales) : {};
    if (semanticReports.dark) {
      darkColors.semantic = buildSemanticColorObject(semanticReports.dark.tokens);
    }
    config += `\n// Dark mode colors (use with darkMode: 'class')\n`;
    config += `// Add to your CSS or use CSS variables approach:\n`;
    config += `/*\n${JSON.stringify(darkColors, null, 2)}\n*/\n`;
  }

  return config;
}

// Export as JSON
export function exportAsJSON(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string,
  options?: ColorExportOptions
): string {
  assertExportPolicyCurrent(scales, darkScales, options);
  const exactRadix = deriveExactRadixMetadata(scales, darkScales);
  const buildScaleObject = (scalesData: ExportScales): Record<string, ExportScaleData> => {
    const result: Record<string, ExportScaleData> = {};

    for (const key of getOrderedScaleKeys(scalesData)) {
      const scale = scalesData[key];
      if (scale) {
        const exactRadixScale = isVerifiedExactRadixScale(scale);
        result[key] = {
          name: scale.name,
          role: scale.role,
          profile: scale.profile,
          method: scale.method,
          mode: scale.mode,
          validation: scale.validation,
          sourceVersion: exactRadixScale ? scale.sourceVersion : undefined,
          sourceFamily: exactRadixScale ? scale.sourceFamily : undefined,
          sourceInputHex:
            exactRadixScale &&
            doesRadixSourceInputMatchFamily(scale.sourceInputHex, scale.sourceFamily)
              ? scale.sourceInputHex
              : undefined,
          colors: scale.steps.reduce(
            (acc, step) => {
              acc[stepToVarSuffix(step.step)] = step.hex;
              return acc;
            },
            {} as Record<string, string>
          ),
        };
      }
    }
    return result;
  };

  const data: ExportJSONData = {
    name: systemName,
    generatedAt: new Date().toISOString(),
    generator: 'Teul',
    light: buildScaleObject(scales),
  };

  if (darkScales) {
    data.dark = buildScaleObject(darkScales);
  }
  if (exactRadix) {
    data.metadata = { exactRadix };
  }
  if (options?.semanticPolicy) {
    data.semanticPolicy = options.semanticPolicy;
  }

  return JSON.stringify(data, null, 2);
}
