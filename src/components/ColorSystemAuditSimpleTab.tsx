import * as React from 'react';
import { validateColorSystemAuditPluginMessage } from '../lib/colorSystemAuditMessageValidation';
import { consumeRequestId, createRequestId } from '../lib/requestId';
import type {
  ColorSystemStrategyDirection,
  ColorSystemStrategyVisualizationSettings,
} from '../lib/colorSystemStrategyBuilder';
import type {
  ConfirmedColorSystemAnchor,
  SourceSystemSnapshot,
  SnapshotUsageScope,
} from '../types/colorSystemAudit';
import type {
  ColorSystemAuditProgressMessage,
  ColorSystemBuilderPackageImportResultMessage,
  ColorSystemProposalApplyResultMessage,
  ColorSystemStrategyFailureBlocker,
  ColorSystemStrategyPreviewCandidate,
  ColorSystemStrategyPreviewSet,
} from '../types/messages';

interface ColorSystemAuditSimpleTabProps {
  isDark: boolean;
  isActive?: boolean;
}

type Operation =
  | 'idle'
  | 'analyzing'
  | 'importing'
  | 'opening-package'
  | 'rebuilding'
  | 'generating'
  | 'selecting'
  | 'confirming'
  | 'applying'
  | 'exporting';

interface Theme {
  background: string;
  card: string;
  raised: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  warning: string;
  success: string;
}

interface AuditSession {
  origin: 'figma' | 'structured-import';
  snapshot: SourceSystemSnapshot;
  scannedNodeCount: number;
  partial: boolean;
  cancelled: boolean;
}

interface StrategyReceipt {
  strategySet: ColorSystemStrategyPreviewSet;
  primaryResolution: 'structured-source' | 'verified-role' | 'user-confirmed';
  primaryNote: string;
}

interface ApplyReceipt {
  sourceHash: string;
  proposalHash: string;
  reviewHash: string;
  approvalHash: string;
  outputName: string;
  collectionName?: string;
  variableCount: number;
  aliasCount: number;
  styleCount: number;
  overviewFrameName: string;
  overviewScaleCount: number;
  overviewSwatchCount: number;
  libraryPageName?: string;
  componentCount?: number;
  chartSpecimenCount?: number;
  warnings: readonly string[];
}

type ImportedBuilderPackageReceipt = Extract<
  ColorSystemBuilderPackageImportResultMessage,
  { success: true }
>;
type BuilderPackageBuildReceipt = Extract<ColorSystemProposalApplyResultMessage, { success: true }>;

interface PendingAnalysis {
  id: string;
  origin: AuditSession['origin'];
}

interface PrimaryCandidate extends ConfirmedColorSystemAnchor {
  name: string;
}

interface PendingSelection {
  id: string;
  sourceHash: string;
  candidate: ColorSystemStrategyPreviewCandidate;
  primary: ConfirmedColorSystemAnchor;
}

interface PendingConfirmation extends PendingSelection {
  proposalHash: string;
  reviewHash: string;
  intendedSurfaces: readonly string[];
}

interface PendingApply extends PendingConfirmation {
  approvalHash: string;
}

const DEFAULT_SYSTEM_NAME = 'Teul Color System';

export function formatApplyFailure(
  message: Extract<ColorSystemProposalApplyResultMessage, { success: false }>
): string {
  const stage = message.failureStage.split('-').join(' ');
  const cleanup = message.cleanupReceipt;
  if (!cleanup.attempted) {
    return `${message.error} Stopped at ${stage}; cleanup not needed.`;
  }
  const removed =
    cleanup.removedResourceCount === null
      ? 'Removed count unknown.'
      : `Removed ${cleanup.removedResourceCount} owned resources.`;
  if (cleanup.complete) {
    return `${message.error} Stopped at ${stage}. Cleanup complete. ${removed}`;
  }
  const notes = cleanup.failureMessages.length > 0 ? ` ${cleanup.failureMessages.join(' ')}` : '';
  return `${message.error} Stopped at ${stage}. Cleanup incomplete. ${removed}${notes}`;
}

function formatSearchFailure(blocker: ColorSystemStrategyFailureBlocker): string {
  const evidence = blocker.searchEvidence;
  if (!evidence) return blocker.message;
  return `${blocker.direction!.split('-').join(' ')}: ${blocker.message} Counts raw/max/unique/collapsed/source-dupes/eligible/prequalified/max/scales/invalid/pairs/max/frontier/attempts/beam/viz/max: ${Object.values(evidence).join('/')}.`;
}

function themeFor(isDark: boolean): Theme {
  return isDark
    ? {
        background: '#1a1a1a',
        card: '#262626',
        raised: '#333333',
        text: '#ffffff',
        muted: '#b7b7b7',
        border: '#484848',
        accent: '#8ab4ff',
        accentText: '#102043',
        danger: '#ff8b8b',
        warning: '#f2c14e',
        success: '#75d69c',
      }
    : {
        background: '#ffffff',
        card: '#f6f6f6',
        raised: '#ffffff',
        text: '#1a1a1a',
        muted: '#5f6368',
        border: '#d9d9d9',
        accent: '#2458b3',
        accentText: '#ffffff',
        danger: '#b42318',
        warning: '#8a5a00',
        success: '#137333',
      };
}

function postPluginMessage(message: unknown): void {
  window.parent.postMessage({ pluginMessage: message }, '*');
}

function scopeLabel(scope: Exclude<SnapshotUsageScope, 'not-applicable'>): string {
  if (scope === 'selection') return 'selected frame';
  if (scope === 'current-page') return 'current page';
  return 'whole file';
}

function sourceColorCount(snapshot: SourceSystemSnapshot): number {
  return new Set(
    snapshot.tokens.flatMap(token =>
      Object.values(token.valuesByMode).flatMap(value =>
        value.colorSpace === 'srgb' && value.alpha === 1 && value.hex
          ? [value.hex.toUpperCase()]
          : []
      )
    )
  ).size;
}

function unsupportedPresentationSourceCount(snapshot: SourceSystemSnapshot): number {
  return (snapshot.sourceSections ?? []).reduce(
    (count, section) =>
      count +
      section.entries.filter(
        entry => entry.value.colorSpace !== 'srgb' || !entry.value.hex || entry.value.alpha !== 1
      ).length,
    0
  );
}

interface SourcePreviewSection {
  id: string;
  label: string;
  colors: readonly string[];
  total: number;
}

function colorWithAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  return `${hex}${Math.round(Math.max(0, alpha) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

function sourcePreviewSections(snapshot: SourceSystemSnapshot): SourcePreviewSection[] {
  const structured = (snapshot.sourceSections ?? []).flatMap(section => {
    const colors = section.entries.flatMap(entry =>
      entry.value.colorSpace === 'srgb' && entry.value.hex
        ? [colorWithAlpha(entry.value.hex.toUpperCase(), entry.value.alpha)]
        : []
    );
    return colors.length > 0
      ? [
          {
            id: `${section.kind}:${section.sourceNodeId}`,
            label: section.title,
            colors: colors.slice(0, 32),
            total: colors.length,
          },
        ]
      : [];
  });
  if (structured.length > 0) return structured;

  const observed = [
    ...new Set(
      snapshot.tokens.flatMap(token =>
        Object.values(token.valuesByMode).flatMap(value =>
          value.colorSpace === 'srgb' && value.hex
            ? [colorWithAlpha(value.hex.toUpperCase(), value.alpha)]
            : []
        )
      )
    ),
  ];
  return observed.length > 0
    ? [
        {
          id: 'observed-source',
          label: 'Observed source colors',
          colors: observed.slice(0, 32),
          total: observed.length,
        },
      ]
    : [];
}

function primaryAnchor(strategySet: ColorSystemStrategyPreviewSet): ConfirmedColorSystemAnchor {
  return {
    tokenId: strategySet.primary.tokenId,
    mode: strategySet.primary.mode,
    hex: strategySet.primary.hex,
  };
}

function primaryCandidatesFromSnapshot(snapshot: SourceSystemSnapshot): PrimaryCandidate[] {
  const seen = new Set<string>();
  const candidates: PrimaryCandidate[] = [];
  const tokens = [...snapshot.tokens].sort(
    (left, right) =>
      (left.observedUsageRank ?? Number.MAX_SAFE_INTEGER) -
        (right.observedUsageRank ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
  );
  for (const token of tokens) {
    for (const [mode, value] of Object.entries(token.valuesByMode)) {
      if (value.colorSpace !== 'srgb' || value.alpha !== 1 || !value.hex) continue;
      const candidate = {
        tokenId: token.id,
        name: token.name,
        mode,
        hex: value.hex.toUpperCase(),
      };
      const key = `${candidate.tokenId}\u0000${candidate.mode}\u0000${candidate.hex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }
  return candidates;
}

