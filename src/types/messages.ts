/**
 * Type-safe message protocol between UI and Figma plugin backend
 */

import type { GridConfig } from './grid';

// ============================================
// Color Message Types
// ============================================

export interface ColorPayload {
  hex: string;
  name: string;
  rgb?: number[];
}

export interface GradientColor {
  hex: string;
  name: string;
}

// ============================================
// UI → Plugin Messages
// ============================================

export interface ApplyFillMessage {
  type: 'apply-fill';
  hex: string;
  name: string;
  rgb?: number[];
}

export interface ApplyStrokeMessage {
  type: 'apply-stroke';
  hex: string;
  name: string;
  rgb?: number[];
}

export interface CreateStyleMessage {
  type: 'create-style';
  hex: string;
  name: string;
  rgb?: number[];
}

export interface GetSelectionColorMessage {
  type: 'get-selection-color';
}

export interface GetSelectionForGridMessage {
  type: 'get-selection-for-grid';
}

export interface CreateColorMessage {
  type: 'create-color';
  color: {
    rgb_array: number[];
    name: string;
  };
}

export interface ApplyGradientMessage {
  type: 'apply-gradient';
  gradientType: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';
  colors: GradientColor[];
}

export interface CreatePaletteMessage {
  type: 'create-palette';
  colors: ColorPayload[];
  name?: string;
}

export interface NotifyMessage {
  type: 'notify';
  text: string;
}

export interface CopyMessage {
  type: 'copy';
  text: string;
}

export interface GenerateColorSystemMessage {
  type: 'generate-color-system';
  config: unknown; // Complex config object
  scales: unknown; // ColorSystemData
}

export interface CreateColorStylesMessage {
  type: 'create-color-styles';
  scales: unknown; // CreateStylesData
  systemName: string;
}

export interface CreateGridFrameMessage {
  type: 'create-grid-frame';
  config: GridConfig;
  frameName: string;
  width: number;
  height: number;
  includeImage?: boolean;
  imageBytes?: Uint8Array;
}

export interface ApplyGridMessage {
  type: 'apply-grid';
  config: GridConfig;
  replaceExisting: boolean;
}

export interface ClearGridsMessage {
  type: 'clear-grids';
}

/**
 * All messages that can be sent from UI to Plugin
 */
export type UIToPluginMessage =
  | ApplyFillMessage
  | ApplyStrokeMessage
  | CreateStyleMessage
  | GetSelectionColorMessage
  | GetSelectionForGridMessage
  | CreateColorMessage
  | ApplyGradientMessage
  | CreatePaletteMessage
  | NotifyMessage
  | CopyMessage
  | GenerateColorSystemMessage
  | CreateColorStylesMessage
  | CreateGridFrameMessage
  | ApplyGridMessage
  | ClearGridsMessage;

// ============================================
// Plugin → UI Messages
// ============================================

export interface SelectionColorMessage {
  type: 'selection-color';
  rgb: number[];
}

export interface SelectionInfoMessage {
  type: 'selection-info';
  hasSelection: boolean;
  isFrame: boolean;
  width?: number;
  height?: number;
  name?: string;
}

export interface GridAppliedMessage {
  type: 'grid-applied';
  success: boolean;
  frameName?: string;
  error?: string;
}

/**
 * All messages that can be sent from Plugin to UI
 */
export type PluginToUIMessage = SelectionColorMessage | SelectionInfoMessage | GridAppliedMessage;

// ============================================
// Type Guards
// ============================================

export function isPluginMessage(msg: unknown): msg is PluginToUIMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}

export function isSelectionInfoMessage(msg: PluginToUIMessage): msg is SelectionInfoMessage {
  return msg.type === 'selection-info';
}

export function isSelectionColorMessage(msg: PluginToUIMessage): msg is SelectionColorMessage {
  return msg.type === 'selection-color';
}

export function isGridAppliedMessage(msg: PluginToUIMessage): msg is GridAppliedMessage {
  return msg.type === 'grid-applied';
}
