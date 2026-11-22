import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { DownloadSimple, ArrowsClockwise, MagicWand } from './TeulIcons';
import { getContrastRatio } from '../lib/utils';
import { copyToClipboard } from '../lib/clipboard';
import { themeFor, type as typeScale } from '../lib/theme';
import { ColorSystemBuilder } from './ColorSystemBuilder';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import type { NormalizedDocumentColorProfile } from '../types/messages';
import { createRequestId } from '../lib/requestId';
import { useOptionalWorkspaceState } from '../lib/workspaceState';
import { HistoricalColorSwatchCard } from './HistoricalColorSwatchCard';
import type { WadaColor } from '../types/historicalColorData';
import { BottomSheet, Chip, Disclosure, SectionLabel, buttonStyle, monoStyle } from './TeulUI';
import {
  ColorBrowseFrame,
  ColorSearch,
  ColorSheetActions,
  ColorSheetHeader,
  ColorValues,
  EmptyGrid,
  PanelView,
} from './ColorBrowser';

type Color = WadaColor;

interface ColorCombo {
  id: number;
  colors: Color[];
}

interface WadaColorsTabProps {
  isDark: boolean;
  colors: WadaColor[];
  documentColorProfile?: NormalizedDocumentColorProfile;
  /** The Wada | Werner switch, rendered at the start of the top row. */
  librarySwitch?: React.ReactNode;
}

const SWATCH_GROUPS = [
  { id: -1, name: 'All', dot: undefined },
  { id: 0, name: 'Reds', dot: '#d9534f' },
  { id: 1, name: 'Yellows', dot: '#e3b94a' },
  { id: 2, name: 'Greens', dot: '#5d9c6a' },
  { id: 3, name: 'Blues', dot: '#4f7fc4' },
  { id: 4, name: 'Purples', dot: '#8a62b8' },
  { id: 5, name: 'Neutrals', dot: '#9a9a9a' },
];

// Build reverse index for O(1) combination lookups
function buildComboIndex(colors: Color[]): Map<number, Color[]> {
  const index = new Map<number, Color[]>();
  colors.forEach((color: Color) => {
    color.combinations.forEach((comboId: number) => {
      if (!index.has(comboId)) {
        index.set(comboId, []);
      }
      index.get(comboId)!.push(color);
    });
  });
  return index;
}

// O(1) lookup instead of O(n) filter
const calculateCombinations = (color: Color, comboIndex: Map<number, Color[]>): ColorCombo[] => {
  return color.combinations.map(comboId => ({
    id: comboId,
    colors: (comboIndex.get(comboId) || []).filter(c => c.hex !== color.hex),
  }));
};

/**
 * Default name for a system started from a documented pairing. It carries the same
 * "Set n" the sheet shows, so two systems from one color do not collide by default.
 * A system started from the color alone keeps "{color} Palette".
 */
export const combinationSystemName = (color: { name: string }, setIndex: number) =>
  `${color.name} Palette, Set ${setIndex + 1}`;

// Contrast ratio cache
const contrastCache = new Map<string, number>();

function getCachedContrastRatio(rgb1: number[], rgb2: number[]): number {
  const key = `${rgb1.join(',')}-${rgb2.join(',')}`;
  const reverseKey = `${rgb2.join(',')}-${rgb1.join(',')}`;

  if (contrastCache.has(key)) return contrastCache.get(key)!;
  if (contrastCache.has(reverseKey)) return contrastCache.get(reverseKey)!;

  const ratio = getContrastRatio(rgb1, rgb2);
  contrastCache.set(key, ratio);
  return ratio;
}

const contrastLevel = (ratio: number) => {
  if (ratio >= 7) return { level: 'AAA', desc: 'Excellent' };
  if (ratio >= 4.5) return { level: 'AA', desc: 'Good for text' };
  if (ratio >= 3) return { level: 'AA Large', desc: 'Large text only' };
  return { level: 'Fail', desc: 'Not accessible' };
};

