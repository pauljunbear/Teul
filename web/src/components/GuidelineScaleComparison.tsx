import type { ColorSystemConstructedScaleV1 } from '../../../src/lib/colorSystemConstructionV1';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import './GuidelineColorComparison.css';

export function GuidelineScaleComparison({ scale }: { scale: ColorSystemConstructedScaleV1 }) {
  return (
    <details className="guideline-scale-comparison">
      <summary>Compare original and proposed steps</summary>
      <p className="guideline-muted">
        Original colors stay exact. Undefined steps have no source value; their proposed shades are
        additions. Rounded hex labels use ≈; expand Exact CSS for full precision. Swatches and
        exports retain the full values. This view does not assign product roles or certify contrast.
      </p>
      <table>
        <caption>Original and proposed scale values</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Original</th>
            <th scope="col">Proposal</th>
          </tr>
        </thead>
        <tbody>
          {scale.members.map(member => {
            const css = colorSystemSrgbToCssV1(member.value);
            const native = member.value.representation?.kind === 'native-srgb';
            const label = native ? `≈ ${member.value.hex}` : css;
            return (
              <tr key={member.slotId} data-comparison-slot={member.slotId}>
                <th scope="row">{member.slotId}</th>
                <td data-comparison-paint="source">
                  {member.origin.kind === 'source' ? (
                    <>
                      <div
                        className="guideline-comparison-chip"
                        style={{ background: css }}
                        aria-hidden="true"
                      />
                      <code>{label}</code>
                    </>
                  ) : (
                    <span className="guideline-muted">Undefined</span>
                  )}
                </td>
                <td data-comparison-paint="proposal">
                  <div
                    className="guideline-comparison-chip"
                    style={{ background: css }}
                    aria-hidden="true"
                  />
                  <code>{label}</code>
                  <span>{member.origin.kind === 'source' ? 'Unchanged' : 'Added'}</span>
                  {native && (
                    <details className="guideline-comparison-exact">
                      <summary>Exact CSS</summary>
                      <code>{css}</code>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
