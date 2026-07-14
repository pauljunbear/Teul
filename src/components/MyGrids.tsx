import * as React from 'react';
import type { GridConfig, SavedGrid } from '../types/grid';
import {
  loadSavedGrids,
  deleteSavedGrid,
  updateSavedGrid,
  duplicateSavedGrid,
  downloadGridsAsJSON,
  importGridsFromFile,
  getGridStorageDiagnostics,
} from '../lib/gridStorage';
import {
  buildCreateGridFrameMessage,
  getPresetApplicationMode,
  getPresetFrameDimensions,
} from '../lib/figmaGrids';
import type { GridCaptureResultMessage } from '../types/messages';
import { createRequestId } from '../lib/requestId';
import { createConstructionV2FromGridConfig } from '../lib/gridConstructionV2';
import { GridApplyModeDialog } from './GridApplyModeDialog';
import { ClearGridDialog } from './ClearGridDialog';
import { GridBuilderModal } from './GridBuilderModal';
import { SaveGridModal } from './SaveGridModal';
import { useGridApplyController } from '../lib/useGridApplyController';
import { validatePluginToUIMessage } from '../lib/messageValidation';
import { SavedGridCard } from './SavedGridCard';
import { EditGridModal } from './EditGridModal';
import { DeleteGridDialog } from './DeleteGridDialog';
import { myGridStyles } from './myGridTheme';

interface MyGridsProps {
  isDark: boolean;
  onSaveGrid?: (grid: SavedGrid) => void;
}

// ============================================
// Main MyGrids Component
// ============================================

