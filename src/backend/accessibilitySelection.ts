import type { NormalizedDocumentColorProfile } from '../types/colorSystem';
import type { AccessibilitySelectionResultMessage } from '../types/messages';

interface ResolvedSolidPaint {
  hex: string;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type PaintResolution =
  | { success: true; paint: ResolvedSolidPaint }
  | { success: false; error: string };

type PaintPreparation =
  | { success: true; paint: SolidPaint; variableId: string | null }
  | { success: false; error: string };

type VariableLoad =
  | { success: true; variable: Variable | null }
  | { success: false; error: string };

interface SelectionReadAuthority {
  getProfile: () => NormalizedDocumentColorProfile;
  getSelection: () => readonly SceneNode[];
}

const GEOMETRY_EPSILON = 0.01;
const TRANSFORM_EPSILON = 1e-9;

function channelToHex(channel: number): string {
  return Math.round(Math.max(0, Math.min(1, channel)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function rgbToHex(color: RGB): string {
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
}

function sourceLabel(node: SceneNode, fallback: string): string {
  const name = node.name.trim();
  return (name || fallback).slice(0, 512);
}

function profileFailure(profile: NormalizedDocumentColorProfile): string | null {
  if (profile === 'srgb') return null;
  if (profile === 'display-p3') {
    return 'WCAG 2.2 selection analysis requires an sRGB Figma document. Display P3 channels are not treated as sRGB; enter a known sRGB fallback manually.';
  }
  if (profile === 'legacy') {
    return 'WCAG 2.2 selection analysis requires an sRGB Figma document. This legacy document profile is unsupported; enter a known sRGB fallback manually.';
  }
  return 'WCAG 2.2 selection analysis requires a confirmed sRGB Figma document. Teul could not determine this document profile; enter a known sRGB fallback manually.';
}

function readLiveDocumentColorProfile(): NormalizedDocumentColorProfile {
  try {
    const profile = (figma.root as DocumentNode & { readonly documentColorProfile?: unknown })
      .documentColorProfile;
    if (profile === 'SRGB') return 'srgb';
    if (profile === 'DISPLAY_P3') return 'display-p3';
    if (profile === 'LEGACY') return 'legacy';
  } catch {
    // An unavailable profile is unsupported for normative WCAG selection analysis.
  }
  return 'unknown';
}

function hasVisibleEffects(node: SceneNode): boolean {
  if (!('effects' in node)) return false;
  return node.effects.some(effect => effect.visible !== false);
}

function hasVisibleStrokes(node: SceneNode): boolean {
  if (!('strokes' in node)) return false;
  return node.strokes.some(stroke => stroke.visible !== false);
}

function hasMaskInParent(node: SceneNode): boolean {
  const parent = node.parent;
  if (!parent || !('children' in parent)) return false;
  return parent.children.some(child => 'isMask' in child && child.isMask);
}

function renderingContextError(node: SceneNode, role: 'foreground' | 'background'): string | null {
  let current: SceneNode | null = node;

  while (current) {
    if (current.visible === false || ('opacity' in current && current.opacity < 1)) {
      return `The ${role} or one of its ancestors is hidden or transparent, so its rendered color is context-dependent.`;
    }
    if (
      'blendMode' in current &&
      current.blendMode !== 'NORMAL' &&
      current.blendMode !== 'PASS_THROUGH'
    ) {
      return `The ${role} or one of its ancestors uses an unsupported blend mode.`;
    }
    if (hasVisibleEffects(current)) {
      return `The ${role} or one of its ancestors uses an effect Teul cannot evaluate exactly.`;
    }
    if (hasVisibleStrokes(current)) {
      return `The ${role} or one of its ancestors has a visible stroke Teul cannot exclude from the rendered pair.`;
    }
    if (('isMask' in current && current.isMask) || hasMaskInParent(current)) {
      return `The ${role} is inside a mask context Teul cannot evaluate exactly.`;
    }

    const parent = current.parent;
    if (!parent || parent.type === 'PAGE' || parent.type === 'DOCUMENT') break;
    current = parent as SceneNode;
  }

  return null;
}

function prepareSolidPaint(
  node: SceneNode,
  role: 'foreground' | 'background'
): PaintPreparation {
  if (!('fills' in node)) {
    return { success: false, error: `The ${role} selection does not have a fill.` };
  }
  if (node.fills === figma.mixed) {
    return {
      success: false,
      error: `The ${role} uses mixed fills, which cannot form one exact pair.`,
    };
  }

  const contextError = renderingContextError(node, role);
  if (contextError) return { success: false, error: contextError };
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

  return {
    success: true,
    paint,
    variableId: paint.boundVariables?.color?.id ?? null,
  };
}

async function loadBoundVariable(
  variableId: string | null,
  role: 'foreground' | 'background'
): Promise<VariableLoad> {
  if (!variableId) return { success: true, variable: null };
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    return variable
      ? { success: true, variable }
      : { success: false, error: `The ${role} color variable could not be resolved.` };
  } catch {
    return { success: false, error: `The ${role} color variable could not be resolved.` };
  }
}

function resolvePreparedSolidPaint(
  prepared: Extract<PaintPreparation, { success: true }>,
  variable: Variable | null,
  node: SceneNode,
  role: 'foreground' | 'background'
): PaintResolution {
  let color: RGB = prepared.paint.color;
  if (prepared.variableId) {
    if (!variable) {
      return { success: false, error: `The ${role} color variable could not be resolved.` };
    }
    let resolved: ReturnType<Variable['resolveForConsumer']>;
    try {
      resolved = variable.resolveForConsumer(node);
    } catch {
      return { success: false, error: `The ${role} color variable could not be resolved.` };
    }
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

function hasVisibleFill(node: SceneNode): boolean {
  if (!('fills' in node)) return false;
  if (node.fills === figma.mixed) return true;
  return node.fills.some(paint => paint.visible !== false);
}

function findBackgroundAncestor(node: SceneNode): SceneNode | null {
  let parent: BaseNode | null = node.parent;
  while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
    const candidate = parent as SceneNode;
    if (hasVisibleFill(candidate)) return candidate;
    parent = parent.parent;
  }
  return null;
}

function validatedBounds(candidate: Rect | null): Bounds | null {
  if (
    !candidate ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return null;
  }
  return candidate;
}

function getGeometryBounds(node: SceneNode): Bounds | null {
  return validatedBounds(node.absoluteBoundingBox);
}

function getRenderBounds(node: SceneNode): Bounds | null {
  return validatedBounds(
    ('absoluteRenderBounds' in node ? node.absoluteRenderBounds : null) ?? node.absoluteBoundingBox
  );
}

function fullyContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.x <= inner.x + GEOMETRY_EPSILON &&
    outer.y <= inner.y + GEOMETRY_EPSILON &&
    outer.x + outer.width >= inner.x + inner.width - GEOMETRY_EPSILON &&
    outer.y + outer.height >= inner.y + inner.height - GEOMETRY_EPSILON
  );
}

function hasNonAxisAlignedRotation(node: SceneNode): boolean {
  let current: SceneNode | null = node;
  while (current) {
    if ('rotation' in current && Math.abs(current.rotation) > TRANSFORM_EPSILON) return true;
    const parent = current.parent;
    if (!parent || parent.type === 'PAGE' || parent.type === 'DOCUMENT') break;
    current = parent as SceneNode;
  }
  return false;
}

function transformIsNonAxisAligned(transform: Transform): boolean {
  const values = [
    transform[0][0],
    transform[0][1],
    transform[0][2],
    transform[1][0],
    transform[1][1],
    transform[1][2],
  ];
  return (
    !values.every(Number.isFinite) ||
    Math.abs(transform[0][1]) > TRANSFORM_EPSILON ||
    Math.abs(transform[1][0]) > TRANSFORM_EPSILON
  );
}

function hasNonAxisAlignedTransform(node: SceneNode): boolean {
  let current: SceneNode | null = node;
  while (current) {
    if (
      ('relativeTransform' in current &&
        current.relativeTransform &&
        transformIsNonAxisAligned(current.relativeTransform)) ||
      ('absoluteTransform' in current &&
        current.absoluteTransform &&
        transformIsNonAxisAligned(current.absoluteTransform))
    ) {
      return true;
    }
    const parent = current.parent;
    if (!parent || parent.type === 'PAGE' || parent.type === 'DOCUMENT') break;
    current = parent as SceneNode;
  }
  return false;
}

function hasRoundedCorners(node: SceneNode): boolean {
  if ('cornerRadius' in node) {
    const radius = node.cornerRadius;
    if (typeof radius !== 'number' || radius > TRANSFORM_EPSILON) return true;
  }

  const cornerKeys = [
    'topLeftRadius',
    'topRightRadius',
    'bottomLeftRadius',
    'bottomRightRadius',
  ] as const;
  const values = node as unknown as Record<(typeof cornerKeys)[number], unknown>;
  return cornerKeys.some(key => key in node && (
    typeof values[key] !== 'number' || Math.abs(values[key]) > TRANSFORM_EPSILON
  ));
}

function provableBackgroundGeometryError(
  foreground: SceneNode,
  background: SceneNode
): string | null {
  const rectangularBackgroundTypes: ReadonlySet<SceneNode['type']> = new Set([
    'RECTANGLE',
    'FRAME',
    'COMPONENT',
    'INSTANCE',
  ]);
  if (!rectangularBackgroundTypes.has(background.type)) {
    return 'Teul can only prove coverage for a rectangular background; curved, vector, boolean, and other irregular shapes are unsupported.';
  }
  if (hasRoundedCorners(background)) {
    return 'Teul can only prove coverage for a square-cornered background; rounded corners can leave text bounds uncovered.';
  }
  if (
    hasNonAxisAlignedRotation(foreground) ||
    hasNonAxisAlignedRotation(background) ||
    hasNonAxisAlignedTransform(foreground) ||
    hasNonAxisAlignedTransform(background)
  ) {
    return 'Teul can only prove coverage for axis-aligned text and backgrounds; rotated or skewed geometry is unsupported.';
  }
  return null;
}

function intersects(first: Bounds, second: Bounds): boolean {
  return (
    first.x < second.x + second.width - GEOMETRY_EPSILON &&
    first.x + first.width > second.x + GEOMETRY_EPSILON &&
    first.y < second.y + second.height - GEOMETRY_EPSILON &&
    first.y + first.height > second.y + GEOMETRY_EPSILON
  );
}

function nodeOrOverflowingDescendantIntersects(
  node: SceneNode,
  foregroundBounds: Bounds
): boolean {
  if (node.visible === false) return false;
  if (
    (hasVisibleEffects(node) || hasVisibleStrokes(node)) &&
    !('absoluteRenderBounds' in node && node.absoluteRenderBounds)
  ) {
    return true;
  }
  const bounds = getRenderBounds(node);
  if (!bounds || intersects(bounds, foregroundBounds)) return true;

  if (!('children' in node) || node.children.length === 0) return false;
  if ('clipsContent' in node && node.clipsContent === true) return false;

  return node.children.some(child =>
    nodeOrOverflowingDescendantIntersects(child, foregroundBounds)
  );
}

function overlappingSiblingError(
  parent: BaseNode,
  ignoredIds: ReadonlySet<string>,
  foregroundBounds: Bounds,
  minimumIndex = 0
): string | null {
  if (!('children' in parent)) {
    return "Teul cannot prove the selected layers' stacking order.";
  }

  for (let index = minimumIndex; index < parent.children.length; index += 1) {
    const sibling = parent.children[index];
    if (sibling.type === 'PAGE') {
      return "Teul cannot prove the selected layers' stacking order.";
    }
    if (ignoredIds.has(sibling.id) || sibling.visible === false) continue;
    if (nodeOrOverflowingDescendantIntersects(sibling, foregroundBounds)) {
      return `Layer "${sourceLabel(sibling, 'Unnamed layer')}" may alter the selected pair, so Teul cannot prove the rendered background.`;
    }
  }
  return null;
}

function proveAncestorBackground(
  foreground: SceneNode,
  background: SceneNode,
  foregroundBounds: Bounds
): string | null {
  let branch: SceneNode = foreground;

  while (branch.parent && branch.parent.type !== 'PAGE' && branch.parent.type !== 'DOCUMENT') {
    const parent = branch.parent as SceneNode;
    if (parent.id !== background.id && hasVisibleFill(parent)) {
      return `Layer "${sourceLabel(parent, 'Unnamed container')}" has its own fill between the text and selected background.`;
    }
    const siblingError = overlappingSiblingError(parent, new Set([branch.id]), foregroundBounds);
    if (siblingError) return siblingError;
    if (parent.id === background.id) return null;
    branch = parent;
  }

  return 'The selected background is not a provable ancestor of the text layer.';
}

function proveSiblingBackground(
  foreground: SceneNode,
  background: SceneNode,
  foregroundBounds: Bounds
): string | null {
  if (
    foreground.parent !== background.parent ||
    !foreground.parent ||
    !('children' in foreground.parent)
  ) {
    return 'Select a containing background or a background shape that is a direct sibling of the text layer.';
  }

  const children = foreground.parent.children;
  const foregroundIndex = children.findIndex(child => child.id === foreground.id);
  const backgroundIndex = children.findIndex(child => child.id === background.id);
  if (backgroundIndex < 0 || foregroundIndex < 0 || backgroundIndex >= foregroundIndex) {
    return 'The selected background must be behind the text layer in Figma stacking order.';
  }

  if ('children' in background && background.children.length > 0) {
    const descendantError = overlappingSiblingError(
      background,
      new Set<string>(),
      foregroundBounds
    );
    if (descendantError) return descendantError;
  }

  return overlappingSiblingError(
    foreground.parent,
    new Set([foreground.id, background.id]),
    foregroundBounds,
    backgroundIndex + 1
  );
}

function provePairGeometry(foreground: SceneNode, background: SceneNode): string | null {
  const geometryShapeError = provableBackgroundGeometryError(foreground, background);
  if (geometryShapeError) return geometryShapeError;

  const foregroundBounds = getGeometryBounds(foreground);
  const backgroundBounds = getGeometryBounds(background);
  if (!foregroundBounds || !backgroundBounds) {
    return 'Teul could not read finite bounds for both selected layers.';
  }
  if (!fullyContains(backgroundBounds, foregroundBounds)) {
    return 'The background must fully cover the text bounds; a partial or non-overlapping pair is unsupported.';
  }

  let ancestor: BaseNode | null = foreground.parent;
  while (ancestor && ancestor.type !== 'PAGE' && ancestor.type !== 'DOCUMENT') {
    if (ancestor.id === background.id) {
      return proveAncestorBackground(foreground, background, foregroundBounds);
    }
    ancestor = ancestor.parent;
  }

  return proveSiblingBackground(foreground, background, foregroundBounds);
}

export async function readAccessibilitySelection(
  selection: readonly SceneNode[],
  profile: NormalizedDocumentColorProfile,
  requestId: string,
  authority?: SelectionReadAuthority
): Promise<AccessibilitySelectionResultMessage> {
  const fail = (error: string): AccessibilitySelectionResultMessage => ({
    type: 'accessibility-selection-result',
    requestId,
    success: false,
    profile,
    error,
  });

  const unsupportedProfile = profileFailure(profile);
  if (unsupportedProfile) return fail(unsupportedProfile);

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

  const geometryError = provePairGeometry(foregroundNode, backgroundNode);
  if (geometryError) return fail(geometryError);

  const initialForegroundPaint = prepareSolidPaint(foregroundNode, 'foreground');
  if (!initialForegroundPaint.success) return fail(initialForegroundPaint.error);
  const initialBackgroundPaint = prepareSolidPaint(backgroundNode, 'background');
  if (!initialBackgroundPaint.success) return fail(initialBackgroundPaint.error);

  const [foregroundVariable, backgroundVariable] = await Promise.all([
    loadBoundVariable(initialForegroundPaint.variableId, 'foreground'),
    loadBoundVariable(initialBackgroundPaint.variableId, 'background'),
  ]);
  if (!foregroundVariable.success) return fail(foregroundVariable.error);
  if (!backgroundVariable.success) return fail(backgroundVariable.error);

  let finalForegroundNode = foregroundNode;
  let finalBackgroundNode = backgroundNode;
  if (authority) {
    const finalProfile = authority.getProfile();
    const finalProfileError = profileFailure(finalProfile);
    if (finalProfileError) {
      return {
        type: 'accessibility-selection-result',
        requestId,
        success: false,
        profile: finalProfile,
        error: finalProfileError,
      };
    }

    const finalSelection = authority.getSelection();
    const finalTextNodes = finalSelection.filter((node): node is TextNode => node.type === 'TEXT');
    if (finalTextNodes.length !== 1 || finalTextNodes[0].id !== foregroundNode.id) {
      return fail('The selection changed while Teul was reading it; try again.');
    }
    finalForegroundNode = finalTextNodes[0];
    const selectedBackground =
      finalSelection.length === 2
        ? (finalSelection.find(node => node.id !== finalForegroundNode.id) ?? null)
        : findBackgroundAncestor(finalForegroundNode);
    if (!selectedBackground || selectedBackground.id !== backgroundNode.id) {
      return fail('The selected background changed while Teul was reading it; try again.');
    }
    finalBackgroundNode = selectedBackground;
  }

  const finalGeometryError = provePairGeometry(finalForegroundNode, finalBackgroundNode);
  if (finalGeometryError) return fail(finalGeometryError);
  const finalForegroundPaint = prepareSolidPaint(finalForegroundNode, 'foreground');
  if (!finalForegroundPaint.success) return fail(finalForegroundPaint.error);
  const finalBackgroundPaint = prepareSolidPaint(finalBackgroundNode, 'background');
  if (!finalBackgroundPaint.success) return fail(finalBackgroundPaint.error);
  if (
    finalForegroundPaint.variableId !== initialForegroundPaint.variableId ||
    finalBackgroundPaint.variableId !== initialBackgroundPaint.variableId
  ) {
    return fail('A bound color variable changed while Teul was reading the selection; try again.');
  }

  const foreground = resolvePreparedSolidPaint(
    finalForegroundPaint,
    foregroundVariable.variable,
    finalForegroundNode,
    'foreground'
  );
  if (!foreground.success) return fail(foreground.error);
  const background = resolvePreparedSolidPaint(
    finalBackgroundPaint,
    backgroundVariable.variable,
    finalBackgroundNode,
    'background'
  );
  if (!background.success) return fail(background.error);

  return {
    type: 'accessibility-selection-result',
    requestId,
    success: true,
    profile: 'srgb',
    foreground: foreground.paint.hex,
    background: background.paint.hex,
    foregroundSource: sourceLabel(finalForegroundNode, 'Selected text'),
    backgroundSource: sourceLabel(finalBackgroundNode, 'Selected background'),
  };
}

export async function sendAccessibilitySelection(requestId: string): Promise<void> {
  const profile = readLiveDocumentColorProfile();
  try {
    figma.ui.postMessage(
      await readAccessibilitySelection(figma.currentPage.selection, profile, requestId, {
        getProfile: readLiveDocumentColorProfile,
        getSelection: () => figma.currentPage.selection,
      })
    );
  } catch {
    const failureProfile = readLiveDocumentColorProfile();
    figma.ui.postMessage({
      type: 'accessibility-selection-result',
      requestId,
      success: false,
      profile: failureProfile,
      error: 'Teul could not read this selection safely. No accessibility result was produced.',
    });
  }
}
