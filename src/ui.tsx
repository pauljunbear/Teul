/// <reference lib="dom" />

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { styles } from './lib/theme';
import { GridSystemTab } from './components/GridSystemTab';
import { WernerColorsTab } from './components/WernerColorsTab';
import { WadaColorsTab } from './components/WadaColorsTab';
import { AccessibilityTab } from './components/AccessibilityTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  isNormalizedDocumentColorProfile,
  type DocumentColorProfileMessage,
  type MutationOperationResultMessage,
  type NormalizedDocumentColorProfile,
} from './types/messages';
import { consumeRequestId } from './lib/requestId';
import {
  WorkspaceProvider,
  useWorkspaceState,
  type WorkspaceMainTab,
  type WorkspaceThemeMode,
} from './lib/workspaceState';

const profileLabels: Record<NormalizedDocumentColorProfile, string> = {
  legacy: 'Legacy',
  srgb: 'sRGB',
  'display-p3': 'Display P3',
  unknown: 'Not reported',
};

const AppContent: React.FC = () => {
  const { state: workspace, update: updateWorkspace } = useWorkspaceState();
  const [systemDark, setSystemDark] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  const mainTab = workspace.activeTab;
  const setMainTab = useCallback(
    (activeTab: WorkspaceMainTab) => updateWorkspace(current => ({ ...current, activeTab })),
    [updateWorkspace]
  );
  const isDark = workspace.themeMode === 'system' ? systemDark : workspace.themeMode === 'dark';
  const [documentColorProfile, setDocumentColorProfile] =
    useState<NormalizedDocumentColorProfile>('unknown');
  const [mutationStatus, setMutationStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const theme = isDark ? styles.dark : styles.light;
  const profileLabel = profileLabels[documentColorProfile];

  const setThemeMode = useCallback(
    (themeMode: WorkspaceThemeMode) => updateWorkspace(current => ({ ...current, themeMode })),
    [updateWorkspace]
  );

  const handleMainTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const tabs: Array<typeof mainTab> = ['colors', 'werner', 'grids', 'a11y'];
    const currentIndex = tabs.indexOf(mainTab);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowLeft'
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : (currentIndex + 1) % tabs.length;
    const nextTab = tabs[nextIndex];
    setMainTab(nextTab);
    document.getElementById(`main-${nextTab}-tab`)?.focus();
  };

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener?.('change', updateSystemTheme);
    return () => media.removeEventListener?.('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const message = event.data?.pluginMessage as
        | Partial<DocumentColorProfileMessage>
        | Partial<MutationOperationResultMessage>
        | undefined;

      if (
        message?.type === 'document-color-profile' &&
        isNormalizedDocumentColorProfile(message.profile)
      ) {
        setDocumentColorProfile(message.profile);
      }
      if (
        message?.type === 'mutation-operation-result' &&
        typeof message.requestId === 'string' &&
        typeof message.success === 'boolean' &&
        typeof message.message === 'string' &&
        consumeRequestId(message.requestId)
      ) {
        setMutationStatus({ success: message.success, message: message.message });
      }
    };

    window.addEventListener('message', handleMessage);
    parent.postMessage({ pluginMessage: { type: 'get-document-color-profile' } }, '*');

    return () => window.removeEventListener('message', handleMessage);
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
      {mutationStatus && (
        <div
          role={mutationStatus.success ? 'status' : 'alert'}
          style={{
            flexShrink: 0,
            padding: '7px 12px',
            backgroundColor: mutationStatus.success ? '#166534' : '#991b1b',
            color: '#ffffff',
            fontSize: '11px',
            textAlign: 'center',
          }}
        >
          {mutationStatus.message}
        </div>
      )}
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
            Teul
          </div>

          <div
            aria-label={`Document color profile: ${profileLabel}`}
            title={`Figma document color profile: ${profileLabel}`}
            style={{
              minWidth: 'fit-content',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 6px',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              color: theme.textMuted,
              fontSize: '9px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>Profile</span>
            <strong style={{ color: theme.text, fontWeight: 600 }}>{profileLabel}</strong>
          </div>

          {/* Main Tabs - pill style */}
          <div
            role="tablist"
            aria-label="Teul sections"
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
              id="main-colors-tab"
              role="tab"
              aria-selected={mainTab === 'colors'}
              aria-controls="main-colors-panel"
              tabIndex={mainTab === 'colors' ? 0 : -1}
              onClick={() => setMainTab('colors')}
              onKeyDown={handleMainTabKeyDown}
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
              id="main-werner-tab"
              role="tab"
              aria-selected={mainTab === 'werner'}
              aria-controls="main-werner-panel"
              tabIndex={mainTab === 'werner' ? 0 : -1}
              onClick={() => setMainTab('werner')}
              onKeyDown={handleMainTabKeyDown}
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
              id="main-grids-tab"
              role="tab"
              aria-selected={mainTab === 'grids'}
              aria-controls="main-grids-panel"
              tabIndex={mainTab === 'grids' ? 0 : -1}
              onClick={() => setMainTab('grids')}
              onKeyDown={handleMainTabKeyDown}
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
              id="main-a11y-tab"
              role="tab"
              aria-selected={mainTab === 'a11y'}
              aria-controls="main-a11y-panel"
              tabIndex={mainTab === 'a11y' ? 0 : -1}
              onClick={() => setMainTab('a11y')}
              onKeyDown={handleMainTabKeyDown}
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

          <select
            value={workspace.themeMode}
            onChange={event => setThemeMode(event.target.value as WorkspaceThemeMode)}
            title="Theme"
            aria-label="Theme"
            style={{
              width: '56px',
              height: '28px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bg,
              color: theme.text,
              cursor: 'pointer',
              fontSize: '9px',
            }}
          >
            <option value="system">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        {documentColorProfile === 'display-p3' && (
          <div
            role="status"
            style={{
              marginTop: '7px',
              padding: '5px 7px',
              borderRadius: '5px',
              backgroundColor: isDark ? '#422006' : '#fffbeb',
              color: isDark ? '#fcd34d' : '#92400e',
              fontSize: '9px',
              lineHeight: 1.35,
            }}
          >
            This is a Display P3 document. Bundled and generated hex/RGB values are labeled sRGB
            approximations; preserving numeric values may change their appearance.
          </div>
        )}
      </div>

      {/* Content */}
      <div
        id="main-colors-panel"
        role="tabpanel"
        aria-labelledby="main-colors-tab"
        hidden={mainTab !== 'colors'}
        tabIndex={mainTab === 'colors' ? 0 : -1}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        {mainTab === 'colors' && (
          <WadaColorsTab isDark={isDark} documentColorProfile={documentColorProfile} />
        )}
      </div>
      <div
        id="main-werner-panel"
        role="tabpanel"
        aria-labelledby="main-werner-tab"
        hidden={mainTab !== 'werner'}
        tabIndex={mainTab === 'werner' ? 0 : -1}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        {mainTab === 'werner' && (
          <WernerColorsTab isDark={isDark} documentColorProfile={documentColorProfile} />
        )}
      </div>
      <div
        id="main-grids-panel"
        role="tabpanel"
        aria-labelledby="main-grids-tab"
        hidden={mainTab !== 'grids'}
        tabIndex={mainTab === 'grids' ? 0 : -1}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        {mainTab === 'grids' && <GridSystemTab isDark={isDark} />}
      </div>
      <div
        id="main-a11y-panel"
        role="tabpanel"
        aria-labelledby="main-a11y-tab"
        hidden={mainTab !== 'a11y'}
        tabIndex={mainTab === 'a11y' ? 0 : -1}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        {mainTab === 'a11y' && <AccessibilityTab isDark={isDark} />}
      </div>
    </div>
  );
};

export const App: React.FC = () => (
  <WorkspaceProvider>
    <AppContent />
  </WorkspaceProvider>
);

const container = document.getElementById('react-page');
if (container) {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default App;
