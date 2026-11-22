import * as React from 'react';
import type {
  GridApplicationMode,
  GridConfig,
  GridCategory,
  GridConstructionV2,
  GridDimensions,
  GridNativeResources,
  GridResponsiveWidth,
  SavedGrid,
} from '../types/grid';
import { GridMiniPreview } from './GridPreview';
import { createSavedGrid, addSavedGrid } from '../lib/gridStorage';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { themeFor, type as typeScale } from '../lib/theme';

interface SaveGridModalProps {
  /** Grid configuration to save */
  config: GridConfig;
  /** Pre-fill name suggestion */
  suggestedName?: string;
  /** Source of the grid (e.g., "Swiss 4-Column") */
  source?: string;
  /** Suggested aspect ratio */
  aspectRatio?: string;
  /** Canonical dimensions inherited from a bundled preset */
  referenceDimensions?: GridDimensions;
  /** Pixel-measurement behavior inherited from a bundled preset */
  applicationMode?: GridApplicationMode;
  /** Responsive width behavior inherited from a bundled named system. */
  responsiveWidth?: GridResponsiveWidth;
  /** Linked resources retained by native Figma capture. */
  nativeResources?: GridNativeResources;
  /** Versioned source geometry retained independently of the native realization. */
  construction?: GridConstructionV2;
  /** Dark mode */
  isDark: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when grid is saved successfully */
  onSave?: (grid: SavedGrid) => void;
}

/** Save dialog surfaces from the shared theme tokens (2026-11 redesign). */
const paletteFor = (isDark: boolean) => {
  const tokens = themeFor(isDark);
  return {
    bg: tokens.sheetBg,
    text: tokens.text,
    textMuted: tokens.textMuted,
    border: tokens.border,
    inputBg: tokens.inputBg,
    successBg: tokens.okBg,
    successText: tokens.ok,
    primary: tokens.btnActive,
    primaryText: tokens.btnActiveText,
    errorBg: tokens.errorBg,
    error: tokens.no,
  };
};

const CATEGORY_OPTIONS: { value: GridCategory; label: string; icon: string }[] = [
  { value: 'custom', label: 'Custom', icon: '✨' },
  { value: 'classic-swiss', label: 'Swiss-Inspired', icon: '🇨🇭' },
  { value: 'editorial', label: 'Editorial', icon: '📰' },
  { value: 'poster', label: 'Poster', icon: '🎨' },
  { value: 'web-ui', label: 'Web/UI', icon: '💻' },
  { value: 'modular', label: 'Modular', icon: '🔲' },
  { value: 'baseline', label: 'Uniform Grid', icon: '📏' },
  { value: 'combined', label: 'Combined', icon: '🎯' },
];

const SAVE_GRID_TITLE_ID = 'save-grid-dialog-title';
const SAVE_GRID_NAME_ID = 'save-grid-name';
const SAVE_GRID_DESCRIPTION_ID = 'save-grid-description';
const SAVE_GRID_CATEGORY_ID = 'save-grid-category';
const SAVE_GRID_TAGS_ID = 'save-grid-tags';

