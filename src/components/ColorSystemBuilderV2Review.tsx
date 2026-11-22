import * as React from 'react';
import {
  colorSystemSrgbToCssV1,
  colorSystemSrgbToRgbV1,
  compositeColorSystemRgbV1,
} from '../lib/colorSystemSrgbValueV1';
import { getRelativeLuminance } from '../lib/accessibility';
import { hexToRgb } from '../lib/utils';
import type {
  ColorSystemReviewBrandSurfacesV2,
  ColorSystemReviewColorV2,
  ColorSystemReviewFamilyV2,
  ColorSystemReviewModelV2,
  ColorSystemReviewPrintTripletV2,
  ColorSystemReviewProportionRuleV2,
  ColorSystemReviewSectionV2,
  ColorSystemReviewSemanticRoleV2,
  ColorSystemReviewSystemCardV2, // p6
  ColorSystemReviewSystemOriginV2, // p6
  ColorSystemReviewSystemPartV2, // p6
  ColorSystemReviewTextPairV2,
  ColorSystemReviewVisualizationMarkV2, // p6
  ColorSystemReviewWhyV2,
} from '../lib/colorSystemReviewModelV2';
import {
  buildColorSystemVisualizationLegendV2,
  type ColorSystemReviewChartOrderFactV2,
  type ColorSystemReviewSurfacesFactV2,
} from '../lib/colorSystemApplicationBlueprintV2';
// p4-DE: the print triplet and out-of-home checks re-run client-side with the
// same functions the review model used, so a typed spot flips the canonical
// value and every board check matches Brand surfaces by construction.
import {
  outOfHomeTextAdvisory,
  printTriplet,
  type ColorSystemSurfaceV3,
  type OwnerSuppliedSpotColor,
} from '../lib/colorSystemSurfaceAdvisoriesV3';
import {
  COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2,
  colorSystemOwnerSpotColorLabelV2,
  type ColorSystemBuilderV2OwnerSpotColorMessage,
  type ColorSystemBuilderV2OwnerSpotColorsMessage,
} from '../types/colorSystemBuilderV2Messages';
import { splitErrorReference } from './ColorSystemGenericPlanReviewV2';

/**
 * p3-I: the two facts the Why block states in one line each. They travel on the
 * review model's `why` block once the review model projects them from the
 * application blueprint (colorSystemReviewSurfacesFactV2 /
 * colorSystemReviewChartOrderFactV2); until then the block is simply absent.
 */
type WhyWithFacts = ColorSystemReviewWhyV2 & {
  surfaces?: ColorSystemReviewSurfacesFactV2;
  chartOrder?: ColorSystemReviewChartOrderFactV2;
};

const SURFACE_LABELS: Readonly<Record<ColorSystemSurfaceV3, string>> = {
  'screen-product': 'Screen product',
  'screen-marketing': 'Screen marketing',
  print: 'Print',
  'out-of-home': 'Out-of-home',
};

/** One definitional sentence for ΔEOK, shown once wherever the unit appears. */
const DELTA_E_OK_DEFINITION =
  'ΔEOK is the distance between two colors in OKLab; about 0.02 is the smallest difference most people notice.';

/** The comparison swatch: the exact Light step-9 anchor, or the nearest Light step when absent. */
function anchorOf(
  family: ColorSystemReviewFamilyV2
): Pick<ColorSystemReviewColorV2, 'hex' | 'nativeValue'> {
  const light = family.colors.filter(color => color.mode === 'Light');
  if (family.anchorHex)
    return light.find(color => color.hex === family.anchorHex) ?? { hex: family.anchorHex };
  return (
    light[Math.min(8, Math.max(light.length - 1, 0))] ?? family.colors[0] ?? { hex: '#000000' }
  );
}

/** Brand-derived families first, then accents, then neutrals; stable within each group. */
function comparisonFamilies(model: ColorSystemReviewModelV2): ColorSystemReviewFamilyV2[] {
  const order = ['derived', 'accent', 'neutral'];
  const rank = (family: ColorSystemReviewFamilyV2) =>
    family.kind ? order.indexOf(family.kind) : order.length;
  return model.families
    .map((family, index) => ({ family, index }))
    .sort((left, right) => rank(left.family) - rank(right.family) || left.index - right.index)
    .map(entry => entry.family);
}

function measuresLine(why: ColorSystemReviewWhyV2): string {
  return [
    why.familyAnchorSeparation.minimum === null
      ? null
      : `anchors ≥ ${why.familyAnchorSeparation.minimum.toFixed(2)} ΔEOK`,
    `${why.meaningRoles.inRange}/${why.meaningRoles.total} meaning roles in range`,
    `chart separation ${why.chartSeparation.minimum.toFixed(2)}`,
    why.sequentialAdjacentCoefficientOfVariation === null
      ? 'sequential chart not requested'
      : `ramp evenness ${why.sequentialAdjacentCoefficientOfVariation.toFixed(2)}`,
    why.gamutMappedSteps === null ? null : `${why.gamutMappedSteps} steps gamut-mapped`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** WCAG reading for one rendered pair; `check` names the threshold that applies. */
function contrastLabel(
  ratio: number | null,
  status: string,
  threshold: number,
  check: string
): string {
  if (ratio === null) return 'Exact pair could not be assessed';
  return `${ratio.toFixed(2)}:1 · ${status === 'pass' ? 'passes' : status} ${threshold}:1 ${check}`;
}

function textPairContrastLabel(pair: ColorSystemReviewTextPairV2): string {
  return contrastLabel(pair.ratio, pair.status, pair.threshold, 'WCAG check');
}

export interface ColorSystemBuilderV2ReviewBlocker {
  title: string;
  message: string;
  /** Machine code(s) lifted out of the headline, shown as "Reference: CODE". */
  reference?: string | null;
}

/**
 * Both acknowledgements are real checkboxes in the Create footer. They are only
 * ever reported as `true`, because Create stays disabled until both are ticked.
 */
export interface ColorSystemBuilderV2CreateAcknowledgements {
  currentFileAcknowledged: true;
  manualPublicationAcknowledged: true;
}

export const CREATE_ACKNOWLEDGEMENT_COPY = {
  currentFile: 'Create in the current Figma file',
  manualPublication: 'I understand publishing to a library is a separate manual step',
} as const;

export interface ColorSystemBuilderV2ReviewProps {
  models: readonly ColorSystemReviewModelV2[];
  recommendedDirectionId: string;
  selectedDirectionId: string | null;
  onSelectDirection: (directionId: string) => void;
  onCreate: (
    review: ColorSystemReviewModelV2,
    acknowledgements: ColorSystemBuilderV2CreateAcknowledgements,
    /** p4-DE: present only when the owner typed at least one spot reference. */
    ownerSpotColors?: ColorSystemBuilderV2OwnerSpotColorsMessage
  ) => void;
  creating: boolean;
  blocker?: string | ColorSystemBuilderV2ReviewBlocker | null;
  isDark?: boolean;
}

interface ReviewTheme {
  canvas: string;
  panel: string;
  raised: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  selected: string;
  positive: string;
  warning: string;
  danger: string;
  checker: string;
}

const SECTION_ORDER = [
  'primary',
  'secondary',
  'product-graphics',
  'data-visualization',
  'typography',
] as const;

/** The builder's shared palette; the Tab maps these keys onto its own names. */
export function themeFor(isDark: boolean): ReviewTheme {
  return isDark
    ? {
        canvas: '#191919',
        panel: '#242424',
        raised: '#303030',
        text: '#FFFFFF',
        muted: '#B8B8B8',
        border: '#4A4A4A',
        accent: '#8AB4FF',
        accentText: '#102043',
        selected: '#263B5B',
        positive: '#82D9A3',
        warning: '#F2C14E',
        danger: '#FF9A9A',
        checker: '#424242',
      }
    : {
        canvas: '#FFFFFF',
        panel: '#F6F6F4',
        raised: '#FFFFFF',
        text: '#171717',
        muted: '#616161',
        border: '#D7D7D3',
        accent: '#2458B3',
        accentText: '#FFFFFF',
        selected: '#EAF1FF',
        positive: '#146C43',
        warning: '#805A00',
        danger: '#B42318',
        checker: '#D8D8D4',
      };
}

type Sty = React.CSSProperties;

const bodyText: Sty = { fontSize: 13 };
const heavyText: Sty = { fontWeight: 800 };
const roundedSwatch: Sty = { borderRadius: 6 };
const roundedChip: Sty = { borderRadius: 4 };
const readableLine: Sty = { lineHeight: 1.45 };
const openLine: Sty = { lineHeight: 1.5 };
const sectionSpace: Sty = { marginTop: 16 };
const groupSpace: Sty = { marginTop: 18 };
const contentSpace: Sty = { marginTop: 12 };

const smallText: Sty = { fontSize: 12 };
const shrinkable: Sty = { minWidth: 0 };
const blockDisplay: Sty = { display: 'block' };
const flexDisplay: Sty = { display: 'flex' };
const gridDisplay: Sty = { display: 'grid' };
const noMargin: Sty = { margin: 0 };
const boldText: Sty = { fontWeight: 700 };
const clipped: Sty = { overflow: 'hidden' };
const wrapAnywhere: Sty = { overflowWrap: 'anywhere' };
const roundedCard: Sty = { borderRadius: 8 };

/** Muted paragraph: `margin: <top>px 0 0`, 12 px by default. */
const para = (theme: ReviewTheme, top: number, fontSize = 12, lineHeight = 1.45): Sty => ({
  margin: top === 0 ? 0 : `${top}px 0 0`,
  color: theme.muted,
  fontSize,
  lineHeight,
});
/** Muted block-level note, 12 px by default. */
const note = (theme: ReviewTheme, marginTop = 0, fontSize = 12): Sty => ({
  ...blockDisplay,
  marginTop,
  color: theme.muted,
  fontSize,
});
/** Raised card with a 7 px radius. */
const card = (theme: ReviewTheme, padding = 9): Sty => ({
  padding,
  borderRadius: 7,
  background: theme.raised,
});
/** Bordered panel section. */
const panel = (theme: ReviewTheme, marginTop: number, padding: number): Sty => ({
  marginTop,
  padding,
  borderRadius: 10,
  border: hairline(theme),
  background: theme.panel,
});
/** Unstyled list laid out as a grid; `min` enables auto-fill columns. */
const listGrid = (gap: number, min?: number): Sty => ({
  ...gridDisplay,
  gridTemplateColumns: min === undefined ? undefined : `repeat(auto-fill, minmax(${min}px, 1fr))`,
  gap,
  ...noMargin,
  padding: 0,
  listStyle: 'none',
});
const heading = (margin: Sty['margin'], fontSize: number): Sty => ({ margin, fontSize });
const gridSpace = (gap: number, marginTop: number): Sty => ({ ...gridDisplay, gap, marginTop });
const blockLabel: Sty = { ...blockDisplay, ...smallText };
const blockValue: Sty = { ...blockLabel, marginTop: 4 };
const boldLabel: Sty = { ...smallText, ...boldText };
const blockBoldLabel: Sty = { ...boldLabel, ...blockDisplay };
const splitHeading: Sty = {
  ...flexDisplay,
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'baseline',
};
const axisLabels = (color: string): Sty => ({
  ...flexDisplay,
  justifyContent: 'space-between',
  gap: 10,
  marginTop: 6,
  color,
  ...smallText,
  ...boldText,
});
const wrapValue: Sty = { ...noMargin, ...wrapAnywhere };
const twoUp: Sty = { ...gridDisplay, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' };
const bulletList: Sty = { margin: '6px 0 0', paddingLeft: 18, ...smallText, ...openLine };
/** Written-out tag (“Kept exactly”, “Recommended”); the color is never the only signal. */
const tagStyle = (theme: ReviewTheme, color = theme.muted): Sty => ({
  padding: '2px 7px',
  borderRadius: 999,
  border: `1px solid ${color}`,
  color,
  ...smallText,
  ...boldText,
  whiteSpace: 'nowrap',
});
/** The hairline every panel, card and field shares. */
const hairline = (theme: ReviewTheme): string => `1px solid ${theme.border}`;
/** First-screen group heading and card name: the smallest labels there are 13 px. */
const groupHeading: Sty = { ...noMargin, fontSize: 15, lineHeight: 1.3 };
const cardName: Sty = { ...bodyText, lineHeight: 1.35 };
/** A large first-screen swatch with a hairline so white reads on white. */
const swatchFrame = (theme: ReviewTheme, hex: string): Sty => ({
  ...blockDisplay,
  height: 40,
  borderRadius: 5,
  background: hex,
  boxShadow: `inset 0 0 0 1px ${theme.border}`,
});

/**
 * p6: the plain UI names and token paths the review model projects per family
 * (“Violet accent”, `color/violet`). The data names are unchanged; a model
 * without the projection falls back to them.
 */
type FamilyNames = ReadonlyMap<string, { name: string; tokenPath: string }>;

function familyNamesOf(model: ColorSystemReviewModelV2 | null): FamilyNames {
  return new Map(
    (model?.recommendedSystem?.familyNames ?? []).map(entry => [entry.familyId, entry])
  );
}

function plainFamilyName(names: FamilyNames, family: { id: string; name: string }): string {
  return names.get(family.id)?.name ?? family.name;
}

/** One exact Light step-9 swatch per family, with the names and values printed beneath. */
function AnchorStrip({
  families,
  names,
  label,
  theme,
}: {
  families: readonly ColorSystemReviewFamilyV2[];
  names: FamilyNames;
  label: string;
  theme: ReviewTheme;
}) {
  return (
    <>
      <div
        role="group"
        aria-label={label}
        style={{ ...flexDisplay, gap: 2, marginTop: 5, ...clipped, ...roundedChip }}
      >
        {families.map(family => (
          <span
            key={family.id}
            role="img"
            aria-label={`${plainFamilyName(names, family)} ${displayHex(anchorOf(family))}`}
            style={{
              ...blockDisplay,
              flex: '1 1 14px',
              minWidth: 10,
              height: 26,
              background: paintColor(anchorOf(family)),
            }}
          />
        ))}
      </div>
      <p style={{ ...para(theme, 4), ...wrapAnywhere }}>
        {families
          .map(family => `${plainFamilyName(names, family)} ${displayHex(anchorOf(family))}`)
          .join(' · ')}
      </p>
    </>
  );
}

function plainLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase())
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bWcag\b/g, 'WCAG');
}

