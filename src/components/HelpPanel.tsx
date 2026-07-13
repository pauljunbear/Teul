import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';

// ============================================
// Help Panel Component
// ============================================

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    sectionBg: '#f5f5f5',
    codeBg: '#e5e5e5',
    accentBg: '#eff6ff',
    accentBorder: '#3b82f6',
    accentText: '#1e40af',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    sectionBg: '#262626',
    codeBg: '#333333',
    accentBg: '#1e3a5f',
    accentBorder: '#3b82f6',
    accentText: '#93c5fd',
  },
};

// ============================================
// Help Content Sections
// ============================================

const HELP_SECTIONS = [
  {
    id: 'getting-started',
    title: '🚀 Getting Started',
    content: [
      {
        heading: 'Library Tab',
        text: 'Browse pre-built grid presets organized by category. Click a preset to see its details, then Apply to your selection or Create a new frame.',
      },
      {
        heading: 'Saved Tab',
        text: 'Save custom grids for reuse. Export/import grids as JSON to share with your team.',
      },
    ],
  },
  {
    id: 'grid-terminology',
    title: '📐 Grid Terminology',
    definitions: [
      {
        term: 'Columns',
        definition:
          'Vertical divisions that structure your layout. Content aligns to column edges.',
      },
      {
        term: 'Gutter',
        definition: 'Space between columns. Creates visual separation and rhythm.',
      },
      {
        term: 'Margin',
        definition: 'Space between the grid and frame edge. Provides breathing room.',
      },
      {
        term: 'Uniform Grid',
        definition:
          'Figma square cells used for spacing. This is not a horizontal-only typographic baseline grid.',
      },
      {
        term: 'Modular Grid',
        definition: 'Both columns AND rows, creating a matrix of cells for complex layouts.',
      },
      {
        term: 'Swiss Style',
        definition:
          'A design approach emphasizing systematic grids, clean typography, and asymmetric balance.',
      },
    ],
  },
  {
    id: 'inspiration',
    title: '📚 Grid Inspiration',
    content: [
      {
        heading: 'Müller-Brockmann\'s "Grid Systems"',
        text: 'The Swiss-inspired presets are modern adaptations, not historical reconstructions. Müller-Brockmann describes grids as systems derived from format, typography, and content constraints.',
      },
      {
        heading: 'International Typographic Style',
        text: 'The Swiss/International style emerged in the 1950s-60s, emphasizing clean layouts, sans-serif typography, and systematic grid-based design.',
      },
      {
        heading: 'Modern Applications',
        text: 'Modern screen grids should be checked against each target frame. Dense desktop presets may not fit narrow frames.',
      },
    ],
  },
  {
    id: 'tips',
    title: '💡 Pro Tips',
    tips: [
      'Use % for gutters/margins when designing responsive layouts.',
      'Figma uniform grids create square cells; use rows for horizontal layout guides.',
      'Start with a 4 or 6-column preset, then check the resulting column width.',
      'Save grids to My Grids for quick reuse.',
      'Export your grid library as JSON backup before major Figma updates.',
    ],
  },
];

const HELP_TITLE_ID = 'grid-system-guide-title';

export const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose, isDark }) => {
  const theme = isDark ? styles.dark : styles.light;
  const [expandedSection, setExpandedSection] = React.useState<string | null>('getting-started');
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useModalAccessibility({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) return null;

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
        padding: '20px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={HELP_TITLE_ID}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '80vh',
          backgroundColor: theme.bg,
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            id={HELP_TITLE_ID}
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: theme.text,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span>📚</span> Grid System Guide
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close grid system guide"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
          }}
        >
          {HELP_SECTIONS.map(section => (
            <div key={section.id} style={{ marginBottom: '16px' }}>
              {/* Section Header */}
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === section.id ? null : section.id)
                }
                aria-expanded={expandedSection === section.id}
                aria-controls={`${section.id}-content`}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: theme.sectionBg,
                  color: theme.text,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left',
                }}
              >
                {section.title}
                <span
                  style={{
                    transform: expandedSection === section.id ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  ▼
                </span>
              </button>

              {/* Section Content */}
              {expandedSection === section.id && (
                <div
                  id={`${section.id}-content`}
                  style={{
                    padding: '16px',
                    marginTop: '8px',
                    backgroundColor: theme.sectionBg,
                    borderRadius: '10px',
                  }}
                >
                  {/* Regular content */}
                  {section.content?.map((item, idx) => (
                    <div
                      key={idx}
                      style={{ marginBottom: idx < section.content!.length - 1 ? '12px' : 0 }}
                    >
                      <h4
                        style={{
                          margin: '0 0 4px 0',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.text,
                        }}
                      >
                        {item.heading}
                      </h4>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          lineHeight: 1.5,
                          color: theme.textMuted,
                        }}
                      >
                        {item.text}
                      </p>
                    </div>
                  ))}

                  {/* Definitions */}
                  {section.definitions?.map((def, idx) => (
                    <div
                      key={idx}
                      style={{ marginBottom: idx < section.definitions!.length - 1 ? '10px' : 0 }}
                    >
                      <dt
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: theme.text,
                          marginBottom: '2px',
                        }}
                      >
                        {def.term}
                      </dt>
                      <dd
                        style={{
                          margin: 0,
                          fontSize: '10px',
                          lineHeight: 1.4,
                          color: theme.textMuted,
                        }}
                      >
                        {def.definition}
                      </dd>
                    </div>
                  ))}

                  {/* Tips */}
                  {section.tips?.map((tip, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        marginBottom: idx < section.tips!.length - 1 ? '8px' : 0,
                      }}
                    >
                      <span style={{ color: '#f59e0b', fontSize: '12px' }}>•</span>
                      <span
                        style={{
                          fontSize: '11px',
                          lineHeight: 1.4,
                          color: theme.textMuted,
                        }}
                      >
                        {tip}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${theme.border}`,
            textAlign: 'center',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '12px 32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
