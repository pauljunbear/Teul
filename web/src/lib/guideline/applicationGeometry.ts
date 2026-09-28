import { colorSystemValueNoticesV1 } from '../../../../src/lib/colorSystemValueProvenanceV1';
/** Shared painted geometry for source-aware previews. Geometry establishes no source approval. */
import outlines from '../../../../src/data/authoringControlOutlinesV1.json';
import {
  assessColorSystemApplicationGeometryV1,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
  hashColorSystemGeometryApplicationsV1,
  measureColorSystemApplicationGeometryBoardsV1,
  type ColorSystemApplicationGeometryBoardV1,
  type ColorSystemApplicationGeometryNodeV1,
  type ColorSystemApplicationGeometryPlanV1,
  type ColorSystemGeometryShapeV1,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
  type ColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationTemplateV1,
} from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from '../../../../src/lib/colorSystemInertJsonV1';
import { deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemContextApplicationV1 } from '../../../../src/lib/colorSystemRelationshipsV1';
import { colorSystemSrgbToCssV1 } from '../../../../src/lib/colorSystemSrgbValueV1';

export const GUIDELINE_PRODUCT_STATES = ['rest', 'hover', 'pressed', 'focus', 'disabled'] as const;
export type GuidelineApplicationLayoutInput =
  | { readonly kind: 'product'; readonly modeId: string }
  | {
      readonly kind: 'brand';
      readonly modeId: string;
      readonly layout: 'split' | 'frame' | 'stack';
      /** Percentage of the combined visible primary and secondary paint, excluding ground/accent. */
      readonly primaryShare: number;
    };
export interface GuidelineApplicationLayout {
  readonly kind: 'brand' | 'product';
  readonly request: GuidelineApplicationLayoutInput;
  readonly boards: readonly ColorSystemApplicationGeometryBoardV1[];
  readonly requirements: ColorSystemApplicationRequirementsV1;
  readonly areas: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly area: number;
  }[];
  readonly roles: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly role: string;
    readonly label: string;
  }[];
  readonly artwork: NonNullable<ColorSystemApplicationGeometryPlanV1['artwork']>;
}
const exact = serializeColorSystemInertJsonV1;
function fail(message: string): never {
  throw new Error(`Guideline application geometry: ${message}`);
}
function parseRequest(input: GuidelineApplicationLayoutInput): GuidelineApplicationLayoutInput {
  const value = snapshotColorSystemInertJsonV1(input, { maximumBytes: 4096 });
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Expected layout controls.');
  const item = value as Record<string, unknown>;
  const keys =
    item.kind === 'brand' ? ['kind', 'modeId', 'layout', 'primaryShare'] : ['kind', 'modeId'];
  if (Object.keys(item).length !== keys.length || keys.some(key => !(key in item)))
    fail('Missing or unsupported layout controls.');
  if (typeof item.modeId !== 'string' || !item.modeId.trim() || item.modeId.length > 128)
    fail('Choose an explicit source mode.');
  if (item.kind === 'product') return { kind: 'product', modeId: item.modeId };
  if (item.kind !== 'brand' || !['split', 'frame', 'stack'].includes(String(item.layout)))
    fail('Choose a supported brand or product layout.');
  if (
    !Number.isInteger(item.primaryShare) ||
    Number(item.primaryShare) < 20 ||
    Number(item.primaryShare) > 80
  )
    fail('Primary share must be a whole percentage from 20 through 80.');
  return {
    kind: 'brand',
    modeId: item.modeId,
    layout: item.layout as 'split' | 'frame' | 'stack',
    primaryShare: item.primaryShare as number,
  };
}
const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
function node(
  applicationId: string,
  useId: string,
  shape: ColorSystemGeometryShapeV1,
  textAlternative: string,
  children: readonly ColorSystemApplicationGeometryNodeV1[] = []
): ColorSystemApplicationGeometryNodeV1 {
  return { id: `${applicationId}:${useId}`, useId, shape, textAlternative, children };
}
function labelShape(
  key: 'control' | 'text-link',
  x: number,
  y: number,
  width: number,
  height: number
): ColorSystemGeometryShapeV1 {
  const label = outlines.labels[key];
  const left = Math.round((x + (width - label.width) / 2) * 64) / 64;
  const top = Math.round((y + (height - label.height) / 2) * 64) / 64;
  return {
    kind: 'compound-polygon',
    fillRule: 'evenodd',
    contours: label.contours.map(contour =>
      contour.map(point => ({ x: point.x + left, y: point.y + top }))
    ),
  };
}
function productBoard(
  state: (typeof GUIDELINE_PRODUCT_STATES)[number]
): ColorSystemApplicationGeometryBoardV1 {
  return {
    applicationId: state,
    width: 360,
    height: 160,
    root: node(state, 'ground', rect(0, 0, 360, 160), `${state} control sample`, [
      node(state, 'action', rect(92, 36, 176, 44), `${state} action fill`, [
        node(state, 'label', labelShape('control', 92, 36, 176, 44), outlines.labels.control.text),
      ]),
      node(
        state,
        'partner',
        labelShape('text-link', 92, 96, 176, 32),
        outlines.labels['text-link'].text
      ),
      ...(state === 'focus'
        ? [
            node(
              state,
              'focus-ring',
              {
                kind: 'compound-polygon',
                fillRule: 'evenodd',
                contours: [
                  [
                    { x: 88, y: 32 },
                    { x: 272, y: 32 },
                    { x: 272, y: 84 },
                    { x: 88, y: 84 },
                  ],
                  [
                    { x: 90, y: 34 },
                    { x: 270, y: 34 },
                    { x: 270, y: 82 },
                    { x: 90, y: 82 },
                  ],
                ],
              },
              'Two pixel focus ring with two pixels of ground separating it from the action'
            ),
          ]
        : []),
    ]),
  };
}
function brandBoard(
  input: Extract<GuidelineApplicationLayoutInput, { kind: 'brand' }>
): ColorSystemApplicationGeometryBoardV1 {
  const share = input.primaryShare;
  const leaf = (
    id: string,
    shape: ColorSystemGeometryShapeV1,
    children: readonly ColorSystemApplicationGeometryNodeV1[] = []
  ) => node('brand', id, shape, `${id} decorative paint`, children);
  const panels =
    input.layout === 'split'
      ? [
          leaf('primary', rect(40, 28, share * 3, 156)),
          leaf('secondary', rect(60 + share * 3, 28, (100 - share) * 3, 156)),
        ]
      : input.layout === 'stack'
        ? [
            leaf('primary', rect(40, 20, 320, share * 1.5)),
            leaf('secondary', rect(40, 40 + share * 1.5, 320, (100 - share) * 1.5)),
          ]
        : [
            leaf('primary', rect(20, 20, 360, 180), [
              leaf('secondary', rect(38, 10 + share, 324, (100 - share) * 2)),
            ]),
          ];
  return {
    applicationId: 'brand',
    width: 400,
    height: 240,
    root: node(
      'brand',
      'ground',
      rect(0, 0, 400, 240),
      `${input.layout} decorative color composition`,
      [...panels, leaf('accent', rect(40, 208, 320, 12))]
    ),
  };
}
function pair(
  foregroundUseId: string,
  backgroundUseId: string,
  minimum: number,
  assessment: 'required' | 'inactive-exempt' | 'advisory'
) {
  return {
    id: `${foregroundUseId}:on:${backgroundUseId}`,
    foregroundUseId,
    backgroundUseId,
    contrast: { minimum, assessment },
  };
}

