import type { SemanticColorPolicyReport } from '../lib/semanticColorPolicy';
import type { ColorSystemData } from '../types/colorSystem';
import type { ColorSystemLayoutContext, ColorSystemSemanticMode } from './colorSystemLayoutContext';

export async function generateDetailedColorSystemLayout(
  context: ColorSystemLayoutContext,
  scales: ColorSystemData['scales']['light'],
  mode: ColorSystemSemanticMode,
  scaleMethod: ColorSystemData['scaleMethod'],
  semanticPolicy?: SemanticColorPolicyReport
): Promise<FrameNode> {
  const frame = context.createFrame();
  frame.name = `Color System (${mode})`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 24;
  frame.paddingLeft = 32;
  frame.paddingRight = 32;
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.cornerRadius = 16;
  frame.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.1, g: 0.1, b: 0.1 } : { r: 0.98, g: 0.98, b: 0.98 },
    },
  ];

  for (const key of context.getOrderedScaleKeys(scales)) {
    const scale = scales[key];
    if (scale) {
      const row = await context.createScaleRow(
        scale,
        mode,
        true,
        40,
        scaleMethod === 'radix-match'
      );
      frame.appendChild(row);
    }
  }

  const modePolicy = semanticPolicy?.modes[mode];
  if (modePolicy) {
    frame.appendChild(context.createSemanticPolicyReport(semanticPolicy, modePolicy, mode));
  }

  return frame;
}
