// Local-only proof. Raw captures stay in an ignored folder; stdout contains counts/hashes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createServer } from 'vite';

const [source, pages] = process.argv.slice(2);
if (!source || !pages)
  throw new Error('Usage: node scripts/guideline-proof.mjs <PDF path> <pages,comma,separated>');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { openGuidelinePdf, capturePdfPages } = await server.ssrLoadModule(
    '/src/lib/guideline/pdf.ts'
  );
  const { suggestGuidelineReview, compileGuidelineReview, guidelineOperationIssues } =
    await server.ssrLoadModule('/src/lib/guideline/review.ts');
  const start = performance.now();
  const pdf = await openGuidelinePdf(
    new Uint8Array(await readFile(resolve(source))),
    basename(source)
  );
  try {
    const capture = await capturePdfPages(pdf, pages.split(',').map(Number));
    const output = resolve('../release/guideline-proof');
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, 'capture.json'), JSON.stringify(capture, null, 2));
    let modelProof = null;
    if (capture.observations.some(item => item.kind === 'color')) {
      const review = compileGuidelineReview(capture, suggestGuidelineReview(capture), {
        kind: 'agent',
        ref: 'local:extraction-proof',
      });
      await writeFile(resolve(output, 'review.json'), JSON.stringify(review, null, 2));
      modelProof = {
        modelHash: review.model.modelHash,
        colors: review.model.colors.length,
        reviewPrompts: review.model.claims.length,
        gradientBlockers: guidelineOperationIssues(review, 'gradient', 'brand').length,
        scope:
          'Evidence/model proof; interpretations unresolved, no human approval or source-conformance claim',
      };
    }
    console.log(
      JSON.stringify(
        {
          sha256: pdf.sha256,
          pages: pdf.pageCount,
          requested: capture.scope.requested,
          inspected: capture.scope.inspected,
          gaps: capture.scope.gaps.map(gap => gap.code),
          exactCodes: capture.observations.filter(item => item.kind === 'color').length,
          textItems: capture.observations.filter(item => item.kind === 'text').length,
          durationMs: Math.round(performance.now() - start),
          captureHash: capture.captureHash,
          modelProof,
        },
        null,
        2
      )
    );
  } finally {
    await pdf.close();
  }
} finally {
  await server.close();
}
