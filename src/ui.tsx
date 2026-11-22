import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Contrast, Ellipsis, GridFour, Palette, ScanSearch } from './components/TeulIcons';
import { FONT_STACK, styles, type as typeScale } from './lib/theme';
import { GridSystemTab } from './components/GridSystemTab';
import { WernerColorsTab } from './components/WernerColorsTab';
import { WadaColorsTab } from './components/WadaColorsTab';
import { AccessibilityTab } from './components/AccessibilityTab';
import { ColorSystemReleaseTab } from './components/ColorSystemReleaseTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MorePanel } from './components/MorePanel';
import { Segmented, buttonStyle } from './components/TeulUI';
import { COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED } from './lib/colorSystemGenericReleaseChannelV2';
import {
  isNormalizedDocumentColorProfile,
  type DocumentColorProfileMessage,
  type MutationOperationResultMessage,
  type NormalizedDocumentColorProfile,
} from './types/messages';
import { consumeRequestId, createRequestId } from './lib/requestId';
import { validateHistoricalColorDataResult } from './lib/historicalColorDataBridge';
import {
  HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
  type HistoricalColorDataset,
  type WernerColor,
  type WadaColor,
} from './types/historicalColorData';
import {
  WorkspaceProvider,
  useWorkspaceState,
  type WorkspaceMainTab,
  type WorkspaceThemeMode,
} from './lib/workspaceState';

type SectionId = 'colors' | 'grids' | 'a11y' | 'system';
type Destination = SectionId | 'more';
type ColorLibrary = 'wada' | 'werner';

const allSections: Array<{ id: SectionId; label: string; icon: React.ElementType }> = [
  { id: 'colors', label: 'Color', icon: Palette },
  { id: 'grids', label: 'Grids', icon: GridFour },
  { id: 'a11y', label: 'Check', icon: Contrast },
  { id: 'system', label: 'Color system', icon: ScanSearch },
];

/**
 * The color-system builder exists only in the explicit candidate bundle. A
 * disabled release renders neither its rail item nor its panel, so the rail
 * never advertises a feature this build cannot run.
 */
const sections = allSections.filter(
  section => section.id !== 'system' || COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED
);
const railItems: Array<{ id: Destination; label: string; icon: React.ElementType }> = [
  ...sections,
  { id: 'more', label: 'More', icon: Ellipsis },
];

/** Wada and Werner share one Color destination; the persisted tab keeps which library is open. */
const sectionForTab = (tab: WorkspaceMainTab): SectionId => (tab === 'werner' ? 'colors' : tab);

type HistoricalDataState<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; records: T[] }
  | { status: 'error'; message: string };

