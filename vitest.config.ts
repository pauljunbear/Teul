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
      include: [
        'src/lib/**/*.ts',
        'src/backend/{colorSystemGeneration,gridOperations,index}.ts',
        'src/components/{ColorSystemModal,GridLibrary,GridPresetCard,GridSystemTab,HelpPanel,MyGrids,SaveGridModal,SourceProvenanceDisclosure}.tsx',
        'src/ui.tsx',
      ],
      exclude: ['src/lib/__tests__/**', 'src/backend/__tests__/**', 'src/components/__tests__/**'],
      thresholds: {
        branches: 65,
        functions: 70,
        lines: 67,
        statements: 67,
      },
    },
  },
});
