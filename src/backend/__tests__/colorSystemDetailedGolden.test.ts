// The detailed and minimal frames are pinned to a snapshot recorded from
// commit cfde980, before the presentation sheet was rebuilt. A change here
// means the non-presentation output changed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateColorSystemFrames } from '../colorSystemGeneration';
import { createInMemoryFigmaPluginApi, type FakeNode } from './helpers/inMemoryFigmaPluginApi';
import { buildPresentationRequest, wadaCombinationColors } from './helpers/presentationFixture';

const INTER = (['Regular', 'Medium', 'Semi Bold', 'Bold'] as const).map(style => ({
  family: 'Inter',
  style,
}));

function describeTree(node: FakeNode): string[] {
  const paint = node.fills[0];
  const fill =
    paint && paint.type === 'SOLID'
      ? ` fill ${[paint.color.r, paint.color.g, paint.color.b].map(value => value.toFixed(4)).join(',')}`
      : '';
  const frame = node as unknown as Partial<FrameNode>;
  const layout = frame.layoutMode ? ` ${frame.layoutMode}/${frame.itemSpacing}` : '';
  const own =
    node.type === 'TEXT'
      ? `TEXT "${node.characters}" ${node.fontName?.style} ${node.fontSize}${fill}`
      : `${node.type} "${node.name}" ${node.width}x${node.height}${layout}${fill}`;
  return [own, ...node.children.flatMap(child => describeTree(child).map(line => `  ${line}`))];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('non-presentation frames stay unchanged', () => {
  it.each([
    ['detailed', 'custom'],
    ['detailed', 'radix-match'],
    ['minimal', 'custom'],
  ] as const)('%s %s output for Wada combination 243', async (detailLevel, scaleMethod) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = createInMemoryFigmaPluginApi({ fonts: INTER });
    (host.figma.viewport as unknown as { center: Vector }).center = { x: 0, y: 0 };
    vi.stubGlobal('figma', host.figma);
    const request = buildPresentationRequest(wadaCombinationColors(243), {
      detailLevel,
      scaleMethod,
    });

    const container = (await generateColorSystemFrames(request.config, request.scales, {
      notify: false,
    })) as unknown as FakeNode;

    expect(describeTree(container).join('\n')).toMatchSnapshot();
  });
});
