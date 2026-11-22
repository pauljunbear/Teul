import * as React from 'react';
import { GridPresetCard } from './GridPresetCard';
import { SaveGridModal } from './SaveGridModal';
import { GRID_CATEGORIES } from '../lib/gridPresetCatalogMetadata';
import { createGridPresetCatalogLoader } from '../lib/gridPresetCatalogBridge';
import {
  buildCreateGridFrameMessage,
  getPresetApplicationMode,
  getPresetFrameDimensions,
  getPresetSourceDimensions,
  presetToFrameName,
} from '../lib/figmaGrids';
import type { GridPreset, GridCategory, GridSelectionTarget } from '../types/grid';
import { analyzeResolvedPresetFits, type GridFitAggregateAnalysis } from '../lib/gridFit';
import { createRequestId } from '../lib/requestId';
import { themeFor, type as typeScale } from '../lib/theme';
import { GridApplyModeDialog } from './GridApplyModeDialog';
import { ClearGridDialog } from './ClearGridDialog';
import { useGridApplyController } from '../lib/useGridApplyController';
import { buttonStyle, inputStyle, sheetScrollSpacer } from './TeulUI';
import { GridPresetSheet } from './GridSheet';

const loadCatalog = createGridPresetCatalogLoader();

interface GridLibraryProps {
  isDark: boolean;
}

