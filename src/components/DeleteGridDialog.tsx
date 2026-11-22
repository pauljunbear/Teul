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

interface DeleteGridDialogProps {
  gridName: string;
  isDark: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteGridDialog: React.FC<DeleteGridDialogProps> = ({
  gridName,
  isDark,
  onConfirm,
  onCancel,
}) => {
  const theme = themeFor(isDark);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useModalAccessibility({ onClose: onCancel, initialFocusRef: cancelButtonRef });

  return (
    <div style={gridDialogOverlay}>
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-grid-title"
        aria-describedby="delete-grid-description"
        tabIndex={-1}
        style={gridDialogPanel(theme, 320)}
      >
        <h3 id="delete-grid-title" style={gridDialogTitle}>
          Delete Grid?
        </h3>
        <p id="delete-grid-description" style={gridDialogText(theme)}>
          Are you sure you want to delete &ldquo;{gridName}&rdquo;? This action cannot be undone.
        </p>

        <div style={gridDialogActions}>
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="teul-hover"
            style={buttonStyle(theme)}
          >
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={dangerButtonStyle(theme)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
