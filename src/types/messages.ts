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
  hex: string;
  name: string;
}

export interface ApplyStrokeMessage {
  type: 'apply-stroke';
  hex: string;
  name: string;
}

export interface CreateStyleMessage {
  type: 'create-style';
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

export interface ApplyGradientMessage {
  type: 'apply-gradient';
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
  config: ColorSystemConfig;
  scales: ColorSystemData;
}

export interface CreateGridFrameMessage {
  type: 'create-grid-frame';
  config: FigmaGridConfig;
  frameName: string;
  width: number;
  height: number;
  positionNearSelection?: boolean;
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
  | ApplyGradientMessage
  | NotifyMessage
  | GenerateColorSystemMessage
  | CreateGridFrameMessage
  | ApplyGridMessage;

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

export interface ColorSystemOperationResultMessage {
  type: 'color-system-operation-result';
  requestId: string;
  success: boolean;
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
}
