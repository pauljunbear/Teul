import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import colorJson from '../../colors.json';
import { getWCAGContrastHex } from '../../lib/accessibility';
import { generateColorSystemFrames } from '../colorSystemGeneration';
import { createInMemoryFigmaPluginApi, type FakeNode } from './helpers/inMemoryFigmaPluginApi';
import { buildPresentationRequest, wadaCombinationColors } from './helpers/presentationFixture';

const INTER = (['Regular', 'Medium', 'Semi Bold', 'Bold'] as const).map(style => ({
  family: 'Inter',
  style,
}));

function installHost(beforeCreate?: (kind: string, ordinal: number) => void) {
  const host = createInMemoryFigmaPluginApi({ fonts: INTER, beforeCreate });
  (host.figma.viewport as unknown as { center: Vector }).center = { x: 0, y: 0 };
  vi.stubGlobal('figma', host.figma);
  return host;
}

function walk(node: FakeNode): FakeNode[] {
  return [node, ...node.children.flatMap(walk)];
}

function texts(node: FakeNode): string[] {
  return walk(node)
    .filter(candidate => candidate.type === 'TEXT')
    .map(candidate => candidate.characters);
}

function child(node: FakeNode, name: string): FakeNode {
  const found = walk(node).find(candidate => candidate.name === name);
  if (!found) throw new Error(`No node named ${name}`);
  return found;
}