// Contrast chip with its WCAG level on hover and focus
const ContrastTooltip: React.FC<{
  ratio: number;
  children: React.ReactNode;
  isDark: boolean;
}> = ({ ratio, children, isDark }) => {
  const [show, setShow] = useState(false);
  const { level, desc } = contrastLevel(ratio);
  const theme = themeFor(isDark);

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            backgroundColor: theme.sheetBg,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            padding: '6px 8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 30,
            fontSize: typeScale.meta,
            color: theme.text,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            display: 'flex',
            gap: '6px',
          }}
        >
          <strong style={{ fontWeight: 600 }}>{level}</strong>
          <span style={{ color: theme.textMuted }}>{desc}</span>
        </span>
      )}
    </span>
  );
};

/** A documented pairing as a card: its colors side by side and its set number. */
const ComboCard: React.FC<{
  combo: ColorCombo;
  selected: Color;
  index: number;
  onBuild: () => void;
}> = ({ combo, selected, index, onBuild }) => {
  const all = [selected, ...combo.colors];
  return (
    <button
      type="button"
      className="teul-combo"
      data-teul-combo-size={all.length}
      aria-label={`Build a system from set ${index + 1}: ${all.map(color => color.name).join(', ')}`}
      title={all.map(color => color.name).join(' · ')}
      onClick={onBuild}
      style={{
        flex: 'none',
        width: '92px',
        padding: 0,
        border: 0,
        background: 'none',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: typeScale.meta,
      }}
    >
      <span
        style={{
          display: 'flex',
          height: '60px',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '5px',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
        }}
      >
        {all.map(color => (
          <i key={color.hex} style={{ flex: 1, backgroundColor: color.hex }} />
        ))}
      </span>
      <span style={{ opacity: 0.8 }}>Set {index + 1}</span>
    </button>
  );
};

