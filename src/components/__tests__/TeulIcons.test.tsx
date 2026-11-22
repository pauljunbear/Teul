import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ArrowLeft as LucideArrowLeft,
  ArrowLeftRight as LucideArrowLeftRight,
  Contrast as LucideContrast,
  Ellipsis as LucideEllipsis,
  Copy as LucideCopy,
  Download as LucideDownloadSimple,
  Grid2X2 as LucideGridFour,
  PaintBucket as LucidePaintBucket,
  Palette as LucidePalette,
  Pencil as LucidePencilSimple,
  RefreshCw as LucideArrowsClockwise,
  ScanSearch as LucideScanSearch,
  SwatchBook as LucideSwatches,
  WandSparkles as LucideMagicWand,
  X as LucideX,
} from 'lucide-react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowsClockwise,
  Contrast,
  Ellipsis,
  Copy,
  DownloadSimple,
  GridFour,
  MagicWand,
  PaintBucket,
  Palette,
  PencilSimple,
  ScanSearch,
  Swatches,
  X,
} from '../TeulIcons';

const ICON_PAIRS: readonly [React.ElementType, React.ElementType][] = [
  [Palette, LucidePalette],
  [GridFour, LucideGridFour],
  [ScanSearch, LucideScanSearch],
  [Copy, LucideCopy],
  [DownloadSimple, LucideDownloadSimple],
  [PaintBucket, LucidePaintBucket],
  [PencilSimple, LucidePencilSimple],
  [ArrowsClockwise, LucideArrowsClockwise],
  [Swatches, LucideSwatches],
  [MagicWand, LucideMagicWand],
  [X, LucideX],
  [Contrast, LucideContrast],
  [Ellipsis, LucideEllipsis],
  [ArrowLeft, LucideArrowLeft],
  [ArrowLeftRight, LucideArrowLeftRight],
];

describe('TeulIcons', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('preserves Lucide sizing, current-color stroke, and decorative semantics', () => {
    act(() => root.render(<Ellipsis size={18} strokeWidth={2.3} />));
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('18');
    expect(icon?.getAttribute('height')).toBe('18');
    expect(icon?.getAttribute('stroke')).toBe('currentColor');
    expect(icon?.getAttribute('stroke-width')).toBe('2.3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.classList.contains('lucide-ellipsis')).toBe(true);
  });

  it('preserves the pinned path geometry and explicit accessible names', () => {
    act(() => root.render(<PaintBucket size={13} aria-label="Apply fill" />));
    const icon = container.querySelector('svg');
    expect(icon?.querySelectorAll('path')).toHaveLength(4);
    expect(icon?.getAttribute('aria-label')).toBe('Apply fill');
    expect(icon?.hasAttribute('aria-hidden')).toBe(false);
  });

  it.each(ICON_PAIRS)('matches every pinned Lucide node list', (LocalIcon, LucideIcon) => {
    act(() =>
      root.render(
        <>
          <LocalIcon data-icon="local" />
          <LucideIcon data-icon="reference" />
        </>
      )
    );
    const local = container.querySelector('[data-icon="local"]');
    const reference = container.querySelector('[data-icon="reference"]');
    expect(local?.innerHTML).toBe(reference?.innerHTML);
  });
});
