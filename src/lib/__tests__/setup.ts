/**
 * Test setup for Vitest
 * Provides mocks for browser APIs used in the plugin
 */

import { vi, beforeEach } from 'vitest';

// Mock localStorage
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    // Expose store for test assertions
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
};

const localStorageMock = createLocalStorageMock();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// Export for direct access in tests
export { localStorageMock };
