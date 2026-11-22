/** Fixed designer-form artwork. Measured geometry is evidence, never source or Create authority. */
import outlines from '../data/authoringControlOutlinesV1.json';
import {
  assessColorSystemApplicationGeometryV1,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
  hashColorSystemGeometryApplicationsV1,
  measureColorSystemApplicationGeometryBoardsV1,
  type ColorSystemApplicationGeometryBoardV1,
  type ColorSystemApplicationGeometryNodeV1,
  type ColorSystemApplicationGeometryPlanV1,
  type ColorSystemGeometryShapeV1,
} from './colorSystemApplicationGeometryV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
  type ColorSystemApplicationTemplateV1,
} from './colorSystemApplicationRequirementsV1';
import { captureColorSystemModelV1 } from './colorSystemModelV1';
import { buildColorSystemContextApplicationV1 } from './colorSystemRelationshipsV1';
import { deterministicContentHash } from './colorSystemHashing';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from './colorSystemInertJsonV1';

export const COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_VERSION = 'teul.designer-geometry.v1' as const;
export const COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_PROVENANCE = Object.freeze({
  version: COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_VERSION,
  artworkVersion: outlines.version,
  artworkContentHash: deterministicContentHash(serializeColorSystemInertJsonV1(outlines)),
  font: Object.freeze({ ...outlines.font }),
  compilation: Object.freeze({ ...outlines.compilation }),
  labels: Object.freeze(
    Object.fromEntries(Object.entries(outlines.labels).map(([key, value]) => [key, value.text]))
  ),
  placement: 'Glyph bounds are centered; placement offsets are rounded to the 1/64 CSSpx grid.',
});

const samples = ['control', 'text-link', 'selected-control'] as const;
type Sample = (typeof samples)[number];
const states = ['rest', 'hover', 'pressed'] as const;
const boundary = { maximumBytes: 2 * 1024 * 1024, maximumDepth: 12, maximumNodes: 8192 };
function unsupported(message: string): never {
  throw new Error(`Unsupported designer geometry: ${message}`);
}
const exact = (value: unknown) => serializeColorSystemInertJsonV1(value);

/** Recognizes exact current and saved legacy form roles and pair policies. */
function sampleOf(template: ColorSystemApplicationTemplateV1): Sample {
  const ground = template.uses.find(use => use.id === 'ground');
  const sample = samples.find(sample => ground?.role === `${sample}.ground`);
  if (!sample)
    unsupported('The application is not a known control, text-link or selected-control schema.');
  const link = sample === 'text-link';
  const separateDisabledGround = !link || template.uses.some(use => use.id === 'disabled-ground');
  const ids = [
    'ground',
    ...states,
    'focus-ring',
    ...(separateDisabledGround ? ['disabled-ground'] : []),
    'disabled-text',
    ...(!link ? [...states.map(state => `${state}-label`), 'disabled-boundary'] : []),
  ];
  if (
    template.uses.length !== ids.length ||
    ids.some(id => !template.uses.some(use => use.id === id && use.role === `${sample}.${id}`))
  )
    unsupported('Paint roles or use identities differ from the fixed form.');
  const expectedPairs = [
    ...states.map(state => [state, 'ground', link ? 4.5 : 3, 'required'] as const),
    ['focus-ring', 'ground', 3, 'required'] as const,
    [
      'disabled-text',
      separateDisabledGround ? 'disabled-ground' : 'ground',
      4.5,
      'inactive-exempt',
    ] as const,
    ...(!link
      ? [
          ...states.map(state => [`${state}-label`, state, 4.5, 'required'] as const),
          ['disabled-boundary', 'disabled-ground', 3, 'inactive-exempt'] as const,
        ]
      : []),
  ].map(([foregroundUseId, backgroundUseId, minimum, assessment]) => ({
    id: `${foregroundUseId}:on:${backgroundUseId}`,
    foregroundUseId,
    backgroundUseId,
    contrast: { minimum, assessment },
  }));
  if (
    template.pairs.length !== expectedPairs.length ||
    expectedPairs.some(pair => !template.pairs.some(actual => exact(actual) === exact(pair)))
  )
    unsupported('Pair policy differs from the fixed form.');
  return sample;
}

