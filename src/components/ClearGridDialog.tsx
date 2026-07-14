import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';

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
  return (
    <div
      role="presentation"
      onMouseDown={event => event.target === event.currentTarget && onCancel()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-grid-title"
        aria-describedby="clear-grid-description"
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${isDark ? '#404040' : '#e5e5e5'}`,
          backgroundColor: isDark ? '#262626' : '#ffffff',
          color: isDark ? '#ffffff' : '#1a1a1a',
          boxShadow: '0 18px 50px rgba(0,0,0,0.3)',
        }}
      >
        <h2 id="clear-grid-title" style={{ margin: '0 0 8px', fontSize: '16px' }}>
          Clear selected grids?
        </h2>
        <p
          id="clear-grid-description"
          style={{
            margin: '0 0 18px',
            color: isDark ? '#a3a3a3' : '#666666',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          Remove {existingGridCount} native guide, linked style, or Teul construction layer
          {existingGridCount === 1 ? '' : 's'} across {targetCount} selected target
          {targetCount === 1 ? '' : 's'}. This becomes one Figma undo step.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm}>Clear</button>
        </div>
      </div>
    </div>
  );
};
