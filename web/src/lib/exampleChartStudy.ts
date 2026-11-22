/** Synthetic, exposed development study. Never an automatic brand recommendation. */
export const exampleChartStudy = {
  labels: ['Blue', 'Orange', 'Teal', 'Violet', 'Gold', 'Rose'],
  // Synthetic inputs: OKLCH lightness 0.55, chroma 0.11, hues 255/45/185/300/85/0, sRGB gamut mapped.
  original: ['#4273B0', '#A55A37', '#00867A', '#7C61A8', '#8F6B09', '#A4546F'],
  // OKLCH lightness +0.06, same chroma/hue, shared sRGB gamut mapping and hex rounding.
  softer: ['#5385C3', '#B96C49', '#28988C', '#8E73BB', '#A17D27', '#B86681'],
  disclosure:
    'Synthetic example study · invented colors, not any brand’s tokens. Scales use the current Teul engine.',
};