/** Measures the same geometry consumed by preview and SVG before any source color is assigned. */
export function buildGuidelineApplicationLayout(
  input: GuidelineApplicationLayoutInput
): GuidelineApplicationLayout {
  const request = parseRequest(input);
  const measured = measureColorSystemApplicationGeometryBoardsV1(
    request.kind === 'product' ? GUIDELINE_PRODUCT_STATES.map(productBoard) : [brandBoard(request)]
  );
  const templates: ColorSystemApplicationTemplateV1[] = measured.boards.map(board => ({
    id: board.applicationId,
    contextId: request.kind,
    modeId: request.modeId,
    uses: measured.areas
      .filter(area => area.applicationId === board.applicationId)
      .map(area => ({ id: area.useId, role: area.useId, area: area.area })),
    pairs:
      request.kind === 'product'
        ? [
            pair(
              'label',
              'action',
              4.5,
              board.applicationId === 'disabled' ? 'inactive-exempt' : 'required'
            ),
            pair(
              'action',
              'ground',
              3,
              board.applicationId === 'disabled' ? 'inactive-exempt' : 'required'
            ),
            // The secondary link remains active even when the primary action is disabled.
            pair('partner', 'ground', 4.5, 'required'),
            ...(board.applicationId === 'focus'
              ? [pair('focus-ring', 'ground', 3, 'required')]
              : []),
          ]
        : [
            pair('primary', 'ground', 3, 'advisory'),
            pair('secondary', request.layout === 'frame' ? 'primary' : 'ground', 3, 'advisory'),
            pair('accent', 'ground', 3, 'advisory'),
          ],
  }));
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates,
    distinctions: [],
  });
  return {
    kind: request.kind,
    request,
    boards: measured.boards,
    areas: measured.areas,
    requirements,
    roles: templates.flatMap(template =>
      template.uses.map(use => ({
        applicationId: template.id,
        useId: use.id,
        role: use.role,
        label: (
          {
            ground: 'Ground',
            action: 'Action fill',
            label: 'Continue label',
            partner: 'View details link',
            'focus-ring': 'Focus ring',
            primary: 'Primary',
            secondary: 'Secondary',
            accent: 'Accent',
          } as Record<string, string>
        )[use.id],
      }))
    ),
    artwork: {
      status: 'provided-artwork-metadata',
      sources:
        request.kind === 'product'
          ? [
              {
                label: `${outlines.font.family} ${outlines.font.style}, ${outlines.font.size} CSSpx`,
                identity:
                  'Previously registered local control-label outline source; not brand-approved typography',
                sha256: outlines.font.sourceSha256,
              },
              {
                label: 'Teul finite control-label outline artwork',
                identity: outlines.version,
                sha256: deterministicContentHash(exact(outlines)).slice(7),
              },
            ]
          : [],
      notes:
        request.kind === 'product'
          ? [
              outlines.compilation.disclosure,
              outlines.compilation.shaping,
              `Compiled with ${outlines.compilation.tool} ${outlines.compilation.version}; flatness ${outlines.compilation.flatnessCssPx} CSSpx; coordinates and label placement on the 1/64 CSSpx grid.`,
              'Five separate static state samples. View details stays active in the disabled action sample. This artwork is not a complete interaction or accessibility audit.',
            ]
          : [
              'Generic Teul decorative composition; not extracted brand artwork or a brand-owner-approved layout.',
              'Primary share is the exact primary percentage of combined visible primary and secondary ink. Ground and accent are excluded from this control, but included in measured source-rule assessments.',
            ],
    },
  };
}

