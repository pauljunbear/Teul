/** Bind a quantitative composition to a reviewed scale, including its evidence-only paints. */
import { record, boundedText } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { guidelineApplicationSourceRoles } from './applicationSourceRoles';
import {
  readQuantitativeMatrixInput,
  type QuantitativeMatrixInput,
} from './quantitativeMatrixGeometry';

export interface GuidelineMatrixControls {
  readonly scaleId: string;
  readonly numericVersion?: 2;
  readonly dataPaints?: 'reviewed-source-v1';
  readonly input: QuantitativeMatrixInput;
  readonly sourceRoles?: Readonly<Record<string, string>>;
}

function fail(message: string): never {
  throw new Error(`Quantitative application: ${message}`);
}

export function readGuidelineMatrixControls(raw: unknown): GuidelineMatrixControls {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 24 * 1024 });
  record(value, [
    'scaleId',
    'input',
    ...(value && typeof value === 'object' && 'numericVersion' in value ? ['numericVersion'] : []),
    ...(value && typeof value === 'object' && 'sourceRoles' in value ? ['sourceRoles'] : []),
    ...(value && typeof value === 'object' && 'dataPaints' in value ? ['dataPaints'] : []),
  ]);
  if ('numericVersion' in value && value.numericVersion !== 2)
    fail('Unsupported quantitative evidence calculation.');
  if ('dataPaints' in value && value.dataPaints !== 'reviewed-source-v1')
    fail('Unsupported quantitative data-paint binding.');
  boundedText(value.scaleId, 128);
  const input = readQuantitativeMatrixInput(value.input);
  if ('sourceRoles' in value) {
    record(value.sourceRoles, guidelineMatrixUseIds(input));
    Object.values(value.sourceRoles).forEach(role => boundedText(role, 128));
  }
  return freeze({ ...value, input }) as unknown as GuidelineMatrixControls;
}

/** The same set is used for source-role mapping and exact paint assignment. */
export function guidelineMatrixUseIds(input: QuantitativeMatrixInput): string[] {
  return [
    'ground',
    'text',
    ...input.bins.map((_, index) => `bin-${index + 1}`),
    ...input.evidence.steps.filter(step => step.colorId !== null).map(step => `step-${step.step}`),
    ...input.evidence.originals.map((_, index) => `original-${index + 1}`),
  ];
}

export function guidelineMatrixEvidenceAssignments(input: QuantitativeMatrixInput) {
  return [
    ...input.evidence.steps.flatMap(step =>
      step.colorId === null ? [] : [{ useId: `step-${step.step}`, colorId: step.colorId }]
    ),
    ...input.evidence.originals.map((original, index) => ({
      useId: `original-${index + 1}`,
      colorId: original.colorId,
    })),
  ];
}

/** Only data paints change during source comparison; the scale remains reference evidence. */
export function guidelineMatrixBinColorIds(
  source: ColorSystemModelV1,
  controls: GuidelineMatrixControls
): ReadonlySet<string> {
  return new Set(
    controls.dataPaints === 'reviewed-source-v1'
      ? source.colors
          .filter(color => (color.valuesByMode[controls.input.modeId]?.alpha ?? 0) > 0)
          .map(color => color.id)
      : controls.input.evidence.steps.flatMap(step => (step.colorId === null ? [] : [step.colorId]))
  );
}

/** Constructed anchor placement is never evidence of a source-declared step. */
export function guidelineMatrixDeclaredSourceSteps(
  source: ColorSystemModelV1,
  working: ColorSystemModelV1,
  controls: GuidelineMatrixControls
): readonly { step: number; colorId: string | null }[] {
  const original = source.scales.find(scale => scale.id === controls.scaleId);
  const selected = working.scales.find(scale => scale.id === controls.scaleId);
  const mode = original?.modes.find(mode => mode.modeId === controls.input.modeId);
  return controls.input.evidence.steps.map(({ step }) => {
    const slot = selected?.slots[step - 1];
    const declared = original?.slots.find(
      item => item.id === slot?.id && item.position === slot.position
    );
    return {
      step,
      colorId: mode?.anchors.find(anchor => anchor.slotId === declared?.id)?.colorId ?? null,
    };
  });
}

