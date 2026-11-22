import * as React from 'react';
import { themeFor, type as typeScale } from '../lib/theme';
import type { NormalizedDocumentColorProfile } from '../types/messages';
import type { WorkspaceThemeMode } from '../lib/workspaceState';
import {
  WADA_SOURCE_PROVENANCE_DISCLOSURE,
  WERNER_SOURCE_PROVENANCE_DISCLOSURE,
} from '../lib/sourceProvenanceDisclosureData';
import { SourceProvenanceDisclosure } from './SourceProvenanceDisclosure';
import { AboutSection, WADA_ABOUT_CONTENT, WERNER_ABOUT_CONTENT } from './AboutPanel';
import { Disclosure, Notice, SectionLabel, Segmented } from './TeulUI';

export const profileLabels: Record<NormalizedDocumentColorProfile, string> = {
  legacy: 'Legacy',
  srgb: 'sRGB',
  'display-p3': 'Display P3',
  unknown: 'Not reported',
};

/** The Display P3 warning, verbatim from the former Settings panel. */
export const DISPLAY_P3_WARNING =
  'This Display P3 document may render preserved sRGB numeric values differently. Selection contrast and WCAG-constrained Figma creation require a confirmed sRGB document; manual hex remains explicitly sRGB.';

/**
 * More: what is read once rather than on every screen. Appearance, the document's
 * color profile, the digital-approximation notes and the About texts.
 */
export const MorePanel: React.FC<{
  isDark: boolean;
  themeMode: WorkspaceThemeMode;
  onThemeModeChange: (mode: WorkspaceThemeMode) => void;
  documentColorProfile: NormalizedDocumentColorProfile;
}> = ({ isDark, themeMode, onThemeModeChange, documentColorProfile }) => {
  const theme = themeFor(isDark);
  const profileLabel = profileLabels[documentColorProfile];
  const paragraph: React.CSSProperties = {
    margin: 0,
    color: theme.textMuted,
    fontSize: typeScale.meta,
    lineHeight: 1.5,
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '4px 16px 20px',
        boxSizing: 'border-box',
      }}
    >
      <SectionLabel isDark={isDark} id="more-appearance-label">
        Appearance
      </SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Segmented<WorkspaceThemeMode>
          label="Appearance"
          isDark={isDark}
          value={themeMode}
          onChange={onThemeModeChange}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <span style={paragraph}>Match Figma or choose a fixed theme.</span>
      </div>

      <SectionLabel isDark={isDark}>Document color profile</SectionLabel>
      <div
        aria-label={`Document color profile: ${profileLabel}`}
        title={`Figma document color profile: ${profileLabel}`}
        style={{
          color: theme.text,
          fontSize: typeScale.emphasis,
          fontWeight: 600,
          lineHeight: 1.25,
        }}
      >
        {profileLabel}
      </div>
      <p style={{ ...paragraph, marginTop: '4px' }}>
        Figma reports {profileLabel}. Historical and generated hex/RGB values remain labeled sRGB;
        Teul preserves numeric channels.
      </p>
      {documentColorProfile === 'display-p3' && (
        <Notice isDark={isDark} tone="warn" role="status" style={{ marginTop: '10px' }}>
          {DISPLAY_P3_WARNING}
        </Notice>
      )}

      <SectionLabel isDark={isDark}>Digital approximation</SectionLabel>
      <div style={{ display: 'grid', gap: '6px' }}>
        <span style={{ ...paragraph, color: theme.text }}>Sanzo Wada</span>
        <SourceProvenanceDisclosure
          provenance={WADA_SOURCE_PROVENANCE_DISCLOSURE}
          isDark={isDark}
        />
        <span style={{ ...paragraph, color: theme.text, marginTop: '6px' }}>
          Werner’s Nomenclature
        </span>
        <SourceProvenanceDisclosure
          provenance={WERNER_SOURCE_PROVENANCE_DISCLOSURE}
          isDark={isDark}
        />
      </div>

      <SectionLabel isDark={isDark}>About</SectionLabel>
      <Disclosure isDark={isDark} summary="About Teul" defaultOpen first>
        Historical color, tested color systems, and documented layout grids. Wada and Werner colors
        are labeled digital approximations. Exact Radix sRGB solid families retain their published
        values; WCAG-constrained semantic output blocks when required pairs fail.
      </Disclosure>
      <Disclosure isDark={isDark} summary={WADA_ABOUT_CONTENT.title}>
        <AboutSection isDark={isDark} {...WADA_ABOUT_CONTENT} />
      </Disclosure>
      <Disclosure isDark={isDark} summary={WERNER_ABOUT_CONTENT.title}>
        <AboutSection isDark={isDark} {...WERNER_ABOUT_CONTENT} />
      </Disclosure>
    </div>
  );
};