export const SaveGridModal: React.FC<SaveGridModalProps> = ({
  config,
  suggestedName = '',
  source,
  aspectRatio,
  referenceDimensions,
  applicationMode,
  responsiveWidth,
  nativeResources,
  construction,
  isDark,
  onClose,
  onSave,
}) => {
  const theme = paletteFor(isDark);

  // Form state
  const [name, setName] = React.useState(suggestedName || 'My Grid');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState<GridCategory>('custom');
  const [tags, setTags] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = useModalAccessibility({
    onClose,
    closeOnEscape: !isSaving || isSaved,
    initialFocusRef: nameInputRef,
  });

  React.useEffect(() => {
    if (isSaved) {
      dialogRef.current?.focus();
    }
  }, [dialogRef, isSaved]);

  // Auto-generate tags based on config
  React.useEffect(() => {
    const autoTags: string[] = [];

    if (config.columns) {
      autoTags.push(`${config.columns.count}-column`);
    }
    if (config.rows) {
      autoTags.push(`${config.rows.count}-row`);
      autoTags.push('modular');
    }
    if (config.baseline) {
      autoTags.push('uniform-grid');
      autoTags.push(`${config.baseline.height}px`);
    }
    if (source) {
      autoTags.push(source.toLowerCase().replace(/\s+/g, '-'));
    }

    setTags(autoTags.join(', '));
  }, [config, source]);

  // Handle save
  const handleSave = React.useCallback(async () => {
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const savedGrid = createSavedGrid({
        name: name.trim(),
        description: description.trim(),
        category,
        tags: tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        config,
        source,
        aspectRatio,
        referenceDimensions,
        applicationMode,
        responsiveWidth,
        nativeResources,
        construction,
      });

      await addSavedGrid(savedGrid);

      setIsSaved(true);

      // Notify parent
      onSave?.(savedGrid);

      // Close after brief delay
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Failed to save grid:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save grid');
      setIsSaving(false);
    }
  }, [
    name,
    isSaving,
    description,
    category,
    tags,
    config,
    source,
    aspectRatio,
    referenceDimensions,
    applicationMode,
    responsiveWidth,
    nativeResources,
    construction,
    onSave,
    onClose,
  ]);

  // Save with the platform shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Enter' &&
        (e.metaKey || e.ctrlKey) &&
        !isSaving &&
        Boolean(name.trim()) &&
        dialogRef.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogRef, isSaving, name, handleSave]);

  if (isSaved) {
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
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={SAVE_GRID_TITLE_ID}
          tabIndex={-1}
          style={{
            width: '100%',
          maxWidth: '280px',
            backgroundColor: theme.bg,
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: theme.successBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              fontSize: '24px',
            }}
          >
            ✓
          </div>
          <h3
            id={SAVE_GRID_TITLE_ID}
            style={{
              margin: '0 0 8px 0',
              fontSize: typeScale.emphasis,
              fontWeight: 600,
              color: theme.text,
            }}
          >
            Grid Saved!
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: typeScale.body,
              color: theme.textMuted,
            }}
          >
            &ldquo;{name}&rdquo; has been added to My Grids
          </p>
        </div>
      </div>
    );
  }

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
        padding: '16px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={SAVE_GRID_TITLE_ID}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '360px',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          backgroundColor: theme.bg,
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3
            id={SAVE_GRID_TITLE_ID}
            style={{
              margin: 0,
              fontSize: typeScale.emphasis,
              fontWeight: 600,
              color: theme.text,
            }}
          >
            Save Grid
          </h3>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close save grid dialog"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '16px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Preview */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: theme.inputBg,
              borderRadius: '8px',
            }}
          >
            <GridMiniPreview
              config={config}
              construction={construction}
              size={80}
              isDark={isDark}
              referenceDimensions={referenceDimensions}
              applicationMode={applicationMode}
              responsiveWidth={responsiveWidth}
              aspectRatio={aspectRatio}
            />
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {saveError && (
              <div
                role="alert"
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: theme.errorBg,
                  color: theme.error,
                  fontSize: typeScale.meta,
                }}
              >
                {saveError}
              </div>
            )}

            {/* Name */}
            <div>
              <label
                htmlFor={SAVE_GRID_NAME_ID}
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: typeScale.meta,
                  fontWeight: 600,
                  color: theme.textMuted,
                }}
              >
                Name *
              </label>
              <input
                id={SAVE_GRID_NAME_ID}
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Custom Grid"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: typeScale.body,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor={SAVE_GRID_DESCRIPTION_ID}
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: typeScale.meta,
                  fontWeight: 600,
                  color: theme.textMuted,
                }}
              >
                Description
              </label>
              <textarea
                id={SAVE_GRID_DESCRIPTION_ID}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe when to use this grid..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: typeScale.body,
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor={SAVE_GRID_CATEGORY_ID}
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: typeScale.meta,
                  fontWeight: 600,
                  color: theme.textMuted,
                }}
              >
                Category
              </label>
              <select
                id={SAVE_GRID_CATEGORY_ID}
                value={category}
                onChange={e => setCategory(e.target.value as GridCategory)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: typeScale.body,
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label
                htmlFor={SAVE_GRID_TAGS_ID}
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: typeScale.meta,
                  fontWeight: 600,
                  color: theme.textMuted,
                }}
              >
                Tags (comma-separated)
              </label>
              <input
                id={SAVE_GRID_TAGS_ID}
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="poster, swiss, 4-column"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: typeScale.body,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              flex: 1,
              minHeight: '32px',
              padding: '0 14px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: typeScale.body,
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{
              flex: 1,
              minHeight: '32px',
              padding: '0 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: !name.trim() ? theme.border : theme.primary,
              color: !name.trim() ? theme.textMuted : theme.primaryText,
              fontSize: typeScale.body,
              fontWeight: 600,
              cursor: isSaving || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isSaving ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    animation: 'spin 1s linear infinite',
                  }}
                >
                  ⟳
                </span>
                Saving...
              </>
            ) : (
              <>Save Grid</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
