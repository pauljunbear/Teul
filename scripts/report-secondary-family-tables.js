'use strict';

/* global require, process, console */

/**
 * Prints per-direction Secondary family tables for the generic compiler path.
 * Usage: node scripts/report-secondary-family-tables.js [--json] [--out <dir>]
 * Pure: builds the generic chain in memory from three fixture brands and runs
 * the planner, the compiler, and the strategy engine. No Figma, no network.
 */

const fs = require('node:fs');
const path = require('node:path');

require('./register-typescript');

const {
  buildColorSystemGenericSourceSnapshotV2,
} = require('../src/lib/colorSystemGenericSourceAdapterV2.ts');
const {
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
} = require('../src/lib/colorSystemGenericIntentPolicyV2.ts');
const {
  compileColorSystemGenericPolicyHandoffV2,
} = require('../src/lib/colorSystemGenericPolicyHandoffV2.ts');
const {
  compileColorSystemGenericPolicyHandoffSourceV2,
} = require('../src/lib/colorSystemSourceCompilerV2.ts');
const {
  buildColorSystemSecondaryStrategySetV2,
} = require('../src/lib/colorSystemSecondaryEngineV2.ts');
const { canonicalJson, deterministicContentHash } = require('../src/lib/colorSystemAudit.ts');
const { hexToOklch } = require('../src/lib/utils.ts');

const channel = value => value / 255;

function color(hex) {
  const clean = hex.replace('#', '');
  return {
    colorSpace: 'srgb',
    components: [
      channel(parseInt(clean.slice(0, 2), 16)),
      channel(parseInt(clean.slice(2, 4), 16)),
      channel(parseInt(clean.slice(4, 6), 16)),
    ],
    alpha: 1,
  };
}

function variable(id, name, lightHex, darkHex, scopes = ['ALL_FILLS']) {
  return {
    variableId: `variable:${id}`,
    name,
    description: `${name} source.`,
    collectionId: 'collection:colors',
    scopes: [...scopes],
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color', value: color(lightHex) },
        resolution: 'literal',
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color', value: color(darkHex) },
        resolution: 'literal',
      },
    ],
    evidenceIds: ['evidence:variables'],
  };
}

const BRANDS = {
  blue: { label: 'Blue brand', primary: '#2563EB', ink: '#000000', paper: '#FFFFFF' },
  yellow: { label: 'Yellow brand', primary: '#F2B705', ink: '#000000', paper: '#FFFFFF' },
  'brand-b': {
    label: 'Brand B (forest / gold / terracotta)',
    primary: '#1F6F50',
    secondaries: [
      { name: 'Gold', hex: '#D9A441' },
      { name: 'Terracotta', hex: '#B5533C' },
    ],
    ink: '#2B2622',
    paper: '#F5EFE6',
  },
};

function sourceInput(brand) {
  return {
    capturedAt: '2026-08-21T13:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page:colors'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: 'srgb',
    collections: [
      {
        collectionId: 'collection:colors',
        name: 'Colors',
        defaultModeId: 'mode:light',
        modes: [
          { collectionId: 'collection:colors', modeId: 'mode:light', name: 'Light', order: 1 },
          { collectionId: 'collection:colors', modeId: 'mode:dark', name: 'Dark', order: 2 },
        ],
      },
    ],
    variables: [
      variable('brand-primary', 'Primary / Brand', brand.primary, brand.primary),
      ...(brand.secondaries ?? []).map((entry, index) =>
        variable(`secondary-${index + 1}`, `Secondary / ${entry.name}`, entry.hex, entry.hex)
      ),
      variable('text-ink', 'Text / Ink', brand.ink, brand.paper, ['TEXT_FILL']),
      variable('text-surface', 'Text / Surface', brand.paper, brand.ink),
    ],
    paintStyles: [],
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [
      {
        evidenceId: 'evidence:variables',
        kind: 'figma-resource',
        locator: 'figma://local-variables',
      },
    ],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'No remote library values were imported.',
    scannedNodeCount: 1,
    cancelled: false,
    partial: false,
  };
}

function chain(brand) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(sourceInput(brand));
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const sectionDecisions = proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition: section.disposition,
    jobs: section.disposition === 'omit' ? [] : section.jobs,
    sourceRefIds: section.disposition === 'omit' ? [] : section.sourceRefIds,
    status: 'owner-confirmed',
    evidenceIds: [`owner-decision:${section.role}`],
  }));
  const includePolarity = sectionDecisions.some(
    decision => decision.role === 'data-visualization' && decision.jobs.includes('diverging-data')
  );
  const displayedPlan = {
    kind: 'generic-plan-wire',
    sections: proposal.sections,
    generationPolicyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
    contributionIds: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  };
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ownerEditedRoles: [],
    ...(includePolarity
      ? {
          generatedPolarity: {
            policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
            negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
            positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
            status: 'owner-confirmed',
            evidenceIds: ['owner-decision:generated-diverging-polarity'],
          },
        }
      : {}),
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-08-21T14:00:00.000Z',
  });
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  return { snapshot, proposal, confirmation, handoff };
}

function anchorOf(family) {
  const step = family.members.find(member => member.role === 'step-9');
  return step ? step.valuesByMode.Light.hex : null;
}

