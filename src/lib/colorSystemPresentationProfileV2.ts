import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemSectionRoleV2,
} from './colorSystemBuilderV2Contracts';

export const COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION =
  'teul-color-presentation-profile/v2' as const;

export type ColorSystemPresentationProfileV2ErrorCode =
  | 'INVALID_PRESENTATION_EVIDENCE'
  | 'PRESENTATION_EVIDENCE_HASH_MISMATCH'
  | 'PRESENTATION_PROFILE_INTEGRITY';

export class ColorSystemPresentationProfileV2Error extends Error {
  constructor(
    readonly code: ColorSystemPresentationProfileV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemPresentationProfileV2Error';
  }
}

export interface ColorSystemPresentationTextRoleV2 {
  role: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight: number | null;
  lineHeightMultiplier: number | null;
  letterSpacing: number;
  sections: readonly ColorSystemSectionRoleV2[];
}

export interface ColorSystemPresentationRowRecipeV2 {
  count: number;
  width: number;
  height: number;
  cardWidth: number;
}

export interface ColorSystemPresentationSectionRecipeV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  sourceNodeId: string;
  headerNodeId: string;
  paletteNodeId: string;
  headerHeight: number;
  guidance: string | null;
  guidancePlacement: 'header-right' | 'none';
  contentAuthorityRef: string;
  rows: readonly ColorSystemPresentationRowRecipeV2[];
  metadataOrder: readonly string[];
}

export interface ColorSystemPresentationProfileV2 {
  version: typeof COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION;
  sourceAuthorityHash: string;
  sourcePackageHash: string;
  presentationEvidenceHash: string;
  frame: {
    width: number;
    height: number;
    backgroundHex: '#FFFFFF';
    siblingGap: number;
    padding: number;
    layoutAxis: 'vertical';
    horizontalAlignment: 'center';
    distribution: 'space-between';
    header: {
      x: number;
      y: number;
      width: number;
      defaultHeight: number;
      titleGroupGap: number;
      guidanceX: number;
      guidanceWidth: number;
    };
    palette: {
      x: number;
      y: number;
      width: number;
      height: number;
      rowGap: number;
      cardGap: number;
      cardPadding: number;
      cardContentGap: number;
      cardCornerRadius: number;
      cardContentAlignment: 'bottom-left';
      cardClipContent: true;
    };
    explicitLayoutGrid: 'none-governing';
  };
  typography: readonly ColorSystemPresentationTextRoleV2[];
  sections: readonly [
    ColorSystemPresentationSectionRecipeV2,
    ColorSystemPresentationSectionRecipeV2,
    ColorSystemPresentationSectionRecipeV2,
    ColorSystemPresentationSectionRecipeV2,
    ColorSystemPresentationSectionRecipeV2,
  ];
  cardBoundaryPolicy: {
    kind: 'none-or-monochrome-inside-1px';
    allowedColors: readonly ['#000000', '#FFFFFF'];
    forbidden: readonly string[];
  };
  rendererClaimBoundary: {
    authoringProfile: 'srgb';
    claim: string;
    limitations: readonly string[];
    renderAuthority: 'comparison-only';
  };
  profileHash: string;
}

export interface BuildColorSystemPresentationProfileV2Input {
  sourceAuthorityHash: string;
  sourcePackageHash: string;
  evidence: unknown;
}

export type ColorSystemPresentationProfileV2Result =
  | {
      status: 'ready';
      profile: ColorSystemPresentationProfileV2;
      missingFields: readonly [];
      blocker: null;
    }
  | {
      status: 'blocked';
      profile: null;
      missingFields: readonly string[];
      blocker: {
        code: 'PRESENTATION_PROFILE_INCOMPLETE';
        message: string;
      };
    };

type JsonRecord = Record<string, unknown>;

const HASH = /^sha256:[0-9a-f]{64}$/;
const HEX = /^#[0-9A-F]{6}$/;
const MAX_DIMENSION = 100_000;

function fail(code: ColorSystemPresentationProfileV2ErrorCode, message: string): never {
  throw new ColorSystemPresentationProfileV2Error(code, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) fail('INVALID_PRESENTATION_EVIDENCE', `${label} must be an object.`);
  return value;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail('INVALID_PRESENTATION_EVIDENCE', `${label} has missing or unsupported fields.`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    fail('INVALID_PRESENTATION_EVIDENCE', `${label} must be non-empty printable text.`);
  }
  return value.trim();
}

