import { assertXmlText } from '../../../../src/lib/xmlText';
/** A bounded information panel, intended to be one region of a retained composition. */
import { record, boundedText } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  measureColorSystemApplicationGeometryBoardsV1,
  type ColorSystemApplicationGeometryBoardV1,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import { guidelineHash } from './review';
import { layoutCompositionText, placeCompositionText } from './compositionText';

export interface CompositionPanelInput {
  readonly id: string;
  readonly contextId: 'brand' | 'product';
  readonly modeId: string;
  readonly width: number;
  readonly height: number;
  readonly heading: string;
  readonly body: string;
  /** Authored mapping from this panel to source semantics; never inferred from role names. */
  readonly sourceRoles?: {
    readonly ground: string;
    readonly heading: string;
    readonly body: string;
  };
}

export function readCompositionPanelInput(raw: unknown): CompositionPanelInput {
  const data = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 8192 });
  record(data, [
    'id',
    'contextId',
    'modeId',
    'width',
    'height',
    'heading',
    'body',
    ...(data && typeof data === 'object' && 'sourceRoles' in data ? ['sourceRoles'] : []),
  ]);
  const input = data as unknown as CompositionPanelInput;
  if (input.sourceRoles !== undefined) {
    record(input.sourceRoles, ['ground', 'heading', 'body']);
    for (const role of Object.values(input.sourceRoles)) {
      boundedText(role);
      assertXmlText(role);
    }
  }
  boundedText(input.id, 120); // Reserve the ':heading' suffix within the core 128-character node ID.
  boundedText(input.modeId);
  assertXmlText(input.id);
  assertXmlText(input.modeId);
  if (input.contextId !== 'brand' && input.contextId !== 'product')
    throw new Error('Choose the actual brand or product context.');
  if (
    !Number.isInteger(input.width) ||
    input.width < 240 ||
    input.width > 1200 ||
    !Number.isInteger(input.height) ||
    input.height < 160 ||
    input.height > 1600
  )
    throw new Error('Panel dimensions must be whole pixels within the supported bounds.');
  return freeze(input);
}

export function buildCompositionPanelGeometry(raw: CompositionPanelInput) {
  const input = readCompositionPanelInput(raw);
  const roles = input.sourceRoles
    ? {
        ground: input.sourceRoles.ground,
        'text-1': input.sourceRoles.heading,
        'text-2': input.sourceRoles.body,
      }
    : undefined;
  const heading = layoutCompositionText({
    text: input.heading,
    fontSize: 28,
    weight: 600,
    lineHeight: 38,
    width: input.width - 48,
    maximumLines: 3,
  });
  const body = layoutCompositionText({
    text: input.body,
    fontSize: 16,
    weight: 400,
    lineHeight: 24,
    width: input.width - 48,
    maximumLines: 12,
  });
  const bodyTop = 24 + heading.height + 16;
  if (bodyTop + body.height + 24 > input.height)
    throw new Error(
      'The complete heading and body do not fit this panel. Increase its height or edit the copy.'
    );
  const board: ColorSystemApplicationGeometryBoardV1 = {
    applicationId: input.id,
    width: input.width,
    height: input.height,
    root: {
      id: `${input.id}:ground`,
      useId: 'ground',
      shape: { kind: 'rect', x: 0, y: 0, width: input.width, height: input.height },
      children: [
        {
          id: `${input.id}:heading`,
          useId: 'text-1',
          textAlternative: input.heading,
          shape: placeCompositionText(heading, 24, 24),
          children: [],
        },
        {
          id: `${input.id}:body`,
          useId: 'text-2',
          textAlternative: input.body,
          shape: placeCompositionText(body, 24, bodyTop),
          children: [],
        },
      ],
    },
  };
  const measured = measureColorSystemApplicationGeometryBoardsV1([board]);
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [
      {
        id: input.id,
        contextId: input.contextId,
        modeId: input.modeId,
        uses: measured.areas.map(area => ({
          id: area.useId,
          role: area.useId,
          area: area.area,
          ...(roles ? { sourceRole: roles[area.useId as keyof typeof roles] } : {}),
        })),
        pairs: [heading, body].map((text, index) => ({
          id: `text-${index + 1}:ground`,
          foregroundUseId: `text-${index + 1}`,
          backgroundUseId: 'ground',
          contrast: { minimum: text.minimumContrast, assessment: 'required' },
        })),
      },
    ],
    distinctions: [],
  });
  const result = {
    schemaVersion: input.sourceRoles
      ? ('teul.composition-panel.v2' as const)
      : ('teul.composition-panel.v1' as const),
    input,
    boards: measured.boards,
    requirements,
    text: { heading, body },
    artwork: {
      status: 'provided-artwork-metadata' as const,
      sources: [
        {
          label: 'Authored Geist Latin composition text',
          identity: heading.artwork.version,
          sha256: heading.artwork.hash.slice(7),
        },
      ],
      notes: [heading.artwork.compilation.disclosure, heading.artwork.font.license],
    },
    scope:
      'Panel geometry and solid relationships only; not assessment of a larger composition or gradient.' as const,
  };
  return freeze({ ...result, panelHash: guidelineHash(result) });
}
