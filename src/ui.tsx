/// <reference lib="dom" />

import * as React from 'react';
import { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { styles } from './lib/theme';
import { GridSystemTab } from './components/GridSystemTab';
import { WernerColorsTab } from './components/WernerColorsTab';
import { WadaColorsTab } from './components/WadaColorsTab';
import { AccessibilityTab } from './components/AccessibilityTab';
import { ErrorBoundary } from './components/ErrorBoundary';

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(true);
  const [mainTab, setMainTab] = useState<'colors' | 'werner' | 'grids' | 'a11y'>('colors');

  const theme = isDark ? styles.dark : styles.light;

  const handleToggleDark = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Compact Unified Header */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border}`,
          backgroundColor: theme.bg,
        }}
      >
        {/* Top Row: Logo + Main Tabs + Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* Logo/Brand - compact */}
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: theme.textMuted,
              minWidth: 'fit-content',
            }}
          >
            SW
          </div>

          {/* Main Tabs - pill style */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              gap: '2px',
              padding: '3px',
              backgroundColor: theme.inputBg,
              borderRadius: '8px',
            }}
          >
            <button
              onClick={() => setMainTab('colors')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
                backgroundColor: mainTab === 'colors' ? theme.btnActive : 'transparent',
                color: mainTab === 'colors' ? theme.btnActiveText : theme.textMuted,
              }}
            >
              <span style={{ fontSize: '11px' }}>🎨</span>
              Wada
            </button>
            <button
              onClick={() => setMainTab('werner')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
                backgroundColor: mainTab === 'werner' ? theme.btnActive : 'transparent',
                color: mainTab === 'werner' ? theme.btnActiveText : theme.textMuted,
              }}
            >
              <span style={{ fontSize: '11px' }}>📜</span>
              Werner
            </button>
            <button
              onClick={() => setMainTab('grids')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
                backgroundColor: mainTab === 'grids' ? theme.btnActive : 'transparent',
                color: mainTab === 'grids' ? theme.btnActiveText : theme.textMuted,
              }}
            >
              <span style={{ fontSize: '11px' }}>📐</span>
              Grids
            </button>
            <button
              onClick={() => setMainTab('a11y')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
                backgroundColor: mainTab === 'a11y' ? theme.btnActive : 'transparent',
                color: mainTab === 'a11y' ? theme.btnActiveText : theme.textMuted,
              }}
            >
              <span style={{ fontSize: '11px' }}>A</span>
              A11y
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={handleToggleDark}
            title="Toggle Theme"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.text,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {mainTab === 'grids' ? (
          <GridSystemTab isDark={isDark} />
        ) : mainTab === 'werner' ? (
          <WernerColorsTab isDark={isDark} />
        ) : mainTab === 'a11y' ? (
          <AccessibilityTab isDark={isDark} />
        ) : (
          <WadaColorsTab isDark={isDark} />
        )}
      </div>
    </div>
  );
};

const container = document.getElementById('react-page');
if (container) {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default App;