function productIntendedUse(
  specimen: NonNullable<ColorSystemReviewSectionV2['productGraphicsSpecimens']>[number]
): string {
  if (
    specimen.rendering?.provenance === 'declared-context' &&
    specimen.job === 'product-ui-surface'
  ) {
    return 'An internal control surface tested with its declared labels and surroundings.';
  }
  if (specimen.intendedUse.includes('using reviewed Secondary eligibility')) {
    const descriptions: Readonly<Record<typeof specimen.job, string>> = {
      'product-graphic': 'A supporting color for product illustration and graphic shapes.',
      'functional-iconography': 'An exact icon color tested on the surface shown here.',
      'product-ui-surface': 'Exact UI surface color, tested against the surrounding surface shown.',
    };
    return descriptions[specimen.job];
  }
  return specimen.intendedUse
    .replace(specimen.job, plainLabel(specimen.job))
    .replace('reviewed Secondary eligibility', 'reviewed Secondary color');
}

function productContrastLabel(
  specimen: NonNullable<ColorSystemReviewSectionV2['productGraphicsSpecimens']>[number]
): string {
  if (specimen.assessment === 'decorative') return 'Decorative example · no contrast claim';
  const contrast = specimen.contrast;
  if (!contrast) return 'Exact pair could not be assessed';
  return contrastLabel(contrast.ratio, contrast.status, contrast.requiredRatio, 'non-text check');
}

function displayHex(
  color: Pick<ColorSystemReviewColorV2, 'hex' | 'nativeValue'>,
  hex?: string
): string {
  if (hex === undefined) hex = color.hex;
  return color.nativeValue ? `≈ ${hex}` : hex;
}

function paintColor(color: Pick<ColorSystemReviewColorV2, 'hex' | 'nativeValue'>): string {
  return color.nativeValue ? colorSystemSrgbToCssV1(color.nativeValue) : color.hex;
}

function colorRgb(color: Pick<ColorSystemReviewColorV2, 'hex' | 'nativeValue'>) {
  return color.nativeValue ? colorSystemSrgbToRgbV1(color.nativeValue) : hexToRgb(color.hex);
}

function chartPaint(
  mark: ColorSystemReviewVisualizationMarkV2,
  surface: ColorSystemReviewColorV2
): string {
  if (!mark.color.nativeValue && !surface.nativeValue) return mark.renderedHex;
  if (mark.color.alpha === 1) return paintColor(mark.color);
  const rgb = compositeColorSystemRgbV1(colorRgb(mark.color), mark.color.alpha, colorRgb(surface));
  return `color(srgb ${rgb.r / 255} ${rgb.g / 255} ${rgb.b / 255})`;
}

