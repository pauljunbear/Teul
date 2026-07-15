import * as React from 'react';
import { useMemo, useState } from 'react';
import { Copy, MagicWand, PaintBucket, PencilSimple, Question, Swatches, X } from './Icons';
import { wernerColors, WERNER_GROUPS, WernerColor, getWernerTextRecord } from '../wernerColorData';
import { ColorSystemModal } from './ColorSystemModal';
import { AboutPanel, WERNER_ABOUT_CONTENT } from './AboutPanel';
import { copyToClipboard } from '../lib/clipboard';
import { styles } from '../lib/theme';
import { getAccessibleTextColor } from '../lib/accessibility';
import { WERNER_SOURCE_PROVENANCE } from '../lib/sourceProvenance';
import type { NormalizedDocumentColorProfile } from '../types/messages';
import { SourceProvenanceDisclosure } from './SourceProvenanceDisclosure';
import { createRequestId } from '../lib/requestId';
import { useOptionalWorkspaceState } from '../lib/workspaceState';
import { HistoricalColorSwatchCard } from './HistoricalColorSwatchCard';

interface WernerColorsTabProps {
  isDark: boolean;
  documentColorProfile?: NormalizedDocumentColorProfile;
}

export const WernerColorsTab: React.FC<WernerColorsTabProps> = ({
  isDark,
  documentColorProfile = 'unknown',
}) => {
  const workspaceContext = useOptionalWorkspaceState();
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [localSelectedGroup, setLocalSelectedGroup] = useState(-1);
  const [selectedColor, setSelectedColor] = useState<WernerColor | null>(null);
  const [showColorSystem, setShowColorSystem] = useState(false);
  const [colorSystemColors, setColorSystemColors] = useState<{ hex: string; name: string }[]>([]);
  const [colorSystemName, setColorSystemName] = useState('');
  const [showAbout, setShowAbout] = useState(false);

  const searchTerm = workspaceContext?.state.werner.searchTerm ?? localSearchTerm;
  const selectedGroup = workspaceContext?.state.werner.selectedGroup ?? localSelectedGroup;
  const addRecentColor = workspaceContext?.addRecentColor ?? (() => undefined);
  const theme = isDark ? styles.dark : styles.light;

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
    let filtered = wernerColors;
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
  }, [searchTerm, selectedGroup]);

  const selectedText = useMemo(
    () => (selectedColor ? getWernerTextRecord(selectedColor) : null),
    [selectedColor]
  );

  const buttonStyle = (active = false): React.CSSProperties => ({
    minHeight: '32px',
    padding: '7px 8px',
    border: `1px solid ${active ? theme.text : theme.border}`,
    borderRadius: '7px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    backgroundColor: active ? theme.btnActive : theme.btnBg,
    color: active ? theme.btnActiveText : theme.text,
    cursor: 'pointer',
    fontSize: '9px',
    fontWeight: 600,
  });

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            aria-label="Search Werner colors"
            placeholder="Search Werner’s colors..."
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              backgroundColor: theme.inputBg,
              color: theme.text,
              fontSize: '11px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            title="About Werner’s Nomenclature"
            aria-label="Learn about Werner’s Nomenclature of Colours"
            style={{ ...buttonStyle(), width: '32px', minHeight: '32px', padding: 0 }}
          >
            <Question size={14} />
          </button>
        </div>

        <div
          style={{
            marginTop: '6px',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '3px',
          }}
        >
          {WERNER_GROUPS.map(group => (
            <button
              key={group.id}
              type="button"
              onClick={() => setSelectedGroup(group.id)}
              style={{
                minWidth: 0,
                minHeight: '25px',
                padding: '3px 2px',
                border: 0,
                borderRadius: '5px',
                overflow: 'hidden',
                backgroundColor: selectedGroup === group.id ? theme.btnActive : theme.btnBg,
                color: selectedGroup === group.id ? theme.btnActiveText : theme.text,
                cursor: 'pointer',
                fontSize: '8px',
                fontWeight: 600,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={group.name}
            >
              {group.name}
            </button>
          ))}
        </div>
        <SourceProvenanceDisclosure provenance={WERNER_SOURCE_PROVENANCE} isDark={isDark} />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: selectedColor ? 'minmax(0, 1fr) 170px' : 'minmax(0, 1fr)',
          overflow: 'hidden',
        }}
      >
        <div style={{ minWidth: 0, padding: '12px', overflowY: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: selectedColor ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)',
              gap: '8px',
            }}
          >
            {filteredColors.map(color => (
              <HistoricalColorSwatchCard
                key={color.id}
                color={color}
                onOpen={() => setSelectedColor(color)}
                markerLabel={color.characteristic ? 'Characteristic color' : undefined}
              />
            ))}
            {filteredColors.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '40px',
                  textAlign: 'center',
                  color: theme.textMuted,
                }}
              >
                No colors found
              </div>
            )}
          </div>
        </div>

        {selectedColor && selectedText && (
          <aside
            aria-label={`${selectedColor.name} inspector`}
            style={{
              minWidth: 0,
              padding: '10px',
              borderLeft: `1px solid ${theme.border}`,
              overflowY: 'auto',
              backgroundColor: theme.inputBg,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5px' }}>
              <button
                type="button"
                aria-label="Close color inspector"
                onClick={() => setSelectedColor(null)}
                style={{ ...buttonStyle(), width: '26px', minHeight: '26px', padding: 0 }}
              >
                <X size={12} />
              </button>
            </div>
            <div
              style={{
                minHeight: '92px',
                padding: '10px',
                borderRadius: '9px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                backgroundColor: selectedColor.hex,
                color: getAccessibleTextColor(selectedColor.hex).hex,
              }}
            >
              <span style={{ fontSize: '7px', fontWeight: 700, textTransform: 'uppercase' }}>
                {selectedColor.group}
              </span>
              <strong style={{ marginTop: '3px', fontSize: '12px', lineHeight: 1.15 }}>
                {selectedColor.name}
              </strong>
              <span style={{ marginTop: '3px', fontFamily: 'monospace', fontSize: '8px' }}>
                {selectedColor.hex.toUpperCase()}
              </span>
            </div>

            <p
              style={{
                margin: '10px 0',
                color: theme.textMuted,
                fontSize: '8px',
                lineHeight: 1.45,
              }}
            >
              {selectedText.normalized.description}
            </p>

            <dl style={{ margin: '0 0 10px', display: 'grid', gap: '7px' }}>
              {[
                ['Animal', selectedText.normalized.animal],
                ['Vegetable', selectedText.normalized.vegetable],
                ['Mineral', selectedText.normalized.mineral],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt
                      style={{
                        color: theme.textMuted,
                        fontSize: '7px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label}
                    </dt>
                    <dd
                      style={{
                        margin: '2px 0 0',
                        color: theme.text,
                        fontSize: '8px',
                        lineHeight: 1.35,
                      }}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>

            {selectedText.normalizations.length > 0 && (
              <details style={{ marginBottom: '10px', color: theme.textMuted, fontSize: '8px' }}>
                <summary style={{ cursor: 'pointer' }}>
                  Source/display differences ({selectedText.normalizations.length})
                </summary>
                <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                  {selectedText.normalizations.map(normalization => (
                    <div key={normalization.field} style={{ lineHeight: 1.4 }}>
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
              </details>
            )}

            <div style={{ display: 'grid', gap: '5px' }}>
              <button
                onClick={() => postColorAction('apply-fill', selectedColor)}
                style={buttonStyle(true)}
              >
                <PaintBucket size={13} /> Use as fill
              </button>
              <button
                onClick={() => postColorAction('apply-stroke', selectedColor)}
                style={buttonStyle()}
              >
                <PencilSimple size={13} /> Use as stroke
              </button>
              <button
                onClick={() => postColorAction('create-style', selectedColor)}
                style={buttonStyle()}
              >
                <Swatches size={13} /> Create style
              </button>
              <button
                onClick={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
                style={buttonStyle()}
              >
                <Copy size={13} /> Copy value
              </button>
              <button onClick={() => beginColorSystem(selectedColor)} style={buttonStyle()}>
                <MagicWand size={13} /> Create system
              </button>
            </div>

            <p
              style={{
                margin: '10px 0 0',
                color: theme.textMuted,
                fontSize: '7px',
                lineHeight: 1.4,
              }}
            >
              Patrick Syme’s 1821 second edition. Independently transcribed and sampled from the
              public-domain Getty scan.
            </p>
          </aside>
        )}
      </div>

      <ColorSystemModal
        isOpen={showColorSystem}
        onClose={() => setShowColorSystem(false)}
        colors={colorSystemColors}
        combinationName={colorSystemName}
        isDark={isDark}
        documentColorProfile={documentColorProfile}
      />

      <AboutPanel
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        isDark={isDark}
        {...WERNER_ABOUT_CONTENT}
      />
    </div>
  );
};
