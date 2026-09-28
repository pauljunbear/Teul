/** Runtime sources shared by the legacy-paint and construction-margin harnesses. */
export const gradientExperimentSources = Object.freeze([
  'scripts/experiments/gradient-fidelity/source-files.mjs',
  ...[
    'colorSystemGradientV1',
    'colorSystemGradientConstructionV1',
    'colorSystemGradientDesignV2',
    'colorSystemGradientPaintV1',
    'colorSystemGradientFidelityV2',
    'colorSystemGradientIntervalsV1',
    'colorSystemGradientDualIntervalsV1',
    'colorSystemGradientReferenceRouteV2',
    'colorSystemSrgbValueV1',
    'colorSystemInertJsonV1',
    'colorSystemHashing',
    'colorScale',
    'utils',
    'utf8',
  ].map(name => `src/lib/${name}.ts`),
]);