function familyKind(family, brief) {
  if (family.contributionId.startsWith('generic-status-reserve-')) return 'reserve';
  if (family.contributionId.startsWith('generic-neutral')) return 'neutral';
  const hex = anchorOf(family);
  const exact = [...brief.preservedColors, ...brief.sourceReferenceColors].some(colorEntry =>
    Object.values(colorEntry.valuesByMode).some(value => value.hex.toUpperCase() === hex)
  );
  return exact ? 'derived' : 'accent';
}

function tableFor(brandId, brand) {
  const source = chain(brand);
  const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
  const strategy = buildColorSystemSecondaryStrategySetV2(compilation.brief, compilation.seeds);
  const brief = compilation.brief;
  const lines = [];
  lines.push(`## ${brand.label}`);
  lines.push('');
  lines.push(
    `Primary ${brand.primary}` +
      (brand.secondaries
        ? `; secondaries ${brand.secondaries.map(entry => `${entry.name} ${entry.hex}`).join(', ')}`
        : '') +
      `; ink ${brand.ink}; paper ${brand.paper}.`
  );
  lines.push('');
  lines.push(
    `Brief: secondaryTargetFamilyCount ${brief.secondaryTargetFamilyCount}; band ${brief.secondaryTargetFamilyCountBand.minimum}–${brief.secondaryTargetFamilyCountBand.maximum}; by direction ${Object.entries(
      brief.secondaryTargetFamilyCountByDirection
    )
      .map(([direction, count]) => `${direction} ${count}`)
      .join(', ')}.`
  );
  lines.push('');
  const json = {
    brand: brandId,
    label: brand.label,
    brief: {
      secondaryTargetFamilyCount: brief.secondaryTargetFamilyCount,
      secondaryTargetFamilyCountByDirection: brief.secondaryTargetFamilyCountByDirection,
      secondaryTargetFamilyCountBand: brief.secondaryTargetFamilyCountBand,
      secondaryTargetFamilyCountReasonByDirection:
        brief.secondaryTargetFamilyCountReasonByDirection,
      assemblyContributionIds: brief.secondaryTargetPolicy.assemblyContributionIds,
    },
    directions: [],
  };
  for (const candidate of strategy.candidates) {
    lines.push(
      `### ${candidate.label} (${candidate.direction}) — ${candidate.actualFamilyCount} of ${candidate.targetFamilyCount}, ${candidate.status}`
    );
    lines.push('');
    lines.push(`Reason: ${brief.secondaryTargetFamilyCountReasonByDirection[candidate.direction]}`);
    lines.push('');
    lines.push(
      '| # | Family | Kind | Contribution | Prominence | Step 9 (Light) | L | C | H | Jobs |'
    );
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    const rows = candidate.families.map(family => {
      const hex = anchorOf(family);
      const oklch = hexToOklch(hex);
      const jobs = [
        ...new Set(
          candidate.jobEligibility
            .filter(entry => entry.ref.familyId === family.stableFamilyId)
            .flatMap(entry => entry.jobs)
        ),
      ].sort();
      const row = {
        order: family.order,
        displayName: family.displayName,
        kind: familyKind(family, brief),
        contributionId: family.contributionId,
        prominence: family.brandFit.prominence,
        anchorHex: hex,
        l: Number(oklch.l.toFixed(3)),
        c: Number(oklch.c.toFixed(3)),
        h: Number(oklch.h.toFixed(1)),
        jobs,
      };
      lines.push(
        `| ${row.order} | ${row.displayName} | ${row.kind} | ${row.contributionId} | ${row.prominence} | ${row.anchorHex} | ${row.l.toFixed(3)} | ${row.c.toFixed(3)} | ${row.h.toFixed(1)}° | ${row.jobs.join(', ')} |`
      );
      return row;
    });
    lines.push('');
    lines.push(`Summary: ${candidate.explanation.summary}`);
    lines.push('');
    const separation = candidate.measures.find(
      entry => entry.id === 'minimum-family-anchor-separation'
    );
    if (separation) {
      lines.push(
        `Minimum chromatic anchor separation ΔEOK ${separation.measuredValue.toFixed(3)} (threshold ${separation.threshold}).`
      );
      lines.push('');
    }
    json.directions.push({
      id: candidate.id,
      direction: candidate.direction,
      status: candidate.status,
      targetFamilyCount: candidate.targetFamilyCount,
      actualFamilyCount: candidate.actualFamilyCount,
      reason: brief.secondaryTargetFamilyCountReasonByDirection[candidate.direction],
      summary: candidate.explanation.summary,
      minimumFamilyAnchorSeparation: separation ? separation.measuredValue : null,
      families: rows,
    });
  }
  return { markdown: lines.join('\n'), json };
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null;
  const markdown = ['# Secondary family tables per direction (generic compiler path)', ''];
  markdown.push(
    'Generated by `scripts/report-secondary-family-tables.js` from the in-memory generic chain: snapshot → proposal → owner confirmation (all proposed jobs, diverging polarity bound to contributions 02 and 05) → handoff → compiler → strategy engine. Step 9 of the Light scale is each family’s anchor.'
  );
  markdown.push('');
  const all = [];
  for (const [brandId, brand] of Object.entries(BRANDS)) {
    const table = tableFor(brandId, brand);
    markdown.push(table.markdown);
    markdown.push('');
    all.push(table.json);
  }
  const text = markdown.join('\n');
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'family-tables.md'), text);
    fs.writeFileSync(path.join(outDir, 'family-tables.json'), `${JSON.stringify(all, null, 2)}\n`);
    console.log(`wrote ${path.join(outDir, 'family-tables.md')} and family-tables.json`);
  } else {
    console.log(text);
  }
}

main();
