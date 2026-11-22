import { sourceSetPdf, sourceSetPdfRevision } from './source-set-fixture';
import {
  previewGuidelineExtension,
  type GuidelineExtensionRequest,
} from '../../src/lib/guideline/extension';

/** Public synthetic reliability cases; no design-quality or held-out evaluation. */
export async function constructionPortabilityCases(portable = false, stress = false) {
  const cases = [];
  const inputs = [
    ['neutral', '#777777'],
    ['near-neutral', '#777778'],
    ['chromatic', '#126E78'],
    ['warm', '#EF4B00'],
    ['black', '#000000'],
    ['white', '#FFFFFF'],
  ];
  if (stress) {
    for (let i = 0; i < 48; i++)
      inputs.push([`sample-${i}`, `#${((i * 2654435761) >>> 8).toString(16).padStart(6, '0')}`]);
    for (const [i, delta] of ['0.5001', '0.50001', '0.500001', '0.5000001', '0.50000001'].entries())
      inputs.push([`native-near-neutral-${i}`, `color(srgb 0.5 0.5 ${delta})`]);
    for (const base of ['0.1', '0.2', '0.3', '0.4', '0.6', '0.7', '0.8', '0.9']) {
      for (const delta of [0.00001, 0.000001, 0.0000001])
        inputs.push([
          `native-gray-${base}-${delta}`,
          `color(srgb ${base} ${base} ${Number(base) + delta})`,
        ]);
    }
    for (const b of ['0.5000003179272484', '0.5000003179272485', '0.5000003179272486'])
      inputs.push([`cutoff-${b}`, `color(srgb 0.5 0.5 ${b})`]);
    inputs.push(['native', 'color(srgb 0.123456789012345 0.345678901234567 0.567890123456789)']);
  }
  for (const [name, hex] of inputs) {
    const project = sourceSetPdf(`Runtime ${name}`, hex),
      review = project.review!;
    const modeId = review.model.contexts.find(c => c.id === 'brand')!.modeIds[0];
    const anchor = review.model.colors.find(c => c.label === 'Blue')!;
    const family = review.model.families.find(f => f.colorIds.includes(anchor.id))!;
    const requests: GuidelineExtensionRequest[] = [
      {
        context: 'brand',
        modeId,
        scaleId: review.model.scales[0].id,
        additions: [{ slotId: 'middle', position: 1 }],
        lightnessOrder: 'none',
      },
      {
        kind: 'new-scale',
        context: 'brand',
        modeId,
        scaleId: `new:${name}`,
        familyId: family.id,
        anchorColorId: anchor.id,
        label: `Runtime ${name}`,
        polarity: 'light',
      },
    ];
    if (stress)
      requests.push({
        ...requests[1],
        kind: 'new-scale',
        polarity: 'dark',
      } as GuidelineExtensionRequest);
    for (const original of requests) {
      const request = portable ? { ...original, numericVersion: 2 as const } : original;
      const preview = await previewGuidelineExtension(review, request);
      cases.push({
        name: `${name}:${'kind' in request ? (request.polarity === 'dark' ? 'new-dark' : 'new') : 'interior'}`,
        request,
        preview,
      });
    }
  }
  if (stress)
    for (const channel of ['0.20000226657329674', '0.20000226657329675', '0.20000226657329678']) {
      const project = sourceSetPdfRevision(
        sourceSetPdf('Public fallback threshold', 'color(srgb .2 .2 .2)'),
        { color: [1, `color(srgb ${channel} .2 .2)`] }
      );
      const review = project.review!;
      const request: GuidelineExtensionRequest = {
        ...(portable ? { numericVersion: 2 as const } : {}),
        context: 'brand',
        modeId: review.model.modes[0].id,
        scaleId: review.model.scales[0].id,
        additions: [{ slotId: 'middle', position: 1 }],
        lightnessOrder: 'none',
      };
      cases.push({
        name: `fallback-${channel}:interior`,
        request,
        preview: await previewGuidelineExtension(review, request),
      });
    }
  if (stress)
    for (const channel of ['0.09999999999646996', '0.09999999999646997', '0.09999999999646998']) {
      const project = sourceSetPdfRevision(
        sourceSetPdf('Public lightness threshold', 'color(srgb .1 .1 .1)'),
        { color: [1, `color(srgb ${channel} .1 .1)`] }
      );
      const review = project.review!;
      const request: GuidelineExtensionRequest = {
        ...(portable ? { numericVersion: 2 as const } : {}),
        context: 'brand',
        modeId: review.model.modes[0].id,
        scaleId: review.model.scales[0].id,
        additions: [{ slotId: 'middle', position: 1e-6 }],
        lightnessOrder: 'increasing',
      };
      cases.push({
        name: `order-${channel}:interior`,
        request,
        preview: await previewGuidelineExtension(review, request),
      });
    }
  return cases;
}