export const WadaColorsTab: React.FC<WadaColorsTabProps> = ({
  isDark,
  colors,
  documentColorProfile = 'unknown',
  librarySwitch,
}) => {
  const workspaceContext = useOptionalWorkspaceState();
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [localSelectedSwatch, setLocalSelectedSwatch] = useState(-1);
  const searchTerm = workspaceContext?.state.wada.searchTerm ?? localSearchTerm;
  const setSearchTerm = useCallback(
    (searchTerm: string) => {
      if (!workspaceContext) setLocalSearchTerm(searchTerm);
      else {
        workspaceContext.update(current => ({
          ...current,
          wada: { ...current.wada, searchTerm },
        }));
      }
    },
    [workspaceContext]
  );
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [showCombinations, setShowCombinations] = useState(false);
  const selectedSwatch = workspaceContext?.state.wada.selectedSwatch ?? localSelectedSwatch;
  const setSelectedSwatch = useCallback(
    (selectedSwatch: number) => {
      if (!workspaceContext) setLocalSelectedSwatch(selectedSwatch);
      else {
        workspaceContext.update(current => ({
          ...current,
          wada: { ...current.wada, selectedSwatch },
        }));
      }
    },
    [workspaceContext]
  );
  const addRecentColor = React.useMemo(
    () => workspaceContext?.addRecentColor ?? (() => undefined),
    [workspaceContext]
  );
  const [showExport, setShowExport] = useState(false);
  const [exportColors, setExportColors] = useState<Color[]>([]);
  const exportCloseButtonRef = React.useRef<HTMLButtonElement>(null);
  const exportDialogRef = useModalAccessibility({
    isOpen: showExport,
    onClose: () => setShowExport(false),
    initialFocusRef: exportCloseButtonRef,
  });

  const comboIndex = useMemo(() => buildComboIndex(colors), [colors]);

  // Color system builder state
  const [showColorSystem, setShowColorSystem] = useState(false);
  const [colorSystemColors, setColorSystemColors] = useState<{ hex: string; name: string }[]>([]);
  const [colorSystemName, setColorSystemName] = useState('');

  const theme = themeFor(isDark);

  const handleApplyFill = useCallback(
    (color: Color) => {
      addRecentColor(color);
      parent.postMessage(
        {
          pluginMessage: {
            type: 'apply-fill',
            requestId: createRequestId('fill'),
            hex: color.hex,
            name: color.name,
          },
        },
        '*'
      );
    },
    [addRecentColor]
  );

  const handleApplyStroke = useCallback(
    (color: Color) => {
      addRecentColor(color);
      parent.postMessage(
        {
          pluginMessage: {
            type: 'apply-stroke',
            requestId: createRequestId('stroke'),
            hex: color.hex,
            name: color.name,
          },
        },
        '*'
      );
    },
    [addRecentColor]
  );

  const handleCreateStyle = useCallback(
    (color: Color) => {
      addRecentColor(color);
      parent.postMessage(
        {
          pluginMessage: {
            type: 'create-style',
            requestId: createRequestId('style'),
            hex: color.hex,
            name: color.name,
          },
        },
        '*'
      );
    },
    [addRecentColor]
  );

  const beginColorSystem = (sourceColors: Color[], name: string) => {
    setColorSystemColors(sourceColors.map(color => ({ hex: color.hex, name: color.name })));
    setColorSystemName(name);
    setShowColorSystem(true);
  };

  const filteredColors = useMemo(() => {
    let filtered = colors;
    if (selectedSwatch >= 0) filtered = filtered.filter(c => c.swatch === selectedSwatch);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        c => c.name.toLowerCase().includes(term) || c.hex.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [colors, searchTerm, selectedSwatch]);

  const combinations = useMemo(
    () => (selectedColor ? calculateCombinations(selectedColor, comboIndex) : []),
    [selectedColor, comboIndex]
  );

  const exportDialog = showExport && (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 100,
      }}
      onClick={() => setShowExport(false)}
    >
      <div
        ref={exportDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wada-export-title"
        tabIndex={-1}
        style={{
          backgroundColor: theme.sheetBg,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '16px',
          width: '100%',
          maxWidth: '400px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h3
            id="wada-export-title"
            style={{ margin: 0, fontSize: typeScale.emphasis, fontWeight: 600 }}
          >
            Export Palette
          </h3>
          <button
            ref={exportCloseButtonRef}
            type="button"
            onClick={() => setShowExport(false)}
            aria-label="Close palette export"
            className="teul-hover"
            style={{ ...buttonStyle(theme, 'ghost', { height: 28 }), width: '28px', padding: 0 }}
          >
            ✕
          </button>
        </div>

        {[
          {
            label: 'CSS',
            data: exportColors.map((c, i) => `--color-${i + 1}: ${c.hex};`).join('\n'),
          },
          {
            label: 'JSON',
            data: JSON.stringify(
              exportColors.map(c => ({ name: c.name, hex: c.hex })),
              null,
              2
            ),
          },
        ].map(({ label, data }) => (
          <div key={label} style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontSize: typeScale.meta, color: theme.textMuted }}>{label}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(data, label)}
                className="teul-hover"
                style={buttonStyle(theme, 'secondary', { height: 28 })}
              >
                Copy
              </button>
            </div>
            <pre
              style={{
                backgroundColor: theme.codeBg,
                border: `1px solid ${theme.border}`,
                padding: '10px',
                borderRadius: '8px',
                fontSize: typeScale.meta,
                ...monoStyle,
                overflow: 'auto',
                maxHeight: '120px',
                margin: 0,
                color: theme.text,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {data}
            </pre>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setShowExport(false)}
          style={{ ...buttonStyle(theme, 'primary'), width: '100%' }}
        >
          Done
        </button>
      </div>
    </div>
  );

  if (showColorSystem) {
    return (
      <ColorSystemBuilder
        isOpen
        onClose={() => setShowColorSystem(false)}
        colors={colorSystemColors}
        combinationName={colorSystemName}
        isDark={isDark}
        documentColorProfile={documentColorProfile}
      />
    );
  }

  if (showCombinations && selectedColor) {
    return (
      <>
        <PanelView
          isDark={isDark}
          backLabel="Return to color library"
          onBack={() => setShowCombinations(false)}
          title={
            <>
              {selectedColor.name}
              <span style={{ color: theme.textMuted, fontWeight: 400 }}>
                {' '}
                · {combinations.length} combinations
              </span>
            </>
          }
        >
          <div style={{ display: 'grid', gap: '10px' }}>
            {combinations.map((combo, idx) => (
              <section
                key={combo.id}
                aria-label={`Set ${idx + 1}`}
                style={{
                  backgroundColor: theme.cardBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <span style={{ fontSize: typeScale.body, fontWeight: 600 }}>Set {idx + 1}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() =>
                        beginColorSystem(
                          [selectedColor, ...combo.colors],
                          combinationSystemName(selectedColor, idx)
                        )
                      }
                      style={buttonStyle(theme, 'primary', { height: 28 })}
                    >
                      <MagicWand size={13} /> System
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportColors([selectedColor, ...combo.colors]);
                        setShowExport(true);
                      }}
                      className="teul-hover"
                      style={buttonStyle(theme, 'secondary', { height: 28 })}
                    >
                      <DownloadSimple size={13} /> Export
                    </button>
                  </div>
                </div>

                <div
                  style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}
                >
                  {[selectedColor, ...combo.colors].map((c, colorIndex) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => copyToClipboard(c.hex, c.hex)}
                      title={`${c.name} - Click to copy`}
                      aria-label={`Copy ${c.name} ${c.hex}`}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        border: 0,
                        padding: 0,
                        cursor: 'pointer',
                        backgroundColor: c.hex,
                        boxShadow:
                          colorIndex === 0
                            ? `0 0 0 2px ${theme.cardBg}, 0 0 0 4px ${c.hex}`
                            : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                      }}
                    />
                  ))}
                </div>

                <div
                  style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}
                >
                  {combo.colors.map(c => {
                    const ratio = getCachedContrastRatio(selectedColor.rgb, c.rgb);
                    const passes = ratio >= 4.5;
                    const large = ratio >= 3;
                    return (
                      <ContrastTooltip key={c.hex} ratio={ratio} isDark={isDark}>
                        <span
                          tabIndex={0}
                          aria-label={`${selectedColor.name} with ${c.name}: ${ratio.toFixed(1)}:1, ${contrastLevel(ratio).level}`}
                          style={{
                            display: 'inline-block',
                            fontSize: typeScale.meta,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${theme.border}`,
                            color: passes ? theme.ok : large ? theme.warnText : theme.textMuted,
                            cursor: 'help',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {ratio.toFixed(1)}:1
                        </span>
                      </ContrastTooltip>
                    );
                  })}
                </div>

                <div
                  role="group"
                  aria-label={`Apply set ${idx + 1} as a gradient`}
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}
                >
                  {['LINEAR', 'RADIAL', 'ANGULAR', 'DIAMOND'].map(type => (
                    <button
                      key={type}
                      type="button"
                      title={`Apply a ${type.toLowerCase()} gradient`}
                      onClick={() =>
                        parent.postMessage(
                          {
                            pluginMessage: {
                              type: 'apply-gradient',
                              requestId: createRequestId('gradient'),
                              gradientType: type,
                              colors: [selectedColor, ...combo.colors].map(co => ({
                                hex: co.hex,
                                name: co.name,
                              })),
                            },
                          },
                          '*'
                        )
                      }
                      className="teul-hover"
                      style={buttonStyle(theme, 'secondary', { height: 28 })}
                    >
                      {type.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </PanelView>
        {exportDialog}
      </>
    );
  }

  const sheet = selectedColor ? (
    <BottomSheet
      isDark={isDark}
      label={`${selectedColor.name} details`}
      onClose={() => setSelectedColor(null)}
      closeLabel="Close color details"
      focusKey={selectedColor.hex}
    >
      <ColorSheetHeader
        isDark={isDark}
        name={selectedColor.name}
        hex={selectedColor.hex}
        rgb={selectedColor.rgb}
        headingId="wada-detail-title"
      />
      <ColorSheetActions
        isDark={isDark}
        onFill={() => handleApplyFill(selectedColor)}
        onBuild={() => beginColorSystem([selectedColor], `${selectedColor.name} Palette`)}
        onStroke={() => handleApplyStroke(selectedColor)}
        onStyle={() => handleCreateStyle(selectedColor)}
        onCopy={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
      />
      <SectionLabel
        isDark={isDark}
        aside={combinations.length > 0 ? 'Choose one to build a system from it' : undefined}
      >
        In {combinations.length} of Wada’s combinations
      </SectionLabel>
      <div
        className="teul-noscrollbar"
        role="group"
        aria-label={`${selectedColor.name} documented pairings`}
        style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}
      >
        {combinations.map((combo, index) => (
          <ComboCard
            key={combo.id}
            combo={combo}
            selected={selectedColor}
            index={index}
            onBuild={() =>
              beginColorSystem(
                [selectedColor, ...combo.colors],
                combinationSystemName(selectedColor, index)
              )
            }
          />
        ))}
      </div>
      <div style={{ display: 'flex', margin: '10px 0 4px' }}>
        <button
          type="button"
          onClick={() => setShowCombinations(true)}
          className="teul-hover"
          style={buttonStyle(theme, 'secondary', { height: 28 })}
        >
          View all {combinations.length} pairings
        </button>
      </div>
      <Disclosure isDark={isDark} summary="Values">
        <ColorValues
          isDark={isDark}
          hex={selectedColor.hex}
          rows={[
            { label: 'HEX', value: selectedColor.hex.toUpperCase() },
            { label: 'RGB', value: selectedColor.rgb.join(', ') },
            { label: 'CMYK', value: selectedColor.cmyk.join(', ') },
            {
              label: 'LAB',
              value: selectedColor.lab.map(channel => channel.toFixed(1)).join(', '),
            },
          ]}
        />
      </Disclosure>
    </BottomSheet>
  ) : null;

  return (
    <>
      <ColorBrowseFrame
        isDark={isDark}
        gridLabel="Wada colors"
        topRow={
          <>
            {librarySwitch}
            <ColorSearch
              isDark={isDark}
              label="Search Wada colors"
              count={colors.length}
              value={searchTerm}
              onChange={setSearchTerm}
            />
            <button
              type="button"
              onClick={() => {
                if (colors.length === 0) return;
                const random = colors[Math.floor(Math.random() * colors.length)];
                setSelectedColor(random);
                setShowCombinations(false);
              }}
              title="Random Wada Color"
              aria-label="Show random Wada color"
              className="teul-hover"
              style={{ ...buttonStyle(theme), width: '32px', padding: 0, flex: 'none' }}
            >
              <ArrowsClockwise size={14} />
            </button>
          </>
        }
        chips={SWATCH_GROUPS.map(group => (
          <Chip
            key={group.id}
            isDark={isDark}
            pressed={selectedSwatch === group.id}
            onClick={() => setSelectedSwatch(group.id)}
            dot={group.dot}
          >
            {group.name}
          </Chip>
        ))}
        sheet={sheet}
      >
        {filteredColors.map(color => (
          <HistoricalColorSwatchCard
            key={color.hex}
            color={color}
            selected={selectedColor?.hex === color.hex}
            ringColors={{ gap: theme.bg, ring: theme.text }}
            onOpen={() => {
              setSelectedColor(color);
              setShowCombinations(false);
            }}
            trailingCount={color.combinations.length}
          />
        ))}
        {filteredColors.length === 0 && <EmptyGrid isDark={isDark} />}
      </ColorBrowseFrame>
      {exportDialog}
    </>
  );
};
