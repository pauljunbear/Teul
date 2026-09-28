import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/__tests__/colorSystemGradient{IntervalsV1,KernelV1,DualIntervalsV1,ReferenceRouteV2,FidelityV2}.test.ts',
    ],
    testTimeout: 20000,
  },
});
