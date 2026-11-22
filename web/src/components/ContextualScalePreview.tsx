import { useId, useState } from 'react';
import { Check, Download, Sun, Moon } from 'lucide-react';
import { Button } from './ui/button';
import { analyzeStudioContrast, getStudioTextColor, type StudioSystem } from '@/lib/teul';
import {
  chartSurfaces,
  chooseChartStep,
  keepChartChoices,
  exportChartChoices,
  type ChartChoices,
  type ChartMode,
} from '@/lib/chartChoices';
import { exampleChartStudy } from '@/lib/exampleChartStudy';
import { downloadText } from '@/lib/download';
import './ContextualScalePreview.css';

const categories = ['Search', 'Social', 'Email', 'Referral', 'Direct', 'Partners'];
const amounts = [64000, 36200, 24800, 18600, 14800, 10000];
const count = (value: number) => value.toLocaleString('en-US');

export default function ContextualScalePreview({
  system,
  choices,
  mode,
  activeIndex,
  disabled,
  onChange,
  onMode,
  onInspect,
  onError,
}: {
  system: StudioSystem;
  choices: ChartChoices;
  mode: ChartMode;
  activeIndex: number;
  disabled: boolean;
  onChange: (choices: ChartChoices) => void;
  onMode: (mode: ChartMode) => void;
  onInspect: (index: number, step: number) => void;
  onError: (message: string) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const rows = choices[mode];
  const { background, track } = chartSurfaces[mode];
  const study = [exampleChartStudy.original, exampleChartStudy.softer].some(
    colors => colors.join(',') === system.sourceColors.join(',')
  );
  const label = (index: number) =>
    study
      ? exampleChartStudy.labels[Number(system.families[index].id.split('-')[1]) - 1]
      : system.families[index].name;
  const keep = (familyIds: string[]) => {
    onChange(keepChartChoices(choices, mode, familyIds));
    setMessage(
      `${familyIds.length} ${familyIds.length === 1 ? 'choice' : 'choices'} kept for this ${mode} chart. Save the palette to retain them on this device.`
    );
  };
  function deliver(format: 'css' | 'json') {
    try {
      downloadText(
        `${system.name}-${mode}-chart`,
        exportChartChoices(system, choices, mode, format),
        format
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not export these choices.');
    }
  }
  return (
    <section className="contextual-scales" aria-labelledby={`${id}-heading`}>
      <div className="contextual-heading">
        <div>
          <h2 id={`${id}-heading`}>Choose colors in context</h2>
          <p>
            Click a chart color, then try a numbered shade. Keep individual choices or select
            several.
          </p>
        </div>
        <div className="mode-switch" role="group" aria-label="Chart mode">
          <Button
            size="icon-sm"
            variant={mode === 'light' ? 'secondary' : 'ghost'}
            aria-label="Chart light mode"
            aria-pressed={mode === 'light'}
            onClick={() => onMode('light')}
          >
            <Sun size={15} />
          </Button>
          <Button
            size="icon-sm"
            variant={mode === 'dark' ? 'secondary' : 'ghost'}
            aria-label="Chart dark mode"
            aria-pressed={mode === 'dark'}
            onClick={() => onMode('dark')}
          >
            <Moon size={15} />
          </Button>
        </div>
      </div>
      <div className="contextual-workbench">
        <article
          className="context-chart"
          data-mode={mode}
          style={{ background }}
          aria-label="Interactive example chart"
        >
          <h3>Visits by channel</h3>
          <p className="context-chart-period">September · Illustrative data</p>
          <p className="context-chart-total">
            {count(amounts.slice(0, rows.length).reduce((a, b) => a + b, 0))}
          </p>
          <p className="context-chart-period">Total visits</p>
          <ul>
            {rows.map((row, index) => {
              const hex = system.families[index][mode][row.step - 1];
              return (
                <li key={row.familyId}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="context-chart-mark"
                    aria-pressed={activeIndex === index}
                    aria-label={`Inspect ${label(index)} for ${categories[index]}`}
                    onClick={() => onInspect(index, row.step - 1)}
                  >
                    <span className="context-chart-label">
                      <span>{categories[index]}</span>
                      <span>{count(amounts[index])}</span>
                    </span>
                    <span className="context-chart-track" style={{ background: track }}>
                      <span
                        data-chart-family={row.familyId}
                        style={{
                          width: `${(amounts[index] / amounts[0]) * 100}%`,
                          background: hex,
                        }}
                      />
                    </span>
                    <span className="context-chart-meta">
                      <span>
                        {label(index)} · {row.step}
                      </span>
                      <span>{row.kept ? 'Kept' : 'Draft'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </article>
        <div className="context-scale-inspector">
          <div className="context-scale-heading">
            <h3>{system.method === 'radix' ? 'Exact Radix scales' : 'Teul 12-step scales'}</h3>
            <span>{mode === 'light' ? 'Light' : 'Dark'} mode</span>
          </div>
          <p className="contextual-note">
            {system.method === 'radix'
              ? 'Published Radix values. Choose any step for this chart.'
              : 'Custom scales · originals stay at 9. These are not published Radix colors.'}
          </p>
          {rows.map((row, index) => {
            const family = system.families[index];
            const hex = family[mode][row.step - 1];
            const contrast = analyzeStudioContrast(hex, track).wcag.ratio;
            return (
              <div
                className="context-scale-row"
                data-active={activeIndex === index}
                key={family.id}
              >
                <div className="context-scale-label">
                  <label>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.includes(family.id)}
                      aria-label={`Select ${label(index)} for batch decision`}
                      onChange={event =>
                        setSelected(previous =>
                          event.target.checked
                            ? [...previous, family.id]
                            : previous.filter(item => item !== family.id)
                        )
                      }
                    />
                    <span>{label(index)}</span>
                  </label>
                  <code>{hex}</code>
                </div>
                <div
                  className="context-scale-steps"
                  role="group"
                  aria-label={`${label(index)} chart shades`}
                >
                  {family[mode].map((value, step) => (
                    <button
                      type="button"
                      key={step}
                      disabled={disabled}
                      aria-pressed={row.step === step + 1}
                      aria-label={`${label(index)} chart step ${step + 1}: ${value}`}
                      style={{ background: value, color: getStudioTextColor(value) }}
                      onClick={() => {
                        onChange(chooseChartStep(choices, mode, family.id, step + 1));
                        onInspect(index, step);
                        setMessage(`${label(index)} now uses step ${step + 1}.`);
                      }}
                    >
                      {step + 1}
                    </button>
                  ))}
                </div>
                <div className="context-scale-status">
                  <span className={contrast < 3 ? 'context-low-contrast' : ''}>
                    {contrast.toFixed(2)}:1 on track{contrast < 3 ? ' · below 3:1' : ''}
                  </span>
                  <Button
                    size="sm"
                    variant={row.kept ? 'secondary' : 'ghost'}
                    disabled={disabled}
                    aria-label={`${row.kept ? 'Unkeep' : 'Keep'} ${label(index)} step ${row.step}`}
                    onClick={() =>
                      row.kept
                        ? onChange(keepChartChoices(choices, mode, [family.id], false))
                        : keep([family.id])
                    }
                  >
                    {row.kept && <Check size={13} />} {row.kept ? 'Kept' : 'Keep this'}
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="context-batch">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || !selected.length}
              onClick={() => keep(selected)}
            >
              Keep selected ({selected.length})
            </Button>
            <span>
              {rows.filter(row => row.kept).length} of {rows.length} kept
            </span>
          </div>
        </div>
      </div>
      <div className="contextual-footer">
        <p className="contextual-note">
          Keep records your choice for this chart. Contrast is separate; labels and values stay
          visible. Save retains both modes.
        </p>
        <div>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => deliver('css')}>
            <Download size={14} />
            Chart CSS
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => deliver('json')}>
            Chart JSON
          </Button>
        </div>
      </div>
      {study && <p className="contextual-note">{exampleChartStudy.disclosure}</p>}
      <p className="contextual-message" role="status">
        {message}
      </p>
    </section>
  );
}
