import * as React from 'react';
import type { SavedGrid } from '../types/grid';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { themeFor, type as typeScale } from '../lib/theme';
import { buttonStyle } from './TeulUI';
import { gridDialogOverlay, gridDialogPanel, gridDialogTitle } from './GridSheet';

interface EditGridModalProps {
  grid: SavedGrid;
  isDark: boolean;
  onSave: (updates: Partial<SavedGrid>) => void;
  onCancel: () => void;
}

export const EditGridModal: React.FC<EditGridModalProps> = ({ grid, isDark, onSave, onCancel }) => {
  const theme = themeFor(isDark);
  const [name, setName] = React.useState(grid.name);
  const [description, setDescription] = React.useState(grid.description);
  const [tags, setTags] = React.useState(grid.tags.join(', '));
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = useModalAccessibility({ onClose: onCancel, initialFocusRef: nameInputRef });

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontSize: typeScale.meta,
    fontWeight: 500,
    color: theme.textMuted,
  };
  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.inputBg,
    color: theme.text,
    fontSize: typeScale.body,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={gridDialogOverlay}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-grid-title"
        tabIndex={-1}
        style={gridDialogPanel(theme, 340)}
      >
        <h3
          id="edit-grid-title"
          style={{ ...gridDialogTitle, marginBottom: '14px' }}
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

        <div style={{ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} className="teul-hover" style={buttonStyle(theme)}>
            Cancel
          </button>
          <button
            type="button"
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
            style={buttonStyle(theme, 'primary')}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
