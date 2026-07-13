// Backend Module Barrel Export
// Re-exports all backend operations for use in code.ts

import type {
  DocumentColorProfileMessage,
  NormalizedDocumentColorProfile,
} from '../types/messages';

interface DocumentWithOptionalColorProfile {
  readonly documentColorProfile?: unknown;
}

export function normalizeDocumentColorProfile(profile: unknown): NormalizedDocumentColorProfile {
  if (profile === 'LEGACY') return 'legacy';
  if (profile === 'SRGB') return 'srgb';
  if (profile === 'DISPLAY_P3') return 'display-p3';
  return 'unknown';
}

export function detectDocumentColorProfile(root: unknown): NormalizedDocumentColorProfile {
  try {
    if (typeof root !== 'object' || root === null || !('documentColorProfile' in root)) {
      return 'unknown';
    }

    return normalizeDocumentColorProfile(
      (root as DocumentWithOptionalColorProfile).documentColorProfile
    );
  } catch {
    return 'unknown';
  }
}

export function sendDocumentColorProfile(): void {
  const message: DocumentColorProfileMessage = {
    type: 'document-color-profile',
    profile: detectDocumentColorProfile(figma.root),
  };

  figma.ui.postMessage(message);
}

// Figma Helpers
export { sendSelectionInfo } from './figmaHelpers';

// Color Operations
export {
  handleApplyFill,
  handleApplyStroke,
  handleCreateStyle,
  handleApplyGradient,
} from './colorOperations';

// Grid Operations
export { handleCreateGridFrame, handleApplyGrid } from './gridOperations';

export { handleGenerateColorSystem } from './colorSystemTransaction';
