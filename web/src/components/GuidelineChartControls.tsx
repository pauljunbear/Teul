import type { GuidelineChartControls as Controls } from '../lib/guideline/chartGeometry';

export function GuidelineChartControls({
  value,
  onChange,
}: {
  value: Controls;
  onChange: (value: Controls) => void;
}) {
  return (
    <>
      <label>
        Chart meaning
        <select
          aria-label="Chart meaning"
          value={value.meaning}
          onChange={e => {
            const meaning = e.target.value as Controls['meaning'];
            onChange({
              ...value,
              meaning,
              count: Math.max(value.count, meaning === 'categorical' ? 2 : 3),
              direction: meaning === 'sequential' ? 'light-to-dark' : null,
            });
          }}
        >
          <option value="categorical">Categories · labeled bars</option>
          <option value="sequential">Ordered quantities · labeled tiles</option>
        </select>
      </label>
      <label>
        {value.meaning === 'categorical' ? 'Categories' : 'Levels'}
        <select
          aria-label="Chart count"
          value={value.count}
          onChange={e => onChange({ ...value, count: Number(e.target.value) })}
        >
          {Array.from(
            { length: value.meaning === 'categorical' ? 8 : 7 },
            (_, i) => i + (value.meaning === 'categorical' ? 2 : 3)
          ).map(n => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {value.meaning === 'sequential' && (
        <label>
          As quantities increase
          <select
            aria-label="Sequential lightness direction"
            value={value.direction!}
            onChange={e =>
              onChange({ ...value, direction: e.target.value as Controls['direction'] })
            }
          >
            <option value="light-to-dark">Light to dark</option>
            <option value="dark-to-light">Dark to light</option>
          </select>
        </label>
      )}
    </>
  );
}
