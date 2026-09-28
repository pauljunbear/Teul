import { COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS } from '../../../../src/lib/colorSystemModelV1';
import type { SourceStatement } from './sourceReviewContracts';

/** Keep every nonblank source window; callers establish the trusted inventory and ID namespace. */
export function projectSourceStatements(
  texts: readonly { id: string; sourceId: string; locator: string; text: string }[],
  identify: (kind: string, identity: unknown) => string
): SourceStatement[] {
  const result: SourceStatement[] = [];
  for (const item of texts)
    for (let start = 0; start < item.text.length; start += LIMITS.maximumText) {
      const text = item.text.slice(start, start + LIMITS.maximumText);
      if (!text.trim()) continue;
      if (result.length >= LIMITS.maximumClaims)
        throw new Error(
          'Captured text exceeds the working model limit. Narrow the captured source; no source statements were discarded.'
        );
      const locator = `${item.locator}/characters/${start}-${start + text.length}`;
      result.push({
        id: identify('statement', [item.id, start, text.length]),
        sourceId: item.sourceId,
        locator,
        text,
        evidenceId: identify('evidence', [item.sourceId, locator]),
        claimId: identify('claim', [item.sourceId, locator]),
      });
    }
  return result;
}
