import type { GuidelineApplicationDraft } from '../lib/guideline/applicationDraft';

type Panel = NonNullable<GuidelineApplicationDraft['panel']>;
export function GuidelinePanelControls({
  value,
  sourceRoles,
  onChange,
}: {
  value: Panel;
  sourceRoles: readonly string[];
  onChange: (value: Panel) => void;
}) {
  return (
    <>
      <label className="guideline-panel-copy">
        Panel heading
        <textarea
          aria-label="Panel heading"
          maxLength={256}
          value={value.heading}
          onChange={event => onChange({ ...value, heading: event.target.value })}
        />
      </label>
      <label className="guideline-panel-copy">
        Panel body
        <textarea
          aria-label="Panel body"
          maxLength={256}
          value={value.body}
          onChange={event => onChange({ ...value, body: event.target.value })}
        />
      </label>
      {(['width', 'height'] as const).map(dimension => (
        <label key={dimension}>
          Panel {dimension} · {value[dimension]} px
          <input
            aria-label={`Panel ${dimension}`}
            type="range"
            min={dimension === 'width' ? 240 : 160}
            max={dimension === 'width' ? 1200 : 1600}
            step={1}
            value={value[dimension]}
            onChange={event => onChange({ ...value, [dimension]: Number(event.target.value) })}
          />
        </label>
      ))}
      <p className="guideline-muted guideline-panel-note">
        Geist text outlines, with fixed heading and body sizes. This previews your copy and colors;
        it does not reproduce the source typography. Complete text must fit the panel.
      </p>
      <label>
        <input
          type="checkbox"
          checked={!!value.sourceRoles || sourceRoles.length > 0}
          disabled={sourceRoles.length > 0}
          onChange={event => {
            const { sourceRoles: _roles, ...rest } = value;
            onChange(
              event.target.checked
                ? { ...rest, sourceRoles: { ground: '', heading: '', body: '' } }
                : rest
            );
          }}
        />{' '}
        Map panel regions to guideline roles
      </label>
      {(value.sourceRoles || sourceRoles.length > 0) && (
        <>
          <p className="guideline-muted guideline-panel-note">
            Choose the source role that each region serves. These choices determine which source
            rules apply. Use its structural role only when the guideline does not name that region.
          </p>
          {(['ground', 'heading', 'body'] as const).map((region, index) => (
            <label key={region}>
              {region === 'ground' ? 'Canvas' : region} source role
              <select
                aria-label={`Panel ${region} source role`}
                value={value.sourceRoles?.[region] ?? ''}
                onChange={event =>
                  onChange({
                    ...value,
                    sourceRoles: {
                      ground: '',
                      heading: '',
                      body: '',
                      ...value.sourceRoles,
                      [region]: event.target.value,
                    },
                  })
                }
              >
                <option value="">Choose the region's role</option>
                {value.sourceRoles?.[region] &&
                  !sourceRoles.includes(value.sourceRoles[region]) &&
                  value.sourceRoles[region] !== ['ground', 'text-1', 'text-2'][index] && (
                    <option value={value.sourceRoles[region]}>
                      Unavailable saved role · {value.sourceRoles[region]}
                    </option>
                  )}
                {sourceRoles.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
                {!sourceRoles.includes(['ground', 'text-1', 'text-2'][index]) && (
                  <option value={['ground', 'text-1', 'text-2'][index]}>
                    No named source role · {['ground', 'text-1', 'text-2'][index]}
                  </option>
                )}
              </select>
            </label>
          ))}
        </>
      )}
    </>
  );
}