function downloadJson(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SwatchRow({
  label,
  colors,
  theme,
  compact = false,
}: {
  label: string;
  colors: readonly string[];
  theme: Theme;
  compact?: boolean;
}): React.ReactElement {
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <span style={{ color: theme.muted, fontSize: '9px' }}>{label}</span>
      <div
        role="img"
        aria-label={`${label}: ${colors.join(', ')}`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${colors.length}, minmax(0, 1fr))` }}
      >
        {colors.map((hex, index) => (
          <span
            key={`${hex}:${index}`}
            aria-hidden="true"
            style={{
              height: compact ? '14px' : '22px',
              background: hex,
              border: `1px solid ${theme.border}`,
              borderRightWidth: index === colors.length - 1 ? 1 : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StrategyCard({
  candidate,
  selected,
  recommended,
  disabled,
  theme,
  onSelect,
}: {
  candidate: ColorSystemStrategyPreviewCandidate;
  selected: boolean;
  recommended: boolean;
  disabled: boolean;
  theme: Theme;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <label
      style={{
        display: 'grid',
        gap: '8px',
        padding: '11px',
        border: `2px solid ${selected ? theme.accent : theme.border}`,
        borderRadius: '9px',
        background: selected ? theme.raised : theme.card,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="radio"
          name="color-system-strategy"
          value={candidate.id}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
        />
        <strong style={{ fontSize: '11px' }}>{candidate.label}</strong>
        {recommended ? (
          <span
            style={{
              marginLeft: 'auto',
              color: theme.accent,
              fontSize: '8px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Teul policy recommendation
          </span>
        ) : null}
      </span>
      <span style={{ color: theme.muted, fontSize: '9px', lineHeight: 1.4 }}>
        {candidate.rationale}
      </span>
      <SwatchRow
        label={`Protected Primary · ${candidate.primary.hex.toUpperCase()}`}
        colors={[candidate.primary.hex]}
        theme={theme}
        compact
      />
      <div
        id={selected ? 'builder-secondary-preview' : undefined}
        style={{ display: 'grid', gap: 8 }}
      >
        {candidate.secondaryFamilies.flatMap(family => [
          <SwatchRow
            key={`${family.id}-light`}
            label={`Secondary ${family.familyIndex} · 12-step Light scale`}
            colors={family.lightSteps}
            theme={theme}
            compact
          />,
          <SwatchRow
            key={`${family.id}-dark`}
            label={`Secondary ${family.familyIndex} · 12-step Dark scale`}
            colors={family.darkSteps}
            theme={theme}
            compact
          />,
        ])}
      </div>
      <div aria-label="Product mappings">
        <strong style={{ fontSize: '9px' }}>Product roles · Light / Dark</strong>
        {candidate.productSemantics.map(mapping => (
          <SwatchRow
            key={mapping.role}
            label={`${mapping.role} · Light ${mapping.light.targetName} · Dark ${mapping.dark.targetName}`}
            colors={[mapping.light.hex, mapping.dark.hex]}
            theme={theme}
            compact
          />
        ))}
      </div>
      <div
        id={selected ? 'builder-data-viz-preview' : undefined}
        style={{ display: 'grid', gap: 8 }}
      >
        <SwatchRow
          label="Data Viz · Categorical"
          colors={candidate.visualization.categorical}
          theme={theme}
          compact
        />
        <SwatchRow
          label="Data Viz · Sequential"
          colors={candidate.visualization.sequential}
          theme={theme}
          compact
        />
        <SwatchRow
          label="Data Viz · Diverging"
          colors={candidate.visualization.diverging}
          theme={theme}
          compact
        />
      </div>
    </label>
  );
}

function SourceSystemPreview({
  snapshot,
  theme,
}: {
  snapshot: SourceSystemSnapshot;
  theme: Theme;
}): React.ReactElement | null {
  const sections = sourcePreviewSections(snapshot);
  if (sections.length === 0) return null;
  return (
    <section
      aria-labelledby="builder-source-preview-title"
      style={{ display: 'grid', gap: '9px', marginTop: '14px' }}
    >
      <div>
        <h3 id="builder-source-preview-title" style={{ margin: 0, fontSize: '11px' }}>
          Existing source system
        </h3>
        <p style={{ margin: '4px 0 0', color: theme.muted, fontSize: '9px', lineHeight: 1.4 }}>
          Source colors stay exact; suggestions are labeled.
        </p>
      </div>
      {sections.map(section => (
        <div key={section.id}>
          <SwatchRow label={section.label} colors={section.colors} theme={theme} compact />
          {section.total > section.colors.length ? (
            <span style={{ color: theme.muted, fontSize: '8px' }}>
              {section.total - section.colors.length} more source colors appear in the created page.
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export const ColorSystemAuditSimpleTab: React.FC<ColorSystemAuditSimpleTabProps> = ({
  isDark,
  isActive = true,
}) => {
  const theme = themeFor(isDark);
  const [operation, setOperation] = React.useState<Operation>('idle');
  const [progress, setProgress] = React.useState<ColorSystemAuditProgressMessage | null>(null);
  const [session, setSession] = React.useState<AuditSession | null>(null);
  const [strategyReceipt, setStrategyReceipt] = React.useState<StrategyReceipt | null>(null);
  const [strategyFailureBlockers, setStrategyFailureBlockers] = React.useState<
    readonly ColorSystemStrategyFailureBlocker[]
  >([]);
  const [primaryCandidates, setPrimaryCandidates] = React.useState<readonly PrimaryCandidate[]>([]);
  const [confirmedPrimary, setConfirmedPrimary] = React.useState<PrimaryCandidate | null>(null);
  const [primaryQuery, setPrimaryQuery] = React.useState('');
  const [selectedDirection, setSelectedDirection] =
    React.useState<ColorSystemStrategyDirection>('balanced-contrast');
  const [applyReceipt, setApplyReceipt] = React.useState<ApplyReceipt | null>(null);
  const [importedBuilderPackage, setImportedBuilderPackage] =
    React.useState<ImportedBuilderPackageReceipt | null>(null);
  const [builderPackageBuild, setBuilderPackageBuild] =
    React.useState<BuilderPackageBuildReceipt | null>(null);
  const [acknowledgeOpenFileBoundary, setAcknowledgeOpenFileBoundary] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [usageScope, setUsageScope] =
    React.useState<Exclude<SnapshotUsageScope, 'not-applicable'>>('selection');
  const [confirmWholeFile, setConfirmWholeFile] = React.useState(false);
  const [includeLibraries, setIncludeLibraries] = React.useState(false);
  const [visualizationMode, setVisualizationMode] = React.useState<'light' | 'dark'>('light');
  const [visualizationCategoryCount, setVisualizationCategoryCount] = React.useState(4);
  const [visualizationSequentialCount, setVisualizationSequentialCount] = React.useState(3);
  const [visualizationDivergingCount, setVisualizationDivergingCount] = React.useState(3);
  const [visualizationAdjacency, setVisualizationAdjacency] = React.useState<
    'separated-marks' | 'touching-regions'
  >('separated-marks');
  const [visualizationMidpoint, setVisualizationMidpoint] = React.useState(
    'neutral reference for review'
  );
  const [rightsNote, setRightsNote] = React.useState('');
  const [systemName, setSystemName] = React.useState(DEFAULT_SYSTEM_NAME);

  const analysisRequest = React.useRef<PendingAnalysis | null>(null);
  const strategyRequest = React.useRef<{
    id: string;
    sourceHash: string;
    snapshot: SourceSystemSnapshot;
  } | null>(null);
  const selectionRequest = React.useRef<PendingSelection | null>(null);
  const confirmationRequest = React.useRef<PendingConfirmation | null>(null);
  const applyRequest = React.useRef<PendingApply | null>(null);
  const exportRequest = React.useRef<{
    id: string;
    sourceHash: string;
    kind: 'audit' | 'builder-package';
  } | null>(null);
  const builderPackageImportRequest = React.useRef<{ id: string } | null>(null);
  const builderPackageRebuildRequest = React.useRef<{
    id: string;
    receipt: ImportedBuilderPackageReceipt;
  } | null>(null);
  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const builderPackageInput = React.useRef<HTMLInputElement | null>(null);

  const busy = operation !== 'idle';
  const selectedCandidate = strategyReceipt?.strategySet.candidates.find(
    candidate => candidate.id === selectedDirection
  );
  const matchingPrimaryCandidates = primaryCandidates.filter(candidate =>
    `${candidate.name} ${candidate.hex} ${candidate.mode}`
      .toLowerCase()
      .includes(primaryQuery.trim().toLowerCase())
  );
  const boundedSearchFailures = strategyFailureBlockers.filter(
    blocker => blocker.direction && blocker.searchEvidence
  );

  const reset = React.useCallback(() => {
    setOperation('idle');
    setProgress(null);
    setSession(null);
    setStrategyReceipt(null);
    setStrategyFailureBlockers([]);
    setPrimaryCandidates([]);
    setConfirmedPrimary(null);
    setPrimaryQuery('');
    setSelectedDirection('balanced-contrast');
    setApplyReceipt(null);
    setImportedBuilderPackage(null);
    setBuilderPackageBuild(null);
    setAcknowledgeOpenFileBoundary(false);
    setError(null);
    analysisRequest.current = null;
    strategyRequest.current = null;
    selectionRequest.current = null;
    confirmationRequest.current = null;
    applyRequest.current = null;
    exportRequest.current = null;
    builderPackageImportRequest.current = null;
    builderPackageRebuildRequest.current = null;
  }, []);

  const requestStrategies = React.useCallback(
    (snapshot: SourceSystemSnapshot, primary?: ConfirmedColorSystemAnchor) => {
      const requestId = createRequestId('simple-color-strategies');
      strategyRequest.current = { id: requestId, sourceHash: snapshot.sourceHash, snapshot };
      setOperation('generating');
      setStrategyFailureBlockers([]);
      setError(null);
      const visualizationSettings: ColorSystemStrategyVisualizationSettings = {
        mode: visualizationMode,
        surfaceHex: visualizationMode === 'light' ? '#ffffff' : '#111111',
        ...(visualizationAdjacency === 'touching-regions'
          ? { boundaryHex: visualizationMode === 'light' ? '#000000' : '#ffffff' }
          : {}),
        chartType: 'generic-review-bar-chart',
        categoryCount: visualizationCategoryCount,
        nonColorCue: 'direct labels and shapes',
        markType: 'bar',
        adjacency: visualizationAdjacency,
        divergingMidpoint: visualizationMidpoint,
        sequentialCount: visualizationSequentialCount,
        divergingCount: visualizationDivergingCount,
      };
      postPluginMessage({
        type: 'generate-color-system-strategies',
        requestId,
        sourceHash: snapshot.sourceHash,
        visualizationSettings,
        ...(primary
          ? {
              confirmedPrimary: {
                tokenId: primary.tokenId,
                mode: primary.mode,
                hex: primary.hex,
              },
            }
          : {}),
      });
    },
    [
      visualizationAdjacency,
      visualizationCategoryCount,
      visualizationDivergingCount,
      visualizationMidpoint,
      visualizationMode,
      visualizationSequentialCount,
    ]
  );

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const raw = event.data?.pluginMessage;
      const validation = validateColorSystemAuditPluginMessage(raw);
      if (!validation.valid) {
        if (!raw || typeof raw !== 'object') return;
        const requestId =
          'requestId' in raw && typeof raw.requestId === 'string' ? raw.requestId : null;
        const expected = [
          analysisRequest.current?.id,
          strategyRequest.current?.id,
          selectionRequest.current?.id,
          confirmationRequest.current?.id,
          applyRequest.current?.id,
          exportRequest.current?.id,
          builderPackageImportRequest.current?.id,
          builderPackageRebuildRequest.current?.id,
        ].includes(requestId ?? undefined);
        if (expected && requestId && consumeRequestId(requestId)) {
          setOperation('idle');
          setProgress(null);
          setError(`Teul rejected an invalid result: ${validation.error}`);
        }
        return;
      }
      const message = validation.message;
      if (message.type === 'color-system-builder-package-import-result') {
        const pending = builderPackageImportRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        builderPackageImportRequest.current = null;
        setOperation('idle');
        if (!message.success) {
          setError(message.error);
          return;
        }
        setImportedBuilderPackage(message);
        setAcknowledgeOpenFileBoundary(false);
        setBuilderPackageBuild(null);
        setError(null);
        return;
      }
      if (message.type === 'color-system-audit-progress') {
        if (message.requestId === analysisRequest.current?.id) setProgress(message);
        return;
      }
      if (message.type === 'color-system-audit-result') {
        const pending = analysisRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        analysisRequest.current = null;
        setProgress(null);
        if (!message.success) {
          setOperation('idle');
          setError(message.error);
          return;
        }
        const nextSession: AuditSession = {
          origin: pending.origin,
          snapshot: message.snapshot,
          scannedNodeCount: message.scannedNodeCount,
          partial: message.partial,
          cancelled: message.cancelled,
        };
        setSession(nextSession);
        setStrategyReceipt(null);
        setStrategyFailureBlockers([]);
        setApplyReceipt(null);
        setError(null);
        if (
          pending.origin === 'figma' &&
          !message.partial &&
          !message.cancelled &&
          message.snapshot.documentProfile === 'srgb'
        ) {
          requestStrategies(message.snapshot);
        } else {
          setOperation('idle');
        }
        return;
      }
      if (message.type === 'color-system-strategy-set-result') {
        const pending = strategyRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        strategyRequest.current = null;
        setOperation('idle');
        if (!message.success) {
          setStrategyFailureBlockers(message.blockers);
          if (message.blockers.some(blocker => blocker.code === 'PRIMARY_CONFIRMATION_REQUIRED')) {
            const candidates = primaryCandidatesFromSnapshot(pending.snapshot);
            setPrimaryCandidates(candidates);
            setConfirmedPrimary(null);
            setPrimaryQuery('');
            setError(
              candidates.length === 0
                ? 'No opaque sRGB source color is available for Primary.'
                : null
            );
          } else {
            setError(message.error);
          }
          return;
        }
        if (message.sourceHash !== pending.sourceHash) {
          setError('Strategies do not match the analyzed source.');
          return;
        }
        setStrategyReceipt({
          strategySet: message.strategySet,
          primaryResolution: message.primaryResolution,
          primaryNote: message.primaryNote,
        });
        setStrategyFailureBlockers([]);
        setPrimaryCandidates([]);
        setConfirmedPrimary(null);
        setPrimaryQuery('');
        setSelectedDirection(message.strategySet.recommendation.recommendedCandidateId);
        setError(null);
        return;
      }
      if (message.type === 'color-system-proposal-approval-result') {
        const pending = selectionRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        selectionRequest.current = null;
        if (!message.success) {
          setOperation('idle');
          setError(message.error);
          return;
        }
        if (
          message.sourceHash !== pending.sourceHash ||
          message.bundle.status !== 'suitable-candidate' ||
          !message.reviewHash
        ) {
          setOperation('idle');
          setError(
            message.bundle.status === 'no-solution'
              ? (message.bundle.blockers[0]?.message ?? 'This strategy could not be completed.')
              : 'Selected strategy is not ready.'
          );
          return;
        }
        const requestId = createRequestId('simple-color-confirmation');
        confirmationRequest.current = {
          ...pending,
          id: requestId,
          proposalHash: message.bundle.proposal.proposalHash,
          reviewHash: message.reviewHash,
          intendedSurfaces: message.intendedSurfaces,
        };
        setOperation('confirming');
        postPluginMessage({
          type: 'confirm-color-system-proposal',
          requestId,
          sourceHash: pending.sourceHash,
          proposalHash: message.bundle.proposal.proposalHash,
          reviewHash: message.reviewHash,
          confirmedAnchorTokenIds: [pending.primary.tokenId],
          confirmedAnchors: [pending.primary],
          intendedSurfaces: message.intendedSurfaces,
          roleDecisions: [],
        });
        return;
      }
      if (message.type === 'color-system-proposal-confirmation-result') {
        const pending = confirmationRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        confirmationRequest.current = null;
        if (!message.success) {
          setOperation('idle');
          setError(message.error);
          return;
        }
        if (
          message.sourceHash !== pending.sourceHash ||
          message.proposalHash !== pending.proposalHash ||
          message.reviewHash !== pending.reviewHash
        ) {
          setOperation('idle');
          setError('Approval does not match the selected strategy.');
          return;
        }
        const requestId = createRequestId('simple-color-apply');
        applyRequest.current = {
          ...pending,
          id: requestId,
          approvalHash: message.approvalHash,
        };
        setOperation('applying');
        postPluginMessage({
          type: 'apply-color-system-proposal',
          requestId,
          sourceHash: pending.sourceHash,
          proposalHash: pending.proposalHash,
          approvalHash: message.approvalHash,
          systemName: systemName.trim() || DEFAULT_SYSTEM_NAME,
          collisionPolicy: 'create-copy',
          createVariables: true,
          createStyles: true,
          confirmedAnchorTokenIds: [pending.primary.tokenId],
          confirmedAnchors: [pending.primary],
          confirmedIntendedSurfaces: pending.intendedSurfaces,
        });
        return;
      }
      if (message.type === 'color-system-proposal-apply-result') {
        const rebuildPending = builderPackageRebuildRequest.current;
        if (rebuildPending?.id === message.requestId) {
          if (!consumeRequestId(message.requestId)) return;
          builderPackageRebuildRequest.current = null;
          setOperation('idle');
          if (!message.success) {
            setError(formatApplyFailure(message));
            return;
          }
          if (
            message.rebuildSource !== 'builder-package' ||
            message.builderPackageHash !== rebuildPending.receipt.packageHash ||
            message.blueprintParity !== 'exact' ||
            message.outputBlueprintHash !== rebuildPending.receipt.outputBlueprintHash
          ) {
            setError('Rebuilt output does not match this package.');
            return;
          }
          setBuilderPackageBuild(message);
          setError(null);
          return;
        }
        const pending = applyRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        applyRequest.current = null;
        setOperation('idle');
        if (!message.success) {
          setError(formatApplyFailure(message));
          return;
        }
        if (
          message.sourceHash !== pending.sourceHash ||
          message.proposalHash !== pending.proposalHash ||
          message.approvalHash !== pending.approvalHash
        ) {
          setError('The created output did not match the approved strategy.');
          return;
        }
        setApplyReceipt({
          sourceHash: pending.sourceHash,
          proposalHash: pending.proposalHash,
          reviewHash: pending.reviewHash,
          approvalHash: pending.approvalHash,
          outputName: message.outputName,
          ...(message.collectionName ? { collectionName: message.collectionName } : {}),
          variableCount: message.variableCount,
          aliasCount: message.aliasCount,
          styleCount: message.styleCount,
          overviewFrameName: message.overviewFrameName,
          overviewScaleCount: message.overviewScaleCount,
          overviewSwatchCount: message.overviewSwatchCount,
          ...('libraryPageName' in message && typeof message.libraryPageName === 'string'
            ? { libraryPageName: message.libraryPageName }
            : {}),
          ...('componentCount' in message && typeof message.componentCount === 'number'
            ? { componentCount: message.componentCount }
            : {}),
          ...('chartSpecimenCount' in message && typeof message.chartSpecimenCount === 'number'
            ? { chartSpecimenCount: message.chartSpecimenCount }
            : {}),
          warnings: message.warnings,
        });
        setError(null);
        return;
      }
      if (message.type === 'color-system-export-result') {
        const pending = exportRequest.current;
        if (!pending || pending.id !== message.requestId || !consumeRequestId(message.requestId)) {
          return;
        }
        exportRequest.current = null;
        setOperation('idle');
        if (!message.success) {
          setError(message.error);
          return;
        }
        if (message.sourceHash !== pending.sourceHash || message.kind !== pending.kind) {
          setError('Export does not match this color-system session.');
          return;
        }
        downloadJson(message.fileName, message.content);
        setError(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [requestStrategies, systemName]);

  React.useEffect(() => {
    if (!isActive && operation === 'analyzing' && analysisRequest.current) {
      postPluginMessage({
        type: 'cancel-color-system-analysis',
        targetRequestId: analysisRequest.current.id,
        preservePartial: false,
      });
    }
  }, [isActive, operation]);

  const startAnalysis = () => {
    if (busy) return;
    if (usageScope === 'whole-file' && !confirmWholeFile) {
      setError('Confirm the whole-file scan in Advanced.');
      return;
    }
    postPluginMessage({ type: 'clear-color-system-audit-session' });
    setSession(null);
    setStrategyReceipt(null);
    setStrategyFailureBlockers([]);
    setPrimaryCandidates([]);
    setConfirmedPrimary(null);
    setPrimaryQuery('');
    setApplyReceipt(null);
    setError(null);
    const requestId = createRequestId('simple-color-analysis');
    analysisRequest.current = { id: requestId, origin: 'figma' };
    setOperation('analyzing');
    postPluginMessage({
      type: 'analyze-color-system',
      requestId,
      usageScope,
      confirmWholeFile: usageScope === 'whole-file' && confirmWholeFile,
      includeEnabledLibraryDescriptors: includeLibraries,
      authorization: {
        status: 'user-authorized',
        ...(rightsNote.trim() ? { rightsNote: rightsNote.trim() } : {}),
      },
    });
  };

  const cancelAnalysis = () => {
    if (!analysisRequest.current || operation !== 'analyzing') return;
    postPluginMessage({
      type: 'cancel-color-system-analysis',
      targetRequestId: analysisRequest.current.id,
      preservePartial: false,
    });
  };

  const selectAndCreate = () => {
    if (busy || !strategyReceipt || !selectedCandidate || applyReceipt) return;
    const requestId = createRequestId('simple-color-strategy-selection');
    selectionRequest.current = {
      id: requestId,
      sourceHash: strategyReceipt.strategySet.sourceHash,
      candidate: selectedCandidate,
      primary: primaryAnchor(strategyReceipt.strategySet),
    };
    setOperation('selecting');
    setError(null);
    postPluginMessage({
      type: 'select-color-system-strategy',
      requestId,
      sourceHash: strategyReceipt.strategySet.sourceHash,
      strategySetHash: strategyReceipt.strategySet.strategySetHash,
      candidateId: selectedCandidate.id,
      candidateHash: selectedCandidate.candidateHash,
    });
  };

  const importTokens = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Token JSON must be 2 MB or smaller.');
      const requestId = createRequestId('simple-color-import');
      analysisRequest.current = { id: requestId, origin: 'structured-import' };
      setOperation('importing');
      setError(null);
      postPluginMessage({
        type: 'import-structured-color-system',
        requestId,
        fileName: file.name,
        content: await file.text(),
        authorization: {
          status: 'user-authorized',
          ...(rightsNote.trim() ? { rightsNote: rightsNote.trim() } : {}),
        },
      });
    } catch (importError) {
      setOperation('idle');
      setError(importError instanceof Error ? importError.message : 'Token import failed.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const openBuilderPackage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    try {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('System package must be 8 MiB or smaller.');
      }
      postPluginMessage({ type: 'clear-color-system-audit-session' });
      reset();
      const requestId = createRequestId('simple-builder-package-import');
      builderPackageImportRequest.current = { id: requestId };
      setOperation('opening-package');
      postPluginMessage({
        type: 'import-color-system-builder-package',
        requestId,
        fileName: file.name,
        content: await file.text(),
      });
    } catch (importError) {
      setOperation('idle');
      setError(importError instanceof Error ? importError.message : 'System package open failed.');
    } finally {
      if (builderPackageInput.current) builderPackageInput.current.value = '';
    }
  };

  const rebuildBuilderPackage = () => {
    if (!importedBuilderPackage || !acknowledgeOpenFileBoundary || busy) return;
    const requestId = createRequestId('simple-builder-package-rebuild');
    builderPackageRebuildRequest.current = { id: requestId, receipt: importedBuilderPackage };
    setOperation('rebuilding');
    setError(null);
    postPluginMessage({
      type: 'rebuild-color-system-builder-package',
      requestId,
      receiptId: importedBuilderPackage.receiptId,
      packageHash: importedBuilderPackage.packageHash,
      systemName: systemName.trim() || DEFAULT_SYSTEM_NAME,
      collisionPolicy: 'create-copy',
      createVariables: true,
      createStyles: true,
      acknowledgeOpenFileBoundary: true,
    });
  };

  const exportArtifact = (kind: 'audit' | 'builder-package') => {
    const sourceHash = kind === 'audit' ? session?.snapshot.sourceHash : applyReceipt?.sourceHash;
    if (!sourceHash || busy || (kind === 'builder-package' && !applyReceipt)) return;
    const requestId = createRequestId(`simple-color-${kind}`);
    exportRequest.current = { id: requestId, sourceHash, kind };
    setOperation('exporting');
    postPluginMessage({
      type: 'export-color-system-artifact',
      requestId,
      sourceHash,
      kind,
      ...(kind === 'builder-package' && applyReceipt
        ? {
            builderPackageReceipt: {
              schemaVersion: 'teul-color-system-builder-package/v1',
              proposalHash: applyReceipt.proposalHash,
              reviewHash: applyReceipt.reviewHash,
              approvalHash: applyReceipt.approvalHash,
            },
          }
        : {}),
      reviewerDecisions: [],
    });
  };

  const startOver = () => {
    if (busy) return;
    postPluginMessage({
      type: 'clear-color-system-audit-session',
      ...(session ? { sourceHash: session.snapshot.sourceHash } : {}),
    });
    reset();
  };

  const cardStyle: React.CSSProperties = {
    padding: '14px',
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    background: theme.card,
  };
  const buttonStyle: React.CSSProperties = {
    minHeight: '34px',
    padding: '7px 11px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.raised,
    color: theme.text,
    cursor: busy ? 'default' : 'pointer',
    fontSize: '11px',
    fontWeight: 600,
  };
  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    borderColor: theme.accent,
    background: theme.accent,
    color: theme.accentText,
  };
  const inputStyle: React.CSSProperties = {
    minHeight: '34px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.raised,
    color: theme.text,
    fontSize: '11px',
  };
  const helperStyle: React.CSSProperties = {
    margin: '5px 0 0',
    color: theme.muted,
    fontSize: '10px',
    lineHeight: 1.45,
  };
  const unsupportedPresentationSources = session
    ? unsupportedPresentationSourceCount(session.snapshot)
    : 0;

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '12px',
        background: theme.background,
        color: theme.text,
      }}
    >
      <div style={{ display: 'grid', gap: '12px' }}>
        {importedBuilderPackage ? (
          <section aria-labelledby="builder-package-title" style={cardStyle}>
            <h2 id="builder-package-title" style={{ margin: 0, fontSize: '15px' }}>
              {builderPackageBuild ? 'V1 draft built in this file' : 'V1 draft package ready'}
            </h2>
            <p style={helperStyle}>
              {importedBuilderPackage.candidateLabel} ·{' '}
              {importedBuilderPackage.systemSummary.primitiveCount} primitives ·{' '}
              {importedBuilderPackage.systemSummary.aliasCount} aliases ·{' '}
              {importedBuilderPackage.systemSummary.componentVariantCount} component variants ·{' '}
              {importedBuilderPackage.systemSummary.chartSpecimenCount} chart specimens
            </p>
            {builderPackageBuild ? (
              <p role="status" style={{ ...helperStyle, color: theme.success }}>
                Review “{builderPackageBuild.libraryPageName ?? builderPackageBuild.outputName}”.
                This file still requires manual Figma publication.
              </p>
            ) : (
              <>
                <label style={{ display: 'flex', gap: '7px', marginTop: '12px', fontSize: '10px' }}>
                  <input
                    type="checkbox"
                    checked={acknowledgeOpenFileBoundary}
                    disabled={busy}
                    onChange={event => setAcknowledgeOpenFileBoundary(event.target.checked)}
                  />
                  Build this approved two-family v1 draft in the currently open Figma Design file.
                </label>
                <button
                  type="button"
                  onClick={rebuildBuilderPackage}
                  disabled={busy || !acknowledgeOpenFileBoundary}
                  style={{ ...primaryButtonStyle, width: '100%', marginTop: '10px' }}
                >
                  {operation === 'rebuilding'
                    ? 'Building in this file…'
                    : 'Build in this open file'}
                </button>
                <p style={helperStyle}>
                  Builds the verified v1 draft here. It is not the complete multi-family Secondary
                  system. Separate-file creation and publishing stay manual.
                </p>
              </>
            )}
            <button type="button" onClick={startOver} disabled={busy} style={buttonStyle}>
              Close package
            </button>
          </section>
        ) : !session ? (
          <section aria-labelledby="builder-source-title" style={cardStyle}>
            <p
              style={{
                margin: 0,
                color: theme.muted,
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Build from what you already have
            </p>
            <h2 id="builder-source-title" style={{ margin: '5px 0 0', fontSize: '15px' }}>
              Select your color-system frame
            </h2>
            <p style={helperStyle}>
              This limited v1 draft keeps Primary exact, suggests two Secondary families, and
              previews Product and Data Viz roles. It is not the complete 4–12-family builder.
              Analysis is local and read-only.
            </p>
            <p style={helperStyle}>
              Data Viz review context: {visualizationMode} bar charts · {visualizationCategoryCount}{' '}
              categorical · {visualizationSequentialCount} sequential ·{' '}
              {visualizationDivergingCount} diverging ·{' '}
              {visualizationAdjacency === 'separated-marks'
                ? 'separated marks'
                : 'touching regions'}{' '}
              · {visualizationMidpoint}. Edit in Advanced.
            </p>
            <button
              type="button"
              aria-busy={operation === 'analyzing'}
              onClick={startAnalysis}
              disabled={busy}
              style={{ ...primaryButtonStyle, marginTop: '12px' }}
            >
              {operation === 'analyzing'
                ? 'Understanding your colors…'
                : `Analyze ${scopeLabel(usageScope)}`}
            </button>
            <p style={helperStyle}>Analyzing confirms permission to use these colors.</p>
            <label style={{ display: 'grid', gap: '4px', marginTop: '12px', fontSize: '10px' }}>
              Open a Teul system package
              <input
                ref={builderPackageInput}
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={event => void openBuilderPackage(event)}
                style={{ fontSize: '10px', color: theme.text }}
              />
            </label>
            {operation === 'opening-package' ? <p style={helperStyle}>Verifying package…</p> : null}
            {progress ? (
              <div aria-live="polite" style={{ marginTop: '10px' }}>
                <progress
                  aria-label="Color analysis progress"
                  value={Math.min(progress.completed, Math.max(progress.total, 1))}
                  max={Math.max(progress.total, 1)}
                  style={{ width: '100%' }}
                />
                <p role="status" style={helperStyle}>
                  {progress.message}
                </p>
                <button type="button" onClick={cancelAnalysis} style={buttonStyle}>
                  Cancel
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <section aria-labelledby="builder-result-title" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="builder-result-title" style={{ margin: 0, fontSize: '14px' }}>
                  {strategyReceipt ? 'Choose a direction' : 'Source understood'}
                </h2>
                <p style={helperStyle}>
                  {sourceColorCount(session.snapshot)} exact sRGB source colors ·{' '}
                  {session.scannedNodeCount} scanned nodes
                </p>
              </div>
              <button
                type="button"
                onClick={startOver}
                disabled={busy}
                style={{
                  ...buttonStyle,
                  marginLeft: 'auto',
                  minHeight: '28px',
                  padding: '4px 8px',
                }}
              >
                Start over
              </button>
            </div>

            {operation === 'generating' ? (
              <p role="status" style={{ ...helperStyle, marginTop: '12px' }}>
                Searching bounded Secondary and data-viz directions…
              </p>
            ) : null}

            {session.origin === 'structured-import' ? (
              <p role="status" style={{ ...helperStyle, color: theme.warning, marginTop: '12px' }}>
                Token JSON is read-only. Analyze the system in a Figma Design file to build it.
              </p>
            ) : session.snapshot.documentProfile !== 'srgb' ? (
              <p role="status" style={{ ...helperStyle, color: theme.warning, marginTop: '12px' }}>
                This {session.snapshot.documentProfile} file is inventory-only; building requires
                sRGB.
              </p>
            ) : null}

            <SourceSystemPreview snapshot={session.snapshot} theme={theme} />

            {primaryCandidates.length > 0 && !strategyReceipt ? (
              <fieldset
                style={{ border: 0, padding: 0, margin: '14px 0 0', display: 'grid', gap: '8px' }}
              >
                <legend style={{ padding: 0, marginBottom: '5px', fontSize: '10px' }}>
                  Primary is unclear. Choose one exact source value; Teul will not guess.
                </legend>
                <input
                  aria-label="Search exact Primary candidates"
                  placeholder="Search name, hex, or mode"
                  value={primaryQuery}
                  onChange={event => setPrimaryQuery(event.target.value)}
                  style={inputStyle}
                />
                <span style={{ color: theme.muted, fontSize: '8px' }}>
                  Showing {Math.min(matchingPrimaryCandidates.length, 50)} of{' '}
                  {primaryCandidates.length} exact source values.
                </span>
                {matchingPrimaryCandidates.slice(0, 50).map(candidate => {
                  const key = `${candidate.tokenId}:${candidate.mode}:${candidate.hex}`;
                  const selected =
                    confirmedPrimary?.tokenId === candidate.tokenId &&
                    confirmedPrimary.mode === candidate.mode &&
                    confirmedPrimary.hex === candidate.hex;
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 28px 1fr',
                        gap: '8px',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="radio"
                        name="confirmed-primary"
                        checked={selected}
                        onChange={() => setConfirmedPrimary(candidate)}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          width: 28,
                          height: 22,
                          background: candidate.hex,
                          border: `1px solid ${theme.border}`,
                        }}
                      />
                      <span style={{ fontSize: '9px' }}>
                        {candidate.name} · {candidate.hex} · {candidate.mode}
                      </span>
                    </label>
                  );
                })}
                <button
                  type="button"
                  disabled={!confirmedPrimary || busy}
                  onClick={() => {
                    if (confirmedPrimary) requestStrategies(session.snapshot, confirmedPrimary);
                  }}
                  style={{ ...primaryButtonStyle, marginTop: '4px' }}
                >
                  Use selected Primary
                </button>
              </fieldset>
            ) : null}

            {strategyReceipt ? (
              <>
                <fieldset
                  id="builder-strategy-comparison"
                  disabled={busy || Boolean(applyReceipt)}
                  style={{ border: 0, padding: 0, margin: '14px 0 0', display: 'grid', gap: '8px' }}
                >
                  <legend style={{ padding: 0, marginBottom: '8px', fontSize: '10px' }}>
                    Compare {strategyReceipt.strategySet.candidates.length} limited two-family{' '}
                    {strategyReceipt.strategySet.candidates.length === 1 ? 'draft' : 'drafts'}.{' '}
                    {strategyReceipt.strategySet.recommendation.statement}
                  </legend>
                  {strategyReceipt.strategySet.candidates.map(candidate => (
                    <StrategyCard
                      key={candidate.id}
                      candidate={candidate}
                      selected={candidate.id === selectedDirection}
                      recommended={
                        candidate.id ===
                        strategyReceipt.strategySet.recommendation.recommendedCandidateId
                      }
                      disabled={busy || Boolean(applyReceipt)}
                      theme={theme}
                      onSelect={() => setSelectedDirection(candidate.id)}
                    />
                  ))}
                  {strategyReceipt.strategySet.blockers.length > 0 ? (
                    <ul
                      aria-label="Directions not shown"
                      style={{ ...helperStyle, margin: '2px 0 0', paddingLeft: '16px' }}
                    >
                      {strategyReceipt.strategySet.blockers.map(blocker => (
                        <li key={`${blocker.code}:${blocker.direction ?? 'system'}`}>
                          {blocker.direction ? `${blocker.direction}: ` : ''}
                          {blocker.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </fieldset>

                {!applyReceipt ? (
                  <>
                    <button
                      type="button"
                      onClick={selectAndCreate}
                      disabled={busy || !selectedCandidate || unsupportedPresentationSources > 0}
                      style={{ ...primaryButtonStyle, width: '100%', marginTop: '14px' }}
                    >
                      {operation === 'selecting'
                        ? 'Preparing selected system…'
                        : operation === 'confirming'
                          ? 'Confirming exact output…'
                          : operation === 'applying'
                            ? 'Creating Figma library…'
                            : `Create ${selectedCandidate?.label ?? 'selected'} v1 draft`}
                    </button>
                    <p style={helperStyle}>
                      Creates a reviewed two-family draft page in this file; your source stays
                      unchanged. This is not a complete Secondary system.
                    </p>
                    {unsupportedPresentationSources > 0 ? (
                      <p role="status" style={{ ...helperStyle, color: theme.warning }}>
                        Creation is blocked because this v1 renderer cannot reproduce{' '}
                        {unsupportedPresentationSources} alpha-bearing or unsupported source{' '}
                        {unsupportedPresentationSources === 1 ? 'card' : 'cards'} exactly. The
                        source preview remains available; the v2 presentation compiler must retain
                        them before document creation.
                      </p>
                    ) : null}
                  </>
                ) : null}

                {applyReceipt ? (
                  <div
                    role="status"
                    style={{
                      marginTop: '14px',
                      padding: '11px',
                      border: `1px solid ${theme.success}`,
                      borderRadius: '8px',
                    }}
                  >
                    <strong style={{ color: theme.success, fontSize: '11px' }}>
                      Two-family v1 draft created
                    </strong>
                    <p style={{ ...helperStyle, color: theme.text }}>
                      {applyReceipt.libraryPageName
                        ? `Open the “${applyReceipt.libraryPageName}” page to review the limited two-family draft; it is not the complete multi-family system.`
                        : `Review “${applyReceipt.overviewFrameName}” on the canvas.`}{' '}
                      Created {applyReceipt.variableCount} primitive variables,{' '}
                      {applyReceipt.aliasCount} aliases, and {applyReceipt.styleCount} styles.
                    </p>
                    {applyReceipt.chartSpecimenCount !== undefined ? (
                      <p style={helperStyle}>
                        {applyReceipt.componentCount ?? 0} palette components ·{' '}
                        {applyReceipt.chartSpecimenCount} chart specimens · manual Figma
                        publication.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => exportArtifact('builder-package')}
                      disabled={busy}
                      style={{ ...buttonStyle, width: '100%', marginTop: '8px' }}
                    >
                      Export v1 draft package
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        )}

        {error ? (
          <p
            role="alert"
            style={{ margin: 0, color: theme.danger, fontSize: '10px', lineHeight: 1.45 }}
          >
            {error}
          </p>
        ) : null}

        {boundedSearchFailures.length > 0 ? (
          <ul
            aria-label="Search evidence"
            style={{ ...helperStyle, margin: 0, paddingLeft: '16px' }}
          >
            {boundedSearchFailures.map(blocker => (
              <li key={`${blocker.code}:${blocker.direction}`}>{formatSearchFailure(blocker)}</li>
            ))}
          </ul>
        ) : null}

        <details style={{ ...cardStyle, fontSize: '11px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Advanced</summary>
          <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
            <label style={{ display: 'grid', gap: '4px' }}>
              Analyze colors in
              <select
                value={usageScope}
                disabled={busy || Boolean(session)}
                onChange={event => {
                  const next = event.target.value as Exclude<SnapshotUsageScope, 'not-applicable'>;
                  setUsageScope(next);
                  if (next !== 'whole-file') setConfirmWholeFile(false);
                }}
                style={inputStyle}
              >
                <option value="selection">Selected frame</option>
                <option value="current-page">Current page</option>
                <option value="whole-file">Whole file</option>
              </select>
            </label>
            {usageScope === 'whole-file' ? (
              <label style={{ display: 'flex', gap: '7px' }}>
                <input
                  type="checkbox"
                  checked={confirmWholeFile}
                  disabled={busy || Boolean(session)}
                  onChange={event => setConfirmWholeFile(event.target.checked)}
                />
                Confirm the slower whole-file scan.
              </label>
            ) : null}
            <label style={{ display: 'flex', gap: '7px' }}>
              <input
                type="checkbox"
                checked={includeLibraries}
                disabled={busy || Boolean(session)}
                onChange={event => setIncludeLibraries(event.target.checked)}
              />
              Include enabled-library descriptors. Colors are not imported.
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Data Viz review surface
              <select
                value={visualizationMode}
                disabled={busy || Boolean(session)}
                onChange={event => setVisualizationMode(event.target.value as 'light' | 'dark')}
                style={inputStyle}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Categorical series
              <select
                value={visualizationCategoryCount}
                disabled={busy || Boolean(session)}
                onChange={event => setVisualizationCategoryCount(Number(event.target.value))}
                style={inputStyle}
              >
                {[2, 3, 4, 5, 6, 7, 8].map(count => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Mark adjacency
              <select
                value={visualizationAdjacency}
                disabled={busy || Boolean(session)}
                onChange={event =>
                  setVisualizationAdjacency(
                    event.target.value as 'separated-marks' | 'touching-regions'
                  )
                }
                style={inputStyle}
              >
                <option value="separated-marks">Separated marks</option>
                <option value="touching-regions">Touching regions</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Sequential steps
              <select
                value={visualizationSequentialCount}
                disabled={busy || Boolean(session)}
                onChange={event => setVisualizationSequentialCount(Number(event.target.value))}
                style={inputStyle}
              >
                {[3, 4, 5, 6, 7, 8, 9].map(count => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Diverging steps
              <select
                value={visualizationDivergingCount}
                disabled={busy || Boolean(session)}
                onChange={event => setVisualizationDivergingCount(Number(event.target.value))}
                style={inputStyle}
              >
                {[3, 5, 7, 9].map(count => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Diverging midpoint means
              <select
                value={visualizationMidpoint}
                disabled={busy || Boolean(session)}
                onChange={event => setVisualizationMidpoint(event.target.value)}
                style={inputStyle}
              >
                <option value="neutral reference for review">Neutral review reference</option>
                <option value="zero or no change">Zero or no change</option>
                <option value="target or baseline">Target or baseline</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Output name
              <input
                value={systemName}
                maxLength={128}
                disabled={busy || Boolean(applyReceipt)}
                onChange={event => setSystemName(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Rights or provenance note (optional)
              <input
                value={rightsNote}
                maxLength={2_000}
                disabled={busy || Boolean(session)}
                onChange={event => setRightsNote(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              Inspect local DTCG or Teul token JSON
              <input
                ref={fileInput}
                type="file"
                accept=".tokens,.tokens.json,.json,application/json"
                disabled={busy}
                onChange={event => void importTokens(event)}
                style={{ fontSize: '10px', color: theme.text }}
              />
            </label>
            {session ? (
              <button
                type="button"
                onClick={() => exportArtifact('audit')}
                disabled={busy}
                style={buttonStyle}
              >
                {operation === 'exporting' ? 'Exporting…' : 'Export audit JSON'}
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
};
