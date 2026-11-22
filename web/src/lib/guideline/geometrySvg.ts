import { serializeGradientSvgV1 } from '../../../../src/lib/colorSystemGradientPaintV1';
import { isNativeLinearPaintV1 } from '../../../../src/lib/colorSystemFinalGradientPaintV1';
import { serializeNativeGradientSvgV1 } from '../../../../src/lib/colorSystemNativeGradientGeometryV1';
import { guidelineHash } from './review';
import { assertXmlText } from '../../../../src/lib/xmlText';
/** Serialize already-assessed geometry. This finite renderer does not authorize delivery. */
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import type {
  ColorSystemApplicationGeometryAssessmentV1,
  ColorSystemApplicationGeometryNodeV1,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';
import { colorSystemSrgbToCssV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { colorSystemValueNoticesV1 } from '../../../../src/lib/colorSystemValueProvenanceV1';

export function serializeGuidelineGeometrySvgs(
  model: ColorSystemModelV1,
  assessment: ColorSystemApplicationGeometryAssessmentV1,
  titlePrefix: string,
  notes: readonly string[]
): readonly { applicationId: string; svg: string }[] {
  const escape = (value: string) => {
    assertXmlText(value);
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  };
  return assessment.plan.boards.map(board => {
    const application = assessment.applications.find(item => item.id === board.applicationId)!;
    const nodes = new Map<string, ColorSystemApplicationGeometryNodeV1>();
    const collect = (item: ColorSystemApplicationGeometryNodeV1) => {
      nodes.set(item.id, item);
      item.children.forEach(collect);
    };
    collect(board.root);
    const paths = assessment.regions
      .filter(region => region.applicationId === board.applicationId)
      .map(region => {
        const gradient = application.gradients?.find(item => item.id === region.useId);
        if (gradient) {
          const bounds = region.bounds;
          const id = `teul-${guidelineHash([assessment.geometryHash, board.applicationId, region.nodeId]).slice(7, 39)}`;
          const title = nodes.get(region.nodeId)?.textAlternative ?? 'Decorative gradient';
          assertXmlText(title);
          const svg = isNativeLinearPaintV1(gradient.paint)
            ? serializeNativeGradientSvgV1(gradient.paint.paint, bounds.width, bounds.height, {
                gradientId: id,
                label: title,
                description: 'Native paint with authored geometry and explicit sRGB interpolation.',
                nativeEdit: true,
              })
            : serializeGradientSvgV1(gradient.paint, bounds.width, bounds.height, id).replace(
                '</svg>',
                `<title>${escape(title)}</title></svg>`
              );
          return svg.replace('<svg ', `<svg x="${bounds.x}" y="${bounds.y}" `);
        }
        const use = application.uses.find(item => item.id === region.useId)!;
        const color = model.colors.find(item => item.id === use.colorId)!;
        const title = nodes.get(region.nodeId)?.textAlternative ?? region.useId;
        return `<path d="${region.svgPath}" fill="${colorSystemSrgbToCssV1(color.valuesByMode[application.modeId])}" fill-rule="evenodd"><title>${escape(title)}</title></path>`;
      })
      .join('');
    return {
      applicationId: board.applicationId,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${board.width}" height="${board.height}" viewBox="0 0 ${board.width} ${board.height}" role="img"><title>${escape(`${titlePrefix}: ${board.applicationId}`)}</title><desc>${escape(
        [
          ...notes,
          ...colorSystemValueNoticesV1(model, [
            ...application.uses.map(use => use.colorId),
            ...(application.gradients ?? []).flatMap(use =>
              use.paint.stops.flatMap(stop => (stop.sourceColorId ? [stop.sourceColorId] : []))
            ),
          ]),
        ].join(' ')
      )}</desc>${paths}</svg>`,
    };
  });
}
