import * as React from 'react';
import { useMemo, useState } from 'react';
import type { WernerColor } from '../types/historicalColorData';
import { ColorSystemBuilder } from './ColorSystemBuilder';
import { copyToClipboard } from '../lib/clipboard';
import { themeFor, type as typeScale } from '../lib/theme';
import type { NormalizedDocumentColorProfile } from '../types/messages';
import { createRequestId } from '../lib/requestId';
import { useOptionalWorkspaceState } from '../lib/workspaceState';
import { HistoricalColorSwatchCard } from './HistoricalColorSwatchCard';
import { BottomSheet, Chip, Disclosure, SectionLabel } from './TeulUI';
import {
  ColorBrowseFrame,
  ColorSearch,
  ColorSheetActions,
  ColorSheetHeader,
  ColorValues,
  EmptyGrid,
} from './ColorBrowser';

interface WernerColorsTabProps {
  isDark: boolean;
  colors: WernerColor[];
  documentColorProfile?: NormalizedDocumentColorProfile;
  /** The Wada | Werner switch, rendered at the start of the top row. */
  librarySwitch?: React.ReactNode;
}

const WERNER_GROUPS = [
  { id: -1, name: 'All' },
  { id: 0, name: 'Whites' },
  { id: 1, name: 'Greys' },
  { id: 2, name: 'Blacks' },
  { id: 3, name: 'Blues' },
  { id: 4, name: 'Purples' },
  { id: 5, name: 'Greens' },
  { id: 6, name: 'Yellows' },
  { id: 7, name: 'Oranges' },
  { id: 8, name: 'Reds' },
  { id: 9, name: 'Browns' },
];

