import * as React from 'react';
import type {
  ColorSystemReviewColorV2,
  ColorSystemReviewModelV2,
  ColorSystemReviewSectionV2,
} from '../lib/colorSystemReviewModelV2';

export interface ColorSystemBuilderV2ReviewBlocker {
  title: string;
  message: string;
}

export interface ColorSystemBuilderV2ReviewProps {
  models: readonly ColorSystemReviewModelV2[];
  recommendedDirectionId: string;
  selectedDirectionId: string | null;
  onSelectDirection: (directionId: string) => void;
  onCreate: (review: ColorSystemReviewModelV2) => void;
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

function themeFor(isDark: boolean): ReviewTheme {
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

function plainLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase())
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bWcag\b/g, 'WCAG');
}

function exampleLabel(value: string): string {
  const normalized = value.trim();
  const composer = /^Composer:(Categorical|Sequential|Diverging)$/i.exec(normalized);
  if (composer) {
    const kind = composer[1].toLowerCase();
    if (kind === 'categorical') return 'Categorical chart';
    return `${plainLabel(kind)} scale`;
  }
  const primaryLock = /^Primary lock:\s*(.+)$/i.exec(normalized);
  if (primaryLock) return `Locked Primary: ${plainLabel(primaryLock[1])}`;
  const familyScale = /^Scale:\s*(.+)$/i.exec(normalized);
  if (familyScale) return `${plainLabel(familyScale[1])} family scale`;
  return plainLabel(normalized.replace(/:/g, ' '));
}

