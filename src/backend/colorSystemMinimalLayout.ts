import type { SemanticColorPolicyReport } from '../lib/semanticColorPolicy';
import type { ColorSystemData } from '../types/colorSystem';
import type { ColorSystemLayoutContext, ColorSystemSemanticMode } from './colorSystemLayoutContext';

export async function generateMinimalColorSystemLayout(
  context: ColorSystemLayoutContext,
  scales: ColorSystemData['scales']['light'],
  mode: ColorSystemSemanticMode,
  scaleMethod: ColorSystemData['scaleMethod'],
  semanticPolicy?: SemanticColorPolicyReport
): Promise<FrameNode> {
  const frame = context.createFrame();
  frame.name = `Color Scales (${mode})`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 16;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.cornerRadius = 12;
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
        36,
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