function colorBackground(color: ColorSystemReviewColorV2): string {
  if (color.nativeValue) return paintColor(color);
  const { r, g, b } = colorRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${color.alpha})`;
}

function textColorOnSurface(color: ColorSystemReviewColorV2, underlayHex: string): string {
  const { r, g, b } = compositeColorSystemRgbV1(
    colorRgb(color),
    color.alpha,
    hexToRgb(underlayHex)
  );
  return getRelativeLuminance(r, g, b) > 0.179 ? '#171717' : '#FFFFFF';
}

function opacityLabel(alpha: number): string {
  return `${Math.round(alpha * 100)}% opacity`;
}

function orderedModes(colors: readonly ColorSystemReviewColorV2[]): string[] {
  const priority = (mode: string) => (mode === 'Light' ? 0 : mode === 'Dark' ? 1 : 2);
  return [...new Set(colors.map(color => color.mode))].sort(
    (left, right) => priority(left) - priority(right) || left.localeCompare(right)
  );
}

function blockerCopy(
  blocker: ColorSystemBuilderV2ReviewProps['blocker']
): ColorSystemBuilderV2ReviewBlocker | null {
  if (!blocker) return null;
  if (typeof blocker !== 'string') return blocker;
  const { headline, reference } = splitErrorReference(blocker);
  return { title: 'This system cannot be created yet', message: headline, reference };
}

function Swatch({
  color,
  boundary,
  compact,
  theme,
}: {
  color: ColorSystemReviewColorV2;
  boundary: ColorSystemReviewSectionV2['cardBoundary'];
  compact?: boolean;
  theme: ReviewTheme;
}) {
  const boundaryColor =
    boundary === 'black-inside-1px'
      ? '#000000'
      : boundary === 'white-inside-1px'
        ? '#FFFFFF'
        : null;
  const label = `${color.name}, ${color.mode} mode, ${displayHex(color)}, ${opacityLabel(color.alpha)}, ${color.origin}`;

  if (compact) {
    return (
      <span
        role="img"
        aria-label={label}
        style={{
          ...blockDisplay,
          flex: '1 1 10px',
          minWidth: 8,
          height: 26,
          backgroundColor: colorBackground(color),
          boxShadow: boundaryColor ? `inset 0 0 0 1px ${boundaryColor}` : undefined,
        }}
      />
    );
  }

  return (
    <li
      style={{
        ...shrinkable,
        ...roundedCard,
        ...clipped,
        background: theme.raised,
        border: hairline(theme),
      }}
    >
      <div
        role="img"
        aria-label={label}
        style={{
          height: 72,
          padding: 7,
          backgroundColor: theme.checker,
          backgroundImage:
            'repeating-conic-gradient(rgba(255,255,255,.25) 0 25%, transparent 0 50%)',
          backgroundSize: '12px 12px',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            ...roundedChip,
            backgroundColor: colorBackground(color),
            boxShadow: boundaryColor ? `inset 0 0 0 1px ${boundaryColor}` : undefined,
          }}
        />
      </div>
      <div style={{ padding: 9 }}>
        <strong style={{ ...blockDisplay, ...smallText, lineHeight: 1.35 }}>{color.name}</strong>
        {mutedNote(
          theme,
          `${displayHex(color)} · ${opacityLabel(color.alpha)} · ${plainLabel(color.mode)} · ${color.origin === 'existing' ? 'Existing' : 'Suggested'}`,
          3
        )}
      </div>
    </li>
  );
}

type VisualizationSpecimens = NonNullable<ColorSystemReviewSectionV2['visualizationSpecimens']>;

function VisualizationCard({
  title,
  description,
  children,
  theme,
  kind,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  theme: ReviewTheme;
  kind: 'categorical' | 'sequential' | 'diverging';
}) {
  return (
    <figure
      data-teul-specimen-kind={kind}
      aria-label={`${title} chart specimen`}
      style={{
        ...shrinkable,
        ...noMargin,
        padding: 12,
        ...roundedCard,
        border: hairline(theme),
        background: theme.raised,
      }}
    >
      <figcaption>
        <strong style={blockLabel}>{title}</strong>
        {mutedNote(theme, description, 3)}
      </figcaption>
      {children}
    </figure>
  );
}

function ChartLegend({
  kind,
  marks,
  surface,
  theme,
}: {
  kind: 'categorical' | 'sequential' | 'diverging';
  marks: readonly ColorSystemReviewVisualizationMarkV2[];
  surface: ColorSystemReviewColorV2;
  theme: ReviewTheme;
}) {
  const entries = buildColorSystemVisualizationLegendV2(
    marks,
    marks.map(mark => ({ order: mark.order, paint: mark }))
  );
  return (
    <div
      data-teul-chart-legend={kind}
      style={{
        marginTop: 8,
        padding: 10,
        ...roundedSwatch,
        background: colorBackground(surface),
        color: textColorOnSurface(surface, theme.raised),
      }}
    >
      <strong style={blockLabel}>Legend</strong>
      <ol aria-label={`${kind} chart legend`} style={{ ...listGrid(8, 120), marginTop: 6 }}>
        {entries.map(({ order, label, paint }) => (
          <li key={order} data-teul-legend-order={order} style={{ ...flexDisplay, gap: 6 }}>
            <span
              aria-hidden="true"
              data-teul-legend-paint={paint.color.id}
              style={{
                flex: '0 0 12px',
                height: 12,
                marginTop: 2,
                background: chartPaint(paint, surface),
              }}
            />
            <span style={{ ...smallText, ...wrapAnywhere }}>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DataVisualizationSpecimens({
  specimens,
  theme,
}: {
  specimens: VisualizationSpecimens;
  theme: ReviewTheme;
}) {
  const categorical = specimens.categorical;
  const sequential = specimens.sequential;
  const diverging = specimens.diverging;
  const categoricalBoundary = categorical.boundary?.hex;
  const categoricalText = textColorOnSurface(categorical.surface, theme.raised);
  const divergingText = diverging ? textColorOnSurface(diverging.surface, theme.raised) : undefined;
  const midpointIndex =
    diverging?.marks.findIndex(mark => mark.order === diverging.midpointOrder) ?? 0;

  return (
    <section aria-labelledby="teul-data-viz-specimens-title" style={sectionSpace}>
      <h4 id="teul-data-viz-specimens-title" style={heading(0, 13)}>
        Generated chart examples
      </h4>
      {paragraph(
        theme,
        5,
        'The colors, order, labels and non-color cues the created components reuse; not copied source artwork or brand approval.'
      )}
      {specimens.categoricalCapacity && specimens.categoricalCapacity.length > 0 && (
        <ul
          data-teul-categorical-capacity
          aria-label="Categorical series capacity"
          style={{ margin: '8px 0 0', paddingLeft: 18, ...smallText, ...openLine }}
        >
          {specimens.categoricalCapacity.map(capacity => (
            <li key={capacity.mode}>
              {`Requested ${capacity.requestedMarkCount}, achieved ${capacity.achievedMarkCount} in ${plainLabel(capacity.mode)}${capacity.limitation ? `: ${capacity.limitation}` : '.'}`}
            </li>
          ))}
        </ul>
      )}
      <div style={gridSpace(10, 10)}>
        <VisualizationCard
          kind="categorical"
          title="Categorical"
          description="Distinct categories · direct labels + different bar shapes"
          theme={theme}
        >
          <div
            style={{
              ...flexDisplay,
              alignItems: 'end',
              gap: 8,
              minHeight: 170,
              marginTop: 10,
              padding: '14px 10px 8px',
              ...roundedSwatch,
              background: colorBackground(categorical.surface),
            }}
          >
            {categorical.marks.map((mark, index) => (
              <div
                key={`${categorical.selectionId}:${mark.order}`}
                style={{
                  ...gridDisplay,
                  gridTemplateRows: '1fr auto auto',
                  alignItems: 'end',
                  width: `${100 / Math.max(categorical.marks.length, 1)}%`,
                  ...shrinkable,
                  height: 138,
                  textAlign: 'center',
                }}
              >
                <span
                  role="img"
                  aria-label={`${mark.label}, ${displayHex(mark.color, mark.renderedHex)}`}
                  style={{
                    ...blockDisplay,
                    width: '72%',
                    height: `${42 + ((index * 17 + 19) % 58)}px`,
                    margin: '0 auto',
                    border: categoricalBoundary ? `1px solid ${categoricalBoundary}` : 0,
                    borderRadius:
                      index % 3 === 0 ? '1px' : index % 3 === 1 ? '12px 12px 2px 2px' : '999px',
                    background: chartPaint(mark, categorical.surface),
                  }}
                />
                <strong
                  style={{
                    ...blockDisplay,
                    marginTop: 6,
                    color: categoricalText,
                    ...smallText,
                    lineHeight: 1.1,
                    ...wrapAnywhere,
                    whiteSpace: 'normal',
                  }}
                >
                  {mark.label}
                </strong>
                <span
                  style={{
                    ...blockDisplay,
                    color: categoricalText,
                    ...smallText,
                    opacity: 0.72,
                    ...wrapAnywhere,
                  }}
                >
                  {displayHex(mark.color, mark.renderedHex)}
                </span>
              </div>
            ))}
          </div>
          <ChartLegend {...categorical} theme={theme} />
        </VisualizationCard>

        {sequential && (
          <VisualizationCard
            kind="sequential"
            title="Sequential"
            description={`${sequential.axisLabel} · ${sequential.endpointLabels[0]} to ${sequential.endpointLabels[1]}`}
            theme={theme}
          >
            <div
              style={{
                marginTop: 10,
                padding: 10,
                ...roundedSwatch,
                background: colorBackground(sequential.surface),
              }}
            >
              <div style={{ ...flexDisplay, gap: 3 }}>
                {sequential.marks.map(mark => (
                  <span
                    key={`${sequential.selectionId}:${mark.order}`}
                    role="img"
                    aria-label={`${mark.label}, ${displayHex(mark.color, mark.renderedHex)}`}
                    style={{
                      ...blockDisplay,
                      width: `${100 / Math.max(sequential.marks.length, 1)}%`,
                      height: 58,
                      background: chartPaint(mark, sequential.surface),
                      border: 0,
                    }}
                  />
                ))}
              </div>
              <div style={axisLabels(textColorOnSurface(sequential.surface, theme.raised))}>
                <span>{sequential.endpointLabels[0]}</span>
                <span>{sequential.endpointLabels[1]}</span>
              </div>
            </div>
            <ChartLegend {...sequential} theme={theme} />
          </VisualizationCard>
        )}

        {diverging && (
          <VisualizationCard
            kind="diverging"
            title="Diverging"
            description={`${diverging.negativeLabel} · ${diverging.midpointMeaning} · ${diverging.positiveLabel}`}
            theme={theme}
          >
            <div
              style={{
                position: 'relative',
                ...flexDisplay,
                alignItems: 'end',
                gap: 6,
                minHeight: 150,
                marginTop: 10,
                padding: '16px 10px 26px',
                ...roundedSwatch,
                background: colorBackground(diverging.surface),
              }}
            >
              {diverging.marks.map((mark, index) => {
                const distance = Math.abs(index - Math.max(midpointIndex, 0));
                return (
                  <div
                    key={`${diverging.selectionId}:${mark.order}`}
                    style={{
                      width: `${100 / Math.max(diverging.marks.length, 1)}%`,
                      ...shrinkable,
                      textAlign: 'center',
                    }}
                  >
                    <span
                      role="img"
                      aria-label={`${mark.label}, ${displayHex(mark.color, mark.renderedHex)}`}
                      style={{
                        ...blockDisplay,
                        height: `${38 + distance * 24}px`,
                        border: 0,
                        background: chartPaint(mark, diverging.surface),
                      }}
                    />
                    <strong
                      style={{
                        ...blockDisplay,
                        marginTop: 5,
                        ...clipped,
                        color: divergingText,
                        ...smallText,
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mark.label}
                    </strong>
                  </div>
                );
              })}
              <span
                aria-label="Zero reference line"
                style={{
                  position: 'absolute',
                  top: 8,
                  bottom: 22,
                  left: `${((Math.max(midpointIndex, 0) + 0.5) / Math.max(diverging.marks.length, 1)) * 100}%`,
                  width: 2,
                  background: divergingText,
                }}
              />
            </div>
            <div style={axisLabels(theme.muted)}>
              <span>{diverging.negativeLabel}</span>
              <span>{diverging.midpointMeaning}</span>
              <span>{diverging.positiveLabel}</span>
            </div>
            <ChartLegend {...diverging} theme={theme} />
          </VisualizationCard>
        )}
      </div>
    </section>
  );
}

function ProductGraphicsSpecimens({
  specimens,
  theme,
}: {
  specimens: NonNullable<ColorSystemReviewSectionV2['productGraphicsSpecimens']>;
  theme: ReviewTheme;
}) {
  if (specimens.length === 0) return null;
  return (
    <section aria-labelledby="teul-product-graphics-specimens-title" style={sectionSpace}>
      <h4 id="teul-product-graphics-specimens-title" style={heading(0, 13)}>
        Generated product-use examples
      </h4>
      {paragraph(
        theme,
        5,
        'Each proposed color tested in its product job; not copied source artwork or brand approval.'
      )}
      <div
        style={{
          ...gridDisplay,
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
          marginTop: 10,
        }}
      >
        {specimens.map(specimen => {
          const color = specimen.colors[0];
          if (!color) return null;
          const surface = specimen.surface;
          const label = plainLabel(specimen.job);
          const rendering = specimen.rendering;
          const uses = new Map(rendering?.uses.map(use => [use.id, use]));
          return (
            <figure
              key={specimen.derivationId}
              data-teul-product-specimen={
                specimen.job === 'functional-iconography'
                  ? 'iconography'
                  : specimen.job === 'product-ui-surface'
                    ? 'product-surface'
                    : 'product-graphic'
              }
              aria-label={`${label} specimen using ${specimen.colors.map(item => `${item.name}, ${displayHex(item)}, ${opacityLabel(item.alpha)}`).join('; ')}${surface ? ` on ${surface.name}, ${displayHex(surface)}` : ''}; ${productContrastLabel(specimen)}`}
              style={{
                ...shrinkable,
                ...noMargin,
                padding: 10,
                ...roundedCard,
                background: theme.raised,
              }}
            >
              {rendering ? (
                <svg
                  role="img"
                  aria-label={`${label} application geometry`}
                  viewBox={`0 0 ${rendering.width} ${rendering.height}`}
                  data-teul-graphic-context={rendering.contextId}
                  data-teul-graphic-layout={rendering.layoutHash}
                  data-teul-graphic-requirements={rendering.requirementsHash ?? undefined}
                  data-teul-graphic-provenance={rendering.provenance}
                  style={{ ...blockDisplay, width: '100%', height: 'auto' }}
                >
                  {rendering.nodes.map(node => {
                    const use = uses.get(node.useId)!;
                    const attributes = {
                      fill: colorBackground(use.color),
                      'data-teul-graphic-node': node.id,
                      'data-teul-graphic-parent': node.parentId ?? undefined,
                      'data-teul-graphic-use': node.useId,
                      'data-teul-graphic-role': use.role,
                      'data-teul-graphic-assessment': use.assessment,
                    };
                    const title = node.textAlternative ? (
                      <title>
                        {rendering.provenance === 'legacy-pair-only'
                          ? `${label} color on its tested background.`
                          : node.textAlternative}
                      </title>
                    ) : null;
                    return node.kind === 'rectangle' ? (
                      <rect
                        key={node.id}
                        {...attributes}
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                      >
                        {title}
                      </rect>
                    ) : (
                      <path
                        key={node.id}
                        {...attributes}
                        d={node.path!}
                        fillRule="evenodd"
                        transform={`translate(${node.x} ${node.y})`}
                      >
                        {title}
                      </path>
                    );
                  })}
                </svg>
              ) : (
                paragraph(
                  theme,
                  0,
                  specimen.renderingLimitation ??
                    'This record has no unambiguous application geometry. Rebuild its assessed context to preview it.'
                )
              )}
              {rendering &&
                specimen.renderingLimitation &&
                paragraph(theme, 5, specimen.renderingLimitation)}
              <figcaption style={{ marginTop: 7, ...smallText, ...boldText }}>{label}</figcaption>
              <p style={{ margin: '2px 0 0', color: theme.muted, ...smallText }}>
                {displayHex(color)} · {opacityLabel(color.alpha)}
                {surface ? ` on ${displayHex(surface)}` : ''}
              </p>
              {paragraph(theme, 3, productIntendedUse(specimen), 12, 1.35)}
              {paragraph(theme, 3, productContrastLabel(specimen), 12, 1.35)}
              {rendering && (
                <ul
                  aria-label={`${label} exact paint checks`}
                  style={{ ...smallText, paddingLeft: 16 }}
                >
                  {rendering.pairs.map(pair => (
                    <li
                      key={pair.pairEvidenceId}
                      data-teul-graphic-pair={pair.pairEvidenceId}
                      data-teul-graphic-foreground={pair.foregroundUseId}
                      data-teul-graphic-background={pair.backgroundUseId}
                      data-teul-graphic-underlay={pair.underlayUseId ?? undefined}
                    >
                      {uses.get(pair.foregroundUseId)!.color.name} on{' '}
                      {uses.get(pair.backgroundUseId)!.color.name}
                      {' · '}
                      {contrastLabel(
                        pair.contrast.ratio,
                        pair.contrast.status,
                        pair.contrast.requiredRatio,
                        'WCAG check'
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function paragraph(
  theme: ReviewTheme,
  top: number,
  content: React.ReactNode,
  fontSize = 12,
  lineHeight = 1.45
) {
  return <p style={para(theme, top, fontSize, lineHeight)}>{content}</p>;
}

function mutedNote(theme: ReviewTheme, content: React.ReactNode, marginTop = 0, fontSize = 12) {
  return <span style={note(theme, marginTop, fontSize)}>{content}</span>;
}

function listItems(items: readonly string[]) {
  return items.map(item => <li key={item}>{item}</li>);
}

function RatingSummary({
  section,
  theme,
}: {
  section: ColorSystemReviewSectionV2;
  theme: ReviewTheme;
}) {
  if (!section.ratings) return null;
  return (
    <div style={sectionSpace}>
      <h4 style={heading('0 0 8px', 13)}>Measured checks</h4>
      <ul aria-label={`${section.title} measured checks`} style={listGrid(8, 150)}>
        {section.ratings.dimensions.map(dimension => (
          <li key={dimension.id} style={card(theme, 10)}>
            <strong style={blockLabel}>{dimension.label}</strong>
            <span style={blockValue}>
              {dimension.measuredValue} {dimension.unit}
            </span>
            {dimension.threshold !== undefined && (
              <span style={note(theme, 2)}>
                Required limit: {dimension.threshold} {dimension.unit}
              </span>
            )}
          </li>
        ))}
      </ul>
      {paragraph(theme, 8, section.ratings.limitation)}
    </div>
  );
}

function SectionReview({
  section,
  model,
  names,
  theme,
}: {
  section: ColorSystemReviewSectionV2;
  model: ColorSystemReviewModelV2;
  /** p6: plain family names and token paths for the Secondary strips. */
  names: FamilyNames;
  theme: ReviewTheme;
}) {
  const showDetailedColorCards =
    (section.role !== 'secondary' || model.families.length === 0) &&
    !(section.role === 'data-visualization' && section.visualizationSpecimens) &&
    !(section.role === 'product-graphics' && section.productGraphicsSpecimens);

  return (
    <article aria-labelledby={`teul-review-section-${section.role}`} style={panel(theme, 0, 16)}>
      <div style={{ ...flexDisplay, gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 id={`teul-review-section-${section.role}`} style={heading(0, 17)}>
          {section.title}
        </h3>
        <span
          style={tagStyle(
            theme,
            section.disposition === 'preserve' ? theme.positive : theme.accent
          )}
        >
          {section.changeLabel}
        </span>
      </div>
      {paragraph(theme, 8, section.guidance, 12, 1.5)}

      {showDetailedColorCards && section.colors.length > 0 ? (
        <ul aria-label={`${section.title} colors`} style={{ ...listGrid(9, 132), marginTop: 14 }}>
          {section.colors.map((color, index) => (
            <Swatch
              key={`${color.id}:${color.mode}:${index}`}
              color={color}
              boundary={section.cardBoundary}
              theme={theme}
            />
          ))}
        </ul>
      ) : showDetailedColorCards ? (
        paragraph(theme, 12, 'This direction assigns no color to this section.', 12)
      ) : null}

      {section.role === 'secondary' && model.families.length > 0 && (
        <div style={groupSpace}>
          <h4 style={heading('0 0 8px', 13)}>Why these Secondary families</h4>
          <ul style={listGrid(8)}>
            {model.families.map(family => (
              <li key={family.id} style={{ padding: 10, ...roundedCard, background: theme.raised }}>
                <div style={splitHeading}>
                  <strong style={smallText}>{plainFamilyName(names, family)}</strong>
                  <span style={{ color: theme.muted, ...smallText }}>
                    {plainLabel(family.prominence)}
                  </span>
                </div>
                <div style={gridSpace(8, 9)}>
                  {orderedModes(family.colors).map(mode => {
                    const modeColors = family.colors.filter(color => color.mode === mode);
                    const first = modeColors[0];
                    const last = modeColors[modeColors.length - 1];
                    return (
                      <div key={mode}>
                        <div
                          style={{
                            ...flexDisplay,
                            justifyContent: 'space-between',
                            gap: 8,
                            marginBottom: 4,
                            color: theme.muted,
                            ...smallText,
                          }}
                        >
                          <strong style={{ color: theme.text }}>{plainLabel(mode)}</strong>
                          <span>
                            {first && displayHex(first)} to {last && displayHex(last)}
                          </span>
                        </div>
                        <div
                          aria-label={`${plainFamilyName(names, family)} ${plainLabel(mode)} scale`}
                          style={{ ...flexDisplay, ...clipped, borderRadius: 5 }}
                        >
                          {modeColors.map((color, index) => (
                            <Swatch
                              key={`${color.id}:${color.mode}:${index}`}
                              color={color}
                              boundary="none"
                              compact
                              theme={theme}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {names.get(family.id) ? (
                  // p6: the created token path with its step numbers; steps read left to right.
                  <p data-teul-family-token-path style={para(theme, 6)}>
                    {`Tokens ${names.get(family.id)?.tokenPath}/1 to ${names.get(family.id)?.tokenPath}/${
                      family.colors.filter(color => color.mode === orderedModes(family.colors)[0])
                        .length
                    }, in the order shown.`}
                  </p>
                ) : null}
                {paragraph(theme, 8, family.reason)}
                <p style={heading('5px 0 0', 12)}>
                  Intended for: {family.jobs.map(plainLabel).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {section.role === 'data-visualization' && section.visualizationSpecimens && (
        <DataVisualizationSpecimens specimens={section.visualizationSpecimens} theme={theme} />
      )}

      {section.role === 'product-graphics' && section.productGraphicsSpecimens && (
        <ProductGraphicsSpecimens specimens={section.productGraphicsSpecimens} theme={theme} />
      )}

      {section.textPairs && section.textPairs.length > 0 && (
        <div style={sectionSpace}>
          <h4 style={heading('0 0 8px', 13)}>Rendered text pairs</h4>
          <ul aria-label="Rendered text pairs" style={listGrid(8, 150)}>
            {section.textPairs.map(pair => (
              <li
                key={pair.id}
                data-teul-text-pair={pair.id}
                style={{ ...card(theme, 0), ...clipped }}
              >
                <div
                  role="img"
                  aria-label={`${pair.foreground.name} ${displayHex(pair.foreground)} on ${pair.background.name} ${displayHex(pair.background)}`}
                  style={{
                    padding: '12px 10px',
                    color: colorBackground(pair.foreground),
                    background: colorBackground(pair.background),
                    fontSize: 16,
                    ...boldText,
                  }}
                >
                  Aa
                </div>
                <div style={{ padding: 9, ...smallText, lineHeight: 1.4 }}>
                  <strong style={blockLabel}>
                    {plainLabel(pair.useCategory)} · {plainLabel(pair.mode)}
                  </strong>
                  <span style={note(theme)}>
                    {displayHex(pair.foreground)} on {displayHex(pair.background)}
                  </span>
                  <span style={blockDisplay}>{textPairContrastLabel(pair)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RatingSummary section={section} theme={theme} />
    </article>
  );
}

function WhyBlock({ why, theme }: { why: ColorSystemReviewWhyV2; theme: ReviewTheme }) {
  const chart = why.chartSeparation;
  const { surfaces, chartOrder } = why as WhyWithFacts;
  const delta = (value: number) => `${value.toFixed(3)} ΔEOK`;
  /** [label, measured value, one sentence on what the number is]. */
  const rows: readonly [string, string, string][] = [
    [
      'Family anchor separation',
      why.familyAnchorSeparation.minimum === null
        ? 'Not measured'
        : `${delta(why.familyAnchorSeparation.minimum)} · needs at least ${why.familyAnchorSeparation.threshold}`,
      'Distance between the closest family anchors; below the threshold they read as one.',
    ],
    [
      'Source-to-generated adjustment',
      why.meanSourceAdjustment === null
        ? 'Not measured'
        : `${delta(why.meanSourceAdjustment)} on average`,
      'Average distance generated anchors moved from their source.',
    ],
    [
      'Gamut-mapped steps',
      why.gamutMappedSteps === null
        ? 'Not measured'
        : `${why.gamutMappedSteps} of the Light and Dark steps`,
      'Steps mapped from outside sRGB to the nearest displayable color.',
    ],
    [
      'Required pairs passing',
      `${why.requiredPairs.passing} of ${why.requiredPairs.total}`,
      'Text and non-text pairs that meet their WCAG threshold.',
    ],
    [
      'Meaning roles in range',
      `${why.meaningRoles.inRange} of ${why.meaningRoles.total}`,
      'Roles whose hues fit their meaning bands, such as success, warning and error.',
    ],
    [
      'Sequential ramp evenness',
      why.sequentialAdjacentCoefficientOfVariation === null
        ? 'Not requested; source palette kept'
        : `${why.sequentialAdjacentCoefficientOfVariation.toFixed(3)} coefficient of variation`,
      'Variation in distances between neighbouring ramp colors; 0 is even.',
    ],
    [
      'Modeled chart separation',
      `${delta(chart.minimum)} · needs at least ${chart.threshold} · protan ${chart.protan.toFixed(3)} · deutan ${chart.deutan.toFixed(3)} · tritan ${chart.tritan.toFixed(3)} · typical ${chart.normal.toFixed(3)}`,
      'Minimum chart-color distance, overall and with simulated red-, green- and blue-weak vision.',
    ],
    [
      'Mean anchor separation',
      delta(why.meanAnchorSeparation),
      'Average distance across all family-anchor pairs; higher is more distinct.',
    ],
    [
      'Source continuity',
      why.sourceContinuity === null ? 'No governed source anchors' : delta(why.sourceContinuity),
      'Average distance to each anchor’s nearest source color; lower is closer.',
    ],
  ];
  return (
    <section data-teul-why aria-labelledby="teul-v2-why-title" style={panel(theme, 10, 14)}>
      <h3 id="teul-v2-why-title" style={heading(0, 13)}>
        Why this direction
      </h3>
      {paragraph(theme, 5, DELTA_E_OK_DEFINITION)}
      {(surfaces || chartOrder) && (
        <ul data-teul-why-facts style={{ ...bulletList, margin: '8px 0 0' }}>
          {surfaces ? <li data-teul-why-surfaces>{surfaces.statement}</li> : null}
          {chartOrder ? (
            <li data-teul-why-chart-order>
              {chartOrder.statement}
              {chartOrder.warnings.length > 0 ? (
                <ul data-teul-why-chart-order-warnings style={{ ...bulletList, margin: '4px 0 0' }}>
                  {chartOrder.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ) : null}
        </ul>
      )}
      <dl style={{ ...twoUp, gap: 8, margin: '10px 0 0' }}>
        {rows.map(([label, value, meaning]) => (
          <div key={label} style={card(theme)}>
            <dt style={boldLabel}>{label}</dt>
            <dd style={heading('3px 0 0', 12)}>{value}</dd>
            <dd style={para(theme, 2, 12, 1.4)}>{meaning}</dd>
          </div>
        ))}
      </dl>
      <h4 style={heading('12px 0 6px', 12)}>Basis</h4>
      <ul data-teul-basis-statements style={{ ...bulletList, ...noMargin }}>
        {listItems(why.basisStatements)}
      </ul>
      {why.meaningSources && why.meaningSources.length > 0 && (
        <>
          <h4 style={heading('12px 0 6px', 12)}>Where each meaning role comes from</h4>
          <ul data-teul-meaning-sources style={{ ...bulletList, ...noMargin }}>
            {[...new Set(why.meaningSources.map(item => item.statement))].map(statement => (
              <li key={statement}>{statement}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The proportion rule Teul honours, declared with the sources it compared; never inferred from the file. */
function ProportionRule({
  rule,
  theme,
}: {
  rule: ColorSystemReviewProportionRuleV2;
  theme: ReviewTheme;
}) {
  return (
    <section
      data-teul-proportion-rule
      aria-labelledby="teul-v2-proportion-title"
      style={panel(theme, 12, 16)}
    >
      <h3 id="teul-v2-proportion-title" style={heading(0, 17)}>
        How much of each
      </h3>
      {paragraph(theme, 8, rule.statement, 12, 1.5)}
      <dl style={{ ...twoUp, gap: 8, margin: '10px 0 0' }}>
        {rule.tiers.map(tier => (
          <div key={tier.tier} data-teul-proportion-tier={tier.tier} style={card(theme)}>
            <dt style={boldLabel}>
              {plainLabel(tier.tier)} · {tier.share}
            </dt>
            <dd style={para(theme, 3, 12, 1.4)}>{tier.roles.map(plainLabel).join(', ')}</dd>
          </div>
        ))}
      </dl>
      <p data-teul-proportion-note style={para(theme, 10)}>
        {rule.note} Authority: Teul policy default.
      </p>
      <h4 style={heading('10px 0 4px', 12)}>Sources compared</h4>
      {paragraph(theme, 0, rule.sourcesNote)}
      <ul data-teul-proportion-sources style={{ ...bulletList, margin: '4px 0 0' }}>
        {rule.sources.map(source => (
          <li key={source.label}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" style={{ color: theme.accent }}>
                {source.label}
              </a>
            ) : (
              source.label
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================
// p4-DE: owner-supplied spot color on the print sheet
// ============================================

/** The owner's draft for one family, kept as typed; Create trims the name. */
interface SpotDraft {
  system: ColorSystemBuilderV2OwnerSpotColorMessage['system'];
  name: string;
  finish: ColorSystemBuilderV2OwnerSpotColorMessage['finish'];
}

const EMPTY_SPOT_DRAFT: SpotDraft = { system: 'pantone', name: '', finish: 'none' };

/** The wire entry for a draft, or null while the name is empty or over the limit. */
function spotMessage(
  draft: SpotDraft | undefined
): ColorSystemBuilderV2OwnerSpotColorMessage | null {
  const name = draft?.name.trim() ?? '';
  if (
    !draft ||
    name.length === 0 ||
    name.length > COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2.maximumNameLength
  ) {
    return null;
  }
  return { system: draft.system, name, finish: draft.finish, source: 'owner-supplied' };
}

/** The advisories module's shape: an unstated finish is absent, not “none”. */
function ownerSuppliedSpot(
  spot: ColorSystemBuilderV2OwnerSpotColorMessage
): OwnerSuppliedSpotColor {
  return {
    system: spot.system,
    name: spot.name,
    ...(spot.finish === 'none' ? {} : { finish: spot.finish }),
    source: 'owner-supplied',
  };
}

type FamilySurfaces = ColorSystemReviewBrandSurfacesV2['families'][number];

/** Only families that travel to print or out-of-home take a spot reference. */
function carriesBrandSurface(family: FamilySurfaces | undefined): boolean {
  return Boolean(
    family?.surfaces.some(surface => surface === 'print' || surface === 'out-of-home')
  );
}

/** The Create request's map for one direction: valid drafts of its brand-surface families. */
function ownerSpotColorsFor(
  model: ColorSystemReviewModelV2,
  drafts: Readonly<Record<string, SpotDraft>>
): ColorSystemBuilderV2OwnerSpotColorsMessage | null {
  const entries: [string, ColorSystemBuilderV2OwnerSpotColorMessage][] = [];
  for (const family of model.brandSurfaces?.families ?? []) {
    if (!carriesBrandSurface(family)) continue;
    const spot = spotMessage(drafts[family.id]);
    if (spot) entries.push([family.id, spot]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function SpotField({
  familyId,
  familyName,
  draft,
  onChange,
  disabled,
  theme,
}: {
  familyId: string;
  familyName: string;
  draft: SpotDraft;
  /** Patches merge against the latest draft in state, so two edits before a re-render both survive. */
  onChange: (familyId: string, patch: Partial<SpotDraft>) => void;
  disabled: boolean;
  theme: ReviewTheme;
}) {
  const control: Sty = {
    ...shrinkable,
    padding: '3px 5px',
    ...roundedChip,
    border: hairline(theme),
    background: theme.panel,
    color: theme.text,
    ...smallText,
  };
  const update = (patch: Partial<SpotDraft>) => onChange(familyId, patch);
  return (
    <fieldset
      data-teul-spot-field={familyId}
      disabled={disabled}
      style={{
        margin: '7px 0 0',
        padding: '5px 7px 7px',
        border: hairline(theme),
        ...roundedSwatch,
      }}
    >
      <legend style={{ padding: '0 4px', ...smallText, ...boldText }}>
        Spot color · owner-supplied
      </legend>
      <div
        style={{
          ...gridDisplay,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 5,
        }}
      >
        <select
          aria-label={`Spot system for ${familyName}`}
          value={draft.system}
          onChange={event =>
            update({ system: event.target.value === 'other' ? 'other' : 'pantone' })
          }
          style={control}
        >
          <option value="pantone">Pantone</option>
          <option value="other">Other</option>
        </select>
        <select
          aria-label={`Spot finish for ${familyName}`}
          value={draft.finish}
          onChange={event =>
            update({
              finish:
                event.target.value === 'coated'
                  ? 'coated'
                  : event.target.value === 'uncoated'
                    ? 'uncoated'
                    : 'none',
            })
          }
          style={control}
        >
          <option value="none">Not stated</option>
          <option value="coated">Coated</option>
          <option value="uncoated">Uncoated</option>
        </select>
        <input
          aria-label={`Spot color name for ${familyName}`}
          type="text"
          value={draft.name}
          maxLength={COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2.maximumNameLength}
          placeholder="From your print standard"
          onChange={event => update({ name: event.target.value })}
          style={{ ...control, gridColumn: '1 / -1' }}
        />
      </div>
      {mutedNote(
        theme,
        'Create adds this to Variable descriptions. Teul does not look up spot references.',
        4
      )}
    </fieldset>
  );
}

/** One family's print triplet; a valid draft re-runs the triplet so the spot becomes canonical. */
function PrintTripletCard({
  triplet,
  name,
  family,
  draft,
  onDraft,
  disabled,
  theme,
}: {
  triplet: ColorSystemReviewPrintTripletV2;
  /** p6: the plain UI name of the family; the triplet's data name is unchanged. */
  name: string;
  family: FamilySurfaces | undefined;
  draft: SpotDraft | undefined;
  onDraft: (familyId: string, patch: Partial<SpotDraft>) => void;
  disabled: boolean;
  theme: ReviewTheme;
}) {
  const supplied = spotMessage(draft);
  const live = supplied ? printTriplet(triplet.screenHex, ownerSuppliedSpot(supplied)) : null;
  const canonical = live ? live.canonical : triplet.canonical;
  const spot = live ? live.spot : triplet.spot;
  const line: Sty = blockDisplay;
  return (
    <li
      data-teul-print-triplet={triplet.colorId}
      data-teul-print-canonical={canonical}
      style={{ ...card(theme), ...smallText, ...readableLine }}
    >
      <span
        role="img"
        aria-label={`${name} ${triplet.screenHex}`}
        style={{ ...line, height: 22, ...roundedChip, background: triplet.screenHex }}
      />
      <strong style={{ ...line, marginTop: 5, ...smallText }}>{name}</strong>
      <span style={line}>
        Screen {triplet.screenHex}
        {canonical === 'screen' ? ' (canonical)' : ''}
      </span>
      <span style={line}>
        {`CMYK estimate C${triplet.cmyk.c} M${triplet.cmyk.m} Y${triplet.cmyk.y} K${triplet.cmyk.k} · total ink ${triplet.cmyk.totalInk}%`}
      </span>
      <span style={{ ...line, color: theme.muted }}>
        {spot
          ? `Spot color: ${colorSystemOwnerSpotColorLabelV2(spot)}${spot.finish ? ` (${spot.finish})` : ''} · owner-supplied and canonical`
          : 'Spot color: not supplied (owner-provided only)'}
      </span>
      {live && (
        <span data-teul-print-note style={{ ...line, marginTop: 3 }}>
          {live.note}
        </span>
      )}
      {carriesBrandSurface(family) && (
        <SpotField
          familyId={triplet.colorId}
          familyName={name}
          draft={draft ?? EMPTY_SPOT_DRAFT}
          onChange={onDraft}
          disabled={disabled}
          theme={theme}
        />
      )}
    </li>
  );
}

// ============================================
// p4-DE: marketing and out-of-home preview boards
// ============================================

interface BoardToken {
  label: string;
  token: string;
  color: ColorSystemReviewColorV2;
  /** Replaces “token · hex” in the chip when a range is described. */
  detail?: string;
}

interface BoardPalette {
  ground: BoardToken;
  text: BoardToken;
  primary: BoardToken;
  onPrimary: BoardToken;
  accent: BoardToken;
  body: BoardToken;
  footer: { label: string; colors: readonly ColorSystemReviewColorV2[] };
}

/** The family's anchor member in `mode`: the member whose Light value is the recorded anchor, else its first member. */
function familyColorInMode(
  family: ColorSystemReviewFamilyV2,
  mode: string
): ColorSystemReviewColorV2 | null {
  const anchorId = family.anchorHex
    ? family.colors.find(color => color.mode === 'Light' && color.hex === family.anchorHex)?.id
    : undefined;
  return (
    family.colors.find(
      color => color.mode === mode && (anchorId === undefined || color.id === anchorId)
    ) ??
    family.colors.find(color => color.mode === mode) ??
    null
  );
}

/**
 * Resolves one mode's board tokens from the review alone. The ground, text,
 * primary and on-primary are the resolved product roles; the tag is the leading
 * accent family's anchor; body copy is the supporting-text pair; the footer is
 * the neutral ramp. Null until the review carries resolved roles.
 */
function boardPalette(model: ColorSystemReviewModelV2, mode: string): BoardPalette | null {
  const roles = model.semanticRoles ?? [];
  const role = (
    name: ColorSystemReviewSemanticRoleV2['role'],
    label: string
  ): BoardToken | null => {
    const found = roles.find(item => item.mode === mode && item.role === name);
    return found ? { label, token: found.tokenName, color: found.color } : null;
  };
  const ground = role('background', 'Ground');
  const text = role('text', 'Headline');
  const primary = role('selected', 'Call to action');
  const onPrimary = role('on-selected', 'Text on the call to action');
  if (!ground || !text || !primary || !onPrimary) return null;
  const accentFamily =
    model.families.find(family => family.prominence === 'leading' && family.kind !== 'neutral') ??
    model.families.find(family => family.kind === 'accent') ??
    null;
  const accentColor = accentFamily ? familyColorInMode(accentFamily, mode) : null;
  const accent: BoardToken =
    accentFamily && accentColor
      ? {
          label: 'Tag · leading accent',
          // Member names usually begin with the family name (“Sky 9”); print it once.
          token: accentColor.name.startsWith(accentFamily.name)
            ? accentColor.name
            : `${accentFamily.name} / ${accentColor.name}`,
          color: accentColor,
        }
      : { ...(role('link', 'Tag') ?? primary), label: 'Tag · link role' };
  const supporting = model.sections
    .flatMap(section => section.textPairs ?? [])
    .find(pair => pair.mode === mode && pair.useCategory === 'supporting-body')?.foreground;
  const body: BoardToken = supporting
    ? { label: 'Body copy · supporting text', token: supporting.name, color: supporting }
    : { ...text, label: 'Body copy · text role' };
  const neutral = model.families.find(family => family.kind === 'neutral');
  const neutralColors = neutral ? neutral.colors.filter(color => color.mode === mode) : [];
  const surface = role('surface', 'Footer') ?? ground;
  const border = role('border', 'Footer') ?? text;
  const footer =
    neutral && neutralColors.length > 0
      ? {
          label: `Footer · neutral ramp ${neutral.name}, ${neutralColors.length} steps`,
          colors: neutralColors,
        }
      : {
          label: `Footer · ${surface.token} and ${border.token}`,
          colors: [surface.color, border.color],
        };
  return { ground, text, primary, onPrimary, accent, body, footer };
}

function footerChip(footer: BoardPalette['footer']): BoardToken {
  const first = footer.colors[0];
  const last = footer.colors[footer.colors.length - 1];
  return {
    label: footer.label,
    token: first.name,
    color: first,
    detail: `${first.name} ${displayHex(first)} to ${last.name} ${displayHex(last)}`,
  };
}

function TokenChips({
  label,
  tokens,
  theme,
}: {
  label: string;
  tokens: readonly BoardToken[];
  theme: ReviewTheme;
}) {
  return (
    <ul
      aria-label={label}
      style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', ...gridDisplay, gap: 3 }}
    >
      {tokens.map(token => (
        <li
          key={`${token.label}:${token.token}:${token.color.hex}`}
          data-teul-preview-chip={token.token}
          style={{ ...flexDisplay, gap: 6, alignItems: 'center', ...smallText, lineHeight: 1.4 }}
        >
          <span
            role="img"
            aria-label={`${token.token} ${displayHex(token.color)}`}
            style={{
              flexShrink: 0,
              width: 12,
              height: 12,
              borderRadius: 3,
              border: hairline(theme),
              background: paintColor(token.color),
            }}
          />
          <span style={{ ...shrinkable, ...wrapAnywhere }}>
            {token.detail ?? `${token.label} · ${token.token} · ${displayHex(token.color)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A hero, one call to action in the primary, a tag, body copy and a neutral footer; the primary's area is measured, not assumed. */
function MarketingBoard({
  mode,
  model,
  theme,
}: {
  mode: string;
  model: ColorSystemReviewModelV2;
  theme: ReviewTheme;
}) {
  const palette = boardPalette(model, mode);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const ctaRef = React.useRef<HTMLSpanElement>(null);
  const [share, setShare] = React.useState<number | null>(null);
  const groundHex = palette?.ground.color.hex;
  const primaryHex = palette?.primary.color.hex;
  React.useLayoutEffect(() => {
    const measure = () => {
      const board = boardRef.current?.getBoundingClientRect();
      const cta = ctaRef.current?.getBoundingClientRect();
      const area = board ? board.width * board.height : 0;
      setShare(area > 0 && cta ? Math.round(((cta.width * cta.height) / area) * 1000) / 10 : null);
    };
    measure();
    const board = boardRef.current;
    if (typeof ResizeObserver === 'undefined' || !board) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [groundHex, primaryHex]);
  if (!palette) return null;
  const declaredShare =
    model.proportionRule?.tiers.find(tier => tier.tier === 'brand primary')?.share ?? null;
  return (
    <figure
      data-teul-preview-board="marketing"
      data-teul-mode={mode}
      style={{ ...noMargin, ...shrinkable }}
    >
      <figcaption style={boldLabel}>{plainLabel(mode)}</figcaption>
      <div
        ref={boardRef}
        data-teul-preview-ground
        data-teul-preview-hex={palette.ground.color.hex}
        style={{
          marginTop: 6,
          ...roundedCard,
          ...clipped,
          border: hairline(theme),
          background: paintColor(palette.ground.color),
        }}
      >
        <div style={{ padding: '14px 14px 16px' }}>
          <span
            data-teul-preview-tag
            data-teul-preview-hex={palette.accent.color.hex}
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 999,
              border: `1px solid ${paintColor(palette.accent.color)}`,
              color: paintColor(palette.accent.color),
              ...smallText,
              ...boldText,
            }}
          >
            Tag in the leading accent
          </span>
          <p
            data-teul-preview-headline
            style={{
              margin: '10px 0 0',
              color: paintColor(palette.text.color),
              fontSize: 20,
              ...heavyText,
              lineHeight: 1.15,
            }}
          >
            A headline in the text color
          </p>
          <p
            data-teul-preview-body
            style={{
              margin: '8px 0 0',
              color: paintColor(palette.body.color),
              ...smallText,
              ...openLine,
            }}
          >
            Supporting body text. Primary appears once, in the call to action; the ground uses a
            separate color.
          </p>
          <span
            ref={ctaRef}
            data-teul-preview-cta
            data-teul-preview-hex={palette.primary.color.hex}
            style={{
              display: 'inline-block',
              ...contentSpace,
              padding: '8px 14px',
              ...roundedSwatch,
              background: paintColor(palette.primary.color),
              color: paintColor(palette.onPrimary.color),
              ...smallText,
              ...heavyText,
            }}
          >
            Call to action
          </span>
        </div>
        <div
          data-teul-preview-footer
          role="img"
          aria-label={palette.footer.label}
          style={{ ...flexDisplay, height: 22 }}
        >
          {palette.footer.colors.map((color, index) => (
            <span key={`${color.id}:${index}`} style={{ flex: 1, background: paintColor(color) }} />
          ))}
        </div>
      </div>
      <p
        data-teul-preview-share
        data-teul-preview-share-value={share === null ? '' : String(share)}
        style={para(theme, 6)}
      >
        {share === null
          ? 'Primary area: not measured in this view.'
          : `Primary area: ${share} % of the board, measured from the rendered call to action · declared share ${declaredShare ?? 'not declared'}.`}
      </p>
      <TokenChips
        label={`${plainLabel(mode)} marketing tokens`}
        tokens={[
          palette.ground,
          palette.text,
          palette.primary,
          palette.onPrimary,
          palette.accent,
          palette.body,
          footerChip(palette.footer),
        ]}
        theme={theme}
      />
    </figure>
  );
}

