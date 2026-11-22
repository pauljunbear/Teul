import type { ColorSystemModelV1 } from '../../../src/lib/colorSystemModelV1';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import {
  guidelineMatrixDeclaredSourceSteps,
  type GuidelineMatrixControls,
} from '../lib/guideline/quantitativeMatrixBinding';

export function GuidelineMatrixComparisonEvidence({
  source,
  working,
  controls,
}: {
  source: ColorSystemModelV1;
  working: ColorSystemModelV1;
  controls: GuidelineMatrixControls;
}) {
  const originals = guidelineMatrixDeclaredSourceSteps(source, working, controls);
  const value = (model: ColorSystemModelV1, colorId: string | null) => {
    const color = model.colors.find(item => item.id === colorId);
    const paint = color?.valuesByMode[controls.input.modeId];
    if (!paint) return <span className="guideline-muted">Not declared</span>;
    const css = colorSystemSrgbToCssV1(paint);
    return (
      <>
        <span
          className="guideline-comparison-chip"
          style={{ background: css }}
          aria-hidden="true"
        />
        <code>{css}</code>
      </>
    );
  };
  return (
    <details className="guideline-scale-comparison">
      <summary>Compare source-declared and selected scale steps</summary>
      <p className="guideline-muted">
        Only slots declared by the imported source appear in the source column. A new scale has no
        source-declared steps; its original anchor remains separate evidence in the chart. Choosing
        source data colors does not change either reference column.
      </p>
      <table>
        <caption>Source-declared and selected scale values</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Source-declared</th>
            <th scope="col">Selected scale</th>
          </tr>
        </thead>
        <tbody>
          {controls.input.evidence.steps.map((step, index) => (
            <tr key={step.step}>
              <th scope="row">{step.step}</th>
              <td>{value(source, originals[index].colorId)}</td>
              <td>{value(working, step.colorId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