function number(value: unknown, label: string, minimum = 0, maximum = MAX_DIMENSION): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(
      'INVALID_PRESENTATION_EVIDENCE',
      `${label} must be finite from ${minimum} through ${maximum}.`
    );
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0, maximum = 10_000): number {
  const parsed = number(value, label, minimum, maximum);
  if (!Number.isInteger(parsed)) {
    fail('INVALID_PRESENTATION_EVIDENCE', `${label} must be an integer.`);
  }
  return parsed;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail('INVALID_PRESENTATION_EVIDENCE', `${label} must be an array.`);
  return value;
}

function pathValue(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    if (isRecord(current)) return current[key];
    return undefined;
  }, root);
}

const REQUIRED_PATHS = [
  'schemaVersion',
  'evidenceId',
  'source.kind',
  'source.fileKey',
  'source.pageNodeId',
  'source.capturedOn',
  'source.method',
  'source.authority',
  'source.renderAuthority',
  'frameGroup.axis',
  'frameGroup.siblingGap',
  'frameGroup.canonicalOrder',
  'frameGroup.frames',
  'sharedFrameRecipe.backgroundHex',
  'sharedFrameRecipe.outerPadding',
  'sharedFrameRecipe.rootLayout.axis',
  'sharedFrameRecipe.rootLayout.horizontalAlignment',
  'sharedFrameRecipe.rootLayout.distribution',
  'sharedFrameRecipe.header.x',
  'sharedFrameRecipe.header.y',
  'sharedFrameRecipe.header.width',
  'sharedFrameRecipe.header.defaultHeight',
  'sharedFrameRecipe.header.titleGroupGap',
  'sharedFrameRecipe.header.guidanceX',
  'sharedFrameRecipe.header.guidanceWidth',
  'sharedFrameRecipe.palette.x',
  'sharedFrameRecipe.palette.y',
  'sharedFrameRecipe.palette.width',
  'sharedFrameRecipe.palette.height',
  'sharedFrameRecipe.palette.rowGap',
  'sharedFrameRecipe.palette.cardGap',
  'sharedFrameRecipe.palette.cardPadding',
  'sharedFrameRecipe.palette.cardContentGap',
  'sharedFrameRecipe.palette.cardCornerRadius',
  'sharedFrameRecipe.palette.cardContentAlignment',
  'sharedFrameRecipe.palette.cardClipContent',
  'sharedFrameRecipe.explicitLayoutGrid.status',
  'sharedFrameRecipe.explicitLayoutGrid.governing',
  'sharedFrameRecipe.explicitLayoutGrid.replacementAuthority',
  'typography.family',
  'typography.style',
  'typography.letterSpacing',
  'typography.roles',
  'sections',
  'boundaryEvidence.sourceCards',
  'boundaryEvidence.generatedVisibilityBoundary.authority',
  'boundaryEvidence.generatedVisibilityBoundary.rule',
  'boundaryEvidence.generatedVisibilityBoundary.forbidden',
  'rendererClaimBoundary.authoringProfile',
  'rendererClaimBoundary.claim',
  'rendererClaimBoundary.limitations',
  'presentationEvidenceHash',
] as const;

function collectMissingFields(value: unknown): string[] {
  const missing: string[] = REQUIRED_PATHS.filter(path => pathValue(value, path) === undefined);
  const frameGroup = pathValue(value, 'frameGroup.frames');
  if (Array.isArray(frameGroup)) {
    frameGroup.forEach((frame, index) => {
      for (const key of ['role', 'nodeId', 'name', 'x', 'y', 'width', 'height']) {
        if (!isRecord(frame) || frame[key] === undefined)
          missing.push(`frameGroup.frames.${index}.${key}`);
      }
    });
  }
  const sections = pathValue(value, 'sections');
  if (Array.isArray(sections)) {
    sections.forEach((section, index) => {
      for (const key of [
        'role',
        'headerNodeId',
        'paletteNodeId',
        'headerHeight',
        'guidance',
        'contentAuthorityRef',
        'rows',
        'metadataOrder',
      ]) {
        if (!isRecord(section) || !(key in section)) missing.push(`sections.${index}.${key}`);
      }
      if (isRecord(section) && Array.isArray(section.rows)) {
        section.rows.forEach((row, rowIndex) => {
          for (const key of ['count', 'width', 'height', 'cardWidth']) {
            if (!isRecord(row) || row[key] === undefined) {
              missing.push(`sections.${index}.rows.${rowIndex}.${key}`);
            }
          }
        });
      }
    });
  }
  return [...new Set(missing)].sort();
}