/** Refresh callers prove source correspondence before remapping these nested references. */
export function refreshGuidelineMatrixControls(
  value: GuidelineMatrixControls,
  modeId: string,
  scaleId: string,
  color: (id: string) => string
): GuidelineMatrixControls {
  return readGuidelineMatrixControls({
    ...value,
    scaleId,
    input: {
      ...value.input,
      modeId,
      evidence: {
        steps: value.input.evidence.steps.map(step => ({
          ...step,
          colorId: step.colorId === null ? null : color(step.colorId),
        })),
        originals: value.input.evidence.originals.map(original => ({
          ...original,
          colorId: color(original.colorId),
        })),
      },
    },
  });
}

/** Display values come from the original model; authored display strings are never evidence. */
export function guidelineMatrixSourceEvidence(
  source: ColorSystemModelV1,
  working: ColorSystemModelV1,
  scaleId: string,
  modeId: string,
  originalColorIds: readonly string[]
): QuantitativeMatrixInput['evidence'] {
  const scale = working.scales.find(item => item.id === scaleId);
  const mode = scale?.modes.find(item => item.modeId === modeId);
  if (!scale || scale.slots.length !== 12 || !mode)
    fail('Choose a scale with twelve declared slots in this mode.');
  return freeze({
    steps: scale.slots.map((slot, index) => ({
      step: index + 1,
      colorId: mode.anchors.find(anchor => anchor.slotId === slot.id)?.colorId ?? null,
    })),
    originals: originalColorIds.map(colorId => {
      const color = source.colors.find(item => item.id === colorId);
      const value = color?.valuesByMode[modeId];
      const retained = working.colors.find(item => item.id === colorId)?.valuesByMode[modeId];
      if (!color || !value || value.alpha <= 0 || canonicalJson(value) !== canonicalJson(retained))
        fail('Original evidence must retain an unchanged source color in this mode.');
      return {
        colorId,
        label: color.label,
        valueLabel: value.alpha === 1 ? value.hex : `${value.hex} / ${value.alpha}`,
      };
    }),
  });
}

/** Called after the extension has been replayed, before any application receives export authority. */
export function validateGuidelineMatrixBinding(
  source: ColorSystemModelV1,
  working: ColorSystemModelV1,
  controls: GuidelineMatrixControls,
  assignments: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly colorId: string;
  }[],
  extension: { readonly scaleId: string; readonly originalAnchorIds: readonly string[] } | null
): void {
  const { input, scaleId } = controls;
  if (extension && extension.scaleId !== scaleId)
    fail('The displayed scale must be the selected extension.');
  const allowedOriginals =
    extension?.originalAnchorIds ??
    source.scales
      .find(scale => scale.id === scaleId)
      ?.modes.find(mode => mode.modeId === input.modeId)
      ?.anchors.map(anchor => anchor.colorId) ??
    [];
  if (input.evidence.originals.some(original => !allowedOriginals.includes(original.colorId)))
    fail('Original evidence must identify an actual source anchor of the selected scale.');
  const evidence = guidelineMatrixSourceEvidence(
    source,
    working,
    scaleId,
    input.modeId,
    input.evidence.originals.map(original => original.colorId)
  );
  if (canonicalJson(evidence) !== canonicalJson(input.evidence))
    fail('Scale evidence or source labels differ from the selected source and scale.');
  const locked = new Map(
    guidelineMatrixEvidenceAssignments(input).map(item => [item.useId, item.colorId])
  );
  const binColors = guidelineMatrixBinColorIds(source, controls);
  for (const assignment of assignments) {
    if (locked.has(assignment.useId) && locked.get(assignment.useId) !== assignment.colorId)
      fail('Source and scale evidence paints are locked to their actual color references.');
    if (assignment.useId.startsWith('bin-')) {
      if (!binColors.has(assignment.colorId))
        fail(
          controls.dataPaints
            ? 'Every source-comparison bin must use an original reviewed source color.'
            : 'Every quantitative bin must use a color from the displayed scale.'
        );
      if (
        controls.dataPaints &&
        canonicalJson(
          source.colors.find(color => color.id === assignment.colorId)?.valuesByMode[input.modeId]
        ) !==
          canonicalJson(
            working.colors.find(color => color.id === assignment.colorId)?.valuesByMode[
              input.modeId
            ]
          )
      )
        fail('Source-comparison data paints must remain unchanged.');
    }
  }
  const roles = guidelineApplicationSourceRoles(source, input.contextId, input.modeId);
  if (roles.length && !controls.sourceRoles)
    fail('Map quantitative regions to source roles before checking the application.');
  for (const [useId, role] of Object.entries(controls.sourceRoles ?? {}))
    if (role !== useId && !roles.includes(role))
      fail('Choose a declared source role or the explicit structural fallback for each region.');
}
