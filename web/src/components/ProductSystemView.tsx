import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Copy, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import type {
  StudioApplicationPaints,
  StudioAuthoringDirection,
  StudioAuthoringResult,
} from '@/lib/authoring';
import { getStudioTextColor } from '@/lib/teul';
import { downloadText } from '@/lib/download';
import './ProductSystemView.css';

function paintStyle(paints: StudioApplicationPaints): CSSProperties {
  return {
    '--paint-rest': paints.css.rest,
    '--paint-hover': paints.css.hover,
    '--paint-pressed': paints.css.pressed,
    '--paint-label': paints.css.restLabel,
    '--paint-hover-label': paints.css.hoverLabel,
    '--paint-pressed-label': paints.css.pressedLabel,
    '--paint-focus': paints.css.focusRing,
  } as CSSProperties;
}

function ApplicationCanvas({
  direction,
  mode,
}: {
  direction: StudioAuthoringDirection;
  mode: 'light' | 'dark';
}) {
  const { control, link, selected } = direction.modes[mode];
  return (
    <section
      className="product-canvas"
      data-mode={mode}
      style={{ background: control.css.ground, color: control.css.focusRing }}
      aria-label={`${mode} product preview`}
    >
      <span className="product-mode-label">{mode === 'light' ? 'Light mode' : 'Dark mode'}</span>
      <h3>A place for your next idea.</h3>
      <p>Bring your work together. Give it room to grow.</p>
      <div className="product-demo-actions">
        <button
          className="product-demo-button"
          data-paint="control.rest"
          style={paintStyle(control)}
        >
          Create project
        </button>
        <button className="product-demo-link" data-paint="link.rest" style={paintStyle(link)}>
          View projects <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="product-demo-selection">
        <button
          className="product-demo-button product-demo-selected"
          aria-pressed="true"
          data-paint="selected.rest"
          style={paintStyle(selected)}
        >
          <Check size={15} /> Team workspace
        </button>
        <button
          disabled
          style={{
            background: control.css.disabledGround ?? control.css.ground,
            color: control.css.disabledText,
            borderColor: control.css.disabledBoundary ?? 'transparent',
          }}
        >
          Archived project
        </button>
      </div>
    </section>
  );
}