function productIntendedUse(
  specimen: NonNullable<ColorSystemReviewSectionV2['productGraphicsSpecimens']>[number]
): string {
  if (specimen.intendedUse.includes('using reviewed Secondary eligibility')) {
    const descriptions: Readonly<Record<typeof specimen.job, string>> = {
      'product-graphic': 'A supporting color for product illustration and graphic shapes.',
      'functional-iconography': 'An exact icon color tested on the surface shown here.',
      'product-ui-surface':
        'An exact UI surface color tested against the surrounding surface shown here.',
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
  if (!contrast || contrast.ratio === null) return 'Exact pair could not be assessed';
  const outcome = contrast.status === 'pass' ? 'passes' : contrast.status;
  return `${contrast.ratio.toFixed(2)}:1 · ${outcome} ${contrast.requiredRatio}:1 non-text check`;
}

function colorBackground(color: ColorSystemReviewColorV2): string {
  const red = Number.parseInt(color.hex.slice(1, 3), 16);
  const green = Number.parseInt(color.hex.slice(3, 5), 16);
  const blue = Number.parseInt(color.hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${color.alpha})`;
}

function textColorOnSurface(color: ColorSystemReviewColorV2, underlayHex: string): string {
  const channel = (hex: string, start: number) => Number.parseInt(hex.slice(start, start + 2), 16);
  const underlay = [channel(underlayHex, 1), channel(underlayHex, 3), channel(underlayHex, 5)];
  const foreground = [channel(color.hex, 1), channel(color.hex, 3), channel(color.hex, 5)];
  const composited = foreground.map(
    (value, index) => value * color.alpha + (underlay[index] ?? 0) * (1 - color.alpha)
  );
  const linear = composited.map(value => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  const luminance =
    (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  return luminance > 0.179 ? '#171717' : '#FFFFFF';
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
  return typeof blocker === 'string'
    ? { title: 'This system cannot be created yet', message: blocker }
    : blocker;
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
  const label = `${color.name}, ${color.mode} mode, ${color.hex}, ${opacityLabel(color.alpha)}, ${color.origin}`;

  if (compact) {
    return (
      <span
        role="img"
        aria-label={label}
        title={`${color.name} · ${color.mode} · ${color.hex} · ${opacityLabel(color.alpha)}`}
        style={{
          display: 'block',
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
        minWidth: 0,
        borderRadius: 8,
        overflow: 'hidden',
        background: theme.raised,
        border: `1px solid ${theme.border}`,
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
            'linear-gradient(45deg, rgba(255,255,255,.25) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,.25) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,.25) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.25) 75%)',
          backgroundSize: '12px 12px',
          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 4,
            backgroundColor: colorBackground(color),
            boxShadow: boundaryColor ? `inset 0 0 0 1px ${boundaryColor}` : undefined,
          }}
        />
      </div>
      <div style={{ padding: 9 }}>
        <strong style={{ display: 'block', fontSize: 12, lineHeight: 1.35 }}>{color.name}</strong>
        <span style={{ display: 'block', marginTop: 3, color: theme.muted, fontSize: 11 }}>
          {color.hex} · {opacityLabel(color.alpha)}
        </span>
        <span style={{ display: 'block', marginTop: 2, color: theme.muted, fontSize: 11 }}>
          {plainLabel(color.mode)} · {color.origin === 'existing' ? 'Existing' : 'Suggested'}
        </span>
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
        minWidth: 0,
        margin: 0,
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.raised,
      }}
    >
      <figcaption>
        <strong style={{ display: 'block', fontSize: 12 }}>{title}</strong>
        <span style={{ display: 'block', marginTop: 3, color: theme.muted, fontSize: 10 }}>
          {description}
        </span>
      </figcaption>
      {children}
    </figure>
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
  const sequentialText = textColorOnSurface(sequential.surface, theme.raised);
  const divergingText = textColorOnSurface(diverging.surface, theme.raised);
  const midpointIndex = diverging.marks.findIndex(mark => mark.order === diverging.midpointOrder);

  return (
    <section aria-labelledby="teul-data-viz-specimens-title" style={{ marginTop: 16 }}>
      <h4 id="teul-data-viz-specimens-title" style={{ margin: 0, fontSize: 13 }}>
        Generated chart examples
      </h4>
      <p style={{ margin: '5px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.45 }}>
        These diagrams test the proposed colors, order, labels, and non-color cues reused in the
        created Figma components. They are not copied source artwork or brand approval.
      </p>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <VisualizationCard
          kind="categorical"
          title="Categorical"
          description="Distinct categories · direct labels + different bar shapes"
          theme={theme}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'end',
              gap: 8,
              minHeight: 170,
              marginTop: 10,
              padding: '14px 10px 8px',
              borderRadius: 6,
              background: colorBackground(categorical.surface),
            }}
          >
            {categorical.marks.map((mark, index) => (
              <div
                key={`${categorical.selectionId}:${mark.order}`}
                style={{
                  display: 'grid',
                  gridTemplateRows: '1fr auto auto',
                  alignItems: 'end',
                  width: `${100 / Math.max(categorical.marks.length, 1)}%`,
                  minWidth: 0,
                  height: 138,
                  textAlign: 'center',
                }}
              >
                <span
                  role="img"
                  aria-label={`${mark.label}, ${mark.renderedHex}`}
                  style={{
                    display: 'block',
                    width: '72%',
                    height: `${42 + ((index * 17 + 19) % 58)}px`,
                    margin: '0 auto',
                    border: categoricalBoundary ? `1px solid ${categoricalBoundary}` : 0,
                    borderRadius:
                      index % 3 === 0 ? '1px' : index % 3 === 1 ? '12px 12px 2px 2px' : '999px',
                    background: mark.renderedHex,
                  }}
                />
                <strong
                  style={{
                    display: 'block',
                    marginTop: 6,
                    color: categoricalText,
                    fontSize: 10,
                    lineHeight: 1.1,
                    overflowWrap: 'anywhere',
                    whiteSpace: 'normal',
                  }}
                >
                  {mark.label}
                </strong>
                <span style={{ color: categoricalText, fontSize: 9, opacity: 0.72 }}>
                  {mark.renderedHex}
                </span>
              </div>
            ))}
          </div>
        </VisualizationCard>

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
              borderRadius: 6,
              background: colorBackground(sequential.surface),
            }}
          >
            <div style={{ display: 'flex', gap: 3 }}>
              {sequential.marks.map(mark => (
                <span
                  key={`${sequential.selectionId}:${mark.order}`}
                  role="img"
                  aria-label={`${mark.label}, ${mark.renderedHex}`}
                  title={`${mark.label} · ${mark.renderedHex}`}
                  style={{
                    display: 'block',
                    width: `${100 / Math.max(sequential.marks.length, 1)}%`,
                    height: 58,
                    background: mark.renderedHex,
                    border: 0,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 6,
                color: sequentialText,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              <span>{sequential.endpointLabels[0]}</span>
              <span>{sequential.endpointLabels[1]}</span>
            </div>
            <p
              style={{
                margin: '6px 0 0',
                color: sequentialText,
                opacity: 0.72,
                textAlign: 'center',
                fontSize: 9,
              }}
            >
              {sequential.marks.map(mark => `${mark.order} ${mark.renderedHex}`).join(' · ')}
            </p>
          </div>
        </VisualizationCard>

        <VisualizationCard
          kind="diverging"
          title="Diverging"
          description={`${diverging.negativeLabel} · ${diverging.midpointMeaning} · ${diverging.positiveLabel}`}
          theme={theme}
        >
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'end',
              gap: 6,
              minHeight: 150,
              marginTop: 10,
              padding: '16px 10px 26px',
              borderRadius: 6,
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
                    minWidth: 0,
                    textAlign: 'center',
                  }}
                >
                  <span
                    role="img"
                    aria-label={`${mark.label}, ${mark.renderedHex}`}
                    style={{
                      display: 'block',
                      height: `${38 + distance * 24}px`,
                      border: 0,
                      background: mark.renderedHex,
                    }}
                  />
                  <strong
                    style={{
                      display: 'block',
                      marginTop: 5,
                      overflow: 'hidden',
                      color: divergingText,
                      fontSize: 9,
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 6,
              color: theme.muted,
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            <span>{diverging.negativeLabel}</span>
            <span>{diverging.midpointMeaning}</span>
            <span>{diverging.positiveLabel}</span>
          </div>
        </VisualizationCard>
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
    <section aria-labelledby="teul-product-graphics-specimens-title" style={{ marginTop: 16 }}>
      <h4 id="teul-product-graphics-specimens-title" style={{ margin: 0, fontSize: 13 }}>
        Generated product-use examples
      </h4>
      <p style={{ margin: '5px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.45 }}>
        These diagrams test each proposed color in its assigned product job; they are not copied
        source artwork or brand approval. No decorative gradient or extra palette is added.
      </p>
      <div
        style={{
          display: 'grid',
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
          const foreground = textColorOnSurface(color, surface?.hex ?? theme.raised);
          const surfaceText = surface ? textColorOnSurface(surface, theme.raised) : theme.text;
          const previewForeground = specimen.job === 'product-ui-surface' ? foreground : theme.text;
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
              aria-label={`${label} specimen using ${specimen.colors.map(item => `${item.name}, ${item.hex}, ${opacityLabel(item.alpha)}`).join('; ')}${surface ? ` on ${surface.name}, ${surface.hex}` : ''}; ${productContrastLabel(specimen)}`}
              style={{
                minWidth: 0,
                margin: 0,
                padding: 10,
                borderRadius: 8,
                background: theme.raised,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  height: 112,
                  overflow: 'hidden',
                  borderRadius: 6,
                  background: surface ? colorBackground(surface) : theme.panel,
                }}
              >
                {specimen.job === 'functional-iconography' ? (
                  <>
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 30,
                        left: '50%',
                        width: 42,
                        height: 42,
                        border: `7px solid ${colorBackground(color)}`,
                        borderRadius: 12,
                        transform: 'translateX(-50%) rotate(12deg)',
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 47,
                        left: '50%',
                        width: 34,
                        height: 7,
                        background: colorBackground(color),
                        transform: 'translateX(-50%) rotate(-32deg)',
                      }}
                    />
                  </>
                ) : specimen.job === 'product-ui-surface' ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 15,
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr',
                      gridTemplateRows: '22px 1fr',
                      gap: 8,
                      padding: 10,
                      borderRadius: 5,
                      color: foreground,
                      background: colorBackground(color),
                      boxShadow: `inset 0 0 0 1px ${foreground}`,
                    }}
                  >
                    <span
                      style={{ gridRow: '1 / span 2', opacity: 0.32, background: foreground }}
                    />
                    <span style={{ opacity: 0.82, background: foreground }} />
                    <span style={{ opacity: 0.24, background: foreground }} />
                  </div>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        width: '48%',
                        height: 80,
                        borderRadius: 24,
                        background: colorBackground(color),
                        opacity: 0.34,
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        right: 18,
                        bottom: 17,
                        width: '38%',
                        height: 48,
                        background: colorBackground(specimen.colors[1] ?? color),
                        opacity: 0.92,
                      }}
                    />
                  </>
                )}
                <span
                  style={{
                    position: 'absolute',
                    right: 7,
                    bottom: 5,
                    color: specimen.job === 'product-ui-surface' ? previewForeground : surfaceText,
                    fontSize: 8,
                    fontWeight: 800,
                  }}
                >
                  {color.hex}
                </span>
              </div>
              <figcaption style={{ marginTop: 7, fontSize: 10, fontWeight: 700 }}>
                {label}
              </figcaption>
              <p style={{ margin: '2px 0 0', color: theme.muted, fontSize: 9 }}>
                {color.hex} · {opacityLabel(color.alpha)}
                {surface ? ` on ${surface.hex}` : ''}
              </p>
              <p style={{ margin: '3px 0 0', color: theme.muted, fontSize: 9, lineHeight: 1.35 }}>
                {productIntendedUse(specimen)}
              </p>
              <p style={{ margin: '3px 0 0', color: theme.muted, fontSize: 9, lineHeight: 1.35 }}>
                {productContrastLabel(specimen)}
              </p>
            </figure>
          );
        })}
      </div>
    </section>
  );
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
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Measured checks</h4>
      <ul
        aria-label={`${section.title} measured checks`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {section.ratings.dimensions.map(dimension => (
          <li key={dimension.id} style={{ padding: 10, borderRadius: 7, background: theme.raised }}>
            <strong style={{ display: 'block', fontSize: 12 }}>{dimension.label}</strong>
            <span style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              {dimension.measuredValue} {dimension.unit}
            </span>
            {dimension.threshold !== undefined ? (
              <span style={{ display: 'block', marginTop: 2, color: theme.muted, fontSize: 11 }}>
                Required limit: {dimension.threshold} {dimension.unit}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p style={{ margin: '8px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.45 }}>
        {section.ratings.limitation}
      </p>
    </div>
  );
}

function SectionReview({
  section,
  model,
  theme,
}: {
  section: ColorSystemReviewSectionV2;
  model: ColorSystemReviewModelV2;
  theme: ReviewTheme;
}) {
  const showDetailedColorCards =
    (section.role !== 'secondary' || model.families.length === 0) &&
    !(section.role === 'data-visualization' && section.visualizationSpecimens) &&
    !(section.role === 'product-graphics' && section.productGraphicsSpecimens);

  return (
    <article
      aria-labelledby={`teul-review-section-${section.role}`}
      style={{
        padding: 16,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 id={`teul-review-section-${section.role}`} style={{ margin: 0, fontSize: 17 }}>
          {section.title}
        </h3>
        <span
          style={{
            padding: '3px 7px',
            borderRadius: 999,
            color: section.disposition === 'preserve' ? theme.positive : theme.accent,
            border: `1px solid ${
              section.disposition === 'preserve' ? theme.positive : theme.accent
            }`,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {section.changeLabel}
        </span>
      </div>
      <p style={{ margin: '8px 0 0', color: theme.muted, fontSize: 12, lineHeight: 1.5 }}>
        {section.guidance}
      </p>

      {showDetailedColorCards && section.colors.length > 0 ? (
        <ul
          aria-label={`${section.title} colors`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
            gap: 9,
            margin: '14px 0 0',
            padding: 0,
            listStyle: 'none',
          }}
        >
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
        <p style={{ margin: '12px 0 0', color: theme.muted, fontSize: 12 }}>
          No color is assigned to this section in this direction.
        </p>
      ) : null}

      {section.role === 'secondary' && model.families.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Why these Secondary families</h4>
          <ul
            aria-label="Secondary family overview"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: 7,
              margin: '0 0 12px',
              padding: 0,
              listStyle: 'none',
            }}
          >
            {model.families.map(family => {
              const lightColors = family.colors.filter(color => color.mode === 'Light');
              const representative =
                lightColors[Math.min(8, Math.max(lightColors.length - 1, 0))] ?? family.colors[0];
              if (!representative) return null;
              return (
                <li
                  key={`${family.id}:overview`}
                  data-teul-family-overview={family.id}
                  style={{ minWidth: 0, padding: 7, borderRadius: 7, background: theme.raised }}
                >
                  <span
                    aria-label={`${family.name} representative color ${representative.hex}`}
                    style={{
                      display: 'block',
                      height: 34,
                      borderRadius: 4,
                      background: colorBackground(representative),
                    }}
                  />
                  <strong style={{ display: 'block', marginTop: 5, fontSize: 10 }}>
                    {family.name}
                  </strong>
                  <span style={{ display: 'block', marginTop: 2, color: theme.muted, fontSize: 9 }}>
                    {representative.hex}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, color: theme.muted, fontSize: 9 }}>
                    {family.jobs[0] ? plainLabel(family.jobs[0]) : 'Reserve family'}
                  </span>
                </li>
              );
            })}
          </ul>
          <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {model.families.map(family => (
              <li
                key={family.id}
                style={{ padding: 10, borderRadius: 8, background: theme.raised }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'baseline',
                  }}
                >
                  <strong style={{ fontSize: 12 }}>{family.name}</strong>
                  <span style={{ color: theme.muted, fontSize: 10 }}>
                    {plainLabel(family.prominence)}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
                  {orderedModes(family.colors).map(mode => {
                    const modeColors = family.colors.filter(color => color.mode === mode);
                    const first = modeColors[0];
                    const last = modeColors[modeColors.length - 1];
                    return (
                      <div key={mode}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                            marginBottom: 4,
                            color: theme.muted,
                            fontSize: 10,
                          }}
                        >
                          <strong style={{ color: theme.text }}>{plainLabel(mode)}</strong>
                          <span>
                            {first?.hex} to {last?.hex}
                          </span>
                        </div>
                        <div
                          aria-label={`${family.name} ${plainLabel(mode)} scale`}
                          style={{ display: 'flex', overflow: 'hidden', borderRadius: 5 }}
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
                <p
                  style={{ margin: '8px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.45 }}
                >
                  {family.reason}
                </p>
                <p style={{ margin: '5px 0 0', fontSize: 11 }}>
                  Intended for: {family.jobs.map(plainLabel).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {section.role === 'data-visualization' && section.visualizationSpecimens ? (
        <DataVisualizationSpecimens specimens={section.visualizationSpecimens} theme={theme} />
      ) : null}

      {section.role === 'product-graphics' && section.productGraphicsSpecimens ? (
        <ProductGraphicsSpecimens specimens={section.productGraphicsSpecimens} theme={theme} />
      ) : null}

      {section.exampleLabels.length > 0 &&
      !section.visualizationSpecimens &&
      section.role !== 'product-graphics' ? (
        <p style={{ margin: '14px 0 0', fontSize: 11, lineHeight: 1.45 }}>
          <strong>Examples:</strong> {section.exampleLabels.map(exampleLabel).join(', ')}
        </p>
      ) : null}
      <RatingSummary section={section} theme={theme} />
    </article>
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
  const [technicalOpen, setTechnicalOpen] = React.useState(false);
  const theme = themeFor(isDark);
  const blockerMessage = blockerCopy(blocker);
  const modelCountInvalid = models.length > 3;
  const selected = models.find(model => model.directionId === selectedDirectionId) ?? null;
  const recommended =
    models.find(model => model.directionId === recommendedDirectionId) ?? models[0] ?? null;
  const ownershipModel = selected ?? models[0] ?? null;

  if (models.length === 0) {
    return (
      <section
        aria-labelledby="teul-v2-review-empty-title"
        style={{ padding: 20, color: theme.text, background: theme.canvas }}
      >
        <h2 id="teul-v2-review-empty-title" style={{ margin: 0, fontSize: 18 }}>
          No color-system directions are ready
        </h2>
        <p role="status" style={{ margin: '8px 0 0', color: theme.muted }}>
          Analyze the source again after resolving its color and intent evidence.
        </p>
      </section>
    );
  }

  const orderedSections = selected
    ? SECTION_ORDER.flatMap(role => selected.sections.filter(section => section.role === role))
    : [];
  const invalidMessage = modelCountInvalid
    ? 'Teul can compare no more than three complete directions at once.'
    : !selected
      ? 'Choose a direction before creating the system.'
      : null;
  const createBlocked = creating || Boolean(blockerMessage) || Boolean(invalidMessage);
  const createState = creating ? 'loading' : createBlocked ? 'blocked' : 'ready';
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
      <style>{`
        .teul-v2-review * { box-sizing: border-box; }
        .teul-v2-review input:focus-visible,
        .teul-v2-review button:focus-visible,
        .teul-v2-review summary:focus-visible {
          outline: 3px solid ${theme.accent};
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .teul-v2-review * { scroll-behavior: auto !important; transition: none !important; }
        }
      `}</style>

      <header>
        <p
          style={{
            margin: 0,
            color: theme.muted,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Review before creating
        </p>
        <h2 id="teul-v2-review-title" style={{ margin: '5px 0 0', fontSize: 22 }}>
          Review your color system
        </h2>
        <p style={{ margin: '7px 0 0', color: theme.muted, fontSize: 12, lineHeight: 1.5 }}>
          Compare the actual colors and examples. Nothing is added to the Figma file until you
          choose Create this system.
        </p>
      </header>

      {ownershipModel ? (
        <section
          data-teul-ownership-summary
          aria-label="Source ownership summary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 10,
            marginTop: 16,
          }}
        >
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${theme.positive}`,
              background: theme.panel,
            }}
          >
            <h3 style={{ margin: 0, color: theme.positive, fontSize: 12 }}>Primary stays locked</h3>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
              {ownershipModel.unchanged.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${theme.accent}`,
              background: theme.panel,
            }}
          >
            <h3 style={{ margin: 0, color: theme.accent, fontSize: 12 }}>Teul proposes</h3>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
              {ownershipModel.proposed.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {selected ? (
        <section
          data-teul-selected-direction
          aria-labelledby="teul-v2-selected-direction-title"
          style={{
            margin: '18px 0 0',
            padding: 14,
            borderRadius: 10,
            background: theme.panel,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <p
              style={{
                margin: 0,
                color: theme.muted,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Selected direction
            </p>
            {selected.directionId === recommendedDirectionId ? (
              <span
                style={{
                  padding: '3px 7px',
                  borderRadius: 999,
                  color: theme.positive,
                  border: `1px solid ${theme.positive}`,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                Recommended
              </span>
            ) : null}
          </div>
          <h3 id="teul-v2-selected-direction-title" style={{ margin: '7px 0 0', fontSize: 17 }}>
            {selected.headline}
          </h3>
          <p style={{ margin: '7px 0 0', color: theme.muted, fontSize: 12, lineHeight: 1.5 }}>
            {selected.summary}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.5 }}>
            {selected.directionDecision.promise}
          </p>
          <p style={{ margin: '7px 0 0', fontSize: 11, lineHeight: 1.5 }}>
            <strong>Best for:</strong> {selected.directionDecision.bestFor}{' '}
            <span style={{ color: theme.muted }}>
              <strong>Tradeoff:</strong> {selected.directionDecision.tradeoff}
            </span>
          </p>
          <p
            data-teul-selected-direction-authority
            style={{ margin: '8px 0 0', color: theme.muted, fontSize: 10, lineHeight: 1.45 }}
          >
            {selected.directionId === recommendedDirectionId
              ? 'Teul recommendation · brand-owner approval still required'
              : `Selected Teul proposal · Teul recommends ${recommended?.directionLabel ?? 'the marked direction'} · brand-owner approval still required`}
          </p>
        </section>
      ) : null}

      {models.length > 1 ? (
        <details
          data-teul-direction-comparison
          style={{
            marginTop: 10,
            padding: 11,
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            color: theme.muted,
            fontSize: 11,
          }}
        >
          <summary style={{ cursor: 'pointer', color: theme.text, fontWeight: 700 }}>
            Compare alternatives
            <span style={{ marginLeft: 6, color: theme.muted, fontWeight: 500 }}>
              {selected
                ? `${Math.max(models.length - 1, 0)} other ${models.length === 2 ? 'direction' : 'directions'}`
                : `${models.length} directions`}
            </span>
          </summary>
          <fieldset
            style={{
              margin: '11px 0 0',
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}
          >
            <legend style={{ padding: '0 5px', fontSize: 12, fontWeight: 700 }}>
              Choose a direction
            </legend>
            <div style={{ display: 'grid', gap: 8 }}>
              {models.slice(0, 3).map(model => {
                const checked = model.directionId === selectedDirectionId;
                const modelRecommended = model.directionId === recommendedDirectionId;
                return (
                  <label
                    data-teul-direction-option
                    key={model.directionId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: 9,
                      padding: 11,
                      borderRadius: 8,
                      cursor: creating ? 'not-allowed' : 'pointer',
                      background: checked ? theme.selected : theme.panel,
                      border: `1px solid ${checked ? theme.accent : theme.border}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="teul-v2-color-system-direction"
                      value={model.directionId}
                      checked={checked}
                      onChange={() => onSelectDirection(model.directionId)}
                      disabled={creating}
                    />
                    <span>
                      <strong style={{ display: 'block', fontSize: 13 }}>
                        {model.directionLabel}
                        {modelRecommended ? (
                          <span style={{ marginLeft: 7, color: theme.positive, fontSize: 10 }}>
                            Recommended
                          </span>
                        ) : null}
                      </strong>
                      <span
                        style={{ display: 'block', marginTop: 3, color: theme.muted, fontSize: 11 }}
                      >
                        {model.directionDecision.promise}
                      </span>
                      <span
                        style={{ display: 'block', marginTop: 6, color: theme.text, fontSize: 10 }}
                      >
                        <strong>Best for:</strong> {model.directionDecision.bestFor}
                      </span>
                      <span
                        style={{ display: 'block', marginTop: 3, color: theme.muted, fontSize: 10 }}
                      >
                        <strong>Tradeoff:</strong> {model.directionDecision.tradeoff}
                      </span>
                      <span
                        style={{ display: 'block', marginTop: 6, color: theme.muted, fontSize: 9 }}
                      >
                        {`${modelRecommended ? 'Teul recommendation' : 'Teul proposal'} · brand-owner approval still required`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </details>
      ) : null}

      {blockerMessage ? (
        <div
          id="teul-v2-review-blocker"
          role="alert"
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            color: theme.danger,
            border: `1px solid ${theme.danger}`,
          }}
        >
          <strong style={{ display: 'block', fontSize: 13 }}>{blockerMessage.title}</strong>
          <span style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
            {blockerMessage.message}
          </span>
        </div>
      ) : invalidMessage ? (
        <div
          id="teul-v2-review-invalid"
          role="alert"
          style={{ marginTop: 16, color: theme.danger, fontSize: 12 }}
        >
          {invalidMessage}
        </div>
      ) : null}

      {selected ? (
        <>
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {orderedSections.map(section => (
              <SectionReview key={section.role} section={section} model={selected} theme={theme} />
            ))}
          </div>

          {selected.importantLimitations.length > 0 ? (
            <aside
              aria-labelledby="teul-v2-review-limitations"
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${theme.warning}`,
              }}
            >
              <h3 id="teul-v2-review-limitations" style={{ margin: 0, fontSize: 13 }}>
                Important limits
              </h3>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
                {selected.importantLimitations.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          ) : null}

          <details
            data-teul-technical-details
            onToggle={event => setTechnicalOpen(event.currentTarget.open)}
            style={{
              marginTop: 14,
              padding: 11,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              color: theme.muted,
              fontSize: 11,
            }}
          >
            <summary style={{ cursor: 'pointer', color: theme.text, fontWeight: 700 }}>
              Technical details
            </summary>
            {technicalOpen ? (
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content minmax(0, 1fr)',
                  gap: '5px 10px',
                  margin: '10px 0 0',
                }}
              >
                <dt>Source fingerprint</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {selected.technicalReceipt.sourceHash}
                </dd>
                <dt>Direction fingerprint</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {selected.technicalReceipt.candidateHash}
                </dd>
                <dt>Application fingerprint</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {selected.technicalReceipt.applicationBlueprintHash}
                </dd>
                <dt>Five-section fingerprint</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {selected.technicalReceipt.sectionBlueprintHash}
                </dd>
                <dt>Review fingerprint</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{selected.reviewModelHash}</dd>
              </dl>
            ) : null}
          </details>

          <footer
            aria-label="Create reviewed color system"
            data-state={createState}
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!createBlocked) onCreate(selected);
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
                borderRadius: 8,
                cursor: createBlocked ? 'not-allowed' : 'pointer',
                color: theme.accentText,
                background: createBlocked ? theme.muted : theme.accent,
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {creating ? 'Creating system…' : 'Create this system'}
            </button>
            <p
              id={createDescriptionId}
              role="status"
              aria-live="polite"
              style={{ margin: '7px 0 0', color: theme.muted, textAlign: 'center', fontSize: 10 }}
            >
              {creating
                ? 'Creating the reviewed system in the current Figma file.'
                : createBlocked
                  ? 'Creation is unavailable until the issue above is resolved.'
                  : 'Ready to create an editable copy in the current Figma file. Publishing remains a separate manual step.'}
            </p>
          </footer>
        </>
      ) : null}
    </section>
  );
}
