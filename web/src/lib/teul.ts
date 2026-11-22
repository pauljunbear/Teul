import { colorData } from '../../../src/colorData';
import { wernerColors } from '../../../src/wernerColorData';
import {
  analyzeContrast,
  getAccessibleTextColor,
  type ContrastResult,
} from '../../../src/lib/accessibility';
import {
  exportAsCSS,
  exportAsJSON,
  exportAsTailwind,
  type ExportScale,
  type ExportScales,
} from '../../../src/lib/colorExport';
import {
  buildColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  type ColorSystemModelInputV1,
} from '../../../src/lib/colorSystemModelV1';
import {
  planColorSystemSourceScaleV1,
  COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
  type ColorSystemSourceScalePlanningRequestV1,
} from '../../../src/lib/colorSystemScalePlanningV1';
import { buildColorSystemConstructionProposalV1 } from '../../../src/lib/colorSystemConstructionProposalV1';
import { COLOR_SYSTEM_CONSTRUCTION_V1_VERSION } from '../../../src/lib/colorSystemConstructionV1';
import { buildColorSystemSrgbValueV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { canonicalJson, deterministicContentHash } from '../../../src/lib/colorSystemHashing';
import {
  getNeutralForAccent,
  matchRadixFamily,
  radixColors,
  RADIX_COLORS_VERSION,
  type RadixColorName,
  type RadixScale,
} from '../../../src/lib/radixColors';
import {
  WADA_SOURCE_PROVENANCE_DISCLOSURE,
  WERNER_SOURCE_PROVENANCE_DISCLOSURE,
} from '../../../src/lib/sourceProvenanceDisclosureData';
import { hexToRgb } from '../../../src/lib/utils';

export type StudioMethod = 'authored' | 'radix';
export type StudioRadixFamily = RadixColorName;
export type StudioScale = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export interface StudioRadixMatch {
  mode: 'light' | 'dark';
  /** Published Radix step, numbered 1–12. */
  step: number;
  hex: string;
  /** Perceptual distance from the reference in OKLab; lower is closer. */
  deltaEOK: number;
}

export interface StudioFamily {
  id: string;
  name: string;
  sourceHex: string;
  light: StudioScale;
  dark: StudioScale;
  provenance: string;
  radixFamily?: RadixColorName;
  /** Present only when Teul matched a reference to a published accent family. */
  radixMatch?: StudioRadixMatch;
}

export interface StudioDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourceHex?: string;
}

export interface StudioSystem {
  id: string;
  name: string;
  sourceColors: string[];
  method: StudioMethod;
  radixFamily?: StudioRadixFamily;
  families: StudioFamily[];
  neutral: StudioFamily;
  diagnostics: StudioDiagnostic[];
  sourcePreservation: {
    sourceModelHash: string | null;
    inputColors: string[];
    exactInputValuesRetained: boolean;
    entries: {
      sourceHex: string;
      status: 'preserved' | 'reference-only' | 'unavailable';
      lightAnchorHex: string | null;
      darkAnchorHex: string | null;
      constructionReceiptHash?: string;
    }[];
    scope: string;
  };
}

export interface StudioLibraryEntry {
  id: string;
  name: string;
  colors: string[];
  source: 'wada' | 'werner' | 'radix';
  description: string;
  radixFamily?: StudioRadixFamily;
}

export const sourceDisclosures = {
  wada: WADA_SOURCE_PROVENANCE_DISCLOSURE.disclosure.detail,
  werner: WERNER_SOURCE_PROVENANCE_DISCLOSURE.disclosure.detail,
  radix: `Exact published sRGB solid scales from @radix-ui/colors ${RADIX_COLORS_VERSION}. Brand matching is a Teul proposal.`,
  authored:
    'Teul source-preserving authored construction. Original colors stay pinned at step 9; added colors are proposals displayed as sRGB hex.',
} as const;

export function isStudioRadixFamily(value: unknown): value is StudioRadixFamily {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(radixColors, value);
}

