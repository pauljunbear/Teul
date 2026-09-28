/** Display observed failures only; this module cannot change a request or grant permission. */
import type {
  ColorSystemAuthoringDirectionV1,
  ColorSystemAuthoringExecutionV1,
} from '../lib/colorSystemAuthoringExecutionV1';
import { canonicalJson } from '../lib/colorSystemHashing';

export function describeColorSystemAuthoringFailureV1(
  execution: ColorSystemAuthoringExecutionV1,
  direction: ColorSystemAuthoringDirectionV1
): string {
  const examples = new Set<string>();
  const codes = new Set<string>();
  let omitted = false;
  const add = (code: string, reason: string) => {
    codes.add(code);
    const bounded = reason.length > 2048 ? `${reason.slice(0, 2048)}… (truncated)` : reason;
    if (examples.has(bounded)) return;
    if (examples.size < 8) examples.add(bounded);
    else omitted = true;
  };
  for (const diagnostic of execution.diagnostics) add(diagnostic.code, diagnostic.reason);
  const composition = execution.composition;
  if (composition && composition.status !== 'cancelled') {
    for (const failure of composition.diagnostics.failures)
      add(
        failure.code,
        failure.code === 'REQUIRED_CONTRAST_FAILED'
          ? failure.reason
          : `${failure.id}: ${failure.reason}`
      );
    for (const option of composition.diagnostics.unavailableOptions)
      add(
        option.code,
        `${option.applicationId}, ${option.modeId}, ${option.useId}: ${option.code === 'COLOR_LOCK_CHANGED' ? `color ${option.colorId} would change the locked color` : `color ${option.colorId} has no source value in this mode`}.`
      );
  }
  const generation = execution.generation;
  if (generation?.kind === 'construction') {
    const construction = generation.result.construction.result;
    if (construction.status !== 'cancelled')
      for (const scale of construction.scales)
        for (const issue of scale.issues)
          add(
            issue.code,
            `${scale.scaleId}, ${scale.modeId}, slots ${issue.slotIds.join(', ')}: ${issue.message}`
          );
  } else if (generation?.kind === 'overlay') {
    for (const diagnostic of generation.result.diagnostics)
      add('FRAGMENT_BLOCKED', `${diagnostic.fragmentId}: ${diagnostic.message}`);
  }
  for (const interaction of execution.interactions) {
    const result = interaction.result;
    const scope = `${interaction.id}, ${result.contextId}, ${result.modeId}`;
    if (result.status === 'incomplete') {
      for (const gap of result.gaps)
        add(
          gap.code,
          `${scope}: missing ${gap.usage} value${gap.colorId ? ` for color ${gap.colorId}` : ''}${gap.scaleId ? `, scale ${gap.scaleId}` : ''}${gap.slotId ? `, slot ${gap.slotId}` : ''}.`
        );
    } else if (result.status === 'infeasible') {
      const diagnostics = result.selectorReceipt.diagnostics;
      const colorsByReference = new Map<string, string>();
      for (const item of result.referenceLookup) {
        const key = canonicalJson(item.ref);
        if (!colorsByReference.has(key)) colorsByReference.set(key, item.colorId);
      }
      const colorFor = (ref: unknown) => colorsByReference.get(canonicalJson(ref));
      for (const failure of diagnostics.failures) {
        const surface = failure.surface ? colorFor(failure.surface) : undefined;
        const foreground = failure.onForeground ? colorFor(failure.onForeground) : undefined;
        const reason = {
          NO_ELIGIBLE_FAMILIES: 'No requested scale supplies an eligible set of states.',
          INSUFFICIENT_MEMBERS: 'The scale has too few eligible members for the requested states.',
          SURFACE_CONTRAST: 'A state does not meet the required contrast on its declared surface.',
          IDENTICAL_RENDERED_STATES:
            'The requested states render identically on a declared surface.',
          NO_COMMON_FOREGROUND: 'No supplied foreground works across the complete set of states.',
        }[failure.code];
        const details = [
          failure.state && `state ${failure.state}`,
          surface && `surface ${surface}`,
          foreground && `foreground ${foreground}`,
          failure.positions && `positions ${failure.positions.join(', ')}`,
          failure.ratio !== undefined && `measured contrast ${failure.ratio}:1`,
          failure.minimumRatio !== undefined && `required minimum ${failure.minimumRatio}:1`,
        ].filter(Boolean);
        add(
          failure.code,
          `${scope}${failure.scaleId ? `, scale ${failure.scaleId}` : ''}: ${reason}${details.length ? ` ${details.join('; ')}.` : ''}`
        );
      }
      if (diagnostics.lockRejectedTriples) {
        const locks = interaction.request.scales.flatMap(scale =>
          Object.entries(scale.lockedSlotIds ?? {}).map(
            ([state, slotId]) => `${scale.scaleId}/${state}=${slotId}`
          )
        );
        add(
          'COLOR_LOCK_CHANGED',
          `${scope}: ${diagnostics.lockRejectedTriples} state combinations change an explicit state lock${locks.length ? ` (${locks.join(', ')})` : ''}.`
        );
      }
    }
  }
  for (const assessment of execution.assessments)
    for (const blocker of assessment.blockers)
      add(blocker.code, `${blocker.id}: ${blocker.reason}`);

  const generationRequest = direction.generation;
  const brief =
    generationRequest.kind === 'construction' || generationRequest.kind === 'catalog'
      ? generationRequest.intent.brief
      : generationRequest.proposal.brief;
  const next: string[] = [];
  if ([...codes].some(code => code.startsWith('MISSING_')))
    next.push(
      'Supply the missing source value for the named mode, or choose an existing color or scale that has one.'
    );
  if (codes.has('COLOR_LOCK_CHANGED'))
    next.push(
      'Choose an option that preserves the named lock, or explicitly unlock it before changing the design.'
    );
  if (generation?.kind === 'construction' || generation?.kind === 'overlay')
    next.push(
      'Review the named anchors, gaps and fragment constraints before changing the construction brief.'
    );
  if (execution.status === 'search-limited')
    next.push(
      'Narrow the declared options or increase the explicit search budget within supported limits; the bounded search does not prove that no solution exists.'
    );
  next.push(
    brief.permissions.addColors
      ? 'Try another permitted color pair or state scale, or propose another role color within the existing brief.'
      : 'Try another permitted existing color pair or state scale. Adding colors requires an explicit change to the brief first.'
  );
  if ([...codes].some(code => /RULE|POLICY|REVIEW|TERRITORY/.test(code)))
    next.push(
      'Inspect the named source rule or decision. A failing source requirement is not permission to waive it.'
    );
  return [
    execution.status === 'search-limited'
      ? 'The search limit was reached before a selectable application was found.'
      : execution.status === 'incomplete'
        ? 'The requested application is missing required input.'
        : 'No selectable application was found for this request.',
    ...(examples.size
      ? [
          'Observed failure examples (not an exhaustive set):',
          ...[...examples].map(reason => `• ${reason}`),
        ]
      : []),
    ...(omitted ? ['Showing the first eight recorded examples.'] : []),
    'Next: ' + next.join(' '),
    'Thresholds, source rules and locks remain unchanged. Any previous selection remains available.',
  ].join('\n');
}
