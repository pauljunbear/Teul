import * as React from 'react';
import type { SavedGrid } from '../types/grid';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { myGridStyles } from './myGridTheme';

interface EditGridModalProps {
  grid: SavedGrid;
  isDark: boolean;
  onSave: (updates: Partial<SavedGrid>) => void;
  onCancel: () => void;
}

export const EditGridModal: React.FC<EditGridModalProps> = ({ grid, isDark, onSave, onCancel }) => {
  const theme = isDark ? myGridStyles.dark : myGridStyles.light;
  const [name, setName] = React.useState(grid.name);
  const [description, setDescription] = React.useState(grid.description);
  const [tags, setTags] = React.useState(grid.tags.join(', '));
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = useModalAccessibility({ onClose: onCancel, initialFocusRef: nameInputRef });

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: 'uppercase',
  };
  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.inputBg,
    color: theme.text,
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  };

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
          style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: theme.text }}
        >
          Edit Grid
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="edit-grid-name" style={fieldLabelStyle}>
              Name
            </label>
            <input
              id="edit-grid-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label htmlFor="edit-grid-description" style={fieldLabelStyle}>
              Description
            </label>
            <textarea
              id="edit-grid-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <label htmlFor="edit-grid-tags" style={fieldLabelStyle}>
              Tags (comma-separated)
            </label>
            <input
              id="edit-grid-tags"
              type="text"
              value={tags}
              onChange={event => setTags(event.target.value)}
              placeholder="poster, swiss, 4-column"
              style={fieldStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
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
                  .map(tag => tag.trim())
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
