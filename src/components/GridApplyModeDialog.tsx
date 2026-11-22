import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import type { GridLinkedResourcePolicy } from '../types/grid';
import { themeFor, type as typeScale } from '../lib/theme';
import { buttonStyle } from './TeulUI';
import {
  gridDialogActions,
  gridDialogOverlay,
  gridDialogPanel,
  gridDialogText,
  gridDialogTitle,
} from './GridSheet';

interface GridApplyModeDialogProps {
  isDark: boolean;
  targetCount: number;
  existingGridCount: number;
  linkedResourceCount?: number;
  onChoose: (replaceExisting: boolean, linkedResourcePolicy: GridLinkedResourcePolicy) => void;
  onCancel: () => void;
}

export const GridApplyModeDialog: React.FC<GridApplyModeDialogProps> = ({
  isDark,
  targetCount,
  existingGridCount,
  linkedResourceCount = 0,
  onChoose,
  onCancel,
}) => {
  const modalRef = useModalAccessibility({ isOpen: true, onClose: onCancel });
  const theme = themeFor(isDark);
  const [preserveLinks, setPreserveLinks] = React.useState(linkedResourceCount > 0);
  const policy: GridLinkedResourcePolicy = preserveLinks
    ? 'preserve-if-available'
    : 'replace-with-values';

  return (
    <div
      role="presentation"
      onMouseDown={event => event.target === event.currentTarget && onCancel()}
      style={gridDialogOverlay}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-apply-mode-title"
        tabIndex={-1}
        style={gridDialogPanel(theme)}
      >
        <h2 id="grid-apply-mode-title" style={gridDialogTitle}>
          {existingGridCount > 0 && linkedResourceCount === 0
            ? 'Existing layout grids found'
            : existingGridCount > 0
              ? 'Choose how to apply this grid'
              : 'Choose linked-resource behavior'}
        </h2>
        <p style={gridDialogText(theme)}>
          {existingGridCount > 0
            ? `${existingGridCount} existing grid${existingGridCount === 1 ? '' : 's'} across ${targetCount} selected target${targetCount === 1 ? '' : 's'}.`
            : `This captured grid contains ${linkedResourceCount} linked resource${linkedResourceCount === 1 ? '' : 's'}.`}
        </p>
        {linkedResourceCount > 0 && (
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              margin: '0 0 16px',
              color: theme.textMuted,
              fontSize: typeScale.meta,
              lineHeight: 1.45,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={preserveLinks}
              onChange={event => setPreserveLinks(event.target.checked)}
              style={{ width: '15px', height: '15px', margin: '1px 0 0', flex: 'none' }}
            />
            <span>
              Preserve the captured grid style and variables. If a link is unavailable, Teul will
              stop and ask you to use the captured numeric values instead.
            </span>
          </label>
        )}
        <div style={gridDialogActions}>
          <button type="button" onClick={onCancel} className="teul-hover" style={buttonStyle(theme)}>
            Cancel
          </button>
          {existingGridCount > 0 && (
            <button
              type="button"
              onClick={() => onChoose(false, policy)}
              className="teul-hover"
              style={buttonStyle(theme)}
            >
              Add
            </button>
          )}
          <button
            type="button"
            onClick={() => onChoose(existingGridCount > 0, policy)}
            style={buttonStyle(theme, 'primary')}
          >
            {existingGridCount > 0 ? 'Replace' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
