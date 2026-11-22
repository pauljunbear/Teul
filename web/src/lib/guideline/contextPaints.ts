import {
  colorSystemContextPaintIdV1,
  readColorSystemContextPaintsInputV1,
  type ColorSystemContextPaintsInputV1,
} from '../../../../src/lib/colorSystemContextPaintsV1';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';

export type GuidelineContextPaints = ColorSystemContextPaintsInputV1;
export const readGuidelineContextPaints = (raw: unknown) =>
  freeze(readColorSystemContextPaintsInputV1(raw));

/** Inactive modes remain in controls; each assessed application binds its own mode. */
export function guidelineContextPaintsForMode(
  input: GuidelineContextPaints | undefined,
  modeId: string
) {
  if (!input) return undefined;
  const checked = readGuidelineContextPaints(input);
  const paints = checked.paints.filter(paint => paint.modeId === modeId);
  return paints.length ? freeze({ ...checked, paints }) : undefined;
}
export function guidelineContextPaintChoices(input: GuidelineContextPaints | undefined) {
  return input
    ? input.paints.map(paint => ({
        id: colorSystemContextPaintIdV1(input.id, paint.id),
        label: paint.label,
        role: paint.role,
        modeId: paint.modeId,
        valuesByMode: { [paint.modeId]: paint.value },
      }))
    : [];
}
export { colorSystemContextPaintAllowsRoleV1 as guidelineContextPaintAllowsRole } from '../../../../src/lib/colorSystemContextPaintsV1';

/** Mode correspondence is established by the existing refresh dependency check first. */
export function refreshGuidelineContextPaints(
  input: GuidelineContextPaints,
  previousMode: string,
  modeId: string
) {
  return readGuidelineContextPaints({
    ...input,
    paints: input.paints.map(paint =>
      paint.modeId === previousMode ? { ...paint, modeId } : paint
    ),
  });
}