/** Display-only channels for the sheet header; the bundled record carries hex. */
const hexChannels = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const WernerColorsTab: React.FC<WernerColorsTabProps> = ({
  isDark,
  colors,
  documentColorProfile = 'unknown',
  librarySwitch,
}) => {
  const workspaceContext = useOptionalWorkspaceState();
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [localSelectedGroup, setLocalSelectedGroup] = useState(-1);
  const [selectedColor, setSelectedColor] = useState<WernerColor | null>(null);
  const [showColorSystem, setShowColorSystem] = useState(false);
  const [colorSystemColors, setColorSystemColors] = useState<{ hex: string; name: string }[]>([]);
  const [colorSystemName, setColorSystemName] = useState('');

  const searchTerm = workspaceContext?.state.werner.searchTerm ?? localSearchTerm;
  const selectedGroup = workspaceContext?.state.werner.selectedGroup ?? localSelectedGroup;
  const addRecentColor = workspaceContext?.addRecentColor ?? (() => undefined);
  const theme = themeFor(isDark);

  const setSearchTerm = React.useCallback(
    (value: string) => {
      if (!workspaceContext) setLocalSearchTerm(value);
      else {
        workspaceContext.update(current => ({
          ...current,
          werner: { ...current.werner, searchTerm: value },
        }));
      }
    },
    [workspaceContext]
  );

  const setSelectedGroup = React.useCallback(
    (value: number) => {
      if (!workspaceContext) setLocalSelectedGroup(value);
      else {
        workspaceContext.update(current => ({
          ...current,
          werner: { ...current.werner, selectedGroup: value },
        }));
      }
    },
    [workspaceContext]
  );

  const filteredColors = useMemo(() => {
    let filtered = colors;
    if (selectedGroup >= 0) filtered = filtered.filter(color => color.groupId === selectedGroup);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        color =>
          color.name.toLowerCase().includes(term) ||
          color.hex.toLowerCase().includes(term) ||
          color.group.toLowerCase().includes(term) ||
          Object.values(color.text.normalized).some(value => value.toLowerCase().includes(term)) ||
          Object.values(color.text.source).some(value => value.toLowerCase().includes(term))
      );
    }
    return filtered;
  }, [colors, searchTerm, selectedGroup]);

  const postColorAction = (
    type: 'apply-fill' | 'apply-stroke' | 'create-style',
    color: WernerColor
  ) => {
    addRecentColor(color);
    const prefix = type === 'apply-fill' ? 'fill' : type === 'apply-stroke' ? 'stroke' : 'style';
    parent.postMessage(
      {
        pluginMessage: {
          type,
          requestId: createRequestId(prefix),
          name: type === 'create-style' ? `Werner/${color.group}/${color.name}` : color.name,
          hex: color.hex,
        },
      },
      '*'
    );
  };

  const beginColorSystem = (color: WernerColor) => {
    setColorSystemColors([{ hex: color.hex, name: color.name }]);
    setColorSystemName(`Werner/${color.name}`);
    setShowColorSystem(true);
  };

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

  const selectedText = selectedColor?.text ?? null;
  const paragraph: React.CSSProperties = {
    margin: 0,
    color: theme.textMuted,
    fontSize: typeScale.meta,
    lineHeight: 1.5,
  };

  const sheet =
    selectedColor && selectedText ? (
      <BottomSheet
        isDark={isDark}
        label={`${selectedColor.name} details`}
        onClose={() => setSelectedColor(null)}
        closeLabel="Close color inspector"
        focusKey={selectedColor.id}
      >
        <ColorSheetHeader
          isDark={isDark}
          name={selectedColor.name}
          hex={selectedColor.hex}
          rgb={hexChannels(selectedColor.hex)}
          eyebrow={`${selectedColor.group}${selectedColor.characteristic ? ' · Characteristic color' : ''}`}
          headingId="werner-detail-title"
        />
        <ColorSheetActions
          isDark={isDark}
          onFill={() => postColorAction('apply-fill', selectedColor)}
          onBuild={() => beginColorSystem(selectedColor)}
          onStroke={() => postColorAction('apply-stroke', selectedColor)}
          onStyle={() => postColorAction('create-style', selectedColor)}
          onCopy={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
        />
        <SectionLabel isDark={isDark}>
          {selectedColor.group} · Werner’s Nomenclature, 1821
        </SectionLabel>
        <p style={{ ...paragraph, color: theme.text }}>{selectedText.normalized.description}</p>
        <dl
          style={{
            margin: '10px 0 8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '10px',
          }}
        >
          {[
            ['Animal', selectedText.normalized.animal],
            ['Vegetable', selectedText.normalized.vegetable],
            ['Mineral', selectedText.normalized.mineral],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt style={{ color: theme.textMuted, fontSize: typeScale.meta }}>{label}</dt>
                <dd
                  style={{
                    margin: '2px 0 0',
                    color: theme.text,
                    fontSize: typeScale.meta,
                    lineHeight: 1.4,
                  }}
                >
                  {value}
                </dd>
              </div>
            ))}
        </dl>
        {selectedText.normalizations.length > 0 && (
          <Disclosure
            isDark={isDark}
            summary={`Source/display differences (${selectedText.normalizations.length})`}
          >
            <div style={{ display: 'grid', gap: '8px' }}>
              {selectedText.normalizations.map(normalization => (
                <div key={normalization.field} style={{ lineHeight: 1.45 }}>
                  <strong style={{ color: theme.text, textTransform: 'capitalize' }}>
                    {normalization.field}
                  </strong>
                  <div>Source: “{normalization.source}”</div>
                  <div>Display: “{normalization.normalized}”</div>
                  <div>{normalization.reasons.join(' ')}</div>
                  {normalization.evidence.length > 0 && (
                    <div>Evidence: {normalization.evidence.join(' ')}</div>
                  )}
                </div>
              ))}
            </div>
          </Disclosure>
        )}
        <Disclosure isDark={isDark} summary="Values">
          <ColorValues
            isDark={isDark}
            hex={selectedColor.hex}
            rows={[
              { label: 'HEX', value: selectedColor.hex.toUpperCase() },
              { label: 'RGB', value: hexChannels(selectedColor.hex).join(', ') },
            ]}
          />
        </Disclosure>
        <p style={{ ...paragraph, marginTop: '8px' }}>
          Patrick Syme’s 1821 second edition. Independently transcribed and sampled from the
          public-domain Getty scan.
        </p>
      </BottomSheet>
    ) : null;

  return (
    <ColorBrowseFrame
      isDark={isDark}
      gridLabel="Werner colors"
      topRow={
        <>
          {librarySwitch}
          <ColorSearch
            isDark={isDark}
            label="Search Werner colors"
            count={colors.length}
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </>
      }
      chips={WERNER_GROUPS.map(group => (
        <Chip
          key={group.id}
          isDark={isDark}
          pressed={selectedGroup === group.id}
          onClick={() => setSelectedGroup(group.id)}
        >
          {group.name}
        </Chip>
      ))}
      sheet={sheet}
    >
      {filteredColors.map(color => (
        <HistoricalColorSwatchCard
          key={color.id}
          color={color}
          selected={selectedColor?.id === color.id}
          ringColors={{ gap: theme.bg, ring: theme.text }}
          onOpen={() => setSelectedColor(color)}
          markerLabel={color.characteristic ? 'Characteristic color' : undefined}
        />
      ))}
      {filteredColors.length === 0 && <EmptyGrid isDark={isDark} />}
    </ColorBrowseFrame>
  );
};
