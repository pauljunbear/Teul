import type { ColorSystemDesignerScaleRequestV1 } from '../lib/colorSystemDesignerScaleV1';
import type { ColorSystemAuthoredDeliveryStateV1 } from '../backend/colorSystemAuthoredDeliverySessionV1';
/** Display data only. These summaries cannot be replayed as a model or write permission. */
export interface ColorSystemAuthoringNamedV1 {
  id: string;
  label: string;
}
export interface ColorSystemAuthoringSourceViewV1 {
  modelHash: string;
  summary: string;
  intake: 'guideline-json' | 'current-file';
  contexts: (ColorSystemAuthoringNamedV1 & { modeIds: string[] })[];
  modes: ColorSystemAuthoringNamedV1[];
  colors: (ColorSystemAuthoringNamedV1 & {
    values: { modeId: string; css: string; native: string }[];
  })[];
  families: ColorSystemAuthoringNamedV1[];
  scales: ColorSystemAuthoringNamedV1[];
  rules: (ColorSystemAuthoringNamedV1 & { status: string; scope: string; description: string })[];
}
export interface ColorSystemAuthoringSelectorViewV1 extends ColorSystemAuthoringNamedV1 {
  kind: 'color' | 'family' | 'scale';
}
export interface ColorSystemAuthoringRefinementViewV1 {
  recipeHash: string;
  contexts: ColorSystemAuthoringNamedV1[];
  modes: ColorSystemAuthoringNamedV1[];
  selectors: ColorSystemAuthoringSelectorViewV1[];
  catalogs: {
    id: string;
    candidateId: string;
    provider: 'wada' | 'werner' | 'radix';
    modes: ColorSystemAuthoringNamedV1[];
  }[];
  roles: {
    fragmentId: string;
    id: string;
    label: string;
    role: string;
    contextIds: string[];
    modeIds: string[];
    members: { kind: 'color' | 'family' | 'scale'; id: string }[];
  }[];
}
export interface ColorSystemAuthoringCatalogViewV1 {
  recipeHash: string;
  fragmentId: string;
  discoveryHash: string;
  request: {
    recipeHash: string;
    fragmentId: string;
    provider: 'wada' | 'werner' | 'radix';
    radix?: {
      category: 'accent' | 'neutral' | 'either';
      modes: { modeId: string; scheme: 'light' | 'dark' }[];
    };
  };
  references: (ColorSystemAuthoringSelectorViewV1 & { paths: string[]; editable: boolean })[];
  candidates: {
    id: string;
    hash: string;
    label: string;
    disclosure: string;
    colors: ColorSystemAuthoringSourceViewV1['colors'];
    targets: ColorSystemAuthoringSelectorViewV1[];
  }[];
}
export interface ColorSystemAuthoringViewV1 {
  version: 'teul.authoring-view.v1';
  message: string;
  status: string;
  delivery?: ColorSystemAuthoredDeliveryStateV1;
  source: ColorSystemAuthoringSourceViewV1 | null;
  designerScale: ColorSystemDesignerScaleRequestV1 | null;
  refinement: ColorSystemAuthoringRefinementViewV1 | null;
  catalog: ColorSystemAuthoringCatalogViewV1 | null;
  pendingReview: null | {
    proposalHash: string;
    rules: {
      id: string;
      label: string;
      force: string;
      origin: string;
      scope: string;
      meaning: string;
      evidence: string[];
    }[];
  };
  recipe: null | {
    id: string;
    label: string;
    recipeHash: string;
    contentHash: string | null;
    saved: boolean;
    readOnly: boolean;
    sourceFreshness: string;
    headRevisionHashes: string[];
    conflictHeads: string[];
    families: (ColorSystemAuthoringNamedV1 & { locked: boolean })[];
    scales: (ColorSystemAuthoringNamedV1 & { locked: boolean })[];
    colors: ColorSystemAuthoringSourceViewV1['colors'];
    applications: {
      id: string;
      contextId: string;
      modeId: string;
      uses: { id: string; role: string; colorId: string; label: string; css: string }[];
      pairs: { id: string; ratio: number | null; minimum: number; assessment: string }[];
    }[];
  };
  readOnly: boolean;
  savedRecipes: {
    id: string;
    status: string;
    heads: string[];
    revisions: { hash: string; label: string; head: boolean }[];
  }[];
  readOnlyEntries: { key: string; reason: string }[];
  storageMessage: string;
  changes: string[];
  /** Present only following an explicit export request; exact recipe/unknown bytes. */
  exportJson?: string;
}
