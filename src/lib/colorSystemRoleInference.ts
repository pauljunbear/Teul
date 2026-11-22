import type {
  SourceEvidenceLocator,
  SourceRoleEvidence,
  SourceScalePosition,
} from '../types/colorSystemAudit';

const ROLE_TERMS: ReadonlyArray<{ role: string; terms: readonly string[] }> = [
  { role: 'background', terms: ['background', 'canvas', 'page'] },
  { role: 'surface', terms: ['surface', 'card', 'panel'] },
  { role: 'text', terms: ['text', 'foreground'] },
  { role: 'border', terms: ['border', 'divider', 'separator', 'stroke'] },
  { role: 'focus', terms: ['focus', 'ring'] },
  { role: 'link', terms: ['link'] },
  { role: 'selected', terms: ['selected', 'selection'] },
  { role: 'disabled', terms: ['disabled'] },
  { role: 'success', terms: ['success', 'positive'] },
  { role: 'warning', terms: ['warning', 'caution'] },
  { role: 'error', terms: ['error', 'danger', 'negative'] },
  { role: 'information', terms: ['information', 'info'] },
  { role: 'destructive', terms: ['destructive', 'delete'] },
  { role: 'neutral', terms: ['neutral', 'gray', 'grey'] },
  { role: 'accent', terms: ['accent'] },
  { role: 'primary', terms: ['primary'] },
  { role: 'secondary', terms: ['secondary'] },
  { role: 'categorical', terms: ['categorical'] },
  { role: 'sequential', terms: ['sequential'] },
  { role: 'diverging', terms: ['diverging'] },
  { role: 'illustration', terms: ['illustration'] },
];

function lexicalTerms(name: string, path: readonly string[]): Set<string> {
  return new Set(
    [name, ...path].flatMap(value => value.toLowerCase().split(/[^a-z0-9]+/g)).filter(Boolean)
  );
}

export function inferSourceRoleEvidence(
  name: string,
  path: readonly string[],
  evidence: readonly SourceEvidenceLocator[]
): SourceRoleEvidence[] {
  const terms = lexicalTerms(name, path);
  return ROLE_TERMS.filter(candidate => candidate.terms.some(term => terms.has(term))).map(
    candidate => ({
      role: candidate.role,
      status: 'inferred',
      confidence: 0.65,
      evidence: evidence.map(item => ({
        ...item,
        detail: item.detail ? `${item.detail} · token-name heuristic` : 'Token-name heuristic',
      })),
      reviewerDisposition: 'pending',
    })
  );
}

export function inferScalePosition(path: readonly string[]): SourceScalePosition | undefined {
  if (path.length < 2) return undefined;
  const step = Number(path[path.length - 1]);
  if (!Number.isInteger(step) || step < 1 || step > 12) return undefined;
  const scaleId = path.slice(0, -1).join('/');
  return scaleId ? { scaleId, step } : undefined;
}
