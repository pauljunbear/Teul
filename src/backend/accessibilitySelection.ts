import type { NormalizedDocumentColorProfile } from '../types/colorSystem';
import type { AccessibilitySelectionResultMessage } from '../types/messages';

interface ResolvedSolidPaint {
  hex: string;
}

type PaintResolution =
  | { success: true; paint: ResolvedSolidPaint }
  | { success: false; error: string };

function channelToHex(channel: number): string {
  return Math.round(Math.max(0, Math.min(1, channel)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function rgbToHex(color: RGB): string {
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
}

function hasOpaqueNodeRendering(node: SceneNode): boolean {
  if ('opacity' in node && node.opacity < 1) return false;
  if ('blendMode' in node && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
    return false;
  }
  return node.visible !== false;
}

function resolveSolidPaint(node: SceneNode, role: 'foreground' | 'background'): PaintResolution {
  if (!('fills' in node)) {
    return { success: false, error: `The ${role} selection does not have a fill.` };
  }
  if (node.fills === figma.mixed) {
    return {
      success: false,
      error: `The ${role} uses mixed fills, which cannot form one exact pair.`,
    };
  }
  if (!hasOpaqueNodeRendering(node)) {
    return {
      success: false,
      error: `The ${role} is hidden, transparent, or uses a blend mode Teul cannot evaluate exactly.`,
    };
  }

  const visiblePaints = node.fills.filter(paint => paint.visible !== false);
  if (visiblePaints.length !== 1) {
    return {
      success: false,
      error: `The ${role} must have exactly one visible fill; mixed or layered paints are unsupported.`,
    };
  }

  const paint = visiblePaints[0];
  if (paint.type !== 'SOLID') {
    return {
      success: false,
      error: `The ${role} uses a gradient, image, or video fill; select an opaque solid-color pair.`,
    };
  }
  if ((paint.opacity ?? 1) < 1 || (paint.blendMode ?? 'NORMAL') !== 'NORMAL') {
    return {
      success: false,
      error: `The ${role} paint is transparent or blended, so its rendered color is context-dependent.`,
    };
  }

  let color: RGB = paint.color;
  const colorVariable = paint.boundVariables?.color;
  if (colorVariable) {
    const variable = figma.variables.getVariableById(colorVariable.id);
    if (!variable) {
      return { success: false, error: `The ${role} color variable could not be resolved.` };
    }
    const resolved = variable.resolveForConsumer(node);
    if (
      resolved.resolvedType !== 'COLOR' ||
      typeof resolved.value !== 'object' ||
      resolved.value === null ||
      !('r' in resolved.value) ||
      !('g' in resolved.value) ||
      !('b' in resolved.value)
    ) {
      return { success: false, error: `The ${role} color variable did not resolve to a color.` };
    }
    if ('a' in resolved.value && typeof resolved.value.a === 'number' && resolved.value.a < 1) {
      return { success: false, error: `The ${role} color variable resolves to transparency.` };
    }
    color = resolved.value;
  }

  return { success: true, paint: { hex: rgbToHex(color) } };
}

function findBackgroundAncestor(node: SceneNode): SceneNode | null {
  let parent: BaseNode | null = node.parent;
  while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
    if ('fills' in parent) return parent as SceneNode;
    parent = parent.parent;
  }
  return null;
}

export function readAccessibilitySelection(
  selection: readonly SceneNode[],
  profile: NormalizedDocumentColorProfile,
  requestId: string
): AccessibilitySelectionResultMessage {
  const fail = (error: string): AccessibilitySelectionResultMessage => ({
    type: 'accessibility-selection-result',
    requestId,
    success: false,
    profile,
    error,
  });

  if (selection.length === 0) {
    return fail(
      'Select one text layer inside a solid background, or one text layer and one solid shape.'
    );
  }
  if (selection.length > 2) {
    return fail('Select only one text layer and one background shape.');
  }

  const textNodes = selection.filter((node): node is TextNode => node.type === 'TEXT');
  if (textNodes.length !== 1) {
    return fail('Teul needs exactly one text layer to identify foreground and background roles.');
  }

  const foregroundNode = textNodes[0];
  const backgroundNode =
    selection.length === 2
      ? (selection.find(node => node.id !== foregroundNode.id) ?? null)
      : findBackgroundAncestor(foregroundNode);

  if (!backgroundNode) {
    return fail('No solid background was selected or found behind the text layer.');
  }

  const foreground = resolveSolidPaint(foregroundNode, 'foreground');
  if (!foreground.success) return fail(foreground.error);
  const background = resolveSolidPaint(backgroundNode, 'background');
  if (!background.success) return fail(background.error);

  return {
    type: 'accessibility-selection-result',
    requestId,
    success: true,
    profile,
    foreground: foreground.paint.hex,
    background: background.paint.hex,
    foregroundSource: foregroundNode.name,
    backgroundSource: backgroundNode.name,
  };
}

export function sendAccessibilitySelection(
  requestId: string,
  profile: NormalizedDocumentColorProfile
): void {
  figma.ui.postMessage(readAccessibilitySelection(figma.currentPage.selection, profile, requestId));
}
