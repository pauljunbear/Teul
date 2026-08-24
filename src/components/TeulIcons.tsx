import * as React from 'react';

// Pinned Lucide v1.24.0 paths. Keeping the small renderer local avoids shipping
// Lucide's context and dynamic class-name machinery for these fixed icons.
type IconNode = string | readonly [attributes: Record<string, string>, tag: 'circle' | 'rect'];
type IconProps = React.SVGProps<SVGSVGElement> & {
  absoluteStrokeWidth?: boolean;
  size?: number | string;
};

function hasAccessibleName(props: React.SVGProps<SVGSVGElement>): boolean {
  for (const key in props) {
    if (key.startsWith('aria-') || key === 'role' || key === 'title') return true;
  }
  return false;
}

function createIcon(name: string, nodes: readonly IconNode[]) {
  return React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    {
      absoluteStrokeWidth = false,
      children,
      className = '',
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      ...props
    },
    ref
  ) {
    const width = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`lucide lucide-${name}${className ? ` ${className}` : ''}`}
        {...(!children && !hasAccessibleName(props) ? { 'aria-hidden': 'true' } : {})}
        {...props}
      >
        {nodes.map((node, index) =>
          typeof node === 'string' ? (
            <path d={node} key={index} />
          ) : (
            React.createElement(node[1], { ...node[0], key: index })
          )
        )}
        {children}
      </svg>
    );
  });
}

export const Palette = createIcon('palette', [
  'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
  [{ cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }, 'circle'],
  [{ cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }, 'circle'],
  [{ cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }, 'circle'],
  [{ cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }, 'circle'],
]);

export const BookOpenText = createIcon('book-open-text', [
  'M12 7v14',
  'M16 12h2',
  'M16 8h2',
  'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  'M6 12h2',
  'M6 8h2',
]);

export const GridFour = createIcon('grid-2x2', [
  'M12 3v18',
  'M3 12h18',
  [{ x: '3', y: '3', width: '18', height: '18', rx: '2' }, 'rect'],
]);

export const CheckCircle = createIcon('circle-check', [
  [{ cx: '12', cy: '12', r: '10' }, 'circle'],
  'm9 12 2 2 4-4',
]);

export const ScanSearch = createIcon('scan-search', [
  'M3 7V5a2 2 0 0 1 2-2h2',
  'M17 3h2a2 2 0 0 1 2 2v2',
  'M21 17v2a2 2 0 0 1-2 2h-2',
  'M7 21H5a2 2 0 0 1-2-2v-2',
  [{ cx: '12', cy: '12', r: '3' }, 'circle'],
  'm16 16-1.9-1.9',
]);

export const GearSix = createIcon('settings', [
  'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
  [{ cx: '12', cy: '12', r: '3' }, 'circle'],
]);

export const Question = createIcon('circle-question-mark', [
  [{ cx: '12', cy: '12', r: '10' }, 'circle'],
  'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
  'M12 17h.01',
]);

export const Copy = createIcon('copy', [
  [{ width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }, 'rect'],
  'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
]);

export const DownloadSimple = createIcon('download', [
  'M12 15V3',
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  'm7 10 5 5 5-5',
]);

export const PaintBucket = createIcon('paint-bucket', [
  'M11 7 6 2',
  'M18.992 12H2.041',
  'M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595',
  'm8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33',
]);

export const PencilSimple = createIcon('pencil', [
  'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
  'm15 5 4 4',
]);

export const ArrowsClockwise = createIcon('refresh-cw', [
  'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
  'M21 3v5h-5',
  'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
  'M8 16H3v5',
]);

export const Swatches = createIcon('swatch-book', [
  'M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z',
  'M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7',
  'M 7 17h.01',
  'm11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8',
]);

export const MagicWand = createIcon('wand-sparkles', [
  'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72',
  'm14 7 3 3',
  'M5 6v4',
  'M19 14v4',
  'M10 2v2',
  'M7 8H3',
  'M21 16h-4',
  'M11 3H9',
]);

export const X = createIcon('x', ['M18 6 6 18', 'm6 6 12 12']);
