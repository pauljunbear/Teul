import type { IntakeKind } from '../../../../services/guideline-intake/src/protocol';
import type {
  InterpretationInput,
  InterpretationResult,
} from '../../../../services/guideline-intake/src/interpretation';
import {
  applyGuidelineAssistance,
  prepareGuidelineAssistance,
  type AssistanceOrigin,
  type PreparedGuidelineAssistance,
} from './assistance';
import { observationColorCss, type GuidelineCaptureAny } from './evidenceV2';
import type { GuidelinePdf } from './pdf';
import type { GuidelineReviewDraftV2 } from './reviewV2';
import { guidelineHash } from './review';
import {
  applyNativeAssistance,
  prepareNativeAssistance,
  NATIVE_ASSISTANCE_PARSER_VERSION,
  type NativeAssistanceSource,
} from './nativeAssistance';
import { figmaSourceStatements } from './figmaReview';
import { websiteSourceStatements } from './websiteModel';

export interface AssistanceAdapter<D, R> {
  kind: IntakeKind;
  sourceCaptureHash: string;
  draftHash: string;
  modeId: string | null;
  scopeLabel: string;
  canPrepare: boolean;
  images: 'available' | 'unavailable' | null;
  parserVersion: string;
  evidenceLabel: (id: string) => string | null;
  prepare: (options: {
    workspaceId: string;
    includeImages: boolean;
    signal: AbortSignal;
  }) => Promise<PreparedGuidelineAssistance>;
  apply: (options: {
    input: InterpretationInput;
    result: InterpretationResult;
    origin: AssistanceOrigin;
  }) => Promise<{ draft: D; receipt: R }>;
}

export function pdfAssistanceAdapter(
  capture: GuidelineCaptureAny,
  draft: GuidelineReviewDraftV2,
  pdf: GuidelinePdf | null
) {
  return {
    kind: 'pdf' as const,
    sourceCaptureHash: capture.captureHash,
    draftHash: guidelineHash(draft),
    modeId: null,
    scopeLabel: capture.scope.requested.map(scope => scope.replace('page:', '')).join(', '),
    canPrepare: true,
    images: pdf ? ('available' as const) : ('unavailable' as const),
    parserVersion: 'assisted-review-1',
    evidenceLabel(id: string) {
      const item = capture.observations.find(item => item.id === id);
      return item
        ? `${item.locator.kind === 'pdf' ? `Page ${item.locator.page}` : 'Source'} · ${item.kind === 'color' ? observationColorCss(item) : 'Text'}`
        : null;
    },
    prepare: (options: Parameters<AssistanceAdapter<unknown, unknown>['prepare']>[0]) =>
      prepareGuidelineAssistance(capture, { ...options, pdf }),
    apply: async (options: Parameters<AssistanceAdapter<unknown, unknown>['apply']>[0]) =>
      applyGuidelineAssistance({ capture, draft, ...options }),
  };
}

export function nativeAssistanceAdapter(source: NativeAssistanceSource, modeId: string) {
  const evidence = new Map<string, string>();
  for (const item of source.inventory.declarations)
    evidence.set(item.id, `${item.label} · ${item.locator}`);
  const statements =
    source.kind === 'figma'
      ? figmaSourceStatements(source.inventory)
      : websiteSourceStatements(source.inventory);
  for (const item of statements)
    evidence.set(item.id, `${item.text.slice(0, 240)} · ${item.locator}`);
  return {
    kind: source.kind,
    sourceCaptureHash: source.inventory.packet.contentHash,
    draftHash: guidelineHash(source.draft),
    modeId,
    scopeLabel:
      source.inventory.modes.find(mode => mode.id === modeId)?.label ?? 'Choose a captured mode',
    canPrepare: source.draft.modeIds.includes(modeId) && source.draft.colors.length > 0,
    images: null,
    parserVersion: NATIVE_ASSISTANCE_PARSER_VERSION,
    evidenceLabel: (id: string) => evidence.get(id) ?? null,
    prepare: (options: Parameters<AssistanceAdapter<unknown, unknown>['prepare']>[0]) =>
      prepareNativeAssistance(source, { ...options, modeId }),
    apply: (options: Parameters<AssistanceAdapter<unknown, unknown>['apply']>[0]) =>
      applyNativeAssistance({ source, modeId, ...options }),
  };
}