function evidenceHash(evidence: JsonRecord): string {
  const { presentationEvidenceHash: _ignored, ...content } = evidence;
  return deterministicContentHash(content);
}

function validateEvidenceAndBuildProfile(
  input: BuildColorSystemPresentationProfileV2Input
): ColorSystemPresentationProfileV2 {
  if (!HASH.test(input.sourceAuthorityHash) || !HASH.test(input.sourcePackageHash)) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'Source authority and package hashes must be canonical.');
  }
  const evidence = record(input.evidence, 'Presentation evidence');
  exactKeys(
    evidence,
    [
      'schemaVersion',
      'evidenceId',
      'source',
      'frameGroup',
      'sharedFrameRecipe',
      'typography',
      'sections',
      'boundaryEvidence',
      'rendererClaimBoundary',
      'presentationEvidenceHash',
    ],
    'Presentation evidence'
  );
  if (evidence.schemaVersion !== 'teul.structured-presentation-evidence/1') {
    fail('INVALID_PRESENTATION_EVIDENCE', 'Unsupported structured presentation evidence version.');
  }
  const suppliedEvidenceHash = string(
    evidence.presentationEvidenceHash,
    'presentationEvidenceHash'
  );
  if (!HASH.test(suppliedEvidenceHash) || suppliedEvidenceHash !== evidenceHash(evidence)) {
    fail('PRESENTATION_EVIDENCE_HASH_MISMATCH', 'Presentation evidence hash is stale or forged.');
  }

  const source = record(evidence.source, 'source');
  exactKeys(
    source,
    ['kind', 'fileKey', 'pageNodeId', 'capturedOn', 'method', 'authority', 'renderAuthority'],
    'source'
  );
  const methods = array(source.method, 'source.method').map((item, index) =>
    string(item, `source.method[${index}]`)
  );
  if (
    source.kind !== 'figma-design' ||
    source.authority !== 'structured-native' ||
    source.renderAuthority !== 'comparison-only' ||
    methods.includes('screenshot') ||
    !methods.includes('figma_get_metadata') ||
    !methods.includes('figma_get_design_context')
  ) {
    fail(
      'INVALID_PRESENTATION_EVIDENCE',
      'Only native Figma metadata and design context may govern the presentation profile.'
    );
  }

  const group = record(evidence.frameGroup, 'frameGroup');
  exactKeys(group, ['axis', 'siblingGap', 'canonicalOrder', 'frames'], 'frameGroup');
  if (group.axis !== 'horizontal') {
    fail('INVALID_PRESENTATION_EVIDENCE', 'The source frame group must be horizontal.');
  }
  const siblingGap = number(group.siblingGap, 'frameGroup.siblingGap');
  const order = array(group.canonicalOrder, 'frameGroup.canonicalOrder').map((item, index) =>
    string(item, `frameGroup.canonicalOrder[${index}]`)
  );
  if (canonicalJson(order) !== canonicalJson(COLOR_SYSTEM_SECTION_ROLES_V2)) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'The source must contain the canonical five roles.');
  }
  const frames = array(group.frames, 'frameGroup.frames');
  if (frames.length !== 5) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'The source must contain exactly five sibling frames.');
  }
  const parsedFrames = frames.map((value, index) => {
    const frame = record(value, `frameGroup.frames[${index}]`);
    exactKeys(frame, ['role', 'nodeId', 'name', 'x', 'y', 'width', 'height'], `frame ${index}`);
    if (frame.role !== COLOR_SYSTEM_SECTION_ROLES_V2[index]) {
      fail('INVALID_PRESENTATION_EVIDENCE', `Frame ${index} role is out of order.`);
    }
    return {
      role: frame.role as ColorSystemSectionRoleV2,
      nodeId: string(frame.nodeId, `frame ${index} nodeId`),
      width: number(frame.width, `frame ${index} width`, 1),
      height: number(frame.height, `frame ${index} height`, 1),
      x: number(frame.x, `frame ${index} x`, -MAX_DIMENSION, MAX_DIMENSION),
    };
  });
  const width = parsedFrames[0].width;
  const height = parsedFrames[0].height;
  if (parsedFrames.some(frame => frame.width !== width || frame.height !== height)) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'All five role frames must share exact dimensions.');
  }
  for (let index = 1; index < parsedFrames.length; index += 1) {
    if (parsedFrames[index].x - parsedFrames[index - 1].x !== width + siblingGap) {
      fail('INVALID_PRESENTATION_EVIDENCE', 'Sibling offsets do not match width plus gap.');
    }
  }

  const shared = record(evidence.sharedFrameRecipe, 'sharedFrameRecipe');
  exactKeys(
    shared,
    ['backgroundHex', 'outerPadding', 'rootLayout', 'header', 'palette', 'explicitLayoutGrid'],
    'sharedFrameRecipe'
  );
  const backgroundHex = string(shared.backgroundHex, 'sharedFrameRecipe.backgroundHex');
  if (backgroundHex !== '#FFFFFF' || !HEX.test(backgroundHex)) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'The governed source frame background must be #FFFFFF.');
  }
  const rootLayout = record(shared.rootLayout, 'sharedFrameRecipe.rootLayout');
  exactKeys(rootLayout, ['axis', 'horizontalAlignment', 'distribution'], 'rootLayout');
  if (
    rootLayout.axis !== 'vertical' ||
    rootLayout.horizontalAlignment !== 'center' ||
    rootLayout.distribution !== 'space-between'
  ) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'Root auto-layout does not match the source recipe.');
  }
  const header = record(shared.header, 'sharedFrameRecipe.header');
  exactKeys(
    header,
    ['x', 'y', 'width', 'defaultHeight', 'titleGroupGap', 'guidanceX', 'guidanceWidth'],
    'header'
  );
  const palette = record(shared.palette, 'sharedFrameRecipe.palette');
  exactKeys(
    palette,
    [
      'x',
      'y',
      'width',
      'height',
      'rowGap',
      'cardGap',
      'cardPadding',
      'cardContentGap',
      'cardCornerRadius',
      'cardContentAlignment',
      'cardClipContent',
    ],
    'palette'
  );
  if (palette.cardContentAlignment !== 'bottom-left' || palette.cardClipContent !== true) {
    fail(
      'INVALID_PRESENTATION_EVIDENCE',
      'Card alignment and clipping must match source evidence.'
    );
  }
  const layoutGrid = record(shared.explicitLayoutGrid, 'explicitLayoutGrid');
  exactKeys(layoutGrid, ['status', 'governing', 'replacementAuthority'], 'explicitLayoutGrid');
  if (layoutGrid.governing !== false || layoutGrid.status !== 'not-exposed-by-structured-context') {
    fail('INVALID_PRESENTATION_EVIDENCE', 'An unobserved layout grid cannot govern output.');
  }

  const typography = record(evidence.typography, 'typography');
  exactKeys(typography, ['family', 'style', 'letterSpacing', 'roles'], 'typography');
  const fontFamily = string(typography.family, 'typography.family');
  const fontStyle = string(typography.style, 'typography.style');
  const letterSpacing = number(typography.letterSpacing, 'typography.letterSpacing', -1000, 1000);
  const textRoles = array(typography.roles, 'typography.roles').map((value, index) => {
    const textRole = record(value, `typography.roles[${index}]`);
    const allowed = [
      'role',
      'fontSize',
      'lineHeight',
      'lineHeightMultiplier',
      'colorRefs',
      'colorRef',
      'sections',
    ];
    const unknown = Object.keys(textRole).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
      fail('INVALID_PRESENTATION_EVIDENCE', `Typography role ${index} has unsupported fields.`);
    }
    for (const key of ['role', 'fontSize']) {
      if (!(key in textRole)) {
        fail('INVALID_PRESENTATION_EVIDENCE', `Typography role ${index} is missing ${key}.`);
      }
    }
    const roleSections = Array.isArray(textRole.sections)
      ? textRole.sections.map((item, sectionIndex) => {
          const role = string(item, `typography role ${index} sections[${sectionIndex}]`);
          if (!(COLOR_SYSTEM_SECTION_ROLES_V2 as readonly string[]).includes(role)) {
            fail(
              'INVALID_PRESENTATION_EVIDENCE',
              `Typography role ${index} uses an unknown section.`
            );
          }
          return role as ColorSystemSectionRoleV2;
        })
      : [...COLOR_SYSTEM_SECTION_ROLES_V2];
    return {
      role: string(textRole.role, `typography role ${index}`),
      fontFamily,
      fontStyle,
      fontSize: number(textRole.fontSize, `typography role ${index} fontSize`, 1, 1000),
      lineHeight:
        textRole.lineHeight === undefined
          ? null
          : number(textRole.lineHeight, `typography role ${index} lineHeight`, 1, 2000),
      lineHeightMultiplier:
        textRole.lineHeightMultiplier === undefined
          ? null
          : number(
              textRole.lineHeightMultiplier,
              `typography role ${index} lineHeightMultiplier`,
              0.5,
              4
            ),
      letterSpacing,
      sections: roleSections,
    };
  });

  const sections = array(evidence.sections, 'sections');
  if (sections.length !== 5) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'Presentation evidence requires five section recipes.');
  }
  const sectionRecipes = sections.map((value, index) => {
    const section = record(value, `sections[${index}]`);
    exactKeys(
      section,
      [
        'role',
        'headerNodeId',
        'paletteNodeId',
        'headerHeight',
        'guidance',
        'contentAuthorityRef',
        'rows',
        'metadataOrder',
      ],
      `section ${index}`
    );
    const role = COLOR_SYSTEM_SECTION_ROLES_V2[index];
    if (section.role !== role) {
      fail('INVALID_PRESENTATION_EVIDENCE', `Section ${index} role is out of order.`);
    }
    const rows = array(section.rows, `section ${role} rows`).map((rowValue, rowIndex) => {
      const row = record(rowValue, `section ${role} row ${rowIndex}`);
      exactKeys(row, ['count', 'width', 'height', 'cardWidth'], `section ${role} row ${rowIndex}`);
      return {
        count: integer(row.count, `section ${role} row ${rowIndex} count`, 1, 12),
        width: number(row.width, `section ${role} row ${rowIndex} width`, 1),
        height: number(row.height, `section ${role} row ${rowIndex} height`, 1),
        cardWidth: number(row.cardWidth, `section ${role} row ${rowIndex} cardWidth`, 1),
      };
    });
    if (rows.length === 0) {
      fail('INVALID_PRESENTATION_EVIDENCE', `Section ${role} requires at least one row.`);
    }
    const guidance =
      section.guidance === null ? null : string(section.guidance, `${role} guidance`);
    return {
      role,
      order: index + 1,
      sourceNodeId: parsedFrames[index].nodeId,
      headerNodeId: string(section.headerNodeId, `${role} headerNodeId`),
      paletteNodeId: string(section.paletteNodeId, `${role} paletteNodeId`),
      headerHeight: number(section.headerHeight, `${role} headerHeight`, 1),
      guidance,
      guidancePlacement: guidance === null ? ('none' as const) : ('header-right' as const),
      contentAuthorityRef: string(section.contentAuthorityRef, `${role} contentAuthorityRef`),
      rows,
      metadataOrder: array(section.metadataOrder, `${role} metadataOrder`).map((item, itemIndex) =>
        string(item, `${role} metadataOrder[${itemIndex}]`)
      ),
    };
  }) as unknown as ColorSystemPresentationProfileV2['sections'];

  const boundaryEvidence = record(evidence.boundaryEvidence, 'boundaryEvidence');
  exactKeys(boundaryEvidence, ['sourceCards', 'generatedVisibilityBoundary'], 'boundaryEvidence');
  const generatedBoundary = record(
    boundaryEvidence.generatedVisibilityBoundary,
    'generatedVisibilityBoundary'
  );
  exactKeys(generatedBoundary, ['authority', 'rule', 'forbidden'], 'generatedVisibilityBoundary');
  const boundaryRule = string(generatedBoundary.rule, 'generatedVisibilityBoundary.rule');
  if (!boundaryRule.includes('one one-pixel inside boundary in black or white')) {
    fail(
      'INVALID_PRESENTATION_EVIDENCE',
      'Boundary authority must permit only one black/white inside pixel.'
    );
  }
  const forbidden = array(generatedBoundary.forbidden, 'generatedVisibilityBoundary.forbidden').map(
    (item, index) => string(item, `generatedVisibilityBoundary.forbidden[${index}]`)
  );
  if (
    !forbidden.includes('nested-inside-outside-outline') ||
    !forbidden.includes('double-outline')
  ) {
    fail(
      'INVALID_PRESENTATION_EVIDENCE',
      'Boundary evidence must explicitly forbid nested/double outlines.'
    );
  }

  const renderer = record(evidence.rendererClaimBoundary, 'rendererClaimBoundary');
  exactKeys(renderer, ['authoringProfile', 'claim', 'limitations'], 'rendererClaimBoundary');
  if (renderer.authoringProfile !== 'sRGB') {
    fail('INVALID_PRESENTATION_EVIDENCE', 'The presentation profile supports sRGB authoring only.');
  }
  const limitations = array(renderer.limitations, 'rendererClaimBoundary.limitations').map(
    (item, index) => string(item, `renderer limitation ${index}`)
  );
  if (limitations.length < 2) {
    fail('INVALID_PRESENTATION_EVIDENCE', 'Renderer claim boundary requires display limitations.');
  }

  const content: Omit<ColorSystemPresentationProfileV2, 'profileHash'> = {
    version: COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION,
    sourceAuthorityHash: input.sourceAuthorityHash,
    sourcePackageHash: input.sourcePackageHash,
    presentationEvidenceHash: suppliedEvidenceHash,
    frame: {
      width,
      height,
      backgroundHex: '#FFFFFF',
      siblingGap,
      padding: number(shared.outerPadding, 'sharedFrameRecipe.outerPadding'),
      layoutAxis: 'vertical',
      horizontalAlignment: 'center',
      distribution: 'space-between',
      header: {
        x: number(header.x, 'header.x'),
        y: number(header.y, 'header.y'),
        width: number(header.width, 'header.width', 1),
        defaultHeight: number(header.defaultHeight, 'header.defaultHeight', 1),
        titleGroupGap: number(header.titleGroupGap, 'header.titleGroupGap'),
        guidanceX: number(header.guidanceX, 'header.guidanceX'),
        guidanceWidth: number(header.guidanceWidth, 'header.guidanceWidth', 1),
      },
      palette: {
        x: number(palette.x, 'palette.x'),
        y: number(palette.y, 'palette.y'),
        width: number(palette.width, 'palette.width', 1),
        height: number(palette.height, 'palette.height', 1),
        rowGap: number(palette.rowGap, 'palette.rowGap'),
        cardGap: number(palette.cardGap, 'palette.cardGap'),
        cardPadding: number(palette.cardPadding, 'palette.cardPadding'),
        cardContentGap: number(palette.cardContentGap, 'palette.cardContentGap'),
        cardCornerRadius: number(palette.cardCornerRadius, 'palette.cardCornerRadius'),
        cardContentAlignment: 'bottom-left',
        cardClipContent: true,
      },
      explicitLayoutGrid: 'none-governing',
    },
    typography: textRoles,
    sections: sectionRecipes,
    cardBoundaryPolicy: {
      kind: 'none-or-monochrome-inside-1px',
      allowedColors: ['#000000', '#FFFFFF'],
      forbidden,
    },
    rendererClaimBoundary: {
      authoringProfile: 'srgb',
      claim: string(renderer.claim, 'rendererClaimBoundary.claim'),
      limitations,
      renderAuthority: 'comparison-only',
    },
  };
  return { ...content, profileHash: deterministicContentHash(content) };
}