export const GridLibrary: React.FC<GridLibraryProps> = ({ isDark }) => {
  const theme = themeFor(isDark);

  const [catalog, setCatalog] = React.useState<GridPreset[] | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [catalogAttempt, setCatalogAttempt] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal).then(
      presets => {
        if (!controller.signal.aborted) setCatalog(presets);
      },
      error => {
        if (!controller.signal.aborted) setCatalogError(error.message);
      }
    );
    return () => controller.abort();
  }, [catalogAttempt]);

  const [selectedCategory, setSelectedCategory] = React.useState<GridCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedPreset, setSelectedPreset] = React.useState<GridPreset | null>(null);
  const [showSaveModal, setShowSaveModal] = React.useState(false);
  const [operationStatus, setOperationStatus] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const gridController = useGridApplyController<GridPreset>({
    requestPrefix: 'grid-library',
    onResult: result =>
      setOperationStatus({
        success: result.success,
        message: result.message || result.error || 'Grid operation finished',
      }),
    onFailure: message => setOperationStatus({ success: false, message }),
    onPreflightFailure: preset => setSelectedPreset(preset),
  });
  const selectionInfo = gridController.selectionInfo;

  const filteredPresets = React.useMemo(() => {
    let presets = (catalog ?? []).filter(
      preset => selectedCategory === 'all' || preset.category === selectedCategory
    );

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      presets = presets.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    return presets;
  }, [catalog, selectedCategory, searchQuery]);

  const selectedTargets = React.useMemo<GridSelectionTarget[]>(() => {
    if (!selectionInfo?.hasSelection) return [];
    return selectionInfo.eligibleTargets;
  }, [selectionInfo]);

  const fitByPresetId = React.useMemo(() => {
    const fits = new Map<string, GridFitAggregateAnalysis>();
    if (selectedTargets.length > 0) {
      for (const preset of filteredPresets) {
        fits.set(
          preset.id,
          analyzeResolvedPresetFits(preset, selectedTargets, getPresetSourceDimensions(preset))
        );
      }
    }
    return fits;
  }, [filteredPresets, selectedTargets]);

  const selectedFit = React.useMemo(
    () =>
      selectedPreset && selectedTargets.length > 0
        ? analyzeResolvedPresetFits(
            selectedPreset,
            selectedTargets,
            getPresetSourceDimensions(selectedPreset)
          )
        : null,
    [selectedPreset, selectedTargets]
  );

  const handleApplyGrid = (preset: GridPreset) => gridController.requestApply(preset);

  const handleCreateFrame = (preset: GridPreset) => {
    const { width, height } = getPresetFrameDimensions(preset);

    const message = buildCreateGridFrameMessage({
      requestId: createRequestId('grid-frame'),
      config: preset.config,
      frameName: presetToFrameName(preset),
      width,
      height,
      positionNearSelection: true,
      construction: preset.construction,
    });

    parent.postMessage({ pluginMessage: message }, '*');
  };

  const singleTarget = selectedTargets.length === 1 ? selectedTargets[0] : undefined;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
        position: 'relative',
      }}
    >
      <div style={{ flexShrink: 0, padding: '0 12px 10px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            aria-label="Search grids"
            placeholder="Search grids..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle(theme), flex: 1 }}
          />
          <button
            type="button"
            onClick={() => gridController.requestClear()}
            disabled={gridController.pending}
            aria-busy={gridController.pending}
            title="Clear grids from the selected frames"
            className="teul-hover"
            style={buttonStyle(theme)}
          >
            Clear
          </button>
        </div>

        <div
          role="group"
          aria-label="Grid categories"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}
        >
          {GRID_CATEGORIES.map(cat => {
            const count = catalog?.filter(
              preset => cat.id === 'all' || preset.category === cat.id
            ).length;
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={isActive ? 'grid-category-btn' : 'grid-category-btn teul-hover'}
                aria-pressed={isActive}
                disabled={!catalog}
                title={cat.description}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setSelectedPreset(null);
                }}
                style={{
                  minHeight: '28px',
                  padding: '0 10px',
                  borderRadius: '14px',
                  border: `1px solid ${isActive ? theme.text : theme.border}`,
                  backgroundColor: isActive ? theme.text : 'transparent',
                  color: isActive ? theme.bg : theme.textMuted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: typeScale.meta,
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>{cat.name}</span>
                <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                  {count ?? '–'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
        {operationStatus && (
          <div
            role={operationStatus.success ? 'status' : 'alert'}
            style={{
              position: 'absolute',
              top: '4px',
              right: '12px',
              left: '12px',
              zIndex: 6,
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: operationStatus.success ? theme.okBg : theme.errorBg,
              color: operationStatus.success ? theme.ok : theme.no,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              fontSize: typeScale.meta,
              lineHeight: 1.4,
            }}
          >
            {operationStatus.message}
          </div>
        )}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: 'auto',
            padding: '0 12px 12px',
            boxSizing: 'border-box',
            ...sheetScrollSpacer(selectedPreset !== null),
          }}
        >
          {!catalog ? (
            <div
              role={catalogError ? 'alert' : 'status'}
              aria-live="polite"
              style={{
                padding: '40px 20px',
                color: theme.textMuted,
                textAlign: 'center',
                fontSize: typeScale.body,
              }}
            >
              <p style={{ margin: 0 }}>
                {catalogError ? 'Grid presets could not load.' : 'Loading grid presets…'}
              </p>
              {catalogError && (
                <>
                  <p style={{ margin: '6px 0 0', fontSize: typeScale.meta }}>{catalogError}</p>
                  <button
                    type="button"
                    className="teul-hover"
                    style={{ ...buttonStyle(theme), marginTop: '12px' }}
                    onClick={() => {
                      setCatalogError(null);
                      setCatalogAttempt(attempt => attempt + 1);
                    }}
                  >
                    Retry loading grid presets
                  </button>
                </>
              )}
            </div>
          ) : filteredPresets.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '8px',
                alignItems: 'stretch',
              }}
            >
              {filteredPresets.map(preset => (
                <GridPresetCard
                  key={preset.id}
                  preset={preset}
                  fit={fitByPresetId.get(preset.id)?.representative}
                  isSelected={selectedPreset?.id === preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  isDark={isDark}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.textMuted }}>
              <p
                style={{
                  margin: '0 0 6px',
                  color: theme.text,
                  fontSize: typeScale.emphasis,
                  fontWeight: 600,
                }}
              >
                No grids found
              </p>
              <p style={{ margin: 0, fontSize: typeScale.meta }}>Try adjusting your search</p>
            </div>
          )}
        </div>
      </div>

      {selectedPreset && (
        <GridPresetSheet
          preset={selectedPreset}
          isDark={isDark}
          fit={selectedFit}
          targetCount={selectedTargets.length}
          targetName={singleTarget?.name}
          onApply={() => handleApplyGrid(selectedPreset)}
          onCreateFrame={() => handleCreateFrame(selectedPreset)}
          onSave={() => setShowSaveModal(true)}
          onClose={() => setSelectedPreset(null)}
        />
      )}

      {/* Save Grid Modal */}
      {showSaveModal && selectedPreset && (
        <SaveGridModal
          config={selectedPreset.config}
          suggestedName={`${selectedPreset.name} (Copy)`}
          source={selectedPreset.name}
          aspectRatio={selectedPreset.aspectRatio}
          referenceDimensions={getPresetFrameDimensions(selectedPreset)}
          applicationMode={getPresetApplicationMode(selectedPreset)}
          responsiveWidth={selectedPreset.responsiveWidth}
          isDark={isDark}
          onClose={() => setShowSaveModal(false)}
          onSave={() => {
            setShowSaveModal(false);
            parent.postMessage(
              {
                pluginMessage: {
                  type: 'notify',
                  text: `Saved "${selectedPreset.name}" to My Grids`,
                },
              },
              '*'
            );
          }}
        />
      )}

      {gridController.pendingChoice && (
        <GridApplyModeDialog
          isDark={isDark}
          targetCount={gridController.pendingChoice.selection.eligibleTargets.length}
          existingGridCount={gridController.pendingChoice.existingGridCount}
          linkedResourceCount={gridController.pendingChoice.linkedResourceCount}
          onChoose={gridController.chooseApply}
          onCancel={gridController.cancelApplyChoice}
        />
      )}
      {gridController.pendingClear && (
        <ClearGridDialog
          isDark={isDark}
          targetCount={gridController.pendingClear.selection.eligibleTargets.length}
          existingGridCount={gridController.pendingClear.existingGridCount}
          onConfirm={gridController.confirmClear}
          onCancel={gridController.cancelClear}
        />
      )}
    </div>
  );
};