export function normalizeHex(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(value))
    return `#${[...value]
      .map(char => char + char)
      .join('')
      .toUpperCase()}`;
  return /^[\da-f]{6}$/i.test(value) ? `#${value.toUpperCase()}` : null;
}

function twelve(values: readonly string[]): StudioScale {
  if (values.length !== 12 || values.some(value => !normalizeHex(value))) {
    throw new Error('The color engine returned an incomplete 12-step scale.');
  }
  return values.map(value => normalizeHex(value)!) as StudioScale;
}

const radixSteps = (scale: RadixScale): StudioScale =>
  twelve(Array.from({ length: 12 }, (_, index) => scale[(index + 1) as keyof RadixScale]));
const hash = (value: unknown): string => deterministicContentHash(canonicalJson(value));

function radixFamily(name: RadixColorName, sourceHex: string, id: string): StudioFamily {
  const family = radixColors[name];
  return {
    id,
    name: family.displayName,
    sourceHex,
    light: radixSteps(family.light),
    dark: radixSteps(family.dark),
    provenance: sourceDisclosures.radix,
    radixFamily: name,
  };
}

/** Build the shared source model from already-normalized studio hex colors. */
export function buildStudioSourceModel(colors: readonly string[]) {
  const sourceId = 'web:input';
  const evidenceRefs = ['web:entered-colors'];
  const input: ColorSystemModelInputV1 = {
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: [
      {
        id: sourceId,
        label: 'Colors entered in Teul Studio',
        sourceHash: hash(colors),
        version: '1',
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [
      {
        id: evidenceRefs[0],
        sourceId,
        locator: null,
        status: 'observed',
        description:
          'Exact opaque sRGB hex values supplied by the user; no brand rules are inferred.',
      },
    ],
    coverage: [
      {
        sourceId,
        status: 'complete',
        evidenceRefs,
        unresolvedClaimIds: [],
        note: 'Complete coverage of the entered swatches only; no guideline or product-conformance claim.',
      },
    ],
    claims: [],
    modes: [
      { id: 'Light', label: 'Light' },
      { id: 'Dark', label: 'Dark' },
    ],
    colors: colors.map((hex, index) => {
      const rgb = hexToRgb(hex);
      const value = buildColorSystemSrgbValueV1({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });
      return {
        id: `source:${index + 1}`,
        label: `Brand ${index + 1}`,
        sourceId,
        valuesByMode: { Light: value, Dark: value },
        evidenceRefs,
        claimIds: [],
      };
    }),
    families: [],
    scales: [],
    contexts: [
      {
        id: 'studio',
        label: 'Studio exploration',
        modeIds: ['Light', 'Dark'],
        evidenceRefs,
        claimIds: [],
      },
    ],
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  };
  return buildColorSystemModelV1(input);
}

export async function generateStudioSystem(input: {
  name: string;
  colors: string[];
  method: StudioMethod;
  radixFamily?: StudioRadixFamily;
}): Promise<StudioSystem> {
  if (
    !input ||
    !Array.isArray(input.colors) ||
    input.colors.length < 1 ||
    input.colors.length > 6
  ) {
    throw new Error('Enter between one and six source colors.');
  }
  if (input.method !== 'authored' && input.method !== 'radix')
    throw new Error('Choose an authored or Radix scale.');
  if (input.radixFamily !== undefined) {
    if (!isStudioRadixFamily(input.radixFamily)) throw new Error('Choose a valid Radix family.');
    if (input.method !== 'radix' || input.colors.length !== 1)
      throw new Error('An explicit Radix family requires Radix mode and one source reference.');
  }
  if (typeof input.name !== 'string') throw new Error('The system needs a text name.');
  const colors = input.colors.map(raw => {
    const hex = normalizeHex(raw);
    if (!hex)
      throw new Error(`Invalid source color: ${String(raw)}. Use a three- or six-digit hex value.`);
    return hex;
  });
  if (
    input.radixFamily !== undefined &&
    colors[0] !== radixColors[input.radixFamily].light[9].toUpperCase()
  ) {
    throw new Error('The Radix source reference must be the selected family’s light step 9.');
  }
  const name = input.name.trim().slice(0, 80) || 'Untitled system';
  const selection = input.radixFamily === undefined ? {} : { radixFamily: input.radixFamily };
  const identity = hash({ name, colors, method: input.method, ...selection });
  const radixMatches =
    input.method === 'radix' && !input.radixFamily ? colors.map(matchRadixFamily) : [];
  const firstRadixFamily = input.radixFamily ?? radixMatches[0]?.family.name;
  const neutralName = firstRadixFamily
    ? radixColors[firstRadixFamily].pairedNeutral
    : getNeutralForAccent(colors[0]);
  const system: StudioSystem = {
    id: identity,
    name,
    sourceColors: colors,
    method: input.method,
    ...selection,
    families: [],
    neutral: radixFamily(neutralName, radixColors[neutralName].light[9].toUpperCase(), 'neutral'),
    diagnostics: [
      {
        level: 'info',
        code: 'PAIR_CHECKS_REQUIRED',
        message:
          'Check foreground and background pairs in the intended component. A generated scale does not establish product accessibility.',
      },
    ],
    sourcePreservation: {
      sourceModelHash: null,
      inputColors: [...colors],
      exactInputValuesRetained: true,
      entries: [],
      scope:
        input.method === 'authored'
          ? 'Exact entered colors remain in the source model and at step 9 of each completed scale. Generated additions are unqualified proposals.'
          : 'Entered colors remain reference inputs. Radix matching selects unchanged library values and may not reproduce the input.',
    },
  };

  if (input.method === 'radix') {
    if (input.radixFamily) {
      system.sourcePreservation.scope =
        'The selected Radix family retains its exact published light and dark scales. The source reference is its light step 9; no family matching is performed.';
    }
    colors.forEach((sourceHex, index) => {
      const match = radixMatches[index];
      const selectedFamily = input.radixFamily ?? match.family.name;
      const family = radixFamily(selectedFamily, sourceHex, `brand-${index + 1}`);
      if (match) {
        family.radixMatch = {
          mode: match.matchedMode,
          step: match.matchedStep,
          hex: match.matchedHex.toUpperCase(),
          deltaEOK: match.deltaEOK,
        };
      }
      system.families.push(family);
      system.sourcePreservation.entries.push({
        sourceHex,
        status: 'reference-only',
        lightAnchorHex: family.light[8],
        darkAnchorHex: family.dark[8],
      });
    });
    return system;
  }

  const source = buildStudioSourceModel(colors);
  system.sourcePreservation.sourceModelHash = source.modelHash;
  for (const [index, sourceHex] of colors.entries()) {
    const sourceColorId = `source:${index + 1}`;
    const request: ColorSystemSourceScalePlanningRequestV1 = {
      version: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
      id: `web-scale-${index + 1}`,
      sourceModelHash: source.modelHash,
      contextId: 'studio',
      family: { id: `generated:family:${index + 1}`, label: `Brand ${index + 1}` },
      scale: { id: `generated:scale:${index + 1}`, label: `Brand ${index + 1}` },
      brief: {
        briefHash: identity,
        operation: 'extend',
        contextIds: ['studio'],
        modeIds: ['Light', 'Dark'],
        permissions: {
          addColors: true,
          addFamilies: true,
          addScales: true,
          addRules: false,
          editFamilyIds: [],
          editScaleIds: [],
          replaceRuleIds: [],
        },
      },
      decision: {
        actor: { kind: 'user', ref: 'web:generate' },
        authorityRef: 'web:generate-source-scale',
        decisionRef: identity,
      },
      modes: [
        { modeId: 'Light', polarity: 'light', anchorColorId: sourceColorId },
        { modeId: 'Dark', polarity: 'dark', anchorColorId: sourceColorId },
      ],
    };
    const unavailable = (message: string) => {
      system.diagnostics.push({
        level: 'error',
        code: 'AUTHORED_CONSTRUCTION_UNAVAILABLE',
        sourceHex,
        message,
      });
      system.sourcePreservation.entries.push({
        sourceHex,
        status: 'unavailable',
        lightAnchorHex: null,
        darkAnchorHex: null,
      });
    };
    try {
      const plan = planColorSystemSourceScaleV1(source, request);
      if (plan.status !== 'planned') {
        unavailable(
          `The authored engine could not plan ${sourceHex}: required source values are missing.`
        );
        continue;
      }
      const result = await buildColorSystemConstructionProposalV1(
        source,
        plan.constructionBrief,
        plan.constructionIntent,
        undefined,
        plan.structureProposal
      );
      const construction = result.construction.result;
      if (result.status !== 'proposed' || construction.status !== 'complete') {
        const issues =
          construction.status === 'cancelled'
            ? 'Construction cancelled.'
            : construction.scales
                .flatMap(scale => scale.issues.map(issue => issue.message))
                .join(' ');
        unavailable(`The authored engine could not complete ${sourceHex}. ${issues}`);
        continue;
      }
      const originalsRetained = source.colors.every(
        original =>
          canonicalJson(
            result.proposal.workingModel.colors.find(color => color.id === original.id)
          ) === canonicalJson(original)
      );
      if (!originalsRetained)
        throw new Error('Authored construction did not preserve the original source model.');
      const values = (modeId: string): StudioScale =>
        twelve(
          construction.scales
            .find(scale => scale.modeId === modeId)!
            .members.slice()
            .sort((a, b) => a.position - b.position)
            .map(member => member.value.hex)
        );
      const light = values('Light');
      const dark = values('Dark');
      if (light[8] !== sourceHex || dark[8] !== sourceHex)
        throw new Error('The authored source anchor moved.');
      system.families.push({
        id: `brand-${index + 1}`,
        name: `Brand ${index + 1}`,
        sourceHex,
        light,
        dark,
        provenance: sourceDisclosures.authored,
      });
      system.sourcePreservation.entries.push({
        sourceHex,
        status: 'preserved',
        lightAnchorHex: light[8],
        darkAnchorHex: dark[8],
        constructionReceiptHash: result.construction.receiptHash,
      });
      for (const derivation of plan.endpointDerivations) {
        if (!derivation.validation.valid)
          system.diagnostics.push({
            level: 'warning',
            code: 'ENDPOINT_GENERATOR_DIAGNOSTIC',
            sourceHex,
            message: `${derivation.modeId} endpoint-generator diagnostics: ${derivation.validation.issues.map(issue => issue.message).join(' ')} These are not final application checks.`,
          });
      }
    } catch (error) {
      unavailable(
        `The authored engine could not complete ${sourceHex}: ${error instanceof Error ? error.message : 'Unknown construction error.'}`
      );
    }
  }
  if (!system.families.length) {
    throw new Error(
      system.diagnostics
        .filter(item => item.level === 'error')
        .map(item => item.message)
        .join(' ')
    );
  }
  return system;
}

const combinations = new Map<number, typeof colorData.colors>();
for (const color of colorData.colors) {
  for (const combination of color.combinations) {
    const members = combinations.get(combination) ?? [];
    members.push(color);
    combinations.set(combination, members);
  }
}

export const wadaPalettes: StudioLibraryEntry[] = [...combinations]
  .sort(([a], [b]) => a - b)
  .map(([id, members]) => ({
    id: `wada-${id}`,
    name: `Wada ${String(id).padStart(3, '0')}`,
    source: 'wada',
    colors: members.map(color => normalizeHex(color.hex)!),
    description: `${members.map(color => color.name).join(' · ')}. Digital sRGB approximations.`,
  }));
export const wernerSwatches: StudioLibraryEntry[] = wernerColors.map(color => ({
  id: `werner-${color.id}`,
  name: color.name,
  source: 'werner',
  colors: [normalizeHex(color.hex)!],
  description: `${color.group}. ${color.text.normalized.description}`,
}));
export const radixFamilies: StudioLibraryEntry[] = Object.values(radixColors).map(family => ({
  id: `radix-${family.name}`,
  name: family.displayName,
  source: 'radix',
  radixFamily: family.name,
  colors: radixSteps(family.light),
  description: `Exact @radix-ui/colors ${RADIX_COLORS_VERSION} light scale. Paired neutral: ${family.pairedNeutral}.`,
}));
export const libraryEntries: StudioLibraryEntry[] = [
  ...wadaPalettes,
  ...wernerSwatches,
  ...radixFamilies,
];

export function analyzeStudioContrast(foreground: string, background: string): ContrastResult {
  const fg = normalizeHex(foreground),
    bg = normalizeHex(background);
  if (!fg || !bg) throw new Error('Contrast checks require two valid hex colors.');
  return analyzeContrast(fg, bg);
}

export function getStudioTextColor(background: string): string {
  const hex = normalizeHex(background);
  if (!hex) throw new Error('Text color selection requires a valid background hex color.');
  const preferred = getAccessibleTextColor(hex, ['#FFFFFF', '#151515']);
  return preferred.rating.aa
    ? preferred.hex
    : getAccessibleTextColor(hex, ['#FFFFFF', '#000000']).hex;
}

function exportScales(system: StudioSystem, mode: 'light' | 'dark'): ExportScales {
  const convert = (family: StudioFamily, role: string): ExportScale => ({
    name: family.name,
    role,
    profile: 'sRGB',
    mode,
    steps: family[mode].map((hex, index) => ({ step: index + 1, hex })),
    ...(family.radixFamily
      ? {
          method: 'Radix Colors' as const,
          sourceVersion: RADIX_COLORS_VERSION,
          sourceFamily: family.radixFamily,
          sourceInputHex: family.sourceHex,
        }
      : {}),
  });
  const scales: ExportScales = { neutral: convert(system.neutral, 'Neutral') };
  system.families.forEach((family, index) => {
    scales[index === 0 ? 'primary' : `accent${index}`] = convert(family, family.name);
  });
  return scales;
}

export function exportStudioSystem(
  system: StudioSystem,
  format: 'css' | 'json' | 'tailwind'
): string {
  const light = exportScales(system, 'light'),
    dark = exportScales(system, 'dark');
  const metadata = {
    schemaVersion: 'teul.studio.v1',
    id: system.id,
    method: system.method,
    ...(system.radixFamily ? { radixFamily: system.radixFamily } : {}),
    sourceColors: system.sourceColors,
    engine:
      system.method === 'authored'
        ? COLOR_SYSTEM_CONSTRUCTION_V1_VERSION
        : `@radix-ui/colors@${RADIX_COLORS_VERSION}`,
    sourcePreservation: system.sourcePreservation,
    diagnostics: system.diagnostics,
    qualified: false,
    accessibilityScope:
      'Individual foreground/background pairs require checks in their intended use.',
    families: [...system.families, system.neutral].map(
      ({ id, sourceHex, provenance, radixMatch }) => ({
        id,
        sourceHex,
        provenance,
        ...(radixMatch ? { radixMatch } : {}),
      })
    ),
  };
  if (format === 'json') {
    const result = JSON.parse(exportAsJSON(light, dark, system.name));
    result.metadata = { ...result.metadata, studio: metadata };
    return JSON.stringify(result, null, 2);
  }
  // Names are data; prevent line breaks or comment terminators from becoming exported code.
  const safeName = system.name.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/\*\//g, '* /');
  if (format === 'css') {
    const serialized = JSON.stringify(metadata, null, 2).replace(/\*\//g, '*\\/');
    return `/* Teul Studio metadata\n${serialized}\n*/\n\n${exportAsCSS(light, dark, safeName)}`;
  }
  if (format === 'tailwind') {
    return `${exportAsTailwind(light, dark, safeName)}\nmodule.exports.teul = { ...module.exports.teul, studio: ${JSON.stringify(metadata, null, 2)} };\n`;
  }
  throw new Error('Choose CSS, JSON, or Tailwind export.');
}
