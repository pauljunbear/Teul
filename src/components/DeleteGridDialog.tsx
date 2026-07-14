import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { myGridStyles } from './myGridTheme';

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
  const theme = isDark ? myGridStyles.dark : myGridStyles.light;
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
          style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: theme.text }}
        >
          Delete Grid?
        </h3>
        <p
          id="delete-grid-description"
          style={{ margin: '0 0 20px', fontSize: '13px', color: theme.textMuted }}
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
