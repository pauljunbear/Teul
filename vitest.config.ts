import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
    setupFiles: ['./src/lib/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportOnFailure: true,
      // Measure the shipped plugin, not a hand-picked subset. Test files and
      // declarations are excluded, but every production TS/TSX module counts.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**', 'src/**/*.{test,spec}.{ts,tsx}'],
      thresholds: {
        branches: 65,
        functions: 70,
        lines: 67,
        statements: 67,
      },
    },
  },
});
