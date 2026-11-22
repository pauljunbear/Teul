import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import type { ReviewRuleV2 } from './reviewV2';

export interface SourceProfileDecision {
  captureHash: string;
  interpretation: 'srgb';
  actor: { kind: 'user'; ref: string };
  decidedAt: string;
}
export interface SourceReviewColor {
  declarationId: string;
  label: string;
  family: string;
}
export interface SourceReviewStatement extends ReviewRuleV2 {
  modeIds: string[];
}
export interface SourceReviewScale {
  id: string;
  label: string;
  family: string;
  slots: { id: string; position: number }[];
  modes: { modeId: string; anchors: { slotId: string; declarationId: string }[] }[];
  evidenceRefs: string[];
}
export interface SourceReviewDraft<DraftVersion extends string = string> {
  schemaVersion: DraftVersion;
  captureHash: string;
  modeIds: string[];
  colors: SourceReviewColor[];
  profileDecision: SourceProfileDecision | null;
  statements: SourceReviewStatement[];
  scales: SourceReviewScale[];
  scopeDecision: { accepted: boolean; reason: string };
}
export interface SourceReviewedSource<
  DraftVersion extends string = string,
  ReviewVersion extends string = string,
> {
  schemaVersion: ReviewVersion;
  captureHash: string;
  model: ColorSystemModelV1;
  decision: {
    actor: { kind: 'user'; ref: string };
    reviewedAt: string;
    draft: SourceReviewDraft<DraftVersion>;
  };
  reviewHash: string;
}

export interface SourceStatement {
  id: string;
  sourceId: string;
  locator: string;
  text: string;
  evidenceId: string;
  claimId: string;
}