export const MyGrids: React.FC<MyGridsProps> = ({ isDark }) => {
  const theme = isDark ? myGridStyles.dark : myGridStyles.light;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const nextCaptureRequestIdRef = React.useRef(0);
  const pendingCaptureRequestIdRef = React.useRef<string | null>(null);
  const nextBuilderSelectionRequestIdRef = React.useRef(0);
  const pendingBuilderSelectionRequestIdRef = React.useRef<string | null>(null);

  // State
  const [grids, setGrids] = React.useState<SavedGrid[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingGrid, setEditingGrid] = React.useState<SavedGrid | null>(null);
  const [geometryEditingGrid, setGeometryEditingGrid] = React.useState<SavedGrid | null>(null);
  const [deletingGrid, setDeletingGrid] = React.useState<SavedGrid | null>(null);
  const [showGridBuilder, setShowGridBuilder] = React.useState(false);
  const [builderTargetDimensions, setBuilderTargetDimensions] = React.useState<
    { width: number; height: number } | undefined
  >();
  const [draftGrid, setDraftGrid] = React.useState<{
    config: GridConfig;
    dimensions: { width: number; height: number };
    suggestedName: string;
    source: string;
    nativeResources?: SavedGrid['nativeResources'];
    construction: NonNullable<SavedGrid['construction']>;
    applicationMode: SavedGrid['applicationMode'];
    responsiveWidth?: SavedGrid['responsiveWidth'];
  } | null>(null);
  const [notification, setNotification] = React.useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Load grids on mount
  React.useEffect(() => {
    let cancelled = false;
    void loadSavedGrids()
      .then(async savedGrids => {
        if (!cancelled) setGrids(savedGrids);
        const diagnostics = await getGridStorageDiagnostics();
        if (!cancelled && diagnostics.quarantinedCount > 0) {
          setNotification({
            type: 'warning',
            message: `${diagnostics.quarantinedCount} invalid saved grid record${diagnostics.quarantinedCount === 1 ? ' was' : 's were'} quarantined and left out of the active library.`,
          });
        }
      })
      .catch(error => {
        if (!cancelled) {
          setNotification({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to load saved grids',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter grids by search
  const filteredGrids = React.useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    if (!normalizedQuery) return grids;

    return grids.filter(grid => {
      const nameMatch = grid.name.toLowerCase().includes(normalizedQuery);
      const descMatch = grid.description.toLowerCase().includes(normalizedQuery);
      const tagMatch = grid.tags.some(tag => tag.toLowerCase().includes(normalizedQuery));
      return nameMatch || descMatch || tagMatch;
    });
  }, [grids, searchQuery]);

  // Show notification
  const showNotification = React.useCallback(
    (type: 'success' | 'warning' | 'error', message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 3000);
    },
    []
  );

  const gridController = useGridApplyController<SavedGrid>({
    requestPrefix: 'saved-grid',
    onResult: result =>
      showNotification(
        result.success ? 'success' : 'error',
        result.message || result.error || 'Grid operation finished'
      ),
    onFailure: message => showNotification('error', message),
  });

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const validation = validatePluginToUIMessage(event.data?.pluginMessage);
      if (!validation.valid) return;
      const msg = validation.message;

      if (msg.type === 'grid-capture-result') {
        const result: GridCaptureResultMessage = msg;
        if (result.requestId !== pendingCaptureRequestIdRef.current) return;
        pendingCaptureRequestIdRef.current = null;
        if (result.success && result.config && result.dimensions) {
          setDraftGrid({
            config: result.config,
            dimensions: result.dimensions,
            suggestedName: `${result.frameName ?? 'Captured Frame'} Grid`,
            source: `Captured from ${result.frameName ?? 'selected target'}`,
            nativeResources: result.nativeResources,
            construction: createConstructionV2FromGridConfig(result.config, result.dimensions),
            applicationMode: 'fixed',
          });
        } else {
          showNotification('error', result.error ?? 'Failed to capture selected grid');
        }
        return;
      }

      if (msg.type === 'selection-info') {
        if (msg.requestId === pendingBuilderSelectionRequestIdRef.current) {
          pendingBuilderSelectionRequestIdRef.current = null;
          const firstTarget = Array.isArray(msg.eligibleTargets)
            ? msg.eligibleTargets[0]
            : undefined;
          setBuilderTargetDimensions(
            firstTarget &&
              typeof firstTarget.width === 'number' &&
              typeof firstTarget.height === 'number'
              ? { width: firstTarget.width, height: firstTarget.height }
              : undefined
          );
          return;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [showNotification]);

  const handleCaptureGrid = () => {
    const requestId = `grid-capture-${++nextCaptureRequestIdRef.current}`;
    pendingCaptureRequestIdRef.current = requestId;
    parent.postMessage({ pluginMessage: { type: 'capture-selected-grid', requestId } }, '*');
  };

  const handleNewGrid = () => {
    requestBuilderSelection();
    setShowGridBuilder(true);
  };

  function requestBuilderSelection(): void {
    const requestId = `grid-builder-selection-${++nextBuilderSelectionRequestIdRef.current}`;
    pendingBuilderSelectionRequestIdRef.current = requestId;
    setBuilderTargetDimensions(undefined);
    parent.postMessage({ pluginMessage: { type: 'get-selection-for-grid', requestId } }, '*');
  }

  // Apply grid to selection
  const handleApplyGrid = (grid: SavedGrid) => gridController.requestApply(grid);

  // Create new frame with grid
  const handleCreateFrame = (grid: SavedGrid) => {
    const dimensions = getPresetFrameDimensions(grid);
    const message = buildCreateGridFrameMessage({
      requestId: createRequestId('grid-frame'),
      config: grid.config,
      frameName: `Grid - ${grid.name}`,
      width: dimensions.width,
      height: dimensions.height,
      positionNearSelection: true,
      construction: grid.construction,
    });
    parent.postMessage({ pluginMessage: message }, '*');
  };

  // Edit grid
  const handleEditGrid = async (grid: SavedGrid, updates: Partial<SavedGrid>) => {
    try {
      const updated = await updateSavedGrid(grid.id, updates);
      setGrids(updated);
      setEditingGrid(null);
      showNotification('success', 'Grid updated');
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to update grid');
    }
  };

  // Duplicate grid
  const handleDuplicateGrid = async (grid: SavedGrid) => {
    try {
      const duplicate = await duplicateSavedGrid(grid.id);
      if (duplicate) {
        setGrids(await loadSavedGrids());
        showNotification('success', `Created copy of "${grid.name}"`);
      }
    } catch (error) {
      showNotification(
        'error',
        error instanceof Error ? error.message : 'Failed to duplicate grid'
      );
    }
  };

  // Delete grid
  const handleDeleteGrid = async (grid: SavedGrid) => {
    try {
      const updated = await deleteSavedGrid(grid.id);
      setGrids(updated);
      setDeletingGrid(null);
      showNotification('success', `Deleted "${grid.name}"`);
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to delete grid');
    }
  };

  // Export grids
  const handleExport = async () => {
    if (grids.length === 0) {
      showNotification('error', 'No grids to export');
      return;
    }
    try {
      await downloadGridsAsJSON(grids);
      showNotification('success', `Exported ${grids.length} grid(s)`);
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Export failed');
    }
  };

  // Import grids
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await importGridsFromFile(file);

    if (result.success) {
      setGrids(result.grids || []);
      const importedCount = result.count ?? 0;
      const rejectedCount = result.rejectedCount ?? 0;
      if (rejectedCount > 0) {
        const totalCount = result.totalCount ?? importedCount + rejectedCount;
        showNotification(
          'warning',
          `Imported ${importedCount} of ${totalCount} grids. ${rejectedCount} invalid grid${
            rejectedCount === 1 ? ' was' : 's were'
          } rejected.`
        );
      } else {
        showNotification('success', `Imported ${importedCount} grid(s)`);
      }
    } else {
      showNotification('error', result.error || 'Import failed');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
      }}
    >
      {/* Header with search and actions */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {/* Search */}
        <input
          type="text"
          placeholder="Search your grids..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            color: theme.text,
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: '12px',
          }}
        />

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
          }}
        >
          <button onClick={handleNewGrid}>+ New Grid</button>
          <button onClick={handleCaptureGrid}>Capture Selected Frame</button>
          <button
            onClick={() => gridController.requestClear()}
            disabled={gridController.pending}
            aria-busy={gridController.pending}
          >
            Clear Selected
          </button>
          <button
            onClick={handleExport}
            disabled={grids.length === 0}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: grids.length === 0 ? theme.textMuted : theme.text,
              fontSize: '11px',
              fontWeight: 600,
              cursor: grids.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: grids.length === 0 ? 0.5 : 1,
            }}
          >
            <span>📤</span> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.text,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>📥</span> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div
          role={notification.type === 'success' ? 'status' : 'alert'}
          style={{
            padding: '10px 16px',
            backgroundColor:
              notification.type === 'success'
                ? theme.successBg
                : notification.type === 'warning'
                  ? theme.warningBg
                  : theme.dangerBg,
            color:
              notification.type === 'success'
                ? theme.successText
                : notification.type === 'warning'
                  ? theme.warningText
                  : theme.dangerText,
            fontSize: '12px',
            fontWeight: 500,
            textAlign: 'center',
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Grid List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}
      >
        {filteredGrids.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}
          >
            {filteredGrids.map(grid => (
              <SavedGridCard
                key={grid.id}
                grid={grid}
                isDark={isDark}
                onApply={() => handleApplyGrid(grid)}
                onCreateFrame={() => handleCreateFrame(grid)}
                onEdit={() => setEditingGrid(grid)}
                onEditGeometry={() => {
                  requestBuilderSelection();
                  setGeometryEditingGrid(grid);
                }}
                onDuplicate={() => handleDuplicateGrid(grid)}
                onDelete={() => setDeletingGrid(grid)}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>💾</div>
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '16px',
                fontWeight: 600,
                color: theme.text,
              }}
            >
              {searchQuery ? 'No matching grids' : 'No saved grids yet'}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: theme.textMuted,
                lineHeight: 1.5,
              }}
            >
              {searchQuery
                ? 'Try a different search term'
                : 'Save grids from the Library tab to build your collection.'}
            </p>

            {!searchQuery && (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  marginTop: '16px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📥</span> Import Grids
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer with count */}
      {grids.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            borderTop: `1px solid ${theme.border}`,
            fontSize: '11px',
            color: theme.textMuted,
            textAlign: 'center',
          }}
        >
          {filteredGrids.length === grids.length
            ? `${grids.length} saved grid${grids.length !== 1 ? 's' : ''}`
            : `${filteredGrids.length} of ${grids.length} grids`}
        </div>
      )}

      {/* Edit Modal */}
      {editingGrid && (
        <EditGridModal
          grid={editingGrid}
          isDark={isDark}
          onSave={updates => handleEditGrid(editingGrid, updates)}
          onCancel={() => setEditingGrid(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingGrid && (
        <DeleteGridDialog
          gridName={deletingGrid.name}
          isDark={isDark}
          onConfirm={() => handleDeleteGrid(deletingGrid)}
          onCancel={() => setDeletingGrid(null)}
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

      {showGridBuilder && (
        <GridBuilderModal
          isDark={isDark}
          targetDimensions={builderTargetDimensions}
          onCancel={() => setShowGridBuilder(false)}
          onContinue={value => {
            setShowGridBuilder(false);
            setDraftGrid({
              config: value.config,
              dimensions: value.dimensions,
              suggestedName: 'My Grid',
              source: 'Created in Teul',
              construction: value.construction,
              applicationMode: value.applicationMode,
              responsiveWidth: value.responsiveWidth,
            });
          }}
        />
      )}

      {geometryEditingGrid && (
        <GridBuilderModal
          isDark={isDark}
          targetDimensions={builderTargetDimensions}
          initialValue={{
            config: geometryEditingGrid.config,
            construction:
              geometryEditingGrid.construction ??
              createConstructionV2FromGridConfig(
                geometryEditingGrid.config,
                geometryEditingGrid.referenceDimensions ??
                  getPresetFrameDimensions(geometryEditingGrid)
              ),
            dimensions:
              geometryEditingGrid.referenceDimensions ??
              getPresetFrameDimensions(geometryEditingGrid),
            applicationMode: getPresetApplicationMode(geometryEditingGrid),
            responsiveWidth: geometryEditingGrid.responsiveWidth,
          }}
          onCancel={() => setGeometryEditingGrid(null)}
          onContinue={value => {
            const grid = geometryEditingGrid;
            void updateSavedGrid(grid.id, {
              config: value.config,
              construction: value.construction,
              referenceDimensions: value.dimensions,
              applicationMode: value.applicationMode,
              responsiveWidth: value.responsiveWidth,
            })
              .then(updated => {
                setGrids(updated);
                setGeometryEditingGrid(null);
                showNotification('success', 'Grid geometry updated');
              })
              .catch(updateError => {
                showNotification(
                  'error',
                  updateError instanceof Error
                    ? updateError.message
                    : 'Failed to update grid geometry'
                );
              });
          }}
        />
      )}

      {draftGrid && (
        <SaveGridModal
          config={draftGrid.config}
          suggestedName={draftGrid.suggestedName}
          source={draftGrid.source}
          referenceDimensions={draftGrid.dimensions}
          applicationMode={draftGrid.applicationMode}
          responsiveWidth={draftGrid.responsiveWidth}
          nativeResources={draftGrid.nativeResources}
          construction={draftGrid.construction}
          isDark={isDark}
          onClose={() => setDraftGrid(null)}
          onSave={() => {
            setDraftGrid(null);
            void loadSavedGrids().then(setGrids);
          }}
        />
      )}
    </div>
  );
};