export function buildColorSystemPresentationProfileV2(
  input: BuildColorSystemPresentationProfileV2Input
): ColorSystemPresentationProfileV2Result {
  const missingFields = collectMissingFields(input.evidence);
  if (missingFields.length > 0) {
    return {
      status: 'blocked',
      profile: null,
      missingFields,
      blocker: {
        code: 'PRESENTATION_PROFILE_INCOMPLETE',
        message: `Structured presentation evidence is missing ${missingFields.length} governed field${missingFields.length === 1 ? '' : 's'}.`,
      },
    };
  }
  return {
    status: 'ready',
    profile: validateEvidenceAndBuildProfile(input),
    missingFields: [],
    blocker: null,
  };
}

export function assertColorSystemPresentationProfileV2Integrity(
  profile: ColorSystemPresentationProfileV2,
  input: BuildColorSystemPresentationProfileV2Input
): void {
  assertColorSystemPresentationProfileV2ContentIntegrity(profile);
  const rebuilt = buildColorSystemPresentationProfileV2(input);
  if (rebuilt.status !== 'ready' || canonicalJson(rebuilt.profile) !== canonicalJson(profile)) {
    fail(
      'PRESENTATION_PROFILE_INTEGRITY',
      'Presentation profile failed canonical integrity validation.'
    );
  }
}

