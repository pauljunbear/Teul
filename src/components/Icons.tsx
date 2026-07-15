import * as React from 'react';

export interface IconProps {
  size?: number | string;
  weight?: 'regular' | 'fill' | 'bold';
}

const makeIcon = (displayName: string, d: string) => {
  const Icon: React.FC<IconProps> = ({ size = 16, weight = 'regular' }) => (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight === 'regular' ? 1.7 : 2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
};

export const Palette = makeIcon(
  'Palette',
  'M12 3a9 9 0 1 0 0 18h1.4a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5.5A3.5 3.5 0 0 0 21 9.5C21 5.9 17 3 12 3Zm-4 6h.01M11 6h.01m4 1h.01M6 13h.01'
);
export const BookOpenText = makeIcon(
  'BookOpenText',
  'M4 4.5h5a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4V4.5Zm16 0h-5a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h5V4.5ZM6.5 8H9m-2.5 3H9m6.5-3H18m-2.5 3H18'
);
export const GridFour = makeIcon(
  'GridFour',
  'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z'
);
export const CheckCircle = makeIcon('CheckCircle', 'M21 12a9 9 0 1 1-4-7.5M8 12l2.5 2.5L20 5');
export const GearSix = makeIcon(
  'GearSix',
  'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-3.5 1.5-1.2-1.5-2.6-1.9.4a7.5 7.5 0 0 0-1.7-1L15 5.7h-3l-.6 1.9a7.5 7.5 0 0 0-1.7 1l-1.9-.4-1.5 2.6L8 12a7 7 0 0 0 0 2l-1.7 1.2 1.5 2.6 1.9-.4a7.5 7.5 0 0 0 1.7 1l.6 1.9h3l.6-1.9a7.5 7.5 0 0 0 1.7-1l1.9.4 1.5-2.6L19 14a7 7 0 0 0 0-2Z'
);
export const ArrowsClockwise = makeIcon(
  'ArrowsClockwise',
  'M20 7V3l-2 2a8 8 0 0 0-13 3m-1 9v4l2-2a8 8 0 0 0 13-3'
);
export const Copy = makeIcon('Copy', 'M8 8h11v11H8V8Zm-3 8H4V4h12v1');
export const DownloadSimple = makeIcon('DownloadSimple', 'M12 4v11m-4-4 4 4 4-4M5 20h14');
export const MagicWand = makeIcon(
  'MagicWand',
  'm4 20 11-11m-8-2 2 2m6-5 1 3m4 1-3 1m-1 4 2 2M6 14l4 4'
);
export const PaintBucket = makeIcon(
  'PaintBucket',
  'm5 4 10 10-6 6-6-6 6-6m7 8h5m-2.5-5.5c0 0-2.5 3-2.5 4.5a2.5 2.5 0 0 0 5 0c0-1.5-2.5-4.5-2.5-4.5Z'
);
export const PencilSimple = makeIcon(
  'PencilSimple',
  'm4 20 4.5-1L19 8.5 15.5 5 5 15.5 4 20Zm9.5-13.5 4 4'
);
export const Question = makeIcon(
  'Question',
  'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-1 .4-1 1-1 1.7m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
);
export const Swatches = makeIcon(
  'Swatches',
  'M5 4h5v15a2.5 2.5 0 0 1-5 0V4Zm5 4 4-2 6.5 13H10m0-6h8M7.5 18.5h.01'
);
export const X = makeIcon('X', 'M5 5l14 14M19 5 5 19');
