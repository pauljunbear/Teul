export const gradientFidelityFixtures = [
  [
    'restrained',
    [
      [0.1, 0.2, 0.3],
      [0.2, 0.3, 0.4],
    ],
    { space: 'oklab' },
  ],
  [
    'black-white',
    [
      [0, 0, 0],
      [1, 1, 1],
    ],
    { space: 'oklab' },
  ],
  [
    'shorter',
    [
      [0.12, 0.5, 0.6],
      [0.35, 0.45, 0.7],
    ],
    { space: 'oklch', huePath: 'shorter' },
  ],
  [
    'longer',
    [
      [0.8, 0.1, 0.2],
      [0.1, 0.1, 0.8],
    ],
    { space: 'oklch', huePath: 'longer' },
  ],
  [
    'neutral',
    [
      [0.4, 0.4, 0.4],
      [0.3, 0.5, 0.6],
    ],
    { space: 'oklch', huePath: 'longer' },
  ],
  [
    'five',
    [
      [0.1, 0.2, 0.3],
      [0.12, 0.24, 0.36],
      [0.18, 0.3, 0.4],
      [0.2, 0.35, 0.45],
      [0.3, 0.4, 0.5],
    ],
    { space: 'oklab' },
  ],
  [
    'between-sample-failure',
    [
      [0.16032589599490166, 0.6980988865252584, 0.28516142861917615],
      [0.5630403070244938, 0.9031179184094071, 0.5892083912622184],
    ],
    { space: 'oklch', huePath: 'longer' },
  ],
];