const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
const ring = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'compound-polygon',
  fillRule: 'evenodd',
  contours: [
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    [
      { x: x + 2, y: y + 2 },
      { x: x + width - 2, y: y + 2 },
      { x: x + width - 2, y: y + height - 2 },
      { x: x + 2, y: y + height - 2 },
    ],
  ],
});
function labelShape(sample: Sample, x: number, y: number): ColorSystemGeometryShapeV1 {
  const label = outlines.labels[sample];
  const left = Math.round((x + (176 - label.width) / 2) * 64) / 64;
  const top = Math.round((y + (44 - label.height) / 2) * 64) / 64;
  return {
    kind: 'compound-polygon',
    fillRule: 'evenodd',
    contours: label.contours.map(contour =>
      contour.map(point => ({ x: point.x + left, y: point.y + top }))
    ),
  };
}
function board(
  template: ColorSystemApplicationTemplateV1,
  sample: Sample
): ColorSystemApplicationGeometryBoardV1 {
  const prefix = `designer-geometry:${deterministicContentHash(template.id).slice(7, 31)}`;
  const node = (
    id: string,
    useId: string,
    shape: ColorSystemGeometryShapeV1,
    textAlternative: string,
    children: readonly ColorSystemApplicationGeometryNodeV1[] = []
  ): ColorSystemApplicationGeometryNodeV1 => ({
    id: `${prefix}:${id}`,
    useId,
    shape,
    textAlternative,
    children,
  });
  const label = (id: string, useId: string, x: number, y: number, state: string) =>
    node(
      id,
      useId,
      labelShape(sample, x, y),
      `${sample}, ${state}: ${outlines.labels[sample].text}`
    );
  const active = (state: (typeof states)[number], x: number, y: number, focused = false) => {
    const id = focused ? 'focus-rest' : state;
    return sample === 'text-link'
      ? label(id, state, x, y, focused ? 'focused rest' : state)
      : node(
          id,
          state,
          rect(x, y, 176, 44),
          `${sample}, ${focused ? 'focused rest' : state} fill`,
          [label(`${id}-label`, `${state}-label`, x, y, focused ? 'focused rest' : state)]
        );
  };
  const disabled =
    sample === 'text-link' && !template.uses.some(use => use.id === 'disabled-ground')
      ? label('disabled-text', 'disabled-text', 624, 24, 'disabled')
      : node(
          'disabled-ground',
          'disabled-ground',
          rect(624, 24, 176, 44),
          `${sample}, disabled ground`,
          [
            label('disabled-text', 'disabled-text', 624, 24, 'disabled'),
            ...(sample === 'text-link'
              ? []
              : [
                  node(
                    'disabled-boundary',
                    'disabled-boundary',
                    ring(624, 24, 176, 44),
                    `${sample}, disabled boundary`
                  ),
                ]),
          ]
        );
  const sampleLabel = {
    control: 'Button',
    'text-link': 'Text link',
    'selected-control': 'Selected control',
  }[sample];
  return {
    applicationId: template.id,
    width: 824,
    height: 180,
    root: node(
      'ground',
      'ground',
      rect(0, 0, 824, 180),
      `${sampleLabel}: rest, hover, pressed and disabled from left to right; focus below.`,
      [
        ...states.map((state, index) => active(state, 24 + index * 200, 24)),
        disabled,
        active('rest', 24, 112, true),
        node(
          'focus-ring',
          'focus-ring',
          ring(20, 108, 184, 52),
          `${sample}, 2px focus ring separated from the control by 2px of ground`
        ),
      ]
    ),
  };
}
function boards(input: unknown): readonly ColorSystemApplicationGeometryBoardV1[] {
  const raw = snapshotColorSystemInertJsonV1(input, boundary);
  if (!Array.isArray(raw) || !raw.length || raw.length > 12)
    unsupported('One through twelve fixed application templates are supported.');
  const templates = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: raw,
    distinctions: [],
  }).templates;
  if (new Set(templates.map(template => template.modeId)).size > 4)
    unsupported('At most four authored modes are supported.');
  const seen = new Set<string>();
  return templates.map(template => {
    const sample = sampleOf(template);
    const key = exact([template.contextId, template.modeId, sample]);
    if (seen.has(key)) unsupported('Duplicate sample in the same context and mode.');
    seen.add(key);
    return board(template, sample);
  });
}

/** Measures fixed artwork before generation, without assigning or inventing a source paint. */
export function buildColorSystemDesignerLayoutV1(
  templates: unknown
): ReturnType<typeof measureColorSystemApplicationGeometryBoardsV1> {
  return measureColorSystemApplicationGeometryBoardsV1(boards(templates));
}

/** Binds actual paints, modes and pairs; full geometry assessment rejects opacity, gaps or area drift. */
export function buildColorSystemDesignerGeometryV1(
  modelInput: unknown,
  applicationsInput: unknown
): ColorSystemApplicationGeometryPlanV1 {
  const model = captureColorSystemModelV1(modelInput);
  const raw = snapshotColorSystemInertJsonV1(applicationsInput, boundary);
  if (!Array.isArray(raw)) unsupported('Expected actual applications.');
  const applications = raw.map(buildColorSystemContextApplicationV1);
  const templates = applications.map(application => ({
    ...application,
    uses: application.uses.map(({ colorId: _colorId, ...use }) => use),
  }));
  return assessColorSystemApplicationGeometryV1(model, applications, {
    version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
    modelHash: model.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: boards(templates),
    artwork: {
      status: 'provided-artwork-metadata',
      sources: [
        {
          label: `${outlines.font.family} ${outlines.font.style}, ${outlines.font.size} CSSpx`,
          identity: 'Pinned local font bytes used to compile finite label artwork',
          sha256: outlines.font.sourceSha256,
        },
        {
          label: 'Teul fixed control label outlines',
          identity: outlines.version,
          sha256: COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_PROVENANCE.artworkContentHash.slice(7),
        },
      ],
      notes: [
        `${outlines.compilation.tool} ${outlines.compilation.version}; flatness ${outlines.compilation.flatnessCssPx} CSSpx; coordinate grid 1/${outlines.compilation.gridScale} CSSpx.`,
        outlines.compilation.shaping,
        outlines.compilation.disclosure,
        COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_PROVENANCE.placement,
        `Labels: ${Object.values(outlines.labels)
          .map(label => label.text)
          .join('; ')}.`,
      ],
    },
  }).plan;
}
