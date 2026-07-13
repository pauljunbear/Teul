import * as React from 'react';
import type { SavedGrid } from '../types/grid';
import { GridMiniPreview } from './GridPreview';
import {
  loadSavedGrids,
  deleteSavedGrid,
  updateSavedGrid,
  duplicateSavedGrid,
  downloadGridsAsJSON,
  importGridsFromFile,
  searchSavedGrids,
} from '../lib/gridStorage';
import {
  buildApplyGridMessage,
  buildCreateGridFrameMessage,
  getPresetApplicationMode,
  getPresetFrameDimensions,
  getPresetSourceDimensions,
} from '../lib/figmaGrids';
import { analyzeResolvedPresetFits } from '../lib/gridFit';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import type { SelectionInfoMessage } from '../types/messages';

interface MyGridsProps {
  isDark: boolean;
  onSaveGrid?: (grid: SavedGrid) => void;
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
    cardBg: '#ffffff',
    cardHoverBg: '#f8f8f8',
    dangerBg: '#fef2f2',
    dangerText: '#dc2626',
    successBg: '#f0fdf4',
    successText: '#16a34a',
    warningBg: '#fffbeb',
    warningText: '#b45309',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#2a2a2a',
    cardBg: '#262626',
    cardHoverBg: '#333333',
    dangerBg: '#450a0a',
    dangerText: '#fca5a5',
    successBg: '#052e16',
    successText: '#86efac',
    warningBg: '#451a03',
    warningText: '#fcd34d',
  },
};

// ============================================
// Grid Card Component
// ============================================

interface GridCardProps {
  grid: SavedGrid;
  isDark: boolean;
  onApply: () => void;
  onCreateFrame: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const GridCard: React.FC<GridCardProps> = ({
  grid,
  isDark,
  onApply,
  onCreateFrame,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const theme = isDark ? styles.dark : styles.light;

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: theme.cardBg,
        borderRadius: '10px',
        border: `1px solid ${theme.border}`,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Preview */}
      <div
        style={{
          marginBottom: '10px',
          borderRadius: '6px',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1e1e1e' : '#f0f0f0',
          padding: '8px',
        }}
      >
        <GridMiniPreview
          config={grid.config}
          size={64}
          isDark={isDark}
          referenceDimensions={grid.referenceDimensions}
          applicationMode={grid.applicationMode}
          responsiveWidth={grid.responsiveWidth}
          aspectRatio={grid.aspectRatio}
        />
      </div>

      {/* Info */}
      <h4
        style={{
          margin: '0 0 4px 0',
          fontSize: '12px',
          fontWeight: 600,
          color: theme.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {grid.name}
      </h4>

      <p
        style={{
          margin: '0 0 6px 0',
          fontSize: '10px',
          color: theme.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {grid.description || 'No description'}
      </p>

      {grid.referenceDimensions && (
        <p
          style={{
            margin: '0 0 6px 0',
            fontSize: '9px',
            color: theme.textMuted,
          }}
        >
          {getPresetApplicationMode(grid) === 'canonical-only'
            ? 'Canonical frame only'
            : getPresetApplicationMode(grid) === 'responsive-width'
              ? `Responsive ${grid.responsiveWidth?.min}-${grid.responsiveWidth?.max ?? '∞'}px width`
              : getPresetApplicationMode(grid) === 'scale-from-reference'
                ? 'Scales from reference'
                : 'Fixed measurements'}{' '}
          · {grid.referenceDimensions.width}×{grid.referenceDimensions.height}px
        </p>
      )}

      {/* Tags */}
      {grid.tags.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            marginBottom: '8px',
          }}
        >
          {grid.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                backgroundColor: isDark ? '#333' : '#e5e5e5',
                color: theme.textMuted,
              }}
            >
              {tag}
            </span>
          ))}
          {grid.tags.length > 3 && (
            <span style={{ fontSize: '9px', color: theme.textMuted }}>+{grid.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Primary actions */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginTop: '8px',
        }}
      >
        <button
          onClick={onApply}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
        <button
          onClick={onCreateFrame}
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent',
            color: theme.text,
            fontSize: '10px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          title="Create new frame"
          aria-label="Create new frame with this grid"
        >
          +
        </button>
      </div>

      {/* Secondary actions */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          gap: '4px',
        }}
      >
        <button
          onClick={onEdit}
          title="Edit"
          aria-label="Edit grid settings"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.cardBg,
            color: theme.textMuted,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✏️
        </button>
        <button
          onClick={onDuplicate}
          title="Duplicate"
          aria-label="Duplicate this grid"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.cardBg,
            color: theme.textMuted,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          📋
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          aria-label="Delete this grid"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.dangerBg,
            color: theme.dangerText,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

// ============================================
// Edit Modal Component
// ============================================

interface EditModalProps {
  grid: SavedGrid;
  isDark: boolean;
  onSave: (updates: Partial<SavedGrid>) => void;
  onCancel: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ grid, isDark, onSave, onCancel }) => {
  const theme = isDark ? styles.dark : styles.light;
  const [name, setName] = React.useState(grid.name);
  const [description, setDescription] = React.useState(grid.description);
  const [tags, setTags] = React.useState(grid.tags.join(', '));
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = useModalAccessibility({ onClose: onCancel, initialFocusRef: nameInputRef });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-grid-title"
        tabIndex={-1}
        style={{
          width: '340px',
          backgroundColor: theme.bg,
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}
      >
        <h3
          id="edit-grid-title"
          style={{
            margin: '0 0 16px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: theme.text,
          }}
        >
          Edit Grid
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label
              htmlFor="edit-grid-name"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
              }}
            >
              Name
            </label>
            <input
              id="edit-grid-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="edit-grid-description"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
              }}
            >
              Description
            </label>
            <textarea
              id="edit-grid-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="edit-grid-tags"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
              }}
            >
              Tags (comma-separated)
            </label>
            <input
              id="edit-grid-tags"
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="poster, swiss, 4-column"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '20px',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                name: name.trim() || 'Untitled Grid',
                description: description.trim(),
                tags: tags
                  .split(',')
                  .map(t => t.trim())
                  .filter(Boolean),
              })
            }
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Delete Confirmation Modal
// ============================================

