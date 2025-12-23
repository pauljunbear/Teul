import * as React from 'react'

interface AboutPanelProps {
  isOpen: boolean
  onClose: () => void
  isDark: boolean
  title: string
  emoji: string
  content: {
    heading: string
    text: string
  }[]
  credit?: {
    text: string
    link?: string
  }
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
  }
}

export const AboutPanel: React.FC<AboutPanelProps> = ({ 
  isOpen, 
  onClose, 
  isDark, 
  title, 
  emoji, 
  content,
  credit 
}) => {
  const theme = isDark ? styles.dark : styles.light
  
  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])
  
  if (!isOpen) return null
  
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: '380px',
        backgroundColor: theme.bg,
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 700,
            color: theme.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span>{emoji}</span> {title}
          </h2>
          <button
            onClick={onClose}
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
              <h4 style={{
                margin: '0 0 6px 0',
                fontSize: '12px',
                fontWeight: 700,
                color: theme.text,
              }}>
                {item.heading}
              </h4>
              <p style={{
                margin: 0,
                fontSize: '11px',
                lineHeight: 1.6,
                color: theme.textMuted,
              }}>
                {item.text}
              </p>
            </div>
          ))}
          
          {/* Credit */}
          {credit && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              borderLeft: `3px solid ${theme.accentBorder}`,
            }}>
              <p style={{
                margin: 0,
                fontSize: '10px',
                lineHeight: 1.5,
                color: theme.textMuted,
              }}>
                {credit.text}
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${theme.border}`,
          textAlign: 'center',
        }}>
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
  )
}

// About content for Wada Sanzo
export const WADA_ABOUT_CONTENT = {
  title: 'About Sanzo Wada',
  emoji: '🎨',
  content: [
    {
      heading: 'The Dictionary of Color Combinations',
      text: 'These palettes come from Sanzo Wada\'s groundbreaking 1933 book "A Dictionary of Color Combinations" (配色辞典). Wada was a Japanese artist and designer who meticulously documented 348 color combinations for artists and designers.',
    },
    {
      heading: 'Timeless Color Theory',
      text: 'Each combination was carefully curated to work harmoniously together. Originally created for traditional Japanese design, these palettes remain strikingly relevant for modern digital design.',
    },
  ],
  credit: {
    text: 'Originally published by Seigensha Art Publishing. Digital adaptation inspired by Dain M. Blodorn\'s sanzo-wada library.',
  },
}

// About content for Werner
export const WERNER_ABOUT_CONTENT = {
  title: 'About Werner\'s Colors',
  emoji: '📜',
  content: [
    {
      heading: 'Werner\'s Nomenclature of Colours',
      text: 'These colors originate from Abraham Gottlob Werner\'s 1814 taxonomy "Werner\'s Nomenclature of Colours." This was the first standardized color naming system, used by naturalists including Charles Darwin on his Beagle voyage.',
    },
    {
      heading: 'The Natural World',
      text: 'Each color is described through examples from nature—animals, vegetables, and minerals. This poetic approach connects colors to the observable world, making it both scientific and beautifully descriptive.',
    },
  ],
  credit: {
    text: 'Digitized and preserved by Nicholas Rougeux. Based on Patrick Syme\'s 1821 expanded edition.',
  },
}

export default AboutPanel

