import { calculateContrastRatio } from './utils';

export type SemanticColorMode = 'light' | 'dark';
export type SemanticColorCategory = 'text' | 'enhanced-text' | 'non-text';

type SemanticColorTokenName =
  | 'background.canvas'
  | 'background.surface'
  | 'background.control'
  | 'text.primary'
  | 'text.secondary'
  | 'control.border'
  | 'action.background'
  | 'action.backgroundHover'
  | 'action.text'
  | 'focus.ring';

export interface SemanticColorToken {
  name: SemanticColorTokenName;
  value: string;
  source: {
    scale: string;
    step: number;
  };
}

interface SemanticColorPairingResult {
  foregroundToken: SemanticColorTokenName;
  backgroundToken: SemanticColorTokenName;
  useCase: string;
  category: SemanticColorCategory;
  minimumRatio: number;
  ratio: number;
  pass: boolean;
}

export interface SemanticColorModeReport {
  mode: SemanticColorMode;
  tokens: Record<string, SemanticColorToken>;
  pairings: SemanticColorPairingResult[];
  valid: boolean;
}

export interface SemanticColorPolicyReport {
  standard: 'WCAG 2.2';
  level: 'AA + enhanced primary text';
  modes: {
    light: SemanticColorModeReport;
    dark?: SemanticColorModeReport;
  };
  valid: boolean;
}

interface SemanticColorScale {
  steps: readonly { step: number; hex: string }[];
}

export interface SemanticColorScales {
  neutral: SemanticColorScale;
  [key: string]: SemanticColorScale | undefined;
}

export const WCAG_CONTRAST_THRESHOLDS: Record<SemanticColorCategory, number> = {
  text: 4.5,
  'enhanced-text': 7,
  'non-text': 3,
};

interface PairingDefinition {
  foregroundToken: SemanticColorTokenName;
  backgroundToken: SemanticColorTokenName;
  useCase: string;
  category: SemanticColorCategory;
}

const ACTION_SCALE_PRIORITY = ['primary', 'accent', 'secondary', 'tertiary', 'neutral'] as const;
const ACTION_BACKGROUND_STEP_PRIORITY = [9, 10, 8, 11, 7, 12, 6, 5, 4, 3, 2, 1] as const;
const ACTION_HOVER_STEP_PRIORITY = [10, 9, 11, 8, 12, 7, 6, 5, 4, 3, 2, 1] as const;
const NEUTRAL_EXTREME_STEP_PRIORITY = [1, 12, 2, 11, 3, 10, 4, 9, 5, 8, 6, 7] as const;

export const SEMANTIC_PAIRING_DEFINITIONS: readonly PairingDefinition[] = [
  {
    foregroundToken: 'text.primary',
    backgroundToken: 'background.canvas',
    useCase: 'Enhanced primary text on the canvas background',
    category: 'enhanced-text',
  },
  {
    foregroundToken: 'text.primary',
    backgroundToken: 'background.surface',
    useCase: 'Primary text on a surface background',
    category: 'text',
  },
  {
    foregroundToken: 'text.secondary',
    backgroundToken: 'background.canvas',
    useCase: 'Secondary text on the canvas background',
    category: 'text',
  },
  {
    foregroundToken: 'text.primary',
    backgroundToken: 'background.control',
    useCase: 'Control text on a control background',
    category: 'text',
  },
  {
    foregroundToken: 'action.text',
    backgroundToken: 'action.background',
    useCase: 'Text on an action background',
    category: 'text',
  },
  {
    foregroundToken: 'action.text',
    backgroundToken: 'action.backgroundHover',
    useCase: 'Text on a hovered action background',
    category: 'text',
  },
  {
    foregroundToken: 'control.border',
    backgroundToken: 'background.canvas',
    useCase: 'Control border against the canvas background',
    category: 'non-text',
  },
  {
    foregroundToken: 'control.border',
    backgroundToken: 'background.control',
    useCase: 'Control border against a control background',
    category: 'non-text',
  },
  {
    foregroundToken: 'action.background',
    backgroundToken: 'background.canvas',
    useCase: 'Action control against the canvas background',
    category: 'non-text',
  },
  {
    foregroundToken: 'action.backgroundHover',
    backgroundToken: 'background.canvas',
    useCase: 'Hovered action control against the canvas background',
    category: 'non-text',
  },
  {
    foregroundToken: 'focus.ring',
    backgroundToken: 'background.canvas',
    useCase: 'Focus ring against the canvas background',
    category: 'non-text',
  },
  {
    foregroundToken: 'focus.ring',
    backgroundToken: 'background.surface',
    useCase: 'Focus ring against a surface background',
    category: 'non-text',
  },
  {
    foregroundToken: 'focus.ring',
    backgroundToken: 'background.control',
    useCase: 'Focus ring against a control background',
    category: 'non-text',
  },
] as const;

