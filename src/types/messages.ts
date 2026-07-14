/**
 * Type-safe message protocol between UI and Figma plugin backend
 */

import type {
  ColorSystemConfig,
  ColorSystemData,
  NormalizedDocumentColorProfile,
} from './colorSystem';
import type {
  FigmaRowsColsLayoutGrid,
  FigmaUniformLayoutGrid,
  GridApplicationMode,
  GridResponsiveWidth,
  GridConfig,
  GridConstructionV2,
  GridLinkedResourcePolicy,
  GridNativeResources,
  GridSelectionTarget,
} from './grid';

// ============================================
// Color Message Types
// ============================================

export interface GradientColor {
  hex: string;
  name: string;
}

export interface FigmaGridConfig {
  columns?: FigmaRowsColsLayoutGrid;
  rows?: FigmaRowsColsLayoutGrid;
  baseline?: FigmaUniformLayoutGrid;
}

export type { NormalizedDocumentColorProfile } from './colorSystem';

export function isNormalizedDocumentColorProfile(
  value: unknown
): value is NormalizedDocumentColorProfile {
  return value === 'legacy' || value === 'srgb' || value === 'display-p3' || value === 'unknown';
}

// ============================================
// UI → Plugin Messages
// ============================================

export interface ApplyFillMessage {
  type: 'apply-fill';
  requestId: string;
  hex: string;
  name: string;
}

export interface ApplyStrokeMessage {
  type: 'apply-stroke';
  requestId: string;
  hex: string;
  name: string;
}

export interface CreateStyleMessage {
  type: 'create-style';
  requestId: string;
  hex: string;
  name: string;
}

export interface GetSelectionForGridMessage {
  type: 'get-selection-for-grid';
  requestId?: string;
}

export interface GetDocumentColorProfileMessage {
  type: 'get-document-color-profile';
}

export interface GetAccessibilitySelectionMessage {
  type: 'get-selection-for-accessibility';
  requestId: string;
}

export interface ApplyGradientMessage {
  type: 'apply-gradient';
  requestId: string;
  gradientType: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';
  colors: GradientColor[];
}

export interface NotifyMessage {
  type: 'notify';
  text: string;
}

export interface GenerateColorSystemMessage {
  type: 'generate-color-system';
  requestId: string;
  createStyles: boolean;
  createVariables: boolean;
  collisionPolicy?: 'cancel' | 'update-local' | 'create-copy';
  config: ColorSystemConfig;
  scales: ColorSystemData;
}

export interface CreateGridFrameMessage {
  type: 'create-grid-frame';
  requestId: string;
  config: FigmaGridConfig;
  frameName: string;
  width: number;
  height: number;
  positionNearSelection?: boolean;
  construction?: GridConstructionV2;
}

export interface ApplyGridMessage {
  type: 'apply-grid';
  requestId: string;
  sourceConfig: GridConfig;
  sourceDimensions?: { width: number; height: number };
  applicationMode: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
  expectedTargetIds: string[];
  replaceExisting: boolean;
  nativeResources?: GridNativeResources;
  linkedResourcePolicy?: GridLinkedResourcePolicy;
  construction?: GridConstructionV2;
}

export interface ClearGridMessage {
  type: 'clear-grid';
  requestId: string;
  expectedTargetIds: string[];
}

export interface CaptureSelectedGridMessage {
  type: 'capture-selected-grid';
  requestId: string;
}

export interface GetGridStorageMessage {
  type: 'get-grid-storage';
  requestId: string;
}

export interface SetGridStorageMessage {
  type: 'set-grid-storage';
  requestId: string;
  value: string;
}

export interface DeleteGridStorageMessage {
  type: 'delete-grid-storage';
  requestId: string;
}

export interface GetWorkspaceStorageMessage {
  type: 'get-workspace-storage';
  requestId: string;
}

export interface SetWorkspaceStorageMessage {
  type: 'set-workspace-storage';
  requestId: string;
  value: string;
}

/**
 * All messages that can be sent from UI to Plugin
 */
export type UIToPluginMessage =
  | ApplyFillMessage
  | ApplyStrokeMessage
  | CreateStyleMessage
  | GetSelectionForGridMessage
  | GetDocumentColorProfileMessage
  | GetAccessibilitySelectionMessage
  | ApplyGradientMessage
  | NotifyMessage
  | GenerateColorSystemMessage
  | CreateGridFrameMessage
  | ApplyGridMessage
  | ClearGridMessage
  | CaptureSelectedGridMessage
  | GetGridStorageMessage
  | SetGridStorageMessage
  | DeleteGridStorageMessage
  | GetWorkspaceStorageMessage
  | SetWorkspaceStorageMessage;

// ============================================
// Plugin → UI Messages
// ============================================

export interface SelectionInfoMessage {
  type: 'selection-info';
  requestId?: string;
  hasSelection: boolean;
  isFrame: boolean;
  selectedCount: number;
  eligibleTargets: GridSelectionTarget[];
  ineligibleCount: number;
  width?: number;
  height?: number;
  name?: string;
}

export interface DocumentColorProfileMessage {
  type: 'document-color-profile';
  profile: NormalizedDocumentColorProfile;
}

export interface AccessibilitySelectionResultMessage {
  type: 'accessibility-selection-result';
  requestId: string;
  success: boolean;
  profile: NormalizedDocumentColorProfile;
  foreground?: string;
  background?: string;
  foregroundSource?: string;
  backgroundSource?: string;
  error?: string;
}

export interface ColorSystemOperationResultMessage {
  type: 'color-system-operation-result';
  requestId: string;
  success: boolean;
  message?: string;
  outputName?: string;
  modes?: string[];
  primitiveCount?: number;
  semanticAliasCount?: number;
  styleCount?: number;
  frameCount?: number;
  skippedCount?: number;
  warnings?: string[];
  error?: string;
}

export type MutationOperation =
  | 'apply-fill'
  | 'apply-stroke'
  | 'create-style'
  | 'apply-gradient'
  | 'create-grid-frame';

export interface MutationOperationResultMessage {
  type: 'mutation-operation-result';
  requestId: string;
  operation: MutationOperation;
  success: boolean;
  message: string;
  error?: string;
}

export interface GridAppliedMessage {
  type: 'grid-applied';
  requestId: string;
  success: boolean;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  message: string;
  frameName?: string;
  frameWidth?: number;
  frameHeight?: number;
  error?: string;
  realization?: GridConstructionV2['realization'];
}

export interface GridStorageResultMessage {
  type: 'grid-storage-result';
  requestId: string;
  operation: 'get' | 'set' | 'delete';
  success: boolean;
  value?: string | null;
  error?: string;
}

export interface WorkspaceStorageResultMessage {
  type: 'workspace-storage-result';
  requestId: string;
  operation: 'get' | 'set';
  success: boolean;
  value?: string | null;
  error?: string;
}

export interface GridCaptureResultMessage {
  type: 'grid-capture-result';
  requestId: string;
  success: boolean;
  config?: GridConfig;
  frameName?: string;
  dimensions?: { width: number; height: number };
  nativeResources?: GridNativeResources;
  error?: string;
}

/** All messages that can be sent from the plugin sandbox to the UI iframe. */
export type PluginToUIMessage =
  | SelectionInfoMessage
  | DocumentColorProfileMessage
  | AccessibilitySelectionResultMessage
  | ColorSystemOperationResultMessage
  | MutationOperationResultMessage
  | GridAppliedMessage
  | GridStorageResultMessage
  | WorkspaceStorageResultMessage
  | GridCaptureResultMessage;