/** A 3:1 board: one line in the text color on the ground, one in the on-color on the primary, each with its out-of-home checks. */
function OutOfHomeBoard({
  mode,
  model,
  theme,
}: {
  mode: string;
  model: ColorSystemReviewModelV2;
  theme: ReviewTheme;
}) {
  const palette = boardPalette(model, mode);
  if (!palette) return null;
  const lines = [
    {
      key: 'text',
      copy: 'Type on the ground',
      foreground: palette.text,
      background: palette.ground,
    },
    {
      key: 'primary',
      copy: 'Type on the primary',
      foreground: palette.onPrimary,
      background: palette.primary,
    },
  ] as const;
  return (
    <figure
      data-teul-preview-board="out-of-home"
      data-teul-mode={mode}
      style={{ ...noMargin, ...shrinkable }}
    >
      <figcaption style={boldLabel}>{plainLabel(mode)}</figcaption>
      <div
        style={{
          ...gridDisplay,
          gridTemplateRows: '1fr 1fr',
          // Height follows the column width; a min-height would transfer through the ratio
          // into a min-width and push the board past a narrow column.
          aspectRatio: '3 / 1',
          ...shrinkable,
          marginTop: 6,
          ...roundedCard,
          ...clipped,
          border: hairline(theme),
        }}
      >
        {lines.map(line => (
          <div
            key={line.key}
            data-teul-preview-ooh-line={line.key}
            data-teul-preview-fg={line.foreground.color.hex}
            data-teul-preview-bg={line.background.color.hex}
            style={{
              ...flexDisplay,
              alignItems: 'center',
              // Grid items default to min-width auto; without 0 the nowrap line widens the track.
              ...shrinkable,
              padding: '0 14px',
              background: paintColor(line.background.color),
              color: paintColor(line.foreground.color),
              fontSize: 18,
              ...heavyText,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              ...clipped,
              textOverflow: 'ellipsis',
            }}
          >
            {line.copy}
          </div>
        ))}
      </div>
      <ul
        aria-label={`${plainLabel(mode)} out-of-home checks`}
        style={{
          margin: '6px 0 0',
          padding: 0,
          listStyle: 'none',
          ...gridDisplay,
          gap: 5,
          ...shrinkable,
          // Advisory codes are single unbreakable words; let them wrap inside a narrow column.
          ...wrapAnywhere,
        }}
      >
        {lines.map(line => {
          const findings = outOfHomeTextAdvisory(
            line.foreground.color.hex,
            line.background.color.hex
          );
          const ratio =
            findings
              .map(finding => finding.evidence.ratio)
              .find((value): value is number => typeof value === 'number') ?? null;
          return (
            <li
              key={line.key}
              data-teul-preview-ooh-check={line.key}
              data-teul-preview-ooh-ratio={ratio === null ? '' : String(ratio)}
              style={{ ...smallText, ...readableLine }}
            >
              <strong>
                {line.foreground.token} on {line.background.token}
                {ratio === null ? '' : ` · ${ratio}:1`}
              </strong>
              {findings.map(finding => (
                <span
                  key={finding.code}
                  data-teul-preview-ooh-code={finding.code}
                  style={{
                    ...blockDisplay,
                    marginTop: 2,
                    color: finding.severity === 'warning' ? theme.warning : theme.muted,
                  }}
                >
                  {finding.severity === 'warning' ? 'Warning' : 'Note'} · {finding.code} ·{' '}
                  {finding.message}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function PreviewBoards({ model, theme }: { model: ColorSystemReviewModelV2; theme: ReviewTheme }) {
  const roles = model.semanticRoles ?? [];
  const modes = orderedModes(roles.map(role => role.color)).filter(
    mode => boardPalette(model, mode) !== null
  );
  if (modes.length === 0) return null;
  // Two boards must share the 428px the panel leaves at the plugin's 560px width:
  // 2 × 200 + a 10px gap fits, where the review's 210px two-up grid falls 2px short.
  const boardsGrid: Sty = {
    ...gridDisplay,
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 10,
  };
  return (
    <section
      data-teul-preview-boards
      aria-labelledby="teul-v2-preview-boards-title"
      style={panel(theme, 12, 16)}
    >
      <h3 id="teul-v2-preview-boards-title" style={heading(0, 17)}>
        Preview boards
      </h3>
      {paragraph(
        theme,
        8,
        'Uses only this review’s resolved tokens; chips name each token and hex. Out-of-home uses the Brand surfaces checks.',
        12,
        1.5
      )}
      <h4 style={heading('12px 0 6px', 13)}>Marketing</h4>
      <div style={boardsGrid}>
        {modes.map(mode => (
          <MarketingBoard key={mode} mode={mode} model={model} theme={theme} />
        ))}
      </div>
      <h4 style={heading('14px 0 6px', 13)}>Out-of-home · 3:1</h4>
      <div style={boardsGrid}>
        {modes.map(mode => (
          <OutOfHomeBoard key={mode} mode={mode} model={model} theme={theme} />
        ))}
      </div>
    </section>
  );
}

function BrandSurfaces({
  surfaces,
  names,
  spotDrafts,
  onSpotDraft,
  disabled,
  theme,
}: {
  surfaces: ColorSystemReviewBrandSurfacesV2;
  /** p6: plain family names; the advisory data keeps its own. */
  names: FamilyNames;
  /** p4-DE: owner-typed spot references keyed by family id. */
  spotDrafts: Readonly<Record<string, SpotDraft>>;
  onSpotDraft: (familyId: string, patch: Partial<SpotDraft>) => void;
  disabled: boolean;
  theme: ReviewTheme;
}) {
  const advisories = surfaces.advisories.filter(advisory => advisory.code !== 'PRINT_TRIPLET');
  const pill: Sty = {
    padding: '2px 7px',
    borderRadius: 999,
    border: hairline(theme),
    ...smallText,
  };
  const line: Sty = blockDisplay;
  return (
    <section
      data-teul-brand-surfaces
      aria-labelledby="teul-v2-brand-surfaces-title"
      style={panel(theme, 12, 16)}
    >
      <h3 id="teul-v2-brand-surfaces-title" style={heading(0, 17)}>
        Brand surfaces
      </h3>
      {paragraph(theme, 8, 'Family uses and checks for print review.', 12, 1.5)}
      <ul aria-label="Family surfaces" style={{ ...listGrid(6), ...contentSpace }}>
        {surfaces.families.map(family => (
          <li
            key={family.id}
            data-teul-family-surfaces={family.id}
            style={{
              ...flexDisplay,
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              ...smallText,
            }}
          >
            <span
              role="img"
              aria-label={`${plainFamilyName(names, family)} ${family.hex}`}
              style={{ width: 14, height: 14, borderRadius: 3, background: family.hex }}
            />
            <strong>{plainFamilyName(names, family)}</strong>
            {family.surfaces.length === 0 ? (
              <span style={{ color: theme.muted }}>No surface assigned yet</span>
            ) : (
              family.surfaces.map(surface => (
                <span key={surface} style={pill}>
                  {SURFACE_LABELS[surface]}
                </span>
              ))
            )}
          </li>
        ))}
      </ul>
      {surfaces.surfaces.map(surface => {
        const items = advisories.filter(advisory => advisory.surface === surface);
        if (items.length === 0) return null;
        return (
          <div key={surface} style={contentSpace}>
            <h4 style={heading('0 0 6px', 13)}>{SURFACE_LABELS[surface]}</h4>
            <ul aria-label={`${SURFACE_LABELS[surface]} advisories`} style={listGrid(6)}>
              {items.map((advisory, index) => {
                const warning = advisory.severity === 'warning';
                return (
                  <li
                    key={`${advisory.id}:${advisory.code}:${index}`}
                    data-teul-advisory-code={advisory.code}
                    style={{
                      ...card(theme),
                      borderLeft: `3px solid ${warning ? theme.warning : theme.border}`,
                    }}
                  >
                    <span
                      style={{
                        ...note(theme),
                        color: warning ? theme.warning : theme.muted,
                        ...boldText,
                      }}
                    >
                      {warning ? 'Warning' : 'Note'} · {advisory.code}
                    </span>
                    <span style={{ ...line, marginTop: 3, ...smallText, ...readableLine }}>
                      {advisory.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {surfaces.printTriplets.length > 0 && (
        <div style={contentSpace}>
          <h4 style={heading('0 0 4px', 13)}>Print triplets</h4>
          <p data-teul-cmyk-disclaimer style={para(theme, 0)}>
            {surfaces.cmykDisclaimer}
          </p>
          {paragraph(
            theme,
            6,
            'For print and out-of-home, enter a spot reference below to make it canonical here and in created Variables.'
          )}
          <ul aria-label="Print triplets" style={{ ...listGrid(8, 150), marginTop: 8 }}>
            {surfaces.printTriplets.map(triplet => (
              <PrintTripletCard
                key={triplet.colorId}
                triplet={triplet}
                name={plainFamilyName(names, { id: triplet.colorId, name: triplet.name })}
                family={surfaces.families.find(family => family.id === triplet.colorId)}
                draft={spotDrafts[triplet.colorId]}
                onDraft={onSpotDraft}
                disabled={disabled}
                theme={theme}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ============================================
// p6: the recommendation screen — the system grouped by use
// ============================================

const ORIGIN_LABEL: Readonly<Record<ColorSystemReviewSystemOriginV2, string>> = {
  'kept-exactly': 'Kept exactly',
  new: 'New',
  'from-brand': 'From your brand',
};

/** Light and Dark side by side when they differ; one swatch when the value is the same in every mode. */
function CardPart({
  name,
  part,
  labelled,
  theme,
}: {
  name: string;
  part: ColorSystemReviewSystemPartV2;
  labelled: boolean;
  theme: ReviewTheme;
}) {
  const same = part.values.every(value => paintColor(value) === paintColor(part.values[0]));
  const swatches =
    same && part.values.length > 1
      ? [{ ...part.values[0], modes: part.values.map(value => value.mode).join(' and ') }]
      : part.values.map(value => ({ ...value, modes: value.mode }));
  return (
    <div data-teul-part={part.label}>
      {labelled && <span style={blockBoldLabel}>{part.label}</span>}
      <div
        style={{
          ...gridDisplay,
          gridTemplateColumns: `repeat(${swatches.length}, minmax(0, 1fr))`,
          gap: 6,
          marginTop: labelled ? 3 : 0,
        }}
      >
        {swatches.map(swatch => (
          <div key={swatch.modes} style={shrinkable}>
            <span
              role="img"
              aria-label={`${name}${labelled ? `, ${part.label}` : ''}, ${swatch.modes}, ${displayHex(swatch)}`}
              style={swatchFrame(theme, paintColor(swatch))}
            />
            <span style={{ ...note(theme, 3), ...wrapAnywhere }}>
              {swatch.modes} {displayHex(swatch)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One color, one card: a plain name, a written tag, large swatches, one “Used for:” line. */
function SystemCard({ item, theme }: { item: ColorSystemReviewSystemCardV2; theme: ReviewTheme }) {
  const labelled = item.parts.length > 1;
  return (
    <li
      data-teul-card={item.id}
      style={{ ...card(theme, 10), ...shrinkable, border: hairline(theme) }}
    >
      <div style={splitHeading}>
        <strong style={cardName}>{item.name}</strong>
        {item.origin && (
          <span
            data-teul-origin={item.origin}
            style={tagStyle(theme, item.origin === 'kept-exactly' ? theme.positive : theme.muted)}
          >
            {ORIGIN_LABEL[item.origin]}
          </span>
        )}
      </div>
      <div style={gridSpace(7, 8)}>
        {item.parts.map(part => (
          <CardPart
            key={part.label}
            name={item.name}
            part={part}
            labelled={labelled}
            theme={theme}
          />
        ))}
      </div>
      <p style={para(theme, 8, 12, 1.45)}>
        <strong style={{ color: theme.text }}>Used for:</strong> {item.usedFor}
      </p>
    </li>
  );
}

function CardGroup({
  id,
  title,
  cards,
  theme,
}: {
  id: string;
  title: string;
  cards: readonly ColorSystemReviewSystemCardV2[];
  theme: ReviewTheme;
}) {
  if (cards.length === 0) return null;
  return (
    <section data-teul-group={id} aria-labelledby={`teul-group-${id}`} style={groupSpace}>
      <h3 id={`teul-group-${id}`} style={groupHeading}>
        {title}
      </h3>
      {/* Two columns in the 460 px the plugin leaves inside the review's padding: 2 × 210 + 10. */}
      <ul style={{ ...listGrid(10, 210), marginTop: 8 }}>
        {cards.map(item => (
          <SystemCard key={item.id} item={item} theme={theme} />
        ))}
      </ul>
    </section>
  );
}

/** Numbered categorical swatches, then the sequential and diverging ramps as one strip each. */
function ChartsGroup({
  model,
  capacity,
  theme,
}: {
  model: ColorSystemReviewModelV2;
  capacity: string | null;
  theme: ReviewTheme;
}) {
  const specimens = model.sections.find(
    section => section.role === 'data-visualization'
  )?.visualizationSpecimens;
  if (!specimens) return null;
  const strip = (
    kind: 'sequential' | 'diverging',
    label: string,
    marks: readonly ColorSystemReviewVisualizationMarkV2[],
    surface: ColorSystemReviewColorV2
  ) => (
    <div data-teul-chart-strip={kind} style={shrinkable}>
      <span style={blockBoldLabel}>{label}</span>
      <div
        role="img"
        aria-label={`${label} ramp: ${marks.map(mark => displayHex(mark.color, mark.renderedHex)).join(', ')}`}
        style={{
          ...swatchFrame(theme, theme.raised),
          ...flexDisplay,
          marginTop: 4,
          ...clipped,
        }}
      >
        {marks.map(mark => (
          <span key={mark.order} style={{ flex: 1, background: chartPaint(mark, surface) }} />
        ))}
      </div>
      <span style={{ ...note(theme, 3), ...wrapAnywhere }}>
        {marks.map(mark => displayHex(mark.color, mark.renderedHex)).join(' · ')}
      </span>
      <ChartLegend kind={kind} marks={marks} surface={surface} theme={theme} />
    </div>
  );
  return (
    <section data-teul-group="charts" aria-labelledby="teul-group-charts" style={groupSpace}>
      <h3 id="teul-group-charts" style={groupHeading}>
        Charts
      </h3>
      <ol
        data-teul-chart-series
        aria-label="Categorical series in order"
        style={{ ...listGrid(8, 86), marginTop: 8 }}
      >
        {specimens.categorical.marks.map(mark => (
          <li key={mark.order} data-teul-chart-series-item={mark.order} style={shrinkable}>
            <span
              role="img"
              aria-label={`Series ${mark.order}, ${displayHex(mark.color, mark.renderedHex)}`}
              style={swatchFrame(theme, chartPaint(mark, specimens.categorical.surface))}
            />
            <strong style={blockValue}>Series {mark.order}</strong>
            <span style={{ ...note(theme, 1), ...wrapAnywhere }}>
              {displayHex(mark.color, mark.renderedHex)}
            </span>
          </li>
        ))}
      </ol>
      <ChartLegend {...specimens.categorical} theme={theme} />
      <div style={{ ...twoUp, gap: 10, marginTop: 10 }}>
        {specimens.sequential &&
          strip(
            'sequential',
            'Sequential',
            specimens.sequential.marks,
            specimens.sequential.surface
          )}
        {specimens.diverging &&
          strip('diverging', 'Diverging', specimens.diverging.marks, specimens.diverging.surface)}
      </div>
      {!specimens.sequential || !specimens.diverging
        ? paragraph(
            theme,
            8,
            'Source palette kept. Unrequested chart examples are omitted.',
            12,
            1.45
          )
        : null}
      {capacity && (
        <p data-teul-chart-capacity style={para(theme, 8, 12, 1.45)}>
          {capacity}
        </p>
      )}
    </section>
  );
}

/** One compact row per other direction; choosing one shows it in place of the current direction. */
function AlsoConsidered({
  others,
  recommendedDirectionId,
  onSelectDirection,
  creating,
  theme,
}: {
  others: readonly ColorSystemReviewModelV2[];
  recommendedDirectionId: string;
  onSelectDirection: (directionId: string) => void;
  creating: boolean;
  theme: ReviewTheme;
}) {
  return (
    <fieldset
      data-teul-also-considered
      style={{
        margin: '18px 0 0',
        padding: '4px 12px 12px',
        border: hairline(theme),
        borderRadius: 10,
        ...shrinkable,
      }}
    >
      <legend style={{ padding: '0 5px', fontSize: 15, ...boldText }}>Also considered</legend>
      {paragraph(theme, 4, 'Select one to show it in place of the current direction.')}
      <div style={gridSpace(10, 10)}>
        {others.map(model => {
          const accents = model.families.filter(family => family.kind === 'accent');
          const id = `teul-v2-direction-${model.directionId}`;
          return (
            <label
              key={model.directionId}
              htmlFor={id}
              data-teul-direction-option={model.directionId}
              style={{
                ...gridDisplay,
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                gap: 9,
                alignItems: 'start',
                cursor: creating ? 'default' : 'pointer',
              }}
            >
              <input
                id={id}
                type="radio"
                name="teul-v2-color-system-direction"
                value={model.directionId}
                checked={false}
                onChange={() => onSelectDirection(model.directionId)}
                disabled={creating}
                style={{ margin: '2px 0 0', accentColor: theme.accent }}
              />
              <span style={shrinkable}>
                <span style={{ ...flexDisplay, gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={cardName}>{model.directionLabel}</strong>
                  {model.directionId === recommendedDirectionId && (
                    <span style={tagStyle(theme, theme.positive)}>Recommended</span>
                  )}
                </span>
                <AnchorStrip
                  families={accents.length > 0 ? accents : comparisonFamilies(model)}
                  names={familyNamesOf(model)}
                  label={`${model.directionLabel} accents`}
                  theme={theme}
                />
                {model.recommendedSystem
                  ? mutedNote(theme, model.recommendedSystem.alsoConsidered, 2)
                  : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Four sentences: what was kept, what was added and why, how the directions differ, what Teul did not do. */
function WhySystem({
  models,
  selected,
  recommended,
}: {
  models: readonly ColorSystemReviewModelV2[];
  selected: ColorSystemReviewModelV2;
  recommended: ColorSystemReviewModelV2;
}) {
  const system = selected.recommendedSystem;
  if (!system) return null;
  const differ =
    models.length > 1
      ? `New accent placement differs: ${models
          .map(
            model =>
              `${model.directionLabel} ${model.recommendedSystem?.accentPlacement ?? 'places them its own way'}`
          )
          .join(', ')}; Teul ranked ${recommended.directionLabel} first using the same checks.`
      : `Only ${selected.directionLabel} was ready; Teul used the same checks for measurement and ranking.`;
  return (
    <section data-teul-why-system aria-labelledby="teul-v2-why-system-title" style={groupSpace}>
      <h3 id="teul-v2-why-system-title" style={groupHeading}>
        Why this system
      </h3>
      <ol style={bulletList}>
        {[system.why.kept, system.why.added, differ, system.why.notDone].map(sentence => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ol>
    </section>
  );
}

/** Every direction side by side: family anchors, promise, best for, tradeoff and measures. Read-only. */
function ComparisonTable({
  models,
  selectedDirectionId,
  recommendedDirectionId,
  theme,
}: {
  models: readonly ColorSystemReviewModelV2[];
  selectedDirectionId: string;
  recommendedDirectionId: string;
  theme: ReviewTheme;
}) {
  return (
    <section
      data-teul-direction-comparison
      aria-labelledby="teul-v2-comparison-title"
      style={panel(theme, 12, 12)}
    >
      <h4 id="teul-v2-comparison-title" style={heading(0, 13)}>
        Directions compared
      </h4>
      <table
        data-teul-direction-table
        aria-label="Directions compared: family anchors, promise, and measures"
        style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', marginTop: 6 }}
      >
        <tbody>
          {models.slice(0, 3).map(model => {
            const showing = model.directionId === selectedDirectionId;
            return (
              <tr
                key={model.directionId}
                data-teul-direction-row={model.directionId}
                data-teul-selected={showing ? 'true' : 'false'}
                style={{
                  verticalAlign: 'top',
                  background: showing ? theme.selected : theme.raised,
                  outline: `1px solid ${showing ? theme.accent : theme.border}`,
                  ...roundedCard,
                }}
              >
                <th
                  scope="row"
                  style={{ width: 118, padding: 10, textAlign: 'left', fontWeight: 400 }}
                >
                  <strong style={{ color: theme.text, ...bodyText }}>{model.directionLabel}</strong>
                  {mutedNote(
                    theme,
                    `${model.directionId === recommendedDirectionId ? 'Teul recommendation' : 'Teul proposal'}${showing ? ' · showing' : ''}`,
                    6
                  )}
                </th>
                <td style={{ padding: 10, ...shrinkable }}>
                  <AnchorStrip
                    families={comparisonFamilies(model)}
                    names={familyNamesOf(model)}
                    label={`${model.directionLabel} family anchors`}
                    theme={theme}
                  />
                  <p style={{ ...para(theme, 7), color: theme.text }}>
                    {model.directionDecision.promise}
                  </p>
                  <p style={para(theme, 5)}>
                    <strong>Best for:</strong> {model.directionDecision.bestFor}{' '}
                    <strong>Tradeoff:</strong> {model.directionDecision.tradeoff}
                  </p>
                  {model.why && (
                    <p data-teul-direction-measures style={para(theme, 5)}>
                      {measuresLine(model.why)}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Everything that exists today, after the decision: ownership, what a Replace
 * plan did not carry, the comparison table, the Why block with its numbers, the
 * five sections with every 12-step strip and token path, the proportion rule,
 * brand surfaces with the owner’s spot fields, the preview boards, the limits,
 * and the technical fingerprints. Rendered only while Details is open.
 */
function DetailsBody({
  models,
  selected,
  recommendedDirectionId,
  names,
  spotDrafts,
  onSpotDraft,
  creating,
  theme,
}: {
  models: readonly ColorSystemReviewModelV2[];
  selected: ColorSystemReviewModelV2;
  recommendedDirectionId: string;
  names: FamilyNames;
  spotDrafts: Readonly<Record<string, SpotDraft>>;
  onSpotDraft: (familyId: string, patch: Partial<SpotDraft>) => void;
  creating: boolean;
  theme: ReviewTheme;
}) {
  const orderedSections = SECTION_ORDER.flatMap(role =>
    selected.sections.filter(section => section.role === role)
  );
  /** Every pair the review shows, with its WCAG ratio and supplementary APCA Lc. */
  const pairReadings = [
    ...selected.sections.flatMap(section =>
      (section.productGraphicsSpecimens ?? []).flatMap(specimen =>
        specimen.contrast && specimen.contrast.apcaLc !== undefined
          ? [
              {
                id: specimen.derivationId,
                label: `${plainLabel(specimen.job)} · ${plainLabel(specimen.mode)}`,
                ratio: specimen.contrast.ratio,
                apcaLc: specimen.contrast.apcaLc,
              },
            ]
          : []
      )
    ),
    ...selected.sections.flatMap(section =>
      (section.textPairs ?? []).map(pair => ({
        id: pair.id,
        label: `${plainLabel(pair.useCategory)} · ${plainLabel(pair.mode)}`,
        ratio: pair.ratio,
        apcaLc: pair.apcaLc,
      }))
    ),
  ];
  return (
    <div data-teul-details-body style={{ ...contentSpace, color: theme.text }}>
      {paragraph(theme, 0, selected.summary, 12, 1.5)}
      <section
        data-teul-ownership-summary
        aria-label="Source ownership summary"
        style={{ ...panel(theme, 10, 12), ...twoUp, gap: 10 }}
      >
        {(
          [
            ['Primary stays locked', theme.positive, selected.unchanged],
            ['Teul proposes', theme.accent, selected.proposed],
          ] as const
        ).map(([title, color, items]) => (
          <div key={title}>
            <h4 style={{ ...noMargin, color, ...smallText }}>{title}</h4>
            <ul style={bulletList}>{listItems(items)}</ul>
          </div>
        ))}
      </section>

      {selected.replaced && (
        // p5-A: a Replace plan lists what it did not carry, so nothing disappears silently.
        <section
          data-teul-replaced-summary
          aria-labelledby="teul-v2-replaced-title"
          style={{ ...panel(theme, 10, 12), borderColor: theme.warning }}
        >
          <h4
            id="teul-v2-replaced-title"
            style={{ ...noMargin, color: theme.warning, ...smallText }}
          >
            Replaced, not carried
          </h4>
          <ul style={bulletList}>{listItems(selected.replaced.statements)}</ul>
          <ul style={{ ...bulletList, listStyle: 'none', paddingLeft: 0 }}>
            {selected.replaced.colors.map(color => (
              <li
                key={`${color.id}:${color.mode}`}
                style={{ ...flexDisplay, alignItems: 'center', gap: 6 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    flex: '0 0 12px',
                    borderRadius: 3,
                    background: paintColor(color),
                    border: hairline(theme),
                  }}
                />
                <span style={wrapValue}>
                  {color.name} · {color.mode} {displayHex(color)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {models.length > 1 && (
        <ComparisonTable
          models={models}
          selectedDirectionId={selected.directionId}
          recommendedDirectionId={recommendedDirectionId}
          theme={theme}
        />
      )}

      {selected.why && <WhyBlock why={selected.why} theme={theme} />}

      <div style={gridSpace(12, 12)}>
        {orderedSections.map(section => (
          <SectionReview
            key={section.role}
            section={section}
            model={selected}
            names={names}
            theme={theme}
          />
        ))}
      </div>

      {selected.proportionRule && <ProportionRule rule={selected.proportionRule} theme={theme} />}

      {selected.brandSurfaces && (
        <BrandSurfaces
          surfaces={selected.brandSurfaces}
          names={names}
          spotDrafts={spotDrafts}
          onSpotDraft={onSpotDraft}
          disabled={creating}
          theme={theme}
        />
      )}

      <PreviewBoards model={selected} theme={theme} />

      {selected.importantLimitations.length > 0 && (
        <aside
          aria-labelledby="teul-v2-review-limitations"
          style={{ ...panel(theme, 12, 12), borderColor: theme.warning }}
        >
          <h4 id="teul-v2-review-limitations" style={heading(0, 13)}>
            Important limits
          </h4>
          <ul style={bulletList}>{listItems(selected.importantLimitations)}</ul>
        </aside>
      )}

      <section
        data-teul-technical-details
        aria-labelledby="teul-v2-technical-title"
        style={{ ...panel(theme, 12, 12), color: theme.muted, ...smallText }}
      >
        <h4 id="teul-v2-technical-title" style={{ ...noMargin, color: theme.text, ...bodyText }}>
          Technical details
        </h4>
        {paragraph(theme, 4, 'Source, direction and review fingerprints; Create rechecks them.')}
        <dl
          style={{
            ...gridDisplay,
            gridTemplateColumns: 'max-content minmax(0, 1fr)',
            gap: '5px 10px',
            margin: '10px 0 0',
          }}
        >
          {(
            [
              ['Source', selected.technicalReceipt.sourceHash],
              ['Direction', selected.technicalReceipt.candidateHash],
              ['Application', selected.technicalReceipt.applicationBlueprintHash],
              ['Five-section', selected.technicalReceipt.sectionBlueprintHash],
              ['Review', selected.reviewModelHash],
            ] as const
          ).map(([label, hash]) => (
            <React.Fragment key={label}>
              <dt>{label} fingerprint</dt>
              <dd style={wrapValue}>{hash}</dd>
            </React.Fragment>
          ))}
        </dl>
        {pairReadings.length > 0 && (
          <div data-teul-pair-readings style={contentSpace}>
            <strong style={{ color: theme.text }}>
              Pair readings · the WCAG ratio is the gate; APCA Lc is supplementary
            </strong>
            <ul style={{ ...bulletList, color: theme.text }}>
              {pairReadings.map(reading => (
                <li key={reading.id}>
                  {`${reading.label} · WCAG ${reading.ratio === null ? 'not assessed' : `${reading.ratio.toFixed(2)}:1`} · APCA Lc (supplementary) ${reading.apcaLc === null ? 'not assessed' : reading.apcaLc.toFixed(1)}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

export function ColorSystemBuilderV2Review({
  models,
  recommendedDirectionId,
  selectedDirectionId,
  onSelectDirection,
  onCreate,
  creating,
  blocker,
  isDark = false,
}: ColorSystemBuilderV2ReviewProps) {
  // p6: one disclosure holds everything after the decision; its body mounts only while open.
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [currentFileAcknowledged, setCurrentFileAcknowledged] = React.useState(false);
  const [manualPublicationAcknowledged, setManualPublicationAcknowledged] = React.useState(false);
  // p4-DE: owner-typed spot references keyed by family id; ids are direction-specific.
  const [spotDrafts, setSpotDrafts] = React.useState<Readonly<Record<string, SpotDraft>>>({});
  // Merge against the latest state, never a render's closure: a system change followed by
  // typing before the next paint must keep both edits.
  const updateSpotDraft = React.useCallback((familyId: string, patch: Partial<SpotDraft>) => {
    setSpotDrafts(current => ({
      ...current,
      [familyId]: { ...(current[familyId] ?? EMPTY_SPOT_DRAFT), ...patch },
    }));
  }, []);
  const acknowledged = currentFileAcknowledged && manualPublicationAcknowledged;
  const theme = themeFor(isDark);
  const blockerMessage = blockerCopy(blocker);
  const modelCountInvalid = models.length > 3;
  const selected = models.find(model => model.directionId === selectedDirectionId) ?? null;
  const recommended =
    models.find(model => model.directionId === recommendedDirectionId) ?? models[0] ?? null;
  // p4-DE: the spot references that will ride the Create request for the selected direction.
  const ownerSpotColors = selected ? ownerSpotColorsFor(selected, spotDrafts) : null;

  if (models.length === 0 || !recommended) {
    return (
      <section
        aria-labelledby="teul-v2-review-empty-title"
        style={{ padding: 20, color: theme.text, background: theme.canvas }}
      >
        <h2 id="teul-v2-review-empty-title" style={heading(0, 18)}>
          No color-system directions are ready
        </h2>
        <p role="status" style={{ margin: '8px 0 0', color: theme.muted }}>
          Resolve the color and intent evidence, then analyze again.
        </p>
      </section>
    );
  }

  const system = selected?.recommendedSystem ?? null;
  const names = familyNamesOf(selected);
  const others = models.slice(0, 3).filter(model => model.directionId !== selected?.directionId);
  const showsRecommendation = !selected || selected.directionId === recommended.directionId;
  const invalidMessage = modelCountInvalid
    ? 'Teul can compare up to three complete directions.'
    : !selected
      ? 'Choose a direction before Create.'
      : null;
  const issueBlocked = Boolean(blockerMessage) || Boolean(invalidMessage);
  const createBlocked = creating || issueBlocked || !acknowledged;
  const createState = creating
    ? 'loading'
    : issueBlocked
      ? 'blocked'
      : !acknowledged
        ? 'awaiting-acknowledgement'
        : 'ready';
  const acknowledgementStyle: Sty = {
    ...flexDisplay,
    alignItems: 'flex-start',
    gap: 9,
    ...smallText,
    ...readableLine,
    cursor: creating ? 'default' : 'pointer',
  };
  const acknowledgementInputStyle: Sty = {
    flexShrink: 0,
    width: 16,
    height: 16,
    margin: '1px 0 0',
    accentColor: theme.accent,
  };
  const createDescriptionId = 'teul-v2-create-description';
  const createAlertId = blockerMessage
    ? 'teul-v2-review-blocker'
    : invalidMessage
      ? 'teul-v2-review-invalid'
      : null;

  return (
    <section
      className="teul-v2-review"
      aria-labelledby="teul-v2-review-title"
      aria-busy={creating}
      style={{
        minHeight: '100%',
        padding: 18,
        color: theme.text,
        background: theme.canvas,
        fontFamily: 'Inter, system-ui, sans-serif',
        colorScheme: isDark ? 'dark' : 'light',
      }}
    >
      <style>{`.teul-v2-review *{box-sizing:border-box}.teul-v2-review input:focus-visible,.teul-v2-review button:focus-visible,.teul-v2-review summary:focus-visible{outline:3px solid ${theme.accent};outline-offset:3px}`}</style>

      <header>
        <p
          style={{
            ...noMargin,
            color: theme.muted,
            ...smallText,
            ...boldText,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Recommended color system
        </p>
        <h2
          id="teul-v2-review-title"
          data-teul-recommendation
          style={{ margin: '5px 0 0', fontSize: 22, lineHeight: 1.2 }}
        >
          Teul recommends {recommended.directionLabel}.
        </h2>
        {system && (
          <p data-teul-system-summary style={{ margin: '8px 0 0', ...bodyText, ...openLine }}>
            {system.summary}
          </p>
        )}
        {selected && !showsRecommendation && (
          <p data-teul-showing style={para(theme, 6, 12, 1.5)}>
            {`Showing ${selected.directionLabel}. Select ${recommended.directionLabel} under Also considered to return to the recommendation.`}
          </p>
        )}
        <p data-teul-selected-direction-authority style={para(theme, 6)}>
          {showsRecommendation
            ? 'Teul recommendation · brand-owner approval still required'
            : `Selected Teul proposal · Teul recommends ${recommended.directionLabel} · brand-owner approval still required`}
        </p>
      </header>

      {selected && system && (
        <>
          <CardGroup id="brand" title="Brand & marketing" cards={system.brand} theme={theme} />
          <CardGroup id="product-ui" title="Product UI" cards={system.productUi} theme={theme} />
          <CardGroup id="status" title="Status" cards={system.status} theme={theme} />
        </>
      )}
      {selected && (
        <ChartsGroup model={selected} capacity={system?.chartCapacity ?? null} theme={theme} />
      )}

      {others.length > 0 && (
        <AlsoConsidered
          others={others}
          recommendedDirectionId={recommended.directionId}
          onSelectDirection={onSelectDirection}
          creating={creating}
          theme={theme}
        />
      )}

      {selected && <WhySystem models={models} selected={selected} recommended={recommended} />}

      {selected && (
        <details
          data-teul-details
          onToggle={event => setDetailsOpen(event.currentTarget.open)}
          style={{
            ...groupSpace,
            padding: '10px 12px',
            borderRadius: 10,
            border: hairline(theme),
          }}
        >
          <summary style={{ cursor: 'pointer', ...bodyText, ...boldText }}>
            Details
            <span style={{ marginLeft: 6, color: theme.muted, fontWeight: 400, ...smallText }}>
              comparison, measurements, all scales and token paths, brand surfaces, preview boards
            </span>
          </summary>
          {detailsOpen ? (
            <DetailsBody
              models={models}
              selected={selected}
              recommendedDirectionId={recommended.directionId}
              names={names}
              spotDrafts={spotDrafts}
              onSpotDraft={updateSpotDraft}
              creating={creating}
              theme={theme}
            />
          ) : null}
        </details>
      )}

      {blockerMessage ? (
        <div
          id="teul-v2-review-blocker"
          role="alert"
          style={{
            ...sectionSpace,
            padding: 12,
            ...roundedCard,
            color: theme.danger,
            border: `1px solid ${theme.danger}`,
          }}
        >
          <strong style={{ ...blockDisplay, ...bodyText }}>{blockerMessage.title}</strong>
          <span style={blockValue}>{blockerMessage.message}</span>
          {blockerMessage.reference && (
            <span data-teul-error-reference="true" style={note(theme, 6)}>
              Reference: {blockerMessage.reference}
            </span>
          )}
        </div>
      ) : (
        invalidMessage && (
          <div
            id="teul-v2-review-invalid"
            role="alert"
            style={{ ...sectionSpace, color: theme.danger, ...smallText }}
          >
            {invalidMessage}
          </div>
        )
      )}

      {selected && (
        <footer
          aria-label="Create reviewed color system"
          data-state={createState}
          style={{
            ...groupSpace,
            paddingTop: 16,
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <fieldset
            data-teul-create-acknowledgements
            style={{
              margin: '0 0 12px',
              padding: '10px 12px 12px',
              border: hairline(theme),
              ...roundedCard,
            }}
          >
            <legend style={{ padding: '0 5px', ...smallText, ...boldText }}>
              Before you create
            </legend>
            <div style={{ ...gridDisplay, gap: 8 }}>
              {(
                [
                  [
                    'current-file',
                    currentFileAcknowledged,
                    setCurrentFileAcknowledged,
                    CREATE_ACKNOWLEDGEMENT_COPY.currentFile,
                  ],
                  [
                    'manual-publication',
                    manualPublicationAcknowledged,
                    setManualPublicationAcknowledged,
                    CREATE_ACKNOWLEDGEMENT_COPY.manualPublication,
                  ],
                ] as const
              ).map(([id, checked, setChecked, copy]) => (
                <label key={id} htmlFor={`teul-v2-ack-${id}`} style={acknowledgementStyle}>
                  <input
                    id={`teul-v2-ack-${id}`}
                    type="checkbox"
                    checked={checked}
                    disabled={creating}
                    onChange={event => setChecked(event.target.checked)}
                    style={acknowledgementInputStyle}
                  />
                  <span>{copy}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => {
              if (createBlocked || !currentFileAcknowledged || !manualPublicationAcknowledged) {
                return;
              }
              const acknowledgements = {
                currentFileAcknowledged: true,
                manualPublicationAcknowledged: true,
              } as const;
              // p4-DE: the third argument travels only when a spot reference was typed.
              if (ownerSpotColors) onCreate(selected, acknowledgements, ownerSpotColors);
              else onCreate(selected, acknowledgements);
            }}
            disabled={createBlocked}
            aria-busy={creating}
            aria-describedby={
              createAlertId ? `${createDescriptionId} ${createAlertId}` : createDescriptionId
            }
            style={{
              width: '100%',
              minHeight: 44,
              padding: '10px 16px',
              border: 0,
              ...roundedCard,
              cursor: createBlocked ? 'not-allowed' : 'pointer',
              color: theme.accentText,
              background: createBlocked ? theme.muted : theme.accent,
              ...bodyText,
              ...heavyText,
            }}
          >
            {creating ? 'Creating system…' : 'Create this system'}
          </button>
          <p
            id={createDescriptionId}
            role="status"
            aria-live="polite"
            style={{ margin: '7px 0 0', color: theme.muted, textAlign: 'center', ...smallText }}
          >
            {creating
              ? 'Creating the reviewed system in the current Figma file.'
              : issueBlocked
                ? 'Resolve the issue above before Create.'
                : !acknowledged
                  ? 'Tick both boxes to enable Create. The file changes only when you choose Create this system.'
                  : 'Ready to create an editable copy in this Figma file. Publish separately by hand.'}
          </p>
        </footer>
      )}
    </section>
  );
}
