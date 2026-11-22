'use strict';

/* global require, process, console, __dirname */

/**
 * p5-A: the four plan choices mean what they say; Replace replaces.
 *
 * Prints per-direction Secondary family tables for the invented bright-primary
 * fixture (one bright low-contrast primary, eight grays, black, white, eleven
 * secondaries with Light tints, a six-colour recorded chart set; no real brand)
 * under three owner choices for Secondary and Data Visualization: Replace,
 * Extend (Teul's proposal) and Keep. Each direction also gets a leak check that
 * counts every replaced hex anywhere in the direction's output (candidate,
 * application, section and resource blueprints, review minus its replaced list),
 * the exactness of the primary and gray source tokens, the chart order source and
 * the status-reserve coverage of the primary's hue.
 *
 * Usage: node scripts/report-replace-disposition-tables.js [--out <dir>]
 * Pure: builds the generic chain in memory (snapshot → proposal → owner
 * confirmation → handoff → compiler → strategy engine → orchestrator). No Figma,
 * no network, no clock beyond the fixture's fixed timestamps.
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
const {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} = require('../src/lib/colorSystemBuilderOrchestratorV2.ts');
const {
  COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3,
} = require('../src/lib/colorSystemSecondaryStrategyV3.ts');
const { canonicalJson, deterministicContentHash } = require('../src/lib/colorSystemHashing.ts');
const { hexToOklch } = require('../src/lib/utils.ts');

const FIXTURE = path.resolve(
  __dirname,
  '../fixtures/color-builder/generic-source-v2/bright-primary-brand.json'
);
const input = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function chain(dispositions) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(input);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const sectionDecisions = proposal.sections.map(section => {
    const chosen = dispositions[section.role];
    const disposition = chosen && section.sourceRefIds.length > 0 ? chosen : section.disposition;
    return {
      role: section.role,
      order: section.order,
      disposition,
      jobs: disposition === 'omit' ? [] : section.jobs,
      sourceRefIds: disposition === 'omit' ? [] : section.sourceRefIds,
      status: 'owner-confirmed',
      evidenceIds: [`owner-decision:${section.role}`],
    };
  });
  const ownerEditedRoles = sectionDecisions
    .filter((decision, index) => decision.disposition !== proposal.sections[index].disposition)
    .map(decision => decision.role);
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
    ownerEditedRoles,
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
    confirmedAt: '2026-09-08T10:00:00.000Z',
  });
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  return { snapshot, proposal, confirmation, handoff };
}

function anchorOf(family) {
  const step = family.members.find(member => member.role === 'step-9');
  return step ? step.valuesByMode.Light.hex : null;
}

function familyKind(family, brief) {
  if (family.contributionId.startsWith('generic-status-reserve-')) return 'status reserve';
  if (family.contributionId.startsWith('generic-neutral')) return 'neutral ramp';
  const hex = anchorOf(family);
  const exact = brief.preservedColors.some(color =>
    Object.values(color.valuesByMode).some(value => value.hex.toUpperCase() === hex)
  );
  if (!exact) return 'new accent';
  return family.brandFit.prominence === 'leading' ? 'hero (exact)' : 'owned hue (exact)';
}

const HEX = /#[0-9A-Fa-f]{6}/g;
function hexesIn(value) {
  return new Set((canonicalJson(value).match(HEX) || []).map(hex => hex.toUpperCase()));
}

const recordedByName = new Map(
  input.variables.map(variable => {
    const light = variable.valuesByMode.find(mode => mode.modeName === 'Light').rawValue.value;
    const hex = `#${light.components
      .map(channel =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`.toUpperCase();
    return [variable.name, hex];
  })
);
const recordedHexes = prefix =>
  [...recordedByName.entries()].filter(([name]) => name.startsWith(prefix)).map(([, hex]) => hex);
const SECONDARY_HEXES = recordedHexes('Secondary / ');
const CHART_HEXES = recordedHexes('Data Viz / ');
const GRAY_HEXES = recordedHexes('Typography / Gray');
const PRIMARY_HEX = recordedByName.get('Primary / Signal');

function scenario(label, dispositions) {
  const source = chain(dispositions);
  const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
  const brief = compilation.brief;
  const strategy = buildColorSystemSecondaryStrategySetV2(brief, compilation.seeds);
  const orchestrated = buildColorSystemGenericBuilderOrchestratorV2(
    buildColorSystemGenericBuilderOrchestratorV2Input(
      source.snapshot,
      source.proposal,
      source.confirmation,
      source.handoff,
      {
        application: {
          applicationMode: 'Light',
          surfaceContext: 'light',
          categoricalMarkCount: 6,
          sequentialMarkCount: 5,
          divergingMarkCount: 5,
          categoricalAdjacency: 'separated',
          divergingMidpointMeaning: 'Zero or neutral midpoint',
        },
        maximumDirections: 3,
      }
    )
  );
  const ready = orchestrated.directions.filter(direction => direction.status === 'ready');
  const lines = [];
  const json = { label, dispositions, brief: {}, directions: [] };
  lines.push(`## ${label}`);
  lines.push('');
  lines.push(
    `Owner choices: ${source.confirmation.sectionDecisions
      .map(decision => `${decision.role} = ${decision.disposition}`)
      .join(', ')}.`
  );
  lines.push('');
  const preservedBySection = {};
  brief.preservedColors.forEach(color => {
    preservedBySection[color.section] = (preservedBySection[color.section] || 0) + 1;
  });
  const replacedBySection = {};
  (brief.replacedColors || []).forEach(color => {
    replacedBySection[color.section] = (replacedBySection[color.section] || 0) + 1;
  });
  json.brief = {
    preservedBySection,
    replacedBySection,
    replacedColors: brief.replacedColors || null,
    secondaryTargetFamilyCountByDirection: brief.secondaryTargetFamilyCountByDirection,
    secondaryTargetFamilyCountBand: brief.secondaryTargetFamilyCountBand,
    secondaryTargetFamilyCountReasonByDirection: brief.secondaryTargetFamilyCountReasonByDirection,
    skippedStatusReserves: brief.skippedStatusReserves || [],
    secondaryOmittedDirections: brief.secondaryOmittedDirections || [],
    secondaryGuidance: brief.sections[1].guidance,
    dataVisualizationGuidance: brief.sections[3].guidance,
  };
  lines.push(
    `Brief: preserved colors by section ${JSON.stringify(preservedBySection)}; replaced colors by section ${JSON.stringify(replacedBySection)}.`
  );
  lines.push('');
  lines.push(`Secondary guidance: ${brief.sections[1].guidance}`);
  lines.push('');
  lines.push(`Data Visualization guidance: ${brief.sections[3].guidance}`);
  lines.push('');
  lines.push(
    `Targets by direction: ${Object.entries(brief.secondaryTargetFamilyCountByDirection)
      .map(([direction, count]) => `${direction} ${count}`)
      .join(
        ', '
      )}; band ${brief.secondaryTargetFamilyCountBand.minimum}–${brief.secondaryTargetFamilyCountBand.maximum}.`
  );
  if ((brief.skippedStatusReserves || []).length > 0) {
    lines.push('');
    lines.push(
      `Skipped status reserves: ${brief.skippedStatusReserves
        .map(entry => `${entry.role} (${entry.cause})`)
        .join(', ')}.`
    );
  }
  if ((brief.secondaryOmittedDirections || []).length > 0) {
    lines.push('');
    lines.push(
      `Omitted directions: ${brief.secondaryOmittedDirections
        .map(entry => `${entry.direction} (${entry.cause})`)
        .join(', ')}.`
    );
  }
  if (brief.replacedColors) {
    lines.push('');
    lines.push('Replaced colors on the brief (evidence only):');
    lines.push('');
    lines.push('| Section | Name | Light | Dark |');
    lines.push('| --- | --- | --- | --- |');
    brief.replacedColors.forEach(color => {
      lines.push(
        `| ${color.section} | ${color.displayName} | \`${color.hexByMode.Light}\` | \`${color.hexByMode.Dark}\` |`
      );
    });
  }
  lines.push('');
  lines.push(
    `Strategy set: ${strategy.status}, ${strategy.candidates.length} realized direction(s); orchestrator ${orchestrated.status}, ${ready.length} ready direction(s).`
  );
  lines.push('');
  const blocked = orchestrated.directions.filter(direction => direction.status !== 'ready');
  json.blockedDirections = blocked.map(direction => ({
    directionId: direction.directionId,
    status: direction.status,
    blockers: direction.blockers,
  }));
  if (blocked.length > 0) {
    lines.push('Directions the orchestrator did not offer, with its blockers:');
    lines.push('');
    blocked.forEach(direction => {
      lines.push(`- ${direction.directionId} (${direction.status})`);
      (direction.blockers || []).forEach(blocker => {
        lines.push(`  - \`${blocker.code}\`: ${blocker.message}`);
      });
    });
    lines.push('');
  }
  const primaryHue = hexToOklch(PRIMARY_HEX).h;
  for (const direction of ready) {
    const candidate = direction.candidate;
    const review = direction.review;
    const { replaced: _listed, ...reviewWithoutList } = review;
    const seen = hexesIn({
      candidate,
      application: direction.application,
      section: direction.section,
      resource: direction.resource,
      review: reviewWithoutList,
    });
    const leaks = {
      secondary: SECONDARY_HEXES.filter(hex => seen.has(hex)),
      chart: CHART_HEXES.filter(hex => seen.has(hex)),
    };
    const primitives = direction.resource.collections[0].variables;
    const sourceTokens = primitives.filter(variable => variable.name.startsWith('source/'));
    const exactGrays = GRAY_HEXES.filter(hex =>
      sourceTokens.some(variable => variable.valuesByMode.Light.hex.toUpperCase() === hex)
    );
    const exactPrimary = sourceTokens.some(
      variable => variable.valuesByMode.Light.hex.toUpperCase() === PRIMARY_HEX
    );
    const reserves = candidate.families
      .filter(family => family.contributionId.startsWith('generic-status-reserve-'))
      .map(family => family.contributionId.replace('generic-status-reserve-', ''));
    const coverage = Object.entries(COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3).map(
      ([role, range]) => ({
        role,
        range: `${range.minimum}°–${range.maximum}°`,
        primaryInRange: primaryHue >= range.minimum && primaryHue <= range.maximum,
        reserve: reserves.includes(role),
        skipped: (brief.skippedStatusReserves || []).some(entry => entry.role === role),
      })
    );
    lines.push(
      `### ${candidate.label} (${candidate.direction}) — ${candidate.actualFamilyCount} of ${candidate.targetFamilyCount}, ${candidate.status}`
    );
    lines.push('');
    lines.push(`Promise: ${review.directionDecision.promise}`);
    lines.push('');
    if (review.replaced) {
      review.replaced.statements.forEach(statement => lines.push(`- ${statement}`));
      lines.push(
        `- The review lists ${review.replaced.colors.length} replaced (name, mode, hex) entries.`
      );
      lines.push('');
    }
    lines.push(
      `Chart order: ${review.why && review.why.chartOrder ? review.why.chartOrder.statement : 'n/a'} (categorical orderSource \`${direction.application.visualization.categorical.orderSource}\`).`
    );
    lines.push('');
    lines.push(
      `Leak check (replaced hexes found anywhere in candidate, application, section, resource, review minus the replaced list): secondary ${leaks.secondary.length}/${SECONDARY_HEXES.length}, chart ${leaks.chart.length}/${CHART_HEXES.length}.`
    );
    lines.push(
      `Exact source tokens: primary ${exactPrimary ? 'exact' : 'MISSING'}; grays ${exactGrays.length}/${GRAY_HEXES.length} exact; ${sourceTokens.length} source tokens (groups: ${sourceTokens
        .map(variable => variable.name.split('/')[1])
        .filter((group, index, all) => all.indexOf(group) === index)
        .join(', ')}).`
    );
    lines.push('');
    lines.push(`Status reserve coverage (primary hue ${primaryHue.toFixed(1)}°):`);
    lines.push('');
    lines.push('| Role | Range | Primary in range | Reserve added | Skipped |');
    lines.push('| --- | --- | --- | --- | --- |');
    coverage.forEach(entry => {
      lines.push(
        `| ${entry.role} | ${entry.range} | ${entry.primaryInRange ? 'yes' : 'no'} | ${entry.reserve ? 'yes' : 'no'} | ${entry.skipped ? 'yes' : 'no'} |`
      );
    });
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
        c: Number(oklch.c.toFixed(4)),
        h: Number(oklch.h.toFixed(1)),
        jobs,
        pinnedMembers: (family.pinnedMembers || []).map(
          pin => `${pin.sourceDisplayName} ${pin.hex} @ step ${pin.step}`
        ),
      };
      lines.push(
        `| ${row.order} | ${row.displayName} | ${row.kind} | \`${row.contributionId}\` | ${row.prominence} | \`${row.anchorHex}\` | ${row.l.toFixed(3)} | ${row.c.toFixed(4)} | ${row.h.toFixed(1)} | ${row.jobs.join(', ')} |`
      );
      return row;
    });
    lines.push('');
    lines.push(`Summary: ${candidate.explanation.summary}`);
    lines.push('');
    json.directions.push({
      id: candidate.id,
      direction: candidate.direction,
      status: candidate.status,
      targetFamilyCount: candidate.targetFamilyCount,
      actualFamilyCount: candidate.actualFamilyCount,
      promise: review.directionDecision.promise,
      replaced: review.replaced || null,
      unchanged: review.unchanged,
      chartOrder: review.why ? review.why.chartOrder : null,
      categoricalOrderSource: direction.application.visualization.categorical.orderSource,
      leaks,
      exactPrimary,
      exactGrays: exactGrays.length,
      sourceTokenNames: sourceTokens.map(variable => variable.name),
      statusReserveCoverage: coverage,
      families: rows,
    });
  }
  return { markdown: lines.join('\n'), json };
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null;
  const scenarios = [
    [
      'Replace — Secondary and Data Visualization replaced; Primary and Typography kept',
      { secondary: 'rebuild', 'data-visualization': 'rebuild' },
    ],
    ['Extend — today’s behaviour (Teul’s proposal for a found Secondary)', {}],
    ['Keep — Secondary kept exact; Data Visualization extended', { secondary: 'preserve' }],
  ];
  const primary = hexToOklch(PRIMARY_HEX);
  const markdown = [
    '# p5-A — the four plan choices mean what they say; Replace replaces',
    '',
    `Fixture: \`fixtures/color-builder/generic-source-v2/bright-primary-brand.json\` (invented values, no real brand): primary ${PRIMARY_HEX} (OKLCH hue ${primary.h.toFixed(1)}°, L ${primary.l.toFixed(3)}), white, black, eight grays, eleven secondaries each with a Light tint (22 values), six recorded chart colors. Generated by \`scripts/report-replace-disposition-tables.js\` from the in-memory generic chain; step 9 of the Light scale is each family’s anchor. Application request: Light mode, 6 categorical, 5 sequential, 5 diverging marks.`,
    '',
  ];
  const all = [];
  for (const [label, dispositions] of scenarios) {
    const result = scenario(label, dispositions);
    markdown.push(result.markdown);
    markdown.push('');
    all.push(result.json);
  }
  const text = markdown.join('\n');
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'bright-primary-directions.md'), text);
    fs.writeFileSync(
      path.join(outDir, 'bright-primary-run.json'),
      `${JSON.stringify(all, null, 2)}\n`
    );
    console.log(
      `wrote ${path.join(outDir, 'bright-primary-directions.md')} and bright-primary-run.json`
    );
  } else {
    console.log(text);
  }
  for (const result of all) {
    console.error(`\n${result.label}`);
    console.error(
      `  preserved ${JSON.stringify(result.brief.preservedBySection)} replaced ${JSON.stringify(result.brief.replacedBySection)}`
    );
    console.error(
      `  skipped reserves ${JSON.stringify(result.brief.skippedStatusReserves.map(entry => entry.role))} omitted ${JSON.stringify(result.brief.secondaryOmittedDirections.map(entry => entry.direction))}`
    );
    for (const direction of result.directions) {
      console.error(
        `  ${direction.id}: ${direction.actualFamilyCount} families; leaks secondary ${direction.leaks.secondary.length} chart ${direction.leaks.chart.length}; primary ${direction.exactPrimary ? 'exact' : 'MISSING'}; grays ${direction.exactGrays}; chart ${direction.categoricalOrderSource}`
      );
      console.error(
        `    families: ${direction.families.map(row => `${row.displayName} ${row.anchorHex} [${row.kind}]`).join(' | ')}`
      );
      console.error(`    source tokens: ${direction.sourceTokenNames.join(', ')}`);
      console.error(
        `    coverage: ${direction.statusReserveCoverage
          .map(
            entry =>
              `${entry.role} in=${entry.primaryInRange} reserve=${entry.reserve} skipped=${entry.skipped}`
          )
          .join('; ')}`
      );
    }
  }
}

main();
