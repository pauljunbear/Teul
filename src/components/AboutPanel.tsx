import * as React from 'react';
import { themeFor, type as typeScale } from '../lib/theme';

export interface AboutContent {
  title: string;
  emoji: string;
  content: {
    heading: string;
    text: string;
  }[];
  credit?: {
    text: string;
    link?: string;
  };
}

/**
 * The About text for a historical library, rendered in place inside More (it was a
 * dialog behind a "?" button before the 2026-11 redesign). The text is unchanged.
 */
export const AboutSection: React.FC<AboutContent & { isDark: boolean }> = ({
  isDark,
  content,
  credit,
}) => {
  const theme = themeFor(isDark);
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {content.map(section => (
        <div key={section.heading}>
          <strong
            style={{
              display: 'block',
              color: theme.text,
              fontSize: typeScale.body,
              fontWeight: 600,
              marginBottom: '2px',
            }}
          >
            {section.heading}
          </strong>
          <p style={{ margin: 0, fontSize: typeScale.meta, lineHeight: 1.5 }}>{section.text}</p>
        </div>
      ))}
      {credit && (
        <p style={{ margin: 0, fontSize: typeScale.meta, lineHeight: 1.5, fontStyle: 'italic' }}>
          {credit.text}
        </p>
      )}
    </div>
  );
};

// About content for Wada Sanzo
export const WADA_ABOUT_CONTENT: AboutContent = {
  title: 'About Sanzo Wada',
  emoji: '🎨',
  content: [
    {
      heading: 'The Dictionary of Color Combinations',
      text: "Sanzo Wada's original A-series contains 360 combinations: 120 duos, 120 trios, and 120 quads. The modern Seigensha selection presents 159 normalized colors across 348 combinations and omits A.XII four-color Nos. 109-120.",
    },
    {
      heading: 'Digital Approximation',
      text: 'Bundled names are modern upstream transcriptions, not wholesale verified primary-source text. The sRGB values are digital approximations based on modern Seigensha CMYK recipes, not exact historical RGB colors.',
    },
  ],
  credit: {
    text: "Bundled data converted by mattdesl's dictionary-of-colour-combinations project, which credits Dain M. Blodorn Kim's original digital compilation.",
  },
};

// About content for Werner
export const WERNER_ABOUT_CONTENT: AboutContent = {
  title: "About Werner's Colors",
  emoji: '📜',
  content: [
    {
      heading: "Werner's Nomenclature of Colours",
      text: "The familiar 110-color collection is Patrick Syme's 1821 second edition, adapted from Abraham Gottlob Werner's nomenclature. The 1814 first edition contains 108 colors.",
    },
    {
      heading: 'The Natural World',
      text: "Its references to animals, vegetables, and minerals are principally Syme's contribution. Teul independently transcribes the public-domain edition and reproducibly samples the Getty scan's aged painted swatches.",
    },
  ],
  credit: {
    text: "Patrick Syme's 1821 second edition; public-domain scan from Getty Research Institute.",
  },
};
