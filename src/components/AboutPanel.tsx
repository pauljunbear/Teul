import * as React from 'react';
import { useModalAccessibility } from '../lib/useModalAccessibility';

interface AboutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  title: string;
  emoji: string;
  content: {
    heading: string;
    text: string;
  }[];
  credit?: {
    text: string;
    link?: string;
  };
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    sectionBg: '#f5f5f5',
    accentBg: '#eff6ff',
    accentBorder: '#3b82f6',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    sectionBg: '#262626',
    accentBg: '#1e3a5f',
    accentBorder: '#3b82f6',
  },
};

export const AboutPanel: React.FC<AboutPanelProps> = ({
  isOpen,
  onClose,
  isDark,
  title,
  emoji,
  content,
  credit,
}) => {
  const theme = isDark ? styles.dark : styles.light;
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useModalAccessibility({ isOpen, onClose, initialFocusRef: closeButtonRef });
  const titleId = React.useId();

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
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: theme.bg,
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            id={titleId}
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
            <span>{emoji}</span> {title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={`Close ${title}`}
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
        <div style={{ padding: '0 24px 20px' }}>
          {content.map((item, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: idx < content.length - 1 ? '16px' : 0,
                padding: '14px',
                backgroundColor: theme.sectionBg,
                borderRadius: '10px',
              }}
            >
              <h4
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: theme.text,
                }}
              >
                {item.heading}
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  lineHeight: 1.6,
                  color: theme.textMuted,
                }}
              >
                {item.text}
              </p>
            </div>
          ))}

          {/* Credit */}
          {credit && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: theme.accentBg,
                borderRadius: '8px',
                borderLeft: `3px solid ${theme.accentBorder}`,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '10px',
                  lineHeight: 1.5,
                  color: theme.textMuted,
                }}
              >
                {credit.text}
              </p>
            </div>
          )}
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

// About content for Wada Sanzo
export const WADA_ABOUT_CONTENT = {
  title: 'About Sanzo Wada',
  emoji: '🎨',
  content: [
    {
      heading: 'The Dictionary of Color Combinations',
      text: "The modern corpus presents 159 normalized colors used across 348 combinations from Sanzo Wada's 1930s color-combination work.",
    },
    {
      heading: 'Digital Approximation',
      text: 'The bundled sRGB values are digital approximations based on modern Seigensha CMYK recipes, not exact historical RGB colors.',
    },
  ],
  credit: {
    text: "Bundled data converted by mattdesl's dictionary-of-colour-combinations project, which credits Dain M. Blodorn Kim's original digital compilation.",
  },
};

// About content for Werner
export const WERNER_ABOUT_CONTENT = {
  title: "About Werner's Colors",
  emoji: '📜',
  content: [
    {
      heading: "Werner's Nomenclature of Colours",
      text: "The familiar 110-color collection is Patrick Syme's 1821 second edition, adapted from Abraham Gottlob Werner's nomenclature. The 1814 first edition contains 108 colors.",
    },
    {
      heading: 'The Natural World',
      text: "Its references to animals, vegetables, and minerals are principally Syme's contribution. Teul independently transcribes the public-domain edition and reproducibly samples the Getty scan's aged painted swatches.",
    },
  ],
  credit: {
    text: "Patrick Syme's 1821 second edition; public-domain scan from Getty Research Institute.",
  },
};

export default AboutPanel;
