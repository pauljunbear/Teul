import type { GridStorageResultMessage } from '../types/messages';

const STORAGE_KEY = 'teul-saved-grids';
const REQUEST_TIMEOUT_MS = 5000;

type GridStorageOperation = GridStorageResultMessage['operation'];

let nextRequestId = 0;

function isFigmaPluginUI(): boolean {
  return typeof window !== 'undefined' && typeof parent !== 'undefined' && parent !== window;
}

function clearLegacyStorageBestEffort(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // clientStorage remains authoritative even when the iframe origin blocks cleanup.
  }
}

function requestGridStorage(
  operation: GridStorageOperation,
  value?: string
): Promise<string | null | void> {
  if (!isFigmaPluginUI()) {
    if (operation === 'get') return Promise.resolve(localStorage.getItem(STORAGE_KEY));
    if (operation === 'set') {
      localStorage.setItem(STORAGE_KEY, value ?? '');
      return Promise.resolve();
    }
    localStorage.removeItem(STORAGE_KEY);
    return Promise.resolve();
  }

  const requestId = `grid-storage-${++nextRequestId}`;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Saved grid storage did not respond'));
    }, REQUEST_TIMEOUT_MS);

    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const message = event.data?.pluginMessage as Partial<GridStorageResultMessage> | undefined;
      if (message?.type !== 'grid-storage-result' || message.requestId !== requestId) return;

      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);

      if (!message.success || message.operation !== operation) {
        reject(new Error(message.error || `Failed to ${operation} saved grid storage`));
        return;
      }

      resolve(operation === 'get' && typeof message.value === 'string' ? message.value : null);
    };

    window.addEventListener('message', handleMessage);
    parent.postMessage(
      {
        pluginMessage: {
          type: `${operation === 'delete' ? 'delete' : operation}-grid-storage`,
          requestId,
          ...(operation === 'set' ? { value } : {}),
        },
      },
      '*'
    );
  });
}

export async function getGridStorageItem(): Promise<string | null> {
  const stored = (await requestGridStorage('get')) as string | null;
  if (!isFigmaPluginUI()) return stored;
  if (stored !== null) {
    clearLegacyStorageBestEffort();
    return stored;
  }

  // One-time migration from builds that attempted to persist inside the UI
  // iframe. clientStorage is authoritative; legacy data is removed only after
  // the durable write succeeds.
  let legacyValue: string | null = null;
  try {
    legacyValue = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Opaque-origin plugin iframes can reject localStorage access entirely.
    return null;
  }

  if (legacyValue === null) return null;

  await requestGridStorage('set', legacyValue);
  clearLegacyStorageBestEffort();
  return legacyValue;
}

export async function setGridStorageItem(value: string): Promise<void> {
  await requestGridStorage('set', value);
  if (isFigmaPluginUI()) clearLegacyStorageBestEffort();
}