function hexOf(node: FakeNode): string | null {
  const paint = node.fills[0];
  if (!paint || paint.type !== 'SOLID') return null;
  const channel = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(paint.color.r)}${channel(paint.color.g)}${channel(paint.color.b)}`;
}

/** A readable record of the generated tree: names, text, fills, sizes and layout. */
function serialize(node: FakeNode): unknown {
  const record: Record<string, unknown> = {
    type: node.type,
    name: node.name,
    size: `${node.width}x${node.height}`,
  };
  const fill = hexOf(node);
  if (fill) record.fill = fill;
  if (node.type === 'TEXT') {
    record.text = node.characters;
    record.font = `${node.fontName?.family} ${node.fontName?.style} ${node.fontSize}`;
  }
  const frame = node as unknown as Partial<FrameNode>;
  if (frame.layoutMode && frame.layoutMode !== 'NONE') {
    record.layout = `${frame.layoutMode} gap ${frame.itemSpacing}`;
  }
  if (node.cornerRadius) record.radius = node.cornerRadius;
  if (node.children.length > 0) record.children = node.children.map(serialize);
  return record;
}

function outline(node: FakeNode, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  const fill = hexOf(node);
  const label =
    node.type === 'TEXT'
      ? `${pad}T "${node.characters}" (${node.fontName?.style} ${node.fontSize})`
      : `${pad}${node.type === 'RECTANGLE' ? 'R' : 'F'} ${node.name} ${node.width}x${node.height}${fill ? ` ${fill}` : ''}`;
  return [label, ...node.children.flatMap(childNode => outline(childNode, depth + 1))];
}

const RAW_SIENNA_COMBINATIONS = (colorJson as { name: string; combinations: number[] }[]).find(
  color => color.name === 'Raw Sienna'
)!.combinations;

async function generate243(
  options: Parameters<typeof buildPresentationRequest>[1] = {},
  outputs = { variables: true, styles: true }
) {
  const host = installHost();
  const request = buildPresentationRequest(wadaCombinationColors(243), options);
  const container = (await generateColorSystemFrames(request.config, request.scales, {
    notify: false,
    outputs,
  })) as unknown as FakeNode;
  return { host, request, container };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('presentation color-system sheet', () => {
  it('builds Wada combination 243 into light and dark sheets with every section', async () => {
    const { container, request } = await generate243();
    expect(wadaCombinationColors(243).map(color => color.name)).toEqual([
      'Raw Sienna',
      'Ivory Buff',
      'Olive Green',
      'Slate Color',
    ]);
    expect(container.children.map(frame => frame.name)).toEqual([
      `${request.scales.systemName} - Light Mode`,
      `${request.scales.systemName} - Dark Mode`,
    ]);

    for (const frame of container.children) {
      expect(frame.children.map(section => section.name)).toEqual([
        'Header',
        'Palette',
        'Starting Split',
        'Step Roles',
        'Full Scales',
        'Combinations',
        'Using The Output',
      ]);
      const text = texts(frame);
      expect(text).toEqual(
        expect.arrayContaining([
          'Raw Sienna Palette, Set 1',
          'Source: Sanzo Wada combination 243 (Raw Sienna, Ivory Buff, Olive Green, Slate Color), from the modern 348-combination Seigensha selection',
          'Digital approximation: 348 of 360 original combinations; names are qualified and sRGB is approximate.',
          'A starting split to adjust',
          'Raw Sienna · Primary · 60%',
          'Ivory Buff · Secondary · 30%',
          'Olive Green · Tertiary · 5%',
          'Slate Color · Accent · 5%',
          'How the 12 steps are used',
          'Full scales',
          'Combinations',
          'Combination 243 · your set',
          'Using the output',
        ])
      );
      expect(text.some(line => line.startsWith('Method: Teul OKLCH v3 scales'))).toBe(true);
      expect(text).toContain(
        '1 → 50   ·   2 → 100   ·   3 → 200   ·   4 → 300   ·   5 → 400   ·   6 → 500   ·   7 → 600   ·   8 → 700   ·   9 → 800   ·   10 → 900   ·   11 → 1000   ·   12 → 1100. Variables and styles both use these suffixes.'
      );
    }

    const light = container.children[0];
    const palette = child(light, 'Primary Raw Sienna');
    expect(texts(palette)).toEqual(['Raw Sienna', 'Primary', '#BB7125']);
    expect(texts(child(light, 'Neutral ' + request.scales.scales.light.neutral.name))).toEqual([
      request.scales.scales.light.neutral.name,
      'Neutral, step 9',
      request.scales.scales.light.neutral.steps[8].hex.toUpperCase(),
    ]);
  });

  it('attaches every contrast figure to a named pair and computes it with Teul contrast', async () => {
    const { container, request } = await generate243();
    const ratioLines = texts(container).filter(line => /\d+\.\d{2}:1/.test(line));
    expect(ratioLines.length).toBeGreaterThan(0);
    const namedPair = [
      /^(High text|Low text) on app bg \((12|11) on 1\): \d+\.\d{2}:1$/,
      /^(White|Black) on solid \(9\): \d+\.\d{2}:1$/,
      /^(Most contrast|Contrast): .+ and .+, \d+\.\d{2}:1$/,
    ];
    for (const line of ratioLines) {
      expect(
        namedPair.some(pattern => pattern.test(line)),
        line
      ).toBe(true);
    }
    expect(texts(container).filter(line => /^(AAA|AA|AA Large|Fail)$/.test(line))).toEqual([]);

    const primary = request.scales.scales.light.primary!;
    const expected = getWCAGContrastHex(primary.steps[11].hex, primary.steps[0].hex).toFixed(2);
    const primaryBlock = child(container.children[0], 'Raw Sienna Scale');
    expect(texts(primaryBlock)).toContain(`High text on app bg (12 on 1): ${expected}:1`);
  });

  it('shows one card per real Wada combination that includes the primary color', async () => {
    const { container } = await generate243();
    const cards = child(container.children[0], 'Combination Cards');
    const cardFrames = walk(cards).filter(node => /^Combination \d+/.test(node.name));
    expect(cardFrames.map(card => Number(/^Combination (\d+)/.exec(card.name)![1]))).toEqual(
      [...RAW_SIENNA_COMBINATIONS].sort((a, b) => a - b)
    );
    expect(walk(cards).some(node => node.name === 'Your set')).toBe(false);

    for (const card of cardFrames) {
      const id = Number(/^Combination (\d+)/.exec(card.name)![1]);
      const members = wadaCombinationColors(id);
      const names = texts(child(card, 'Colors')).map(line => line.split('  ')[0]);
      expect(new Set(names)).toEqual(new Set(members.map(member => member.name)));
      expect(names[0]).toBe('Raw Sienna');
      const segments = child(card, 'Color Bar').children.map(hexOf);
      expect(new Set(segments)).toEqual(new Set(members.map(member => member.hex.toLowerCase())));
    }
  });

  it('names Radix as the source of step uses and the matched family in Exact Radix mode', async () => {
    const { container } = await generate243({ scaleMethod: 'radix-match' });
    const text = texts(container.children[0]);
    expect(text).toContain(
      "Each step's use and group as Radix Colors publishes them for its 12-step scales (Radix Colors 3.0.0). These are naming conventions, not measurements."
    );
    expect(
      text.some(line => /^Primary · Radix \w+ 3\.0\.0, matched to Raw Sienna$/.test(line))
    ).toBe(true);
    expect(texts(child(container.children[0], 'Palette Colors'))).toContain('Raw Sienna');
  });

  it('never shows the retired untested labels anywhere on a full sheet', async () => {
    const { container } = await generate243();
    const text = texts(container).join('\n');
    expect(text).not.toMatch(
      /High Contrast|Harmonious|Core Trio|Full Palette|Accents & CTAs|All colors work together|Quick Reference|Suggested Proportions|usage proportions/i
    );
    expect(texts(container).filter(line => /\bAAA?\b|AA Large/.test(line))).toEqual([]);
    expect(walk(container).map(node => node.name)).not.toContain('Usage Proportions');
  });

  it('groups steps the way Radix publishes them', async () => {
    const { container } = await generate243();
    const groups = child(container.children[0], 'Step Roles').children.slice(1);
    expect(groups.map(group => group.name)).toEqual([
      'Backgrounds',
      'Component backgrounds',
      'Borders',
      'Solid backgrounds',
      'Text',
    ]);
  });

  it('takes the primary from the primary scale, not from a stale multi-select roles list', async () => {
    installHost();
    const colors = wadaCombinationColors(243);
    const request = buildPresentationRequest(colors);
    // Raw Sienna keeps a stale roles list naming it primary, but single-select made Ivory Buff primary.
    request.config.roleAssignments = [
      { ...colors[0], role: 'secondary', roles: ['secondary', 'primary'] },
      { ...colors[1], role: 'primary', roles: ['primary'] },
      { ...colors[2], role: 'tertiary', roles: ['tertiary'] },
      { ...colors[3], role: 'accent', roles: ['accent'] },
    ];
    const rebuilt = buildPresentationRequest([colors[1], colors[0], colors[2], colors[3]]);
    request.scales.scales = rebuilt.scales.scales;
    const container = (await generateColorSystemFrames(request.config, request.scales, {
      notify: false,
    })) as unknown as FakeNode;
    const caption = texts(child(container.children[0], 'Combinations'))[1];
    expect(caption).toMatch(/^Every Sanzo Wada combination that includes Ivory Buff:/);
    expect(texts(child(container.children[0], 'Primary Ivory Buff'))).toContain('Primary');
  });

  it('names a Werner source with its approximation notice and draws one light sheet', async () => {
    installHost();
    const request = buildPresentationRequest([{ name: 'Snow White', hex: '#eee7cd' }], {
      systemName: 'Werner/Snow White',
      includeDarkMode: false,
    });
    const container = (await generateColorSystemFrames(request.config, request.scales, {
      notify: false,
      outputs: { variables: true, styles: true },
    })) as unknown as FakeNode;
    expect(container.children).toHaveLength(1);
    const text = texts(container);
    expect(
      text.some(line =>
        /^Source: Werner's Nomenclature of Colours \(Syme, 1821 second edition\), no\. \d+, Snow White$/.test(
          line
        )
      )
    ).toBe(true);
    expect(text).toContain(
      'Digital approximation: Getty 1821 swatch scan represented as sRGB; not a measured original.'
    );
    expect(
      text.some(line => line.startsWith('Color styles named Werner/Snow White/Role/suffix'))
    ).toBe(true);
    expect(walk(container).some(node => node.name === 'Starting Split')).toBe(false);
  });

  it('states what this run did not write', async () => {
    const { container } = await generate243({}, { variables: false, styles: false });
    const output = texts(child(container.children[0], 'Using The Output'));
    expect(output).toContain('Not written in this run.');
    expect(output.some(line => line.startsWith('Not written in this run. With Variables on'))).toBe(
      true
    );
    expect(output.some(line => line.includes('/Semantic:'))).toBe(false);
  });

  it('removes every presentation node when generation fails partway', async () => {
    const host = installHost((kind, ordinal) => {
      if (kind === 'text' && ordinal === 120) throw new Error('injected failure');
    });
    const request = buildPresentationRequest(wadaCombinationColors(243));
    await expect(
      generateColorSystemFrames(request.config, request.scales, { notify: false })
    ).rejects.toThrow('injected failure');
    const live = [...host.document.nodes.values()].filter(
      node => node.type !== 'PAGE' && node.type !== 'DOCUMENT'
    );
    expect(host.document.createdCount).toBeGreaterThan(120);
    expect(live).toEqual([]);
  });

  it('writes the presentation tree for combination 243 when TEUL_PRESENTATION_DUMP is set', async () => {
    const { container } = await generate243();
    const target = process.env.TEUL_PRESENTATION_DUMP;
    if (target) {
      writeFileSync(`${target}.json`, `${JSON.stringify(serialize(container), null, 2)}\n`);
      writeFileSync(`${target}.txt`, `${outline(container).join('\n')}\n`);
    }
    expect(container.children).toHaveLength(2);
  });
});
