import type { SemanticColorPolicyReport } from '../lib/semanticColorPolicy';
import type { ColorSystemData } from '../types/colorSystem';
import {
  RADIX_STEP_LABELS,
  type ColorSystemLayoutContext,
  type ColorSystemSemanticMode,
} from './colorSystemLayoutContext';

export async function generatePresentationColorSystemLayout(
  context: ColorSystemLayoutContext,
  systemName: string,
  scales: ColorSystemData['scales']['light'],
  mode: ColorSystemSemanticMode,
  scaleMethod: ColorSystemData['scaleMethod'],
  semanticPolicy?: SemanticColorPolicyReport
): Promise<FrameNode> {
  const {
    createFrame,
    createText,
    createColorSwatch,
    createScaleRow,
    createBWSwatches,
    createSemanticPolicyReport,
    getOrderedScaleKeys,
    getAccessibilityRating,
    getWCAGContrastHex,
  } = context;
  const frame = createFrame();
  frame.name = `${systemName} - ${mode === 'dark' ? 'Dark' : 'Light'} Mode`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 32;
  frame.paddingLeft = 40;
  frame.paddingRight = 40;
  frame.paddingTop = 40;
  frame.paddingBottom = 40;
  frame.cornerRadius = 20;
  frame.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.08, g: 0.08, b: 0.08 } : { r: 1, g: 1, b: 1 },
    },
  ];

  const textColor = mode === 'dark' ? { r: 0.95, g: 0.95, b: 0.95 } : { r: 0.1, g: 0.1, b: 0.1 };
  const mutedColor = mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 };

  const header = createFrame();
  header.name = 'Header';
  header.layoutMode = 'VERTICAL';
  header.primaryAxisSizingMode = 'AUTO';
  header.counterAxisSizingMode = 'AUTO';
  header.itemSpacing = 8;
  header.fills = [];
  header.appendChild(createText(systemName, 28, 'Bold', textColor));
  header.appendChild(
    createText(`${mode === 'dark' ? 'Dark' : 'Light'} Mode Color System`, 14, 'Regular', mutedColor)
  );
  frame.appendChild(header);

  const primarySection = createFrame();
  primarySection.name = 'Primary Palette';
  primarySection.layoutMode = 'VERTICAL';
  primarySection.primaryAxisSizingMode = 'AUTO';
  primarySection.counterAxisSizingMode = 'AUTO';
  primarySection.itemSpacing = 16;
  primarySection.fills = [];

  const primaryTitle = createText('PRIMARY PALETTE', 11, 'Bold', mutedColor);
  primaryTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
  primarySection.appendChild(primaryTitle);

  const primaryRow = createFrame();
  primaryRow.name = 'Primary Colors';
  primaryRow.layoutMode = 'HORIZONTAL';
  primaryRow.primaryAxisSizingMode = 'AUTO';
  primaryRow.counterAxisSizingMode = 'AUTO';
  primaryRow.itemSpacing = 16;
  primaryRow.fills = [];
  primaryRow.appendChild(createBWSwatches(80));

  for (const key of getOrderedScaleKeys(scales)) {
    const scale = scales[key];
    if (scale && scale.steps[8]) {
      const colorFrame = createFrame();
      colorFrame.name = scale.role;
      colorFrame.layoutMode = 'VERTICAL';
      colorFrame.primaryAxisSizingMode = 'AUTO';
      colorFrame.counterAxisSizingMode = 'AUTO';
      colorFrame.itemSpacing = 4;
      colorFrame.fills = [];
      colorFrame.appendChild(createColorSwatch(scale.steps[8].hex, 80, 80, 4));
      colorFrame.appendChild(createText(scale.role, 10, 'Medium', mutedColor));
      colorFrame.appendChild(
        createText(scale.steps[8].hex.toUpperCase(), 9, 'Regular', mutedColor)
      );
      primaryRow.appendChild(colorFrame);
    }
  }

  primarySection.appendChild(primaryRow);
  frame.appendChild(primarySection);

  // Radix's published step-use guidance only applies to exact bundled Radix scales.
  if (scaleMethod === 'radix-match') {
    const semanticSection = createFrame();
    semanticSection.name = 'Semantic Categories';
    semanticSection.layoutMode = 'VERTICAL';
    semanticSection.primaryAxisSizingMode = 'AUTO';
    semanticSection.counterAxisSizingMode = 'AUTO';
    semanticSection.itemSpacing = 24;
    semanticSection.fills = [];

    const semanticTitle = createText('RADIX STEP USAGE GUIDE', 11, 'Bold', mutedColor);
    semanticTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
    semanticSection.appendChild(semanticTitle);
    semanticSection.appendChild(
      createText(
        'Source guidance for pinned Radix Colors v3.0.0; not a Teul WCAG guarantee.',
        9,
        'Regular',
        mutedColor
      )
    );

    const semanticGroups = [
      {
        name: 'BACKGROUNDS',
        steps: [1, 2, 3, 4, 5],
        description: 'App backgrounds, UI elements, hover & active states',
      },
      {
        name: 'BORDERS',
        steps: [6, 7, 8],
        description: 'Subtle borders, default borders, focus rings',
      },
      { name: 'INTERACTIVE', steps: [9, 10], description: 'Buttons, badges, solid backgrounds' },
      { name: 'TEXT', steps: [11, 12], description: 'Secondary and primary text colors' },
    ];

    for (const group of semanticGroups) {
      const groupFrame = createFrame();
      groupFrame.name = group.name;
      groupFrame.layoutMode = 'VERTICAL';
      groupFrame.primaryAxisSizingMode = 'AUTO';
      groupFrame.counterAxisSizingMode = 'AUTO';
      groupFrame.itemSpacing = 8;
      groupFrame.fills = [];

      const groupTitleRow = createFrame();
      groupTitleRow.layoutMode = 'HORIZONTAL';
      groupTitleRow.primaryAxisSizingMode = 'AUTO';
      groupTitleRow.counterAxisSizingMode = 'AUTO';
      groupTitleRow.itemSpacing = 12;
      groupTitleRow.fills = [];

      const groupTitle = createText(group.name, 10, 'Bold', textColor);
      groupTitle.letterSpacing = { value: 1, unit: 'PIXELS' };
      groupTitleRow.appendChild(groupTitle);
      groupTitleRow.appendChild(createText(group.description, 9, 'Regular', mutedColor));
      groupFrame.appendChild(groupTitleRow);

      const roleSwatches = createFrame();
      roleSwatches.layoutMode = 'HORIZONTAL';
      roleSwatches.primaryAxisSizingMode = 'AUTO';
      roleSwatches.counterAxisSizingMode = 'AUTO';
      roleSwatches.itemSpacing = 16;
      roleSwatches.fills = [];

      for (const roleKey of getOrderedScaleKeys(scales)) {
        const scale = scales[roleKey];
        if (!scale) continue;

        const roleColumn = createFrame();
        roleColumn.layoutMode = 'VERTICAL';
        roleColumn.primaryAxisSizingMode = 'AUTO';
        roleColumn.counterAxisSizingMode = 'AUTO';
        roleColumn.itemSpacing = 4;
        roleColumn.fills = [];
        roleColumn.appendChild(createText(scale.role.toUpperCase(), 7, 'Medium', mutedColor));

        const swatchRow = createFrame();
        swatchRow.layoutMode = 'HORIZONTAL';
        swatchRow.primaryAxisSizingMode = 'AUTO';
        swatchRow.counterAxisSizingMode = 'AUTO';
        swatchRow.itemSpacing = 2;
        swatchRow.fills = [];

        for (const stepNum of group.steps) {
          const step = scale.steps[stepNum - 1];
          if (!step) continue;

          const swatchContainer = createFrame();
          swatchContainer.layoutMode = 'VERTICAL';
          swatchContainer.primaryAxisSizingMode = 'AUTO';
          swatchContainer.counterAxisSizingMode = 'AUTO';
          swatchContainer.itemSpacing = 2;
          swatchContainer.fills = [];
          swatchContainer.appendChild(createColorSwatch(step.hex, 32, 32, 4));

          const semantic = RADIX_STEP_LABELS[stepNum];
          swatchContainer.appendChild(createText(semantic.short, 5, 'Regular', mutedColor));

          if (stepNum === 11 || stepNum === 12) {
            const contrast = getWCAGContrastHex(step.hex, scale.steps[0].hex);
            const { rating, color } = getAccessibilityRating(contrast);
            swatchContainer.appendChild(createText(rating, 5, 'Medium', color));
          }

          swatchRow.appendChild(swatchContainer);
        }

        roleColumn.appendChild(swatchRow);
        roleSwatches.appendChild(roleColumn);
      }

      groupFrame.appendChild(roleSwatches);
      semanticSection.appendChild(groupFrame);
    }

    frame.appendChild(semanticSection);
  }

  const extendedSection = createFrame();
  extendedSection.name = 'Extended Palette';
  extendedSection.layoutMode = 'VERTICAL';
  extendedSection.primaryAxisSizingMode = 'AUTO';
  extendedSection.counterAxisSizingMode = 'AUTO';
  extendedSection.itemSpacing = 16;
  extendedSection.fills = [];

  const extendedTitle = createText('FULL COLOR SCALES', 11, 'Bold', mutedColor);
  extendedTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
  extendedSection.appendChild(extendedTitle);

  for (const key of getOrderedScaleKeys(scales)) {
    const scale = scales[key];
    if (scale) {
      extendedSection.appendChild(
        await createScaleRow(scale, mode, true, 48, scaleMethod === 'radix-match')
      );
    }
  }

  frame.appendChild(extendedSection);

  const modePolicy = semanticPolicy?.modes[mode];
  if (modePolicy) {
    frame.appendChild(createSemanticPolicyReport(semanticPolicy, modePolicy, mode));
  }

  return frame;
}