export class SemanticColorPolicyError extends Error {
  readonly report?: SemanticColorPolicyReport;

  constructor(message: string, report?: SemanticColorPolicyReport) {
    super(message);
    this.name = 'SemanticColorPolicyError';
    this.report = report;
  }
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function tokenFromStep(
  scales: SemanticColorScales,
  name: SemanticColorTokenName,
  scaleName: string,
  step: number
): SemanticColorToken | undefined {
  const value = scales[scaleName]?.steps.find(candidate => candidate.step === step)?.hex;
  if (!value || !isHexColor(value)) return undefined;

  return {
    name,
    value: value.toLowerCase(),
    source: { scale: scaleName, step },
  };
}

function requireToken(
  scales: SemanticColorScales,
  name: SemanticColorTokenName,
  scaleName: string,
  step: number
): SemanticColorToken {
  const token = tokenFromStep(scales, name, scaleName, step);
  if (!token) {
    throw new SemanticColorPolicyError(`${name} requires a valid ${scaleName} step ${step}.`);
  }
  return token;
}

function actionScaleNames(scales: SemanticColorScales): string[] {
  return ACTION_SCALE_PRIORITY.filter(scaleName => scales[scaleName] !== undefined);
}

function candidatesForScale(
  scales: SemanticColorScales,
  name: SemanticColorTokenName,
  scaleName: string,
  steps: readonly number[]
): SemanticColorToken[] {
  return steps
    .map(step => tokenFromStep(scales, name, scaleName, step))
    .filter((token): token is SemanticColorToken => token !== undefined);
}

function contrastPasses(
  foreground: SemanticColorToken,
  background: SemanticColorToken,
  category: SemanticColorCategory
): boolean {
  return (
    calculateContrastRatio(foreground.value, background.value) >= WCAG_CONTRAST_THRESHOLDS[category]
  );
}

function selectActionTokens(
  scales: SemanticColorScales,
  canvas: SemanticColorToken
): Pick<
  Record<SemanticColorTokenName, SemanticColorToken>,
  'action.background' | 'action.backgroundHover' | 'action.text'
> {
  const textCandidates = candidatesForScale(
    scales,
    'action.text',
    'neutral',
    NEUTRAL_EXTREME_STEP_PRIORITY
  );
  const scaleNames = actionScaleNames(scales);

  for (const scaleName of scaleNames) {
    const backgroundCandidates = candidatesForScale(
      scales,
      'action.background',
      scaleName,
      ACTION_BACKGROUND_STEP_PRIORITY
    );
    const hoverCandidates = candidatesForScale(
      scales,
      'action.backgroundHover',
      scaleName,
      ACTION_HOVER_STEP_PRIORITY
    );

    for (const background of backgroundCandidates) {
      if (!contrastPasses(background, canvas, 'non-text')) continue;

      for (const hover of hoverCandidates) {
        if (hover.value === background.value) continue;
        if (!contrastPasses(hover, canvas, 'non-text')) continue;
        for (const text of textCandidates) {
          if (contrastPasses(text, background, 'text') && contrastPasses(text, hover, 'text')) {
            return {
              'action.background': background,
              'action.backgroundHover': hover,
              'action.text': text,
            };
          }
        }
      }
    }
  }

  const fallbackScale = scaleNames[0];
  if (!fallbackScale || textCandidates.length === 0) {
    throw new SemanticColorPolicyError(
      'Semantic action tokens require valid action and neutral colors.'
    );
  }

  const background = requireToken(scales, 'action.background', fallbackScale, 9);
  const hover = requireToken(scales, 'action.backgroundHover', fallbackScale, 10);
  if (background.value === hover.value) {
    throw new SemanticColorPolicyError(
      'action.backgroundHover must be visibly distinct from action.background.'
    );
  }

  return {
    'action.background': background,
    'action.backgroundHover': hover,
    'action.text': textCandidates[0],
  };
}

function selectActionCandidate(
  scales: SemanticColorScales,
  name: 'control.border' | 'focus.ring',
  backgrounds: SemanticColorToken[]
): SemanticColorToken {
  const scaleNames = actionScaleNames(scales);

  for (const scaleName of scaleNames) {
    const candidates = candidatesForScale(scales, name, scaleName, ACTION_BACKGROUND_STEP_PRIORITY);
    const match = candidates.find(candidate =>
      backgrounds.every(background => contrastPasses(candidate, background, 'non-text'))
    );
    if (match) return match;
  }

  const fallbackScale = scaleNames[0];
  if (!fallbackScale) {
    throw new SemanticColorPolicyError(`${name} requires a valid action or neutral scale.`);
  }
  return requireToken(scales, name, fallbackScale, 9);
}

function evaluatePairings(
  tokens: Record<string, SemanticColorToken>
): SemanticColorPairingResult[] {
  return SEMANTIC_PAIRING_DEFINITIONS.map(definition => {
    const foreground = tokens[definition.foregroundToken];
    const background = tokens[definition.backgroundToken];
    if (!foreground || !background) {
      throw new SemanticColorPolicyError(
        `Cannot evaluate ${definition.useCase} because a semantic token is missing.`
      );
    }

    const minimumRatio = WCAG_CONTRAST_THRESHOLDS[definition.category];
    const ratio = calculateContrastRatio(foreground.value, background.value);
    return {
      ...definition,
      minimumRatio,
      ratio,
      pass: ratio >= minimumRatio,
    };
  });
}

export function evaluateSemanticColorPolicy(
  scales: SemanticColorScales,
  mode: SemanticColorMode
): SemanticColorModeReport {
  const canvas = requireToken(scales, 'background.canvas', 'neutral', 1);
  const surface = requireToken(scales, 'background.surface', 'neutral', 2);
  const control = requireToken(scales, 'background.control', 'neutral', 3);
  const actionTokens = selectActionTokens(scales, canvas);
  const tokens: Record<string, SemanticColorToken> = {
    'background.canvas': canvas,
    'background.surface': surface,
    'background.control': control,
    'text.primary': requireToken(scales, 'text.primary', 'neutral', 12),
    'text.secondary': requireToken(scales, 'text.secondary', 'neutral', 11),
    ...actionTokens,
    'control.border': selectActionCandidate(scales, 'control.border', [canvas, control]),
    'focus.ring': selectActionCandidate(scales, 'focus.ring', [canvas, surface, control]),
  };
  const pairings = evaluatePairings(tokens);

  return {
    mode,
    tokens,
    pairings,
    valid: pairings.every(pairing => pairing.pass),
  };
}

export function buildSemanticColorPolicy(
  lightScales: SemanticColorScales,
  darkScales?: SemanticColorScales
): SemanticColorPolicyReport {
  const modes = {
    light: evaluateSemanticColorPolicy(lightScales, 'light'),
    ...(darkScales ? { dark: evaluateSemanticColorPolicy(darkScales, 'dark') } : {}),
  };

  return {
    standard: 'WCAG 2.2',
    level: 'AA + enhanced primary text',
    modes,
    valid: modes.light.valid && (!modes.dark || modes.dark.valid),
  };
}

export function isSemanticColorPolicyCurrent(
  lightScales: SemanticColorScales,
  darkScales: SemanticColorScales | undefined,
  report: unknown
): report is SemanticColorPolicyReport {
  try {
    const expected = buildSemanticColorPolicy(lightScales, darkScales);
    return expected.valid && JSON.stringify(report) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

export function assertSemanticColorPolicy(
  lightScales: SemanticColorScales,
  darkScales?: SemanticColorScales
): SemanticColorPolicyReport {
  const report = buildSemanticColorPolicy(lightScales, darkScales);
  if (!report.valid) {
    throw new SemanticColorPolicyError(
      'One or more declared semantic color pairings fail the WCAG 2.2 policy.',
      report
    );
  }
  return report;
}