interface DeleteModalProps {
  gridName: string;
  isDark: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ gridName, isDark, onConfirm, onCancel }) => {
  const theme = isDark ? styles.dark : styles.light;
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useModalAccessibility({ onClose: onCancel, initialFocusRef: cancelButtonRef });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-grid-title"
        aria-describedby="delete-grid-description"
        tabIndex={-1}
        style={{
          width: '300px',
          backgroundColor: theme.bg,
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗑️</div>
        <h3
          id="delete-grid-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: theme.text,
          }}
        >
          Delete Grid?
        </h3>
        <p
          id="delete-grid-description"
          style={{
            margin: '0 0 20px 0',
            fontSize: '13px',
            color: theme.textMuted,
          }}
        >
          Are you sure you want to delete &ldquo;{gridName}&rdquo;? This action cannot be undone.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Main MyGrids Component
// ============================================

export const MyGrids: React.FC<MyGridsProps> = ({ isDark }) => {
  const theme = isDark ? styles.dark : styles.light;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const nextApplyRequestIdRef = React.useRef(0);
  const pendingApplyRef = React.useRef<{ grid: SavedGrid; requestId: string } | null>(null);
  const pendingApplyResultRef = React.useRef<{ gridName: string; requestId: string } | null>(null);

  // State
  const [grids, setGrids] = React.useState<SavedGrid[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingGrid, setEditingGrid] = React.useState<SavedGrid | null>(null);
  const [deletingGrid, setDeletingGrid] = React.useState<SavedGrid | null>(null);
  const [notification, setNotification] = React.useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Load grids on mount
  React.useEffect(() => {
    setGrids(loadSavedGrids());
  }, []);

  // Filter grids by search
  const filteredGrids = React.useMemo(() => {
    if (!searchQuery.trim()) return grids;
    return searchSavedGrids(searchQuery);
  }, [grids, searchQuery]);

  // Show notification
  const showNotification = React.useCallback(
    (type: 'success' | 'warning' | 'error', message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 3000);
    },
    []
  );

  const notifyApplyFailure = React.useCallback(
    (message: string) => {
      showNotification('error', message);
      parent.postMessage({ pluginMessage: { type: 'notify', text: message } }, '*');
    },
    [showNotification]
  );

  const applyGridToSelection = React.useCallback(
    (grid: SavedGrid, currentSelection: SelectionInfoMessage, requestId: string) => {
      if (!currentSelection.hasSelection) {
        notifyApplyFailure('Please select a frame first');
        return;
      }

      const currentTargets = currentSelection.eligibleTargets;
      if (currentTargets.length === 0) {
        notifyApplyFailure('No selected elements can accept layout grids.');
        return;
      }

      const sourceDimensions = getPresetSourceDimensions(grid);
      const applicationMode = getPresetApplicationMode(grid);
      const fit = analyzeResolvedPresetFits(grid, currentTargets, sourceDimensions);
      if (fit.status === 'fail') {
        const failedTarget = fit.representative.frame;
        notifyApplyFailure(
          fit.representative.recommendations[0]?.message ??
            `This grid does not fit ${failedTarget.name ?? 'one selected target'}.`
        );
        return;
      }

      const message = buildApplyGridMessage({
        requestId,
        config: grid.config,
        expectedTargetIds: currentTargets.map(target => target.id),
        sourceDimensions,
        applicationMode,
        responsiveWidth: grid.responsiveWidth,
        replaceExisting: true,
      });

      pendingApplyResultRef.current = {
        gridName: grid.name,
        requestId,
      };
      parent.postMessage({ pluginMessage: message }, '*');
    },
    [notifyApplyFailure]
  );

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;

      if (msg?.type === 'selection-info') {
        const pendingApply = pendingApplyRef.current;
        if (!pendingApply || msg.requestId !== pendingApply.requestId) return;

        pendingApplyRef.current = null;
        const currentSelection: SelectionInfoMessage = {
          type: 'selection-info',
          requestId: msg.requestId,
          hasSelection: msg.hasSelection,
          isFrame: msg.isFrame,
          selectedCount: msg.selectedCount,
          eligibleTargets: Array.isArray(msg.eligibleTargets) ? msg.eligibleTargets : [],
          ineligibleCount: msg.ineligibleCount,
          width: msg.width,
          height: msg.height,
          name: msg.name,
        };

        applyGridToSelection(pendingApply.grid, currentSelection, pendingApply.requestId);
        return;
      }

      if (msg?.type === 'grid-applied') {
        const pendingResult = pendingApplyResultRef.current;
        if (!pendingResult || msg.requestId !== pendingResult.requestId) return;

        pendingApplyResultRef.current = null;

        showNotification(
          msg.success ? 'success' : 'error',
          msg.message ||
            msg.error ||
            (msg.success
              ? `Applied "${pendingResult.gridName}"`
              : `Failed to apply "${pendingResult.gridName}"`)
        );
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyGridToSelection, showNotification]);

  // Apply grid to selection
  const handleApplyGrid = (grid: SavedGrid) => {
    const requestId = `saved-grid-apply-${++nextApplyRequestIdRef.current}`;
    pendingApplyResultRef.current = null;
    pendingApplyRef.current = { grid, requestId };
    parent.postMessage(
      {
        pluginMessage: {
          type: 'get-selection-for-grid',
          requestId,
        },
      },
      '*'
    );
  };

  // Create new frame with grid
  const handleCreateFrame = (grid: SavedGrid) => {
    const dimensions = getPresetFrameDimensions(grid);
    const message = buildCreateGridFrameMessage({
      config: grid.config,
      frameName: `Grid - ${grid.name}`,
      width: dimensions.width,
      height: dimensions.height,
      positionNearSelection: true,
    });
    parent.postMessage({ pluginMessage: message }, '*');
  };

  // Edit grid
  const handleEditGrid = (grid: SavedGrid, updates: Partial<SavedGrid>) => {
    try {
      const updated = updateSavedGrid(grid.id, updates);
      setGrids(updated);
      setEditingGrid(null);
      showNotification('success', 'Grid updated');
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to update grid');
    }
  };

  // Duplicate grid
  const handleDuplicateGrid = (grid: SavedGrid) => {
    try {
      const duplicate = duplicateSavedGrid(grid.id);
      if (duplicate) {
        setGrids(loadSavedGrids());
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
  const handleDeleteGrid = (grid: SavedGrid) => {
    try {
      const updated = deleteSavedGrid(grid.id);
      setGrids(updated);
      setDeletingGrid(null);
      showNotification('success', `Deleted "${grid.name}"`);
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to delete grid');
    }
  };

  // Export grids
  const handleExport = () => {
    if (grids.length === 0) {
      showNotification('error', 'No grids to export');
      return;
    }
    downloadGridsAsJSON(grids);
    showNotification('success', `Exported ${grids.length} grid(s)`);
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
              <GridCard
                key={grid.id}
                grid={grid}
                isDark={isDark}
                onApply={() => handleApplyGrid(grid)}
                onCreateFrame={() => handleCreateFrame(grid)}
                onEdit={() => setEditingGrid(grid)}
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
        <EditModal
          grid={editingGrid}
          isDark={isDark}
          onSave={updates => handleEditGrid(editingGrid, updates)}
          onCancel={() => setEditingGrid(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingGrid && (
        <DeleteModal
          gridName={deletingGrid.name}
          isDark={isDark}
          onConfirm={() => handleDeleteGrid(deletingGrid)}
          onCancel={() => setDeletingGrid(null)}
        />
      )}
    </div>
  );
};
