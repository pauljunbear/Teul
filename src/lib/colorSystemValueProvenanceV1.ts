import type { ColorSystemModelV1 } from './colorSystemModelV1';

/** Stable compiler notices. Numeric precision is separate from how a source value was obtained. */
export const REVIEWED_VALUE_PREFIXES = {
  transcription: 'User-confirmed transcription:',
  sample: 'Accepted rendered sRGB approximation:',
  profile: 'User-selected sRGB interpretation:',
  website: 'Observed website CSS value:',
  derived: 'Derived from reviewed values:',
} as const;

export function colorSystemValueNoticesV1(
  model: Pick<ColorSystemModelV1, 'colors' | 'evidence'>,
  colorIds: readonly string[]
): string[] {
  const selected = new Set(colorIds);
  const refs = new Set(
    model.colors.filter(color => selected.has(color.id)).flatMap(color => color.evidenceRefs)
  );
  const descriptions = model.evidence
    .filter(item => refs.has(item.id))
    .map(item => item.description);
  const notices = new Set<string>();
  for (const text of descriptions) {
    if (text.startsWith(REVIEWED_VALUE_PREFIXES.transcription))
      notices.add('User-confirmed transcription; not a parser-extracted source value.');
    if (text.startsWith(REVIEWED_VALUE_PREFIXES.sample))
      notices.add('Accepted rendered sRGB approximation; not an exact authored brand token.');
    if (text.startsWith(REVIEWED_VALUE_PREFIXES.profile))
      notices.add('User-selected sRGB interpretation; original source profile is unverified.');
    if (text.startsWith(REVIEWED_VALUE_PREFIXES.website))
      notices.add(
        'Observed website CSS value; authored brand-token approval and composited appearance are unverified.'
      );
    // A proposal retains its declared inputs in the same evidence record as its derivation.
    const derived = text.indexOf(`\n${REVIEWED_VALUE_PREFIXES.derived}`);
    if (derived >= 0) {
      const summary = text.slice(derived);
      if (summary.includes('rendered sRGB approximation'))
        notices.add(
          'Derived from accepted rendered sRGB approximations; not exact authored brand tokens.'
        );
      if (summary.includes('transcription'))
        notices.add(
          'Derived from user-confirmed transcriptions; source values were manually interpreted.'
        );
      if (summary.includes('source profile is unverified'))
        notices.add(
          'Derived from a user-selected sRGB interpretation; original source profile is unverified.'
        );
      if (summary.includes('Observed website CSS value'))
        notices.add(
          'Derived from observed website CSS values; authored brand-token approval and composited appearance are unverified.'
        );
    }
  }
  return [...notices].sort();
}

export function colorSystemDerivationNoticeV1(
  source: Pick<ColorSystemModelV1, 'colors' | 'evidence'>,
  sourceColorIds: readonly string[]
): string {
  const notices = colorSystemValueNoticesV1(source, sourceColorIds);
  return notices.length ? `\n${REVIEWED_VALUE_PREFIXES.derived} ${notices.join(' ')}` : '';
}
