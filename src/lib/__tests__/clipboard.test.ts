import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard';

describe('copyToClipboard', () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('parent', { postMessage });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
    document.body.innerHTML = '';
  });

  it('reports success when execCommand returns true and cleans up', () => {
    document.execCommand = vi.fn(() => true);

    copyToClipboard('#123456', 'hex code');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'notify', text: 'Copied hex code' } },
      '*'
    );
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when execCommand returns false and cleans up', () => {
    document.execCommand = vi.fn(() => false);

    copyToClipboard('#123456', 'hex code');

    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'notify', text: 'Copy failed' } },
      '*'
    );
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when execCommand throws and cleans up', () => {
    document.execCommand = vi.fn(() => {
      throw new Error('Clipboard unavailable');
    });

    copyToClipboard('#123456', 'hex code');

    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'notify', text: 'Copy failed' } },
      '*'
    );
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
