import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import type { GridLinkedResourcePolicy } from '../types/grid';

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
  const background = isDark ? '#262626' : '#ffffff';
  const text = isDark ? '#ffffff' : '#1a1a1a';
  const muted = isDark ? '#a3a3a3' : '#666666';
  const border = isDark ? '#404040' : '#e5e5e5';
  const [preserveLinks, setPreserveLinks] = React.useState(linkedResourceCount > 0);
  const policy: GridLinkedResourcePolicy = preserveLinks
    ? 'preserve-if-available'
    : 'replace-with-values';

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-apply-mode-title"
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${border}`,
          background,
          color: text,
          boxShadow: '0 18px 50px rgba(0,0,0,0.3)',
        }}
      >
        <h2 id="grid-apply-mode-title" style={{ margin: '0 0 8px', fontSize: '16px' }}>
          {existingGridCount > 0 && linkedResourceCount === 0
            ? 'Existing layout grids found'
            : existingGridCount > 0
              ? 'Choose how to apply this grid'
              : 'Choose linked-resource behavior'}
        </h2>
        <p style={{ margin: '0 0 18px', color: muted, fontSize: '12px', lineHeight: 1.5 }}>
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
              margin: '0 0 18px',
              color: muted,
              fontSize: '11px',
              lineHeight: 1.45,
            }}
          >
            <input
              type="checkbox"
              checked={preserveLinks}
              onChange={event => setPreserveLinks(event.target.checked)}
            />
            <span>
              Preserve the captured grid style and variables. If a link is unavailable, Teul will
              stop and ask you to use the captured numeric values instead.
            </span>
          </label>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Cancel</button>
          {existingGridCount > 0 && <button onClick={() => onChoose(false, policy)}>Add</button>}
          <button onClick={() => onChoose(existingGridCount > 0, policy)}>
            {existingGridCount > 0 ? 'Replace' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
