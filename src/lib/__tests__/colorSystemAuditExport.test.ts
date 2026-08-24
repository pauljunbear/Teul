import { describe, expect, it } from 'vitest';
import { auditColorSystem, createSourceSystemSnapshot } from '../colorSystemAudit';
import { createColorSystemProposal } from '../colorSystemProposal';
import {
  createColorSystemAuditExport,
  serializeColorSystemAuditExport,
} from '../colorSystemAuditExport';

function fixture(capturedAt = '2026-08-02T00:00:00.000Z', receiptLocator = 'session-only') {
  const snapshot = createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:test',
    authorization: { status: 'user-authorized', receiptLocator },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 1,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt,
    modes: ['Light'],
    tokens: [
      {
        id: 'brand',
        name: 'Brand <script>',
        path: ['brand'],
        valuesByMode: {
          Light: {
            colorSpace: 'srgb',
            hex: '#3366CC',
            components: [0.2, 0.4, 0.8],
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource', locator: 'VariableID:brand' }],
        roleEvidence: [],
      },
    ],
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  });
  return { snapshot, audit: auditColorSystem(snapshot) };
}

describe('color-system audit export', () => {
  it('binds the snapshot, audit, decisions, policies, and deterministic output hash', () => {
    const { snapshot, audit } = fixture();
    const input = {
      snapshot,
      audit,
      reviewerDecisions: [
        {
          kind: 'intended-surface' as const,
          subjectId: 'product-primitives',
          disposition: 'confirmed' as const,
        },
        {
          kind: 'anchor' as const,
          subjectId: 'brand',
          disposition: 'confirmed' as const,
        },
      ],
      libraryBoundaryNote: 'Metadata only.',
    };
    const first = createColorSystemAuditExport({
      ...input,
      exportedAt: '2026-08-02T01:00:00.000Z',
    });
    const replay = createColorSystemAuditExport({
      ...input,
      reviewerDecisions: [...input.reviewerDecisions].reverse(),
      exportedAt: '2026-08-03T01:00:00.000Z',
    });

    expect(first.outputHash).toBe(replay.outputHash);
    expect(first.sourceHash).toBe(snapshot.sourceHash);
    expect(first.auditHash).toBe(audit.auditHash);
    expect(first.policies.diagnosticPolicyVersion).toBe('teul-color-diagnostics-v1');
    expect(first.completeness).toEqual({
      partial: false,
      cancelled: false,
      scannedNodeCount: 0,
    });
    expect(first.reviewerDecisions.map(decision => decision.kind)).toEqual([
      'anchor',
      'intended-surface',
    ]);
  });

  it('escapes HTML-significant content in serialized JSON', () => {
    const { snapshot, audit } = fixture();
    const serialized = serializeColorSystemAuditExport(
      createColorSystemAuditExport({ snapshot, audit, exportedAt: '2026-08-02T00:00:00.000Z' })
    );

    expect(serialized).toContain('Brand \\u003cscript\\u003e');
    expect(serialized).not.toContain('<script>');
  });

  it('hash-binds visible partial and cancellation completeness metadata', () => {
    const { snapshot, audit } = fixture();
    const complete = createColorSystemAuditExport({
      snapshot,
      audit,
      completeness: { partial: false, cancelled: false, scannedNodeCount: 7 },
    });
    const incomplete = createColorSystemAuditExport({
      snapshot,
      audit,
      completeness: { partial: true, cancelled: true, scannedNodeCount: 7 },
    });

    expect(incomplete.completeness).toEqual({
      partial: true,
      cancelled: true,
      scannedNodeCount: 7,
    });
    expect(incomplete.outputHash).not.toBe(complete.outputHash);
    expect(serializeColorSystemAuditExport(incomplete)).toContain(
      '"completeness":{"cancelled":true,"partial":true,"scannedNodeCount":7}'
    );
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        completeness: { partial: false, cancelled: true, scannedNodeCount: 7 },
      })
    ).toThrow('cancelled retained audit export must be marked partial');
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        completeness: { partial: true, cancelled: false, scannedNodeCount: -1 },
      })
    ).toThrow('scannedNodeCount must be a non-negative safe integer');
  });

  it('rejects fabricated and conflicting reviewer decisions before hashing', () => {
    const { snapshot, audit } = fixture();
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        reviewerDecisions: [{ kind: 'anchor', subjectId: 'missing', disposition: 'confirmed' }],
      })
    ).toThrow('not present in the audited source or policy');
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        reviewerDecisions: [
          { kind: 'anchor', subjectId: 'brand', disposition: 'confirmed' },
          { kind: 'anchor', subjectId: 'brand', disposition: 'rejected' },
        ],
      })
    ).toThrow('duplicated');
  });

  it('accepts only confirmed bounded reviewer-assigned roles for known tokens', () => {
    const { snapshot, audit } = fixture();
    const assigned = {
      kind: 'role' as const,
      subjectId: 'brand:primary',
      disposition: 'confirmed' as const,
      assignmentSource: 'reviewer-assigned' as const,
      note: 'Reviewer-assigned canonical role',
    };

    expect(
      createColorSystemAuditExport({ snapshot, audit, reviewerDecisions: [assigned] })
        .reviewerDecisions
    ).toEqual([assigned]);
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        reviewerDecisions: [{ ...assigned, disposition: 'rejected' }],
      })
    ).toThrow('not present in the audited source or policy');
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        reviewerDecisions: [{ ...assigned, subjectId: 'brand:not-a-canonical-role' }],
      })
    ).toThrow('not present in the audited source or policy');
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        reviewerDecisions: [
          {
            kind: 'anchor',
            subjectId: 'brand',
            disposition: 'confirmed',
            assignmentSource: 'reviewer-assigned',
          },
        ],
      })
    ).toThrow('cannot declare a role assignment source');
  });

  it('fails closed when audit evidence belongs to a different source snapshot', () => {
    const { snapshot, audit } = fixture();
    expect(() =>
      createColorSystemAuditExport({ snapshot, audit: { ...audit, sourceHash: 'fnv1a32:forged' } })
    ).toThrow('Audit source hash does not match');
  });

  it('excludes capture and receipt metadata from the content output hash', () => {
    const first = fixture('2026-08-02T00:00:00.000Z', 'receipt-a');
    const replay = fixture('2026-08-03T00:00:00.000Z', 'receipt-b');

    expect(first.snapshot.sourceHash).toBe(replay.snapshot.sourceHash);
    expect(createColorSystemAuditExport(first).outputHash).toBe(
      createColorSystemAuditExport(replay).outputHash
    );
  });

  it('rejects stale embedded source, audit, and proposal hashes', () => {
    const { snapshot, audit } = fixture();
    const tamperedSnapshot = {
      ...snapshot,
      tokens: [{ ...snapshot.tokens[0], name: 'Tampered' }],
    };
    expect(() => createColorSystemAuditExport({ snapshot: tamperedSnapshot, audit })).toThrow(
      'source-hash revalidation'
    );
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit: { ...audit, unresolvedQuestions: ['Tampered after audit.'] },
      })
    ).toThrow('audit-hash revalidation');

    const bundle = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'brand',
            sourceMode: 'Light',
            name: 'Brand',
            hex: '#3366CC',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });
    expect(bundle.status).not.toBe('no-solution');
    if (bundle.status === 'no-solution') return;
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        proposal: { ...bundle.proposal, warnings: ['Tampered after proposal.'] },
      })
    ).toThrow('proposal-hash revalidation');
  });

  it('retains a typed no-solution outcome and rejects blocker-free failure exports', () => {
    const { snapshot, audit } = fixture();
    const outcome = {
      status: 'no-solution' as const,
      strategy: 'exact-radix' as const,
      blockers: [
        {
          code: 'NO_SUITABLE_EXACT_MATCH' as const,
          message: 'No exact candidate is inside the approved tolerance.',
          sourceTokenIds: ['brand'],
          alternatives: ['Use a brand-preserving proposal.'],
        },
      ],
    };
    const exported = createColorSystemAuditExport({ snapshot, audit, proposalOutcome: outcome });
    expect(exported.proposalOutcome).toEqual(outcome);
    expect(() =>
      createColorSystemAuditExport({
        snapshot,
        audit,
        proposalOutcome: { ...outcome, blockers: [] },
      })
    ).toThrow('retain at least one typed blocker');
  });
});
