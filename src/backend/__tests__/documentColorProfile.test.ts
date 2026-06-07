import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectDocumentColorProfile,
  normalizeDocumentColorProfile,
  sendDocumentColorProfile,
} from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('document color profile detection', () => {
  it('normalizes Figma document color profiles', () => {
    expect(normalizeDocumentColorProfile('LEGACY')).toBe('legacy');
    expect(normalizeDocumentColorProfile('SRGB')).toBe('srgb');
    expect(normalizeDocumentColorProfile('DISPLAY_P3')).toBe('display-p3');
    expect(normalizeDocumentColorProfile('FUTURE_PROFILE')).toBe('unknown');
  });

  it('falls back when an older runtime does not expose the profile', () => {
    expect(detectDocumentColorProfile({ type: 'DOCUMENT' })).toBe('unknown');

    const root = {};
    Object.defineProperty(root, 'documentColorProfile', {
      get: () => {
        throw new Error('Unsupported property');
      },
    });

    expect(detectDocumentColorProfile(root)).toBe('unknown');
  });

  it('sends the normalized profile to the UI', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('figma', {
      root: { documentColorProfile: 'DISPLAY_P3' },
      ui: { postMessage },
    });

    sendDocumentColorProfile();

    expect(postMessage).toHaveBeenCalledWith({
      type: 'document-color-profile',
      profile: 'display-p3',
    });
  });
});