/**
 * Downstream consumers validate the normalized profile without retaining the
 * raw source extraction. Source-bound normalization is still proven by
 * `assertColorSystemPresentationProfileV2Integrity` at the compiler boundary.
 */
export function assertColorSystemPresentationProfileV2ContentIntegrity(
  profile: ColorSystemPresentationProfileV2
): void {
  const value = record(profile, 'Presentation profile');
  exactKeys(
    value,
    [
      'version',
      'sourceAuthorityHash',
      'sourcePackageHash',
      'presentationEvidenceHash',
      'frame',
      'typography',
      'sections',
      'cardBoundaryPolicy',
      'rendererClaimBoundary',
      'profileHash',
    ],
    'Presentation profile'
  );
  if (
    profile.version !== COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION ||
    !HASH.test(profile.sourceAuthorityHash) ||
    !HASH.test(profile.sourcePackageHash) ||
    !HASH.test(profile.presentationEvidenceHash) ||
    !HASH.test(profile.profileHash)
  ) {
    fail('PRESENTATION_PROFILE_INTEGRITY', 'Presentation profile authority is invalid.');
  }
  const { profileHash, ...content } = profile;
  if (profileHash !== deterministicContentHash(content)) {
    fail('PRESENTATION_PROFILE_INTEGRITY', 'Presentation profile content hash is stale or forged.');
  }
  if (
    !Number.isFinite(profile.frame.width) ||
    !Number.isFinite(profile.frame.height) ||
    profile.frame.width <= 0 ||
    profile.frame.height <= 0 ||
    profile.frame.backgroundHex !== '#FFFFFF' ||
    profile.frame.layoutAxis !== 'vertical' ||
    profile.frame.horizontalAlignment !== 'center' ||
    profile.frame.distribution !== 'space-between' ||
    profile.frame.explicitLayoutGrid !== 'none-governing'
  ) {
    fail('PRESENTATION_PROFILE_INTEGRITY', 'Presentation frame recipe is invalid.');
  }
  if (
    profile.sections.length !== COLOR_SYSTEM_SECTION_ROLES_V2.length ||
    profile.sections.some(
      (section, index) =>
        section.role !== COLOR_SYSTEM_SECTION_ROLES_V2[index] || section.order !== index + 1
    )
  ) {
    fail('PRESENTATION_PROFILE_INTEGRITY', 'Presentation section order is invalid.');
  }
  if (
    profile.cardBoundaryPolicy.kind !== 'none-or-monochrome-inside-1px' ||
    canonicalJson(profile.cardBoundaryPolicy.allowedColors) !==
      canonicalJson(['#000000', '#FFFFFF']) ||
    !profile.cardBoundaryPolicy.forbidden.includes('nested-inside-outside-outline') ||
    !profile.cardBoundaryPolicy.forbidden.includes('double-outline')
  ) {
    fail('PRESENTATION_PROFILE_INTEGRITY', 'Presentation boundary policy is invalid.');
  }
  if (
    profile.rendererClaimBoundary.authoringProfile !== 'srgb' ||
    profile.rendererClaimBoundary.renderAuthority !== 'comparison-only' ||
    profile.rendererClaimBoundary.limitations.length < 2
  ) {
    fail('PRESENTATION_PROFILE_INTEGRITY', 'Presentation renderer claim boundary is invalid.');
  }
}