const HistoricalDataStatus: React.FC<{
  dataset: HistoricalColorDataset;
  isDark: boolean;
  state: HistoricalDataState<unknown>;
  onRetry: () => void;
}> = ({ dataset, isDark, state, onRetry }) => {
  const theme = isDark ? styles.dark : styles.light;
  const label = dataset === 'wada' ? 'Wada colors' : 'Werner colors';
  const failed = state.status === 'error';

  return (
    <div
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
      style={{
        flex: 1,
        minHeight: 0,
        padding: '24px',
        display: 'grid',
        placeItems: 'center',
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <div style={{ maxWidth: '320px', textAlign: 'center' }}>
        <strong style={{ display: 'block', fontSize: typeScale.body, fontWeight: 600 }}>
          {failed ? `${label} could not load` : `Loading ${label}…`}
        </strong>
        {failed && (
          <>
            <span
              style={{
                display: 'block',
                marginTop: '6px',
                color: theme.textMuted,
                fontSize: typeScale.meta,
                lineHeight: 1.5,
              }}
            >
              {state.message}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="teul-hover"
              style={{ ...buttonStyle(theme), marginTop: '12px' }}
            >
              Retry loading {label}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { state: workspace, update: updateWorkspace } = useWorkspaceState();
  const [systemDark, setSystemDark] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  const [showMore, setShowMore] = useState(false);
  // A persisted tab that this build does not render falls back to the first section.
  const persistedSection = sectionForTab(workspace.activeTab);
  const mainSection: SectionId = sections.some(section => section.id === persistedSection)
    ? persistedSection
    : sections[0].id;
  const library: ColorLibrary =
    mainSection === 'colors' && workspace.activeTab === 'werner' ? 'werner' : 'wada';
  const destination: Destination = showMore ? 'more' : mainSection;

  const setDestination = useCallback(
    (next: Destination) => {
      if (next === 'more') {
        setShowMore(true);
        return;
      }
      setShowMore(false);
      updateWorkspace(current => {
        if (next === 'colors') {
          return current.activeTab === 'colors' || current.activeTab === 'werner'
            ? current
            : { ...current, activeTab: 'colors' };
        }
        return { ...current, activeTab: next };
      });
    },
    [updateWorkspace]
  );
  const setLibrary = useCallback(
    (next: ColorLibrary) =>
      updateWorkspace(current => ({
        ...current,
        activeTab: next === 'werner' ? 'werner' : 'colors',
      })),
    [updateWorkspace]
  );
  const isDark = workspace.themeMode === 'system' ? systemDark : workspace.themeMode === 'dark';
  const [documentColorProfile, setDocumentColorProfile] =
    useState<NormalizedDocumentColorProfile>('unknown');
  const [mutationStatus, setMutationStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [wadaData, setWadaData] = useState<HistoricalDataState<WadaColor>>({ status: 'idle' });
  const [wernerData, setWernerData] = useState<HistoricalDataState<WernerColor>>({
    status: 'idle',
  });
  const pendingHistoricalRequests = useRef<Partial<Record<HistoricalColorDataset, string>>>({});

  const theme = isDark ? styles.dark : styles.light;

  const setThemeMode = useCallback(
    (themeMode: WorkspaceThemeMode) => updateWorkspace(current => ({ ...current, themeMode })),
    [updateWorkspace]
  );

  const requestHistoricalData = useCallback((dataset: HistoricalColorDataset) => {
    const requestId = createRequestId(`historical-${dataset}`);
    pendingHistoricalRequests.current[dataset] = requestId;
    if (dataset === 'wada') setWadaData({ status: 'loading' });
    else setWernerData({ status: 'loading' });
    parent.postMessage(
      {
        pluginMessage: {
          type: 'get-historical-color-data',
          schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
          requestId,
          dataset,
        },
      },
      '*'
    );
  }, []);

  const handleRailKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const ids = railItems.map(item => item.id);
    const currentIndex = ids.indexOf(destination);
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? ids.length - 1
          : isPrevious
            ? (currentIndex - 1 + ids.length) % ids.length
            : (currentIndex + 1) % ids.length;
    const next = ids[nextIndex];
    setDestination(next);
    document.getElementById(`main-${next}-tab`)?.focus();
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
      const rawMessage = event.data?.pluginMessage;
      if (
        typeof rawMessage === 'object' &&
        rawMessage !== null &&
        'type' in rawMessage &&
        rawMessage.type === 'historical-color-data-result'
      ) {
        const validation = validateHistoricalColorDataResult(rawMessage);
        if (!validation.valid) {
          const envelope = rawMessage as Partial<{
            requestId: string;
            dataset: HistoricalColorDataset;
          }>;
          const dataset = envelope.dataset;
          if (
            (dataset === 'wada' || dataset === 'werner') &&
            typeof envelope.requestId === 'string' &&
            pendingHistoricalRequests.current[dataset] === envelope.requestId &&
            consumeRequestId(envelope.requestId)
          ) {
            delete pendingHistoricalRequests.current[dataset];
            const errorState = {
              status: 'error' as const,
              message: 'Teul rejected an invalid historical color response. Try again.',
            };
            if (dataset === 'wada') setWadaData(errorState);
            else setWernerData(errorState);
          }
          return;
        }

        const historicalMessage = validation.message;
        if (
          pendingHistoricalRequests.current[historicalMessage.dataset] !==
            historicalMessage.requestId ||
          !consumeRequestId(historicalMessage.requestId)
        ) {
          return;
        }
        delete pendingHistoricalRequests.current[historicalMessage.dataset];
        if (!historicalMessage.success) {
          const errorState = {
            status: 'error' as const,
            message: historicalMessage.error,
          };
          if (historicalMessage.dataset === 'wada') setWadaData(errorState);
          else setWernerData(errorState);
          return;
        }
        if (historicalMessage.dataset === 'wada') {
          setWadaData({ status: 'ready', records: historicalMessage.records });
        } else {
          setWernerData({ status: 'ready', records: historicalMessage.records });
        }
        return;
      }

      const message = rawMessage as
        Partial<DocumentColorProfileMessage> | Partial<MutationOperationResultMessage> | undefined;

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
    return () => {
      window.removeEventListener('message', handleMessage);
      for (const requestId of Object.values(pendingHistoricalRequests.current)) {
        if (requestId) consumeRequestId(requestId);
      }
      pendingHistoricalRequests.current = {};
    };
  }, []);

  useEffect(() => {
    if (showMore || mainSection !== 'colors') return;
    const dataset =
      library === 'wada' && wadaData.status === 'idle'
        ? 'wada'
        : library === 'werner' && wernerData.status === 'idle'
          ? 'werner'
          : null;
    if (!dataset) return;
    const timeoutId = window.setTimeout(() => requestHistoricalData(dataset), 0);
    return () => window.clearTimeout(timeoutId);
  }, [library, mainSection, requestHistoricalData, showMore, wadaData.status, wernerData.status]);

  const librarySwitch = (
    <Segmented
      label="Color library"
      isDark={isDark}
      value={library}
      onChange={setLibrary}
      options={[
        { value: 'wada', label: 'Wada', title: 'Sanzo Wada, 159 colors' },
        { value: 'werner', label: 'Werner', title: 'Werner’s Nomenclature, 110 colors' },
      ]}
    />
  );

  const railButton = (active: boolean): React.CSSProperties => ({
    width: '46px',
    minHeight: '50px',
    padding: '6px 2px',
    border: 0,
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    backgroundColor: active ? theme.railActive : 'transparent',
    color: active ? theme.text : theme.textMuted,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: typeScale.meta,
    lineHeight: 1.15,
    textAlign: 'center',
    fontWeight: active ? 600 : 500,
  });

  const renderRailItem = (item: (typeof railItems)[number]) => {
    const Icon = item.icon;
    const active = destination === item.id;
    return (
      <button
        key={item.id}
        id={`main-${item.id}-tab`}
        role="tab"
        aria-selected={active}
        aria-controls={`main-${item.id}-panel`}
        tabIndex={active ? 0 : -1}
        onClick={() => setDestination(item.id)}
        onKeyDown={handleRailKeyDown}
        className={active ? undefined : 'teul-hover'}
        style={railButton(active)}
      >
        <Icon size={18} strokeWidth={active ? 2 : 1.6} />
        <span>{item.label}</span>
      </button>
    );
  };

  const libraryData = library === 'wada' ? wadaData : wernerData;

  return (
    <div
      style={
        {
          height: '100vh',
          display: 'grid',
          gridTemplateColumns: '58px minmax(0, 1fr)',
          backgroundColor: theme.bg,
          color: theme.text,
          colorScheme: isDark ? 'dark' : 'light',
          fontFamily: FONT_STACK,
          fontSize: typeScale.body,
          lineHeight: 1.4,
          overflow: 'hidden',
          '--teul-hover': theme.hoverTint,
          '--teul-thumb': theme.scrollThumb,
          '--teul-focus': theme.focus,
          '--teul-text': theme.text,
          '--teul-border-strong': theme.borderStrong,
          '--teul-placeholder': theme.textMuted,
        } as React.CSSProperties
      }
    >
      <nav
        role="tablist"
        aria-label="Teul sections"
        aria-orientation="vertical"
        style={{
          minHeight: 0,
          padding: '8px 6px',
          borderRight: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: theme.rail,
        }}
      >
        {sections.map(renderRailItem)}
        <div style={{ flex: 1 }} />
        {renderRailItem(railItems[railItems.length - 1])}
      </nav>

      <main
        style={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {sections.map(section => {
          const active = destination === section.id;
          return (
            <div
              key={section.id}
              id={`main-${section.id}-panel`}
              role="tabpanel"
              aria-labelledby={`main-${section.id}-tab`}
              hidden={!active}
              tabIndex={active ? 0 : -1}
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: active ? 'flex' : 'none',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              {active &&
                section.id === 'colors' &&
                (libraryData.status === 'ready' ? (
                  library === 'wada' ? (
                    <WadaColorsTab
                      isDark={isDark}
                      colors={wadaData.status === 'ready' ? wadaData.records : []}
                      documentColorProfile={documentColorProfile}
                      librarySwitch={librarySwitch}
                    />
                  ) : (
                    <WernerColorsTab
                      isDark={isDark}
                      colors={wernerData.status === 'ready' ? wernerData.records : []}
                      documentColorProfile={documentColorProfile}
                      librarySwitch={librarySwitch}
                    />
                  )
                ) : (
                  <>
                    <div style={{ padding: '10px 12px 8px', display: 'flex' }}>{librarySwitch}</div>
                    <HistoricalDataStatus
                      dataset={library}
                      isDark={isDark}
                      state={libraryData}
                      onRetry={() => requestHistoricalData(library)}
                    />
                  </>
                ))}
              {active && section.id === 'grids' && <GridSystemTab isDark={isDark} />}
              {active && section.id === 'a11y' && (
                <AccessibilityTab isDark={isDark} documentColorProfile={documentColorProfile} />
              )}
              {section.id === 'system' && (
                <ColorSystemReleaseTab isDark={isDark} isActive={active} />
              )}
            </div>
          );
        })}
        <div
          id="main-more-panel"
          role="tabpanel"
          aria-labelledby="main-more-tab"
          hidden={!showMore}
          tabIndex={showMore ? 0 : -1}
          style={{ flex: 1, minHeight: 0, display: showMore ? 'flex' : 'none' }}
        >
          <MorePanel
            isDark={isDark}
            themeMode={workspace.themeMode}
            onThemeModeChange={setThemeMode}
            documentColorProfile={documentColorProfile}
          />
        </div>

        {mutationStatus && (
          <div
            role={mutationStatus.success ? 'status' : 'alert'}
            style={{
              position: 'absolute',
              left: '14px',
              right: '14px',
              bottom: '14px',
              zIndex: 1000,
              padding: '9px 12px',
              borderRadius: '8px',
              backgroundColor: mutationStatus.success ? theme.text : '#b42318',
              color: mutationStatus.success ? theme.bg : '#ffffff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              fontSize: typeScale.body,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            {mutationStatus.message}
          </div>
        )}
      </main>
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