/** Exact layout binding only. The caller must separately enforce source and application eligibility. */
export function assessGuidelineApplicationGeometry(
  modelInput: unknown,
  applicationsInput: unknown,
  layout: GuidelineApplicationLayout
) {
  const canonical = buildGuidelineApplicationLayout(layout.request);
  if (exact(canonical) !== exact(layout)) fail('Layout differs from its declared controls.');
  const raw = snapshotColorSystemInertJsonV1(applicationsInput);
  if (!Array.isArray(raw)) fail('Expected actual applications.');
  const applications = raw.map(buildColorSystemContextApplicationV1);
  if (applications.length !== canonical.requirements.templates.length)
    fail('Every state must have a complete application.');
  for (const template of canonical.requirements.templates) {
    const application = applications.find(item => item.id === template.id);
    if (!application) fail(`Application ${template.id} is missing.`);
    const withoutColors = {
      ...application,
      uses: application.uses.map(({ colorId: _colorId, ...use }) => use),
    };
    if (exact(withoutColors) !== exact(template))
      fail(`Application ${template.id} differs from measured roles, scope, mode or pair policy.`);
  }
  const model = captureColorSystemModelV1(modelInput);
  return assessColorSystemApplicationGeometryV1(model, applications, {
    version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
    modelHash: model.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: canonical.boards,
    artwork: canonical.artwork,
  });
}

/** Same measured paths and native source-channel values as preview; no independent artwork renderer. */
export function exportGuidelineApplicationSvgs(
  modelInput: unknown,
  applicationsInput: unknown,
  layout: GuidelineApplicationLayout
): readonly { applicationId: string; svg: string }[] {
  const model = captureColorSystemModelV1(modelInput);
  const assessment = assessGuidelineApplicationGeometry(model, applicationsInput, layout);
  const escape = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  return assessment.plan.boards.map(board => {
    const application = assessment.applications.find(item => item.id === board.applicationId)!;
    const nodes = new Map<string, ColorSystemApplicationGeometryNodeV1>();
    const collect = (item: ColorSystemApplicationGeometryNodeV1) => {
      nodes.set(item.id, item);
      item.children.forEach(collect);
    };
    collect(board.root);
    const paths = assessment.regions
      .filter(region => region.applicationId === board.applicationId)
      .map(region => {
        const use = application.uses.find(item => item.id === region.useId)!;
        const color = model.colors.find(item => item.id === use.colorId)!;
        const title = nodes.get(region.nodeId)?.textAlternative ?? region.useId;
        return `<path d="${region.svgPath}" fill="${colorSystemSrgbToCssV1(color.valuesByMode[application.modeId])}" fill-rule="evenodd"><title>${escape(title)}</title></path>`;
      })
      .join('');
    return {
      applicationId: board.applicationId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${board.width}" height="${board.height}" viewBox="0 0 ${board.width} ${board.height}" role="img"><title>${escape(`${layout.kind}: ${board.applicationId}`)}</title><desc>${escape(
        [
          ...layout.artwork.sources.map(source => `${source.label}: ${source.identity}`),
          ...layout.artwork.notes,
          ...colorSystemValueNoticesV1(
            model,
            application.uses.map(use => use.colorId)
          ),
        ].join(' ')
      )}</desc>${paths}</svg>`,
    };
  });
}
