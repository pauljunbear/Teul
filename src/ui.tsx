/// <reference lib="dom" />

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpenText, CheckCircle, GearSix, GridFour, Palette } from './components/Icons';
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

const sections: Array<{
  id: WorkspaceMainTab;
  label: string;
  title: string;
  eyebrow: string;
  meta: string;
  icon: React.ElementType;
}> = [
  {
    id: 'colors',
    label: 'Wada',
    title: 'Sanzo Wada',
    eyebrow: 'Historical colors',
    meta: '159 colors · 348 combinations',
    icon: Palette,
  },
  {
    id: 'werner',
    label: 'Werner',
    title: 'Werner’s Nomenclature',
    eyebrow: 'Historical colors',
    meta: '110 sampled colors · 1821 edition',
    icon: BookOpenText,
  },
  {
    id: 'grids',
    label: 'Grids',
    title: 'Grid library',
    eyebrow: 'Layout systems',
    meta: '65 documented presets',
    icon: GridFour,
  },
  {
    id: 'a11y',
    label: 'Check',
    title: 'Accessibility',
    eyebrow: 'Contrast and simulation',
    meta: 'WCAG 2.2 · APCA supplemental',
    icon: CheckCircle,
  },
];

const AppContent: React.FC = () => {
  const { state: workspace, update: updateWorkspace } = useWorkspaceState();
  const [systemDark, setSystemDark] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  const [showSettings, setShowSettings] = useState(false);
  const mainTab = workspace.activeTab;
  const setMainTab = useCallback(
    (activeTab: WorkspaceMainTab) => {
      setShowSettings(false);
      updateWorkspace(current => ({ ...current, activeTab }));
    },
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
  const activeSection = sections.find(section => section.id === mainTab) ?? sections[0];

  const setThemeMode = useCallback(
    (themeMode: WorkspaceThemeMode) => updateWorkspace(current => ({ ...current, themeMode })),
    [updateWorkspace]
  );

  const handleMainTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const tabs = sections.map(section => section.id);
    const currentIndex = tabs.indexOf(mainTab);
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : isPrevious
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
        window.setTimeout(() => setMutationStatus(null), 2400);
      }
    };

    window.addEventListener('message', handleMessage);
    parent.postMessage({ pluginMessage: { type: 'get-document-color-profile' } }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const railButton = (active: boolean): React.CSSProperties => ({
    width: '48px',
    minHeight: '52px',
    padding: '6px 3px',
    border: `1px solid ${active ? theme.border : 'transparent'}`,
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    backgroundColor: active ? theme.btnBg : 'transparent',
    color: active ? theme.text : theme.textMuted,
    cursor: 'pointer',
    fontSize: '9px',
    fontWeight: active ? 650 : 500,
  });

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1fr)',
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
      }}
    >
      <nav
        role="tablist"
        aria-label="Teul sections"
        style={{
          minHeight: 0,
          padding: '12px 8px 10px',
          borderRight: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: theme.inputBg,
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          {sections.map(section => {
            const Icon = section.icon;
            const active = !showSettings && mainTab === section.id;
            return (
              <button
                key={section.id}
                id={`main-${section.id}-tab`}
                role="tab"
                aria-selected={active}
                aria-controls={`main-${section.id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMainTab(section.id)}
                onKeyDown={handleMainTabKeyDown}
                style={railButton(active)}
              >
                <Icon size={18} weight={active ? 'fill' : 'regular'} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={showSettings}
          onClick={() => setShowSettings(true)}
          style={{ ...railButton(showSettings), borderTop: `1px solid ${theme.border}` }}
        >
          <GearSix size={18} weight={showSettings ? 'fill' : 'regular'} />
          <span>Settings</span>
        </button>
      </nav>

      <main style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            minHeight: '58px',
            padding: '10px 12px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                marginBottom: '3px',
                color: theme.textMuted,
                fontSize: '8px',
                fontWeight: 650,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {showSettings ? 'Preferences' : activeSection.eyebrow}
            </span>
            <strong style={{ display: 'block', fontSize: '16px', letterSpacing: '-0.02em' }}>
              {showSettings ? 'Settings' : activeSection.title}
            </strong>
            <span style={{ color: theme.textMuted, fontSize: '8px' }}>
              {showSettings ? 'Appearance, profile, and provenance' : activeSection.meta}
            </span>
          </div>
          <div
            aria-label={`Document color profile: ${profileLabel}`}
            title={`Figma document color profile: ${profileLabel}`}
            style={{
              flexShrink: 0,
              padding: '5px 7px',
              border: `1px solid ${theme.border}`,
              borderRadius: '7px',
              color: theme.textMuted,
              fontSize: '8px',
            }}
          >
            Profile <strong style={{ color: theme.text }}>{profileLabel}</strong>
          </div>
        </header>

        {showSettings ? (
          <section style={{ flex: 1, minHeight: 0, padding: '16px', overflow: 'auto' }}>
            <div
              style={{
                padding: '12px',
                border: `1px solid ${theme.border}`,
                borderRadius: '10px',
                backgroundColor: theme.cardBg,
              }}
            >
              <strong style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
                Appearance
              </strong>
              <span style={{ color: theme.textMuted, fontSize: '9px' }}>
                Match Figma or choose a fixed theme.
              </span>
              <div
                style={{
                  marginTop: '10px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '5px',
                }}
              >
                {(['system', 'light', 'dark'] as WorkspaceThemeMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemeMode(mode)}
                    style={{
                      minHeight: '34px',
                      border: `1px solid ${workspace.themeMode === mode ? theme.text : theme.border}`,
                      borderRadius: '7px',
                      backgroundColor: workspace.themeMode === mode ? theme.btnActive : theme.btnBg,
                      color: workspace.themeMode === mode ? theme.btnActiveText : theme.text,
                      cursor: 'pointer',
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {mode === 'system' ? 'Auto' : mode}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: '10px',
                padding: '12px',
                border: `1px solid ${theme.border}`,
                borderRadius: '10px',
                backgroundColor: theme.cardBg,
              }}
            >
              <strong style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
                Document color profile
              </strong>
              <span style={{ color: theme.textMuted, fontSize: '9px', lineHeight: 1.5 }}>
                Figma reports {profileLabel}. Historical and generated hex/RGB values remain labeled
                sRGB; Teul does not silently remap numeric channels.
              </span>
              {documentColorProfile === 'display-p3' && (
                <div
                  role="status"
                  style={{
                    marginTop: '10px',
                    padding: '8px',
                    borderRadius: '7px',
                    backgroundColor: isDark ? '#422006' : '#fffbeb',
                    color: isDark ? '#fcd34d' : '#92400e',
                    fontSize: '9px',
                    lineHeight: 1.4,
                  }}
                >
                  This Display P3 document may render preserved sRGB numeric values differently.
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: '10px',
                padding: '12px',
                border: `1px solid ${theme.border}`,
                borderRadius: '10px',
                backgroundColor: theme.cardBg,
                color: theme.textMuted,
                fontSize: '9px',
                lineHeight: 1.55,
              }}
            >
              <strong
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  color: theme.text,
                  fontSize: '11px',
                }}
              >
                About Teul
              </strong>
              Historical color, tested color systems, and documented layout grids. Wada and Werner
              colors are labeled digital approximations. Exact Radix families retain their published
              values; WCAG-constrained semantic output blocks when required pairs fail.
            </div>
          </section>
        ) : (
          <>
            {sections.map(section => (
              <div
                key={section.id}
                id={`main-${section.id}-panel`}
                role="tabpanel"
                aria-labelledby={`main-${section.id}-tab`}
                hidden={mainTab !== section.id}
                tabIndex={mainTab === section.id ? 0 : -1}
                style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
              >
                {mainTab === section.id && section.id === 'colors' && (
                  <WadaColorsTab isDark={isDark} documentColorProfile={documentColorProfile} />
                )}
                {mainTab === section.id && section.id === 'werner' && (
                  <WernerColorsTab isDark={isDark} documentColorProfile={documentColorProfile} />
                )}
                {mainTab === section.id && section.id === 'grids' && (
                  <GridSystemTab isDark={isDark} />
                )}
                {mainTab === section.id && section.id === 'a11y' && (
                  <AccessibilityTab isDark={isDark} />
                )}
              </div>
            ))}
          </>
        )}
      </main>

      {mutationStatus && (
        <div
          role={mutationStatus.success ? 'status' : 'alert'}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '14px',
            zIndex: 1000,
            maxWidth: '430px',
            padding: '10px 13px',
            border: `1px solid ${mutationStatus.success ? '#4d6b43' : '#7f3d3d'}`,
            borderRadius: '9px',
            transform: 'translateX(-50%)',
            backgroundColor: mutationStatus.success ? '#f3f3f3' : '#991b1b',
            color: mutationStatus.success ? '#171717' : '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          {mutationStatus.message}
        </div>
      )}
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