function StateSamples({
  paints,
  label,
  kind,
}: {
  paints: StudioApplicationPaints;
  label: string;
  kind: 'control' | 'link' | 'selected';
}) {
  const css = paints.css;
  const states = [
    { name: 'Rest', fill: css.rest, text: css.restLabel, hex: paints.rest },
    { name: 'Hover', fill: css.hover, text: css.hoverLabel, hex: paints.hover },
    { name: 'Pressed', fill: css.pressed, text: css.pressedLabel, hex: paints.pressed },
    { name: 'Focus', fill: css.rest, text: css.restLabel, hex: paints.rest },
    {
      name: 'Disabled',
      fill: css.disabledGround ?? css.ground,
      text: css.disabledText,
      hex: kind === 'link' ? paints.disabledText : (paints.disabledGround ?? paints.ground),
    },
  ];
  return (
    <div className="product-state-row">
      <h4>{label}</h4>
      <div className="product-state-samples">
        {states.map(state => (
          <div key={state.name} className="product-state-cell">
            <span className="product-state-name">{state.name}</span>
            <span
              className={`product-state-example ${kind === 'link' ? 'as-link' : ''}`}
              data-state={`${kind}.${state.name.toLowerCase()}`}
              style={{
                background: kind === 'link' ? css.ground : state.fill,
                color:
                  kind === 'link' && state.name !== 'Disabled'
                    ? state.fill
                    : (state.text ?? css.focusRing),
                outline: state.name === 'Focus' ? `2px solid ${css.focusRing}` : undefined,
                outlineOffset: 2,
                borderColor:
                  state.name === 'Disabled'
                    ? (css.disabledBoundary ?? 'transparent')
                    : 'transparent',
              }}
            >
              {kind === 'selected' && <Check size={12} />}{' '}
              {kind === 'link' ? 'View project' : kind === 'selected' ? 'Selected' : 'Create'}
            </span>
            <code>{state.hex}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductSystemView({
  result,
  selected,
  busy,
  dirty,
  onSelect,
  onCopy,
  onError,
  onNotice,
}: {
  result: StudioAuthoringResult | null;
  selected: StudioAuthoringDirection | null;
  busy: boolean;
  dirty: boolean;
  onSelect: (id: string) => void;
  onCopy: (text: string, message?: string) => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [format, setFormat] = useState<'css' | 'json' | 'recipe'>('css');
  const [exporting, setExporting] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => {
    exportController.current?.abort();
    return () => exportController.current?.abort();
  }, [selected, busy, dirty]);

  async function deliver(copy: boolean) {
    if (!selected || !result || dirty || busy || exporting) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    try {
      const engine = await import('@/lib/authoring');
      if (controller.signal.aborted) return;
      const output = await engine.exportStudioAuthoring(selected.recipe, controller.signal);
      if (controller.signal.aborted) return;
      const text =
        format === 'css' ? output.cssText : format === 'json' ? output.dtcgJson : output.recipeJson;
      if (copy) await onCopy(text);
      else {
        downloadText(result.settings.name, text, format === 'recipe' ? 'recipe.json' : format);
        onNotice('Selected product system downloaded');
      }
    } catch (error) {
      if (!controller.signal.aborted)
        onError(error instanceof Error ? error.message : 'Could not export this system.');
    } finally {
      if (exportController.current === controller) setExporting(false);
    }
  }

  if (!result)
    return (
      <div className="empty-state">
        <LoaderCircle className={busy ? 'spin' : ''} size={28} />
        <p>
          {busy
            ? 'Building complete light and dark applications.'
            : 'Choose your colors and generate a product system.'}
        </p>
      </div>
    );
  if (!selected)
    return (
      <div className="product-blocked" role="status">
        <h3>No complete direction passed.</h3>
        <p>Try another accent or allow flexible controls.</p>
        {result.diagnostics.slice(0, 3).map((message, index) => (
          <p key={index}>{message}</p>
        ))}
      </div>
    );
  return (
    <div className="product-result" data-recipe={selected.contentHash}>
      <div className="product-sources" aria-label="Preserved source colors">
        {result.sourceRoles.map(role => (
          <button
            key={role.index}
            onClick={() => void onCopy(role.hex, `${role.hex} copied`)}
            style={{ background: role.hex, color: getStudioTextColor(role.hex) }}
            aria-label={`Copy original color ${role.hex}`}
          >
            <span>
              {role.index === result.settings.anchorIndex
                ? 'Accent'
                : role.role === 'accent'
                  ? 'Companion'
                  : role.role}
            </span>
            <strong>{role.hex}</strong>
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h2>Choose a direction</h2>
        <span>
          {result.directions.length} complete{' '}
          {result.directions.length === 1 ? 'direction' : 'directions'}
        </span>
      </div>
      <div className="product-directions" aria-label="Product directions">
        {result.directions.map(direction => (
          <button
            key={direction.id}
            disabled={busy || dirty}
            aria-pressed={selected.id === direction.id}
            onClick={() => onSelect(direction.id)}
            className="product-direction"
          >
            <div
              className="direction-specimen"
              style={{ background: direction.modes.light.control.css.ground }}
            >
              <span
                style={{
                  background: direction.modes.light.control.css.rest,
                  color: direction.modes.light.control.css.restLabel ?? undefined,
                }}
              >
                Create
              </span>
              <span
                style={{
                  background: direction.modes.dark.control.css.ground,
                  color: direction.modes.dark.link.css.rest,
                }}
              >
                Aa
              </span>
            </div>
            <strong>
              {direction.label}
              {selected.id === direction.id && <Check size={14} />}
            </strong>
            <p>{direction.description}</p>
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h2>See it in use</h2>
        <span>Try hover, press, and keyboard focus</span>
      </div>
      <div className="product-preview-grid">
        <ApplicationCanvas direction={selected} mode="light" />
        <ApplicationCanvas direction={selected} mode="dark" />
      </div>
      <div className="product-proof">
        <Check size={15} />
        <span>{selected.requiredPairs} required color-pair checks pass across both modes.</span>
      </div>
      <p className="fine-print">
        Buttons, links, and selected controls include rest, hover, pressed, focus, and disabled
        states. Disabled controls are shown separately; color checks do not certify a finished
        product.
      </p>
      <details className="product-inspection">
        <summary>Inspect interaction states and contrast</summary>
        {(['light', 'dark'] as const).map(mode => (
          <section
            key={mode}
            className="product-state-panel"
            style={{
              background: selected.modes[mode].control.css.ground,
              color: selected.modes[mode].control.css.focusRing,
            }}
          >
            <h3>{mode === 'light' ? 'Light mode' : 'Dark mode'}</h3>
            <StateSamples paints={selected.modes[mode].control} label="Button" kind="control" />
            <StateSamples paints={selected.modes[mode].link} label="Text link" kind="link" />
            <StateSamples
              paints={selected.modes[mode].selected}
              label="Selected control"
              kind="selected"
            />
            <p className="product-measured">
              Button text:{' '}
              {selected.modes[mode].control.pairs
                .find(pair => pair.pairId === 'rest-label:on:rest')
                ?.ratio?.toFixed(2)}
              :1 · Link text:{' '}
              {selected.modes[mode].link.pairs
                .find(pair => pair.pairId === 'rest:on:ground')
                ?.ratio?.toFixed(2)}
              :1
            </p>
          </section>
        ))}
      </details>
      <details className="product-inspection">
        <summary>Inspect the generated scales</summary>
        {selected.scales.map(scale => (
          <div key={scale.id} className="product-scale">
            <h3>{scale.name}</h3>
            {(['light', 'dark'] as const).map(mode => (
              <div key={mode}>
                <span>{mode}</span>
                <div className="scale-grid">
                  {scale[mode].map((hex, i) => (
                    <button
                      key={i}
                      className="scale-step"
                      aria-label={`Copy ${scale.name} ${mode} step ${i + 1}: ${hex}`}
                      onClick={() => void onCopy(hex, `${hex} copied`)}
                    >
                      <span
                        className="step-color"
                        style={{
                          background: (mode === 'light' ? scale.lightCss : scale.darkCss)[i],
                        }}
                      />
                      <span className="step-number">{i + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </details>
      <div className="export-bar">
        <div>
          <h2>Export this direction</h2>
          <p>Semantic tokens for the exact states above, in both modes.</p>
        </div>
        <div className="export-actions">
          <select
            className="select-control"
            aria-label="Product export format"
            value={format}
            onChange={event => setFormat(event.target.value as typeof format)}
          >
            <option value="css">Semantic CSS</option>
            <option value="json">Design tokens JSON</option>
            <option value="recipe">Portable recipe</option>
          </select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy product export"
            disabled={busy || dirty || exporting}
            onClick={() => void deliver(true)}
          >
            <Copy size={15} />
          </Button>
          <Button disabled={busy || dirty || exporting} onClick={() => void deliver(false)}>
            {exporting ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ArrowDownToLine size={15} />
            )}
            Download
          </Button>
        </div>
      </div>
      <details className="source-details">
        <summary>Sources and scope</summary>
        <p>
          Every supplied color remains in the recipe. Teul generates scale steps around the chosen
          accent and tests complete applications. Other source colors remain companions for further
          exploration.
        </p>
        <p>
          Supporting neutrals use published Radix values selected by your neutral preference. These
          are proposed product roles; no brand guidelines or brand approval are inferred.
        </p>
        <p>
          Review the visual direction in your own product before adopting it. This recipe covers
          buttons, links, and selected controls; it does not supply chart or status palettes.
        </p>
      </details>
    </div>
  );
}
