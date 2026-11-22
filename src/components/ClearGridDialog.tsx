import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { themeFor } from '../lib/theme';
import { buttonStyle } from './TeulUI';
import {
  dangerButtonStyle,
  gridDialogActions,
  gridDialogOverlay,
  gridDialogPanel,
  gridDialogText,
  gridDialogTitle,
} from './GridSheet';

interface ClearGridDialogProps {
  isDark: boolean;
  targetCount: number;
  existingGridCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ClearGridDialog: React.FC<ClearGridDialogProps> = ({
  isDark,
  targetCount,
  existingGridCount,
  onConfirm,
  onCancel,
}) => {
  const modalRef = useModalAccessibility({ isOpen: true, onClose: onCancel });
  const theme = themeFor(isDark);
  return (
    <div
      role="presentation"
      onMouseDown={event => event.target === event.currentTarget && onCancel()}
      style={gridDialogOverlay}
    >
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-grid-title"
        aria-describedby="clear-grid-description"
        tabIndex={-1}
        style={gridDialogPanel(theme)}
      >
        <h2 id="clear-grid-title" style={gridDialogTitle}>
          Clear selected grids?
        </h2>
        <p id="clear-grid-description" style={gridDialogText(theme)}>
          Remove {existingGridCount} native guide, linked style, or Teul construction layer
          {existingGridCount === 1 ? '' : 's'} across {targetCount} selected target
          {targetCount === 1 ? '' : 's'}. This becomes one Figma undo step.
        </p>
        <div style={gridDialogActions}>
          <button type="button" onClick={onCancel} className="teul-hover" style={buttonStyle(theme)}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={dangerButtonStyle(theme)}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};
