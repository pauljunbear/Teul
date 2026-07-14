import * as React from 'react';
import {
  DEFAULT_BASELINE_COLOR,
  DEFAULT_COLUMN_COLOR,
  DEFAULT_ROW_COLOR,
  type GridAlignment,
  type GridApplicationMode,
  type GridConfig,
  type GridColor,
  type GridConstructionV2,
  type GridDimensions,
  type GridResponsiveWidth,
  type GridUnit,
} from '../types/grid';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import {
  createConstructionV2FromGridConfig,
  resolveGridConstructionForTarget,
} from '../lib/gridConstructionV2';

export interface GridBuilderValue {
  config: GridConfig;
  construction: GridConstructionV2;
  dimensions: GridDimensions;
  applicationMode: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
}

interface GridBuilderModalProps {
  isDark: boolean;
  targetDimensions?: GridDimensions;
  initialValue?: GridBuilderValue;
  onCancel: () => void;
  onContinue: (value: GridBuilderValue) => void;
}

interface EditableTrackGroup {
  id: string;
  axis: 'columns' | 'rows';
  tracks: string;
  gutters: string;
  gapBefore: number;
  unit: GridUnit;
  visible: boolean;
  color: GridColor;
}

interface EditableSubdivision {
  id: string;
  parentTrackId: string;
  axis: 'columns' | 'rows';
  tracks: string;
  gutters: string;
  insetStart: number;
  insetEnd: number;
  unit: GridUnit;
  visible: boolean;
  color: GridColor;
}

function nextAvailableId(prefix: string, ids: readonly string[]): string {
  let index = ids.length + 1;
  while (ids.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

const numberValue = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function parseMeasurements(value: string, label: string, allowEmpty = false): number[] {
  if (allowEmpty && value.trim() === '') return [];
  const values = value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item));
  if (values.length === 0 || values.some(item => item <= 0)) {
    throw new Error(`${label} must be comma-separated positive numbers.`);
  }
  return values;
}

function parseGutters(value: string, trackCount: number, label: string): number[] {
  if (trackCount === 0 && value.trim() === '') return [];
  if (trackCount === 1 && value.trim() === '') return [];
  const gutters = value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item));
  if (gutters.length !== trackCount - 1 || gutters.some(item => item < 0)) {
    throw new Error(`${label} needs exactly ${Math.max(0, trackCount - 1)} non-negative values.`);
  }
  return gutters;
}

export const GridBuilderModal: React.FC<GridBuilderModalProps> = ({
  isDark,
  targetDimensions,
  initialValue,
  onCancel,
  onContinue,
}) => {
  const dialogRef = useModalAccessibility({ onClose: onCancel });
  const initialConstruction = initialValue?.construction;
  const [editorMode, setEditorMode] = React.useState<'native' | 'advanced'>(
    initialConstruction?.realization.kind === 'generated-geometry' ||
      initialConstruction?.realization.kind === 'approximation'
      ? 'advanced'
      : 'native'
  );
  const [width, setWidth] = React.useState(initialValue?.dimensions.width ?? 1440);
  const [height, setHeight] = React.useState(initialValue?.dimensions.height ?? 900);
  const [applicationMode, setApplicationMode] = React.useState<GridApplicationMode>(
    initialValue?.applicationMode ?? 'fixed'
  );
  const [responsiveMin, setResponsiveMin] = React.useState(
    initialValue?.responsiveWidth?.min ?? 600
  );
  const [responsiveMax, setResponsiveMax] = React.useState(
    initialValue?.responsiveWidth?.max ?? 1440
  );

  const initialColumns = initialValue?.config.columns;
  const initialRows = initialValue?.config.rows;
  const initialBaseline = initialValue?.config.baseline;
  const nativeColumnColor = initialColumns?.color ?? DEFAULT_COLUMN_COLOR;
  const nativeRowColor = initialRows?.color ?? DEFAULT_ROW_COLOR;
  const baselineColor =
    initialConstruction?.baseline?.color ?? initialBaseline?.color ?? DEFAULT_BASELINE_COLOR;
  const [columnsEnabled, setColumnsEnabled] = React.useState(Boolean(initialColumns ?? true));
  const [columnCount, setColumnCount] = React.useState(initialColumns?.count ?? 12);
  const [columnGutter, setColumnGutter] = React.useState(initialColumns?.gutterSize ?? 24);
  const [columnMargin, setColumnMargin] = React.useState(initialColumns?.margin ?? 64);
  const [columnUnit, setColumnUnit] = React.useState<GridUnit>(initialColumns?.marginUnit ?? 'px');
  const [columnAlignment, setColumnAlignment] = React.useState<GridAlignment>(
    initialColumns?.alignment ?? 'STRETCH'
  );
  const [columnVisible, setColumnVisible] = React.useState(initialColumns?.visible ?? true);
  const [rowsEnabled, setRowsEnabled] = React.useState(Boolean(initialRows));
  const [rowCount, setRowCount] = React.useState(initialRows?.count ?? 8);
  const [rowGutter, setRowGutter] = React.useState(initialRows?.gutterSize ?? 24);
  const [rowMargin, setRowMargin] = React.useState(initialRows?.margin ?? 64);
  const [rowUnit, setRowUnit] = React.useState<GridUnit>(initialRows?.marginUnit ?? 'px');
  const [rowAlignment, setRowAlignment] = React.useState<GridAlignment>(
    initialRows?.alignment ?? 'STRETCH'
  );
  const [rowVisible, setRowVisible] = React.useState(initialRows?.visible ?? true);
  const [baselineEnabled, setBaselineEnabled] = React.useState(Boolean(initialBaseline));
  const [baseline, setBaseline] = React.useState(initialBaseline?.height ?? 8);
  const [baselineInset, setBaselineInset] = React.useState(initialBaseline?.offset ?? 0);
  const [baselineVisible, setBaselineVisible] = React.useState(initialBaseline?.visible ?? true);

  const margins = initialConstruction?.margins;
  const [advancedUnit, setAdvancedUnit] = React.useState<GridUnit>(margins?.unit ?? 'px');
  const [leftMargin, setLeftMargin] = React.useState(margins?.left ?? 72);
  const [rightMargin, setRightMargin] = React.useState(margins?.right ?? 48);
  const [topMargin, setTopMargin] = React.useState(margins?.top ?? 72);
  const [bottomMargin, setBottomMargin] = React.useState(margins?.bottom ?? 48);
  const [insideMargin, setInsideMargin] = React.useState(margins?.inside ?? 72);
  const [outsideMargin, setOutsideMargin] = React.useState(margins?.outside ?? 48);
  const [useBindingMargins, setUseBindingMargins] = React.useState(
    margins?.inside !== undefined && margins.outside !== undefined
  );
  const [advancedGroups, setAdvancedGroups] = React.useState<EditableTrackGroup[]>(() =>
    initialConstruction?.trackGroups.length
      ? initialConstruction.trackGroups.map(group => ({
          id: group.id,
          axis: group.axis,
          tracks: group.tracks.join(', '),
          gutters: group.gutters.join(', '),
          gapBefore: group.gapBefore,
          unit: group.unit,
          visible: group.visible,
          color: group.color,
        }))
      : [
          {
            id: 'columns',
            axis: 'columns',
            tracks: '180, 260, 180',
            gutters: '24, 36',
            gapBefore: 0,
            unit: 'px',
            visible: true,
            color: DEFAULT_COLUMN_COLOR,
          },
        ]
  );
  const [advancedSubdivisions, setAdvancedSubdivisions] = React.useState<EditableSubdivision[]>(
    () =>
      initialConstruction?.subdivisions.map(subdivision => ({
        id: subdivision.id,
        parentTrackId: subdivision.parentTrackId,
        axis: subdivision.axis,
        tracks: subdivision.tracks.join(', '),
        gutters: subdivision.gutters.join(', '),
        insetStart: subdivision.insetStart,
        insetEnd: subdivision.insetEnd,
        unit: subdivision.unit,
        visible: subdivision.visible,
        color: subdivision.color,
      })) ?? []
  );
  const [error, setError] = React.useState<string | null>(null);

  const text = isDark ? '#ffffff' : '#1a1a1a';
  const muted = isDark ? '#a3a3a3' : '#666666';
  const background = isDark ? '#1a1a1a' : '#ffffff';
  const panel = isDark ? '#262626' : '#f7f7f7';
  const border = isDark ? '#404040' : '#e5e5e5';

  const buildValue = React.useCallback((): GridBuilderValue => {
    const dimensions = { width, height };
    if (width <= 0 || height <= 0) throw new Error('Reference dimensions must be positive.');
    const responsiveWidth =
      applicationMode === 'responsive-width'
        ? { min: responsiveMin, ...(responsiveMax > 0 ? { max: responsiveMax } : {}) }
        : undefined;
    if (responsiveWidth && responsiveWidth.max && responsiveWidth.max < responsiveWidth.min) {
      throw new Error('Responsive maximum must be greater than or equal to its minimum.');
    }

    if (editorMode === 'native') {
      const config: GridConfig = {};
      if (columnsEnabled) {
        config.columns = {
          count: columnCount,
          gutterSize: columnGutter,
          gutterUnit: columnUnit,
          margin: columnMargin,
          marginUnit: columnUnit,
          alignment: columnAlignment,
          visible: columnVisible,
          color: nativeColumnColor,
        };
      }
      if (rowsEnabled) {
        config.rows = {
          count: rowCount,
          gutterSize: rowGutter,
          gutterUnit: rowUnit,
          margin: rowMargin,
          marginUnit: rowUnit,
          alignment: rowAlignment,
          visible: rowVisible,
          color: nativeRowColor,
        };
      }
      if (baselineEnabled) {
        config.baseline = {
          height: baseline,
          offset: baselineInset,
          visible: baselineVisible,
          color: baselineColor,
        };
      }
      if (Object.keys(config).length === 0) throw new Error('Enable at least one grid layer.');
      return {
        config,
        construction: createConstructionV2FromGridConfig(config, dimensions),
        dimensions,
        applicationMode,
        responsiveWidth,
      };
    }

    if (advancedGroups.length === 0) throw new Error('Add at least one track group.');
    const trackGroups: GridConstructionV2['trackGroups'] = advancedGroups.map((group, index) => {
      const label = `Track group ${index + 1}`;
      const tracks = parseMeasurements(group.tracks, `${label} tracks`);
      return {
        id: group.id.trim(),
        axis: group.axis,
        tracks,
        gutters: parseGutters(group.gutters, tracks.length, `${label} gutters`),
        gapBefore: group.gapBefore,
        unit: group.unit,
        visible: group.visible,
        color: group.color,
      };
    });
    const subdivisions: GridConstructionV2['subdivisions'] = advancedSubdivisions.map(
      (subdivision, index) => {
        const label = `Subdivision ${index + 1}`;
        const tracks = parseMeasurements(subdivision.tracks, `${label} tracks`);
        return {
          id: subdivision.id.trim(),
          parentTrackId: subdivision.parentTrackId.trim(),
          axis: subdivision.axis,
          tracks,
          gutters: parseGutters(subdivision.gutters, tracks.length, `${label} gutters`),
          insetStart: subdivision.insetStart,
          insetEnd: subdivision.insetEnd,
          unit: subdivision.unit,
          visible: subdivision.visible,
          color: subdivision.color,
        };
      }
    );
    const construction: GridConstructionV2 = {
      version: 2,
      margins: {
        left: leftMargin,
        right: rightMargin,
        top: topMargin,
        bottom: bottomMargin,
        ...(useBindingMargins ? { inside: insideMargin, outside: outsideMargin } : {}),
        unit: advancedUnit,
      },
      trackGroups,
      subdivisions,
      ...(baselineEnabled
        ? {
            baseline: {
              interval: baseline,
              topInset: baselineInset,
              unit: advancedUnit,
              visible: baselineVisible,
              color: baselineColor,
            },
          }
        : {}),
      realization:
        initialConstruction?.realization.kind === 'generated-geometry' ||
        initialConstruction?.realization.kind === 'approximation'
          ? initialConstruction.realization
          : {
              kind: 'generated-geometry',
              disclosure:
                'Teul renders this source construction as tagged geometry because native Figma layout grids cannot preserve every declared relationship.',
            },
    };
    return {
      config: {},
      construction,
      dimensions,
      applicationMode,
      responsiveWidth,
    };
  }, [
    advancedGroups,
    advancedSubdivisions,
    advancedUnit,
    applicationMode,
    baseline,
    baselineEnabled,
    baselineInset,
    baselineVisible,
    baselineColor,
    bottomMargin,
    columnAlignment,
    columnCount,
    columnGutter,
    columnMargin,
    columnUnit,
    columnVisible,
    columnsEnabled,
    editorMode,
    height,
    insideMargin,
    leftMargin,
    initialConstruction,
    nativeColumnColor,
    nativeRowColor,
    outsideMargin,
    responsiveMax,
    responsiveMin,
    rightMargin,
    rowAlignment,
    rowCount,
    rowGutter,
    rowMargin,
    rowUnit,
    rowVisible,
    rowsEnabled,
    topMargin,
    useBindingMargins,
    width,
  ]);

  const preview = React.useMemo(() => {
    try {
      const value = buildValue();
      const target = targetDimensions ?? value.dimensions;
      return {
        value,
        resolved: resolveGridConstructionForTarget(
          value.construction,
          value.dimensions,
          target,
          value.applicationMode,
          value.responsiveWidth
        ),
        target,
        error: null,
      };
    } catch (previewError) {
      return {
        value: null,
        resolved: null,
        target: targetDimensions ?? { width, height },
        error: previewError instanceof Error ? previewError.message : 'Invalid grid construction.',
      };
    }
  }, [buildValue, height, targetDimensions, width]);

  const field = (label: string, value: number, onChange: (value: number) => void, min = 0) => (
    <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
      {label}
      <input
        type="number"
        min={min}
        value={value}
        onChange={event => onChange(numberValue(event.target.value, value))}
      />
    </label>
  );

  const textField = (label: string, value: string, onChange: (value: string) => void) => (
    <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
      {label}
      <input value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );

  const handleContinue = () => {
    try {
      const value = buildValue();
      resolveGridConstructionForTarget(
        value.construction,
        value.dimensions,
        targetDimensions ?? value.dimensions,
        value.applicationMode,
        value.responsiveWidth
      );
      setError(null);
      onContinue(value);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Invalid grid construction.');
    }
  };

  const previewScale = Math.min(260 / preview.target.width, 150 / preview.target.height);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-builder-title"
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '94vh',
          overflow: 'auto',
          padding: '18px',
          background,
          color: text,
          borderRadius: '12px',
        }}
      >
        <h2 id="grid-builder-title" style={{ margin: '0 0 12px', fontSize: '16px' }}>
          {initialValue ? 'Edit Grid Geometry' : 'New Grid'}
        </h2>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          <button onClick={() => setEditorMode('native')} aria-pressed={editorMode === 'native'}>
            Native
          </button>
          <button
            onClick={() => setEditorMode('advanced')}
            aria-pressed={editorMode === 'advanced'}
          >
            Advanced construction
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {field('Reference width', width, setWidth, 1)}
          {field('Reference height', height, setHeight, 1)}
          <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
            Application mode
            <select
              value={applicationMode}
              onChange={event => setApplicationMode(event.target.value as GridApplicationMode)}
            >
              <option value="fixed">Fixed</option>
              <option value="scale-from-reference">Scale from reference</option>
              <option value="canonical-only">Canonical only</option>
              <option value="responsive-width">Responsive width</option>
            </select>
          </label>
        </div>
        {applicationMode === 'responsive-width' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            {field('Responsive minimum', responsiveMin, setResponsiveMin, 1)}
            {field('Responsive maximum', responsiveMax, setResponsiveMax, 1)}
          </div>
        )}

        {editorMode === 'native' ? (
          <>
            {[
              {
                label: 'Columns',
                enabled: columnsEnabled,
                setEnabled: setColumnsEnabled,
                count: field('Count', columnCount, setColumnCount, 1),
                gutter: field('Gutter', columnGutter, setColumnGutter),
                margin: field('Margin', columnMargin, setColumnMargin),
                unit: columnUnit,
                setUnit: setColumnUnit,
                alignment: columnAlignment,
                setAlignment: setColumnAlignment,
                visible: columnVisible,
                setVisible: setColumnVisible,
              },
              {
                label: 'Rows',
                enabled: rowsEnabled,
                setEnabled: setRowsEnabled,
                count: field('Count', rowCount, setRowCount, 1),
                gutter: field('Gutter', rowGutter, setRowGutter),
                margin: field('Margin', rowMargin, setRowMargin),
                unit: rowUnit,
                setUnit: setRowUnit,
                alignment: rowAlignment,
                setAlignment: setRowAlignment,
                visible: rowVisible,
                setVisible: setRowVisible,
              },
            ].map(section => (
              <fieldset
                key={section.label}
                style={{ marginTop: '12px', border: `1px solid ${border}` }}
              >
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={event => section.setEnabled(event.target.checked)}
                    />{' '}
                    {section.label}
                  </label>
                </legend>
                {section.enabled && (
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' }}
                  >
                    {section.count}
                    {section.gutter}
                    {section.margin}
                    <select
                      value={section.unit}
                      onChange={event => section.setUnit(event.target.value as GridUnit)}
                    >
                      <option value="px">Pixels</option>
                      <option value="percent">Percent</option>
                    </select>
                    <select
                      value={section.alignment}
                      onChange={event => section.setAlignment(event.target.value as GridAlignment)}
                    >
                      <option value="STRETCH">Stretch</option>
                      <option value="MIN">Start</option>
                      <option value="CENTER">Center</option>
                      <option value="MAX">End</option>
                    </select>
                    <label style={{ fontSize: '10px', color: muted }}>
                      <input
                        type="checkbox"
                        checked={section.visible}
                        onChange={event => section.setVisible(event.target.checked)}
                      />{' '}
                      Visible
                    </label>
                  </div>
                )}
              </fieldset>
            ))}
          </>
        ) : (
          <fieldset style={{ marginTop: '12px', border: `1px solid ${border}` }}>
            <legend>Source construction</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '7px' }}>
              {field('Left', leftMargin, setLeftMargin)}
              {field('Right', rightMargin, setRightMargin)}
              {field('Top', topMargin, setTopMargin)}
              {field('Bottom', bottomMargin, setBottomMargin)}
            </div>
            <label style={{ display: 'block', marginTop: '8px', fontSize: '10px', color: muted }}>
              Units{' '}
              <select
                value={advancedUnit}
                onChange={event => setAdvancedUnit(event.target.value as GridUnit)}
              >
                <option value="px">Pixels</option>
                <option value="percent">Percent</option>
              </select>
            </label>
            <label style={{ display: 'block', marginTop: '8px', fontSize: '10px', color: muted }}>
              <input
                type="checkbox"
                checked={useBindingMargins}
                onChange={event => setUseBindingMargins(event.target.checked)}
              />{' '}
              Use inside/outside binding margins
            </label>
            {useBindingMargins && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '7px',
                  marginTop: '7px',
                }}
              >
                {field('Inside', insideMargin, setInsideMargin)}
                {field('Outside', outsideMargin, setOutsideMargin)}
              </div>
            )}
            <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
              <strong style={{ fontSize: '11px' }}>Ordered track groups</strong>
              {advancedGroups.map((group, index) => (
                <fieldset
                  key={`${group.id}-${index}`}
                  style={{ border: `1px solid ${border}`, display: 'grid', gap: '7px' }}
                >
                  <legend>Group {index + 1}</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px' }}>
                    {textField('Group ID', group.id, id =>
                      setAdvancedGroups(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, id } : item
                        )
                      )
                    )}
                    <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
                      Axis
                      <select
                        value={group.axis}
                        onChange={event =>
                          setAdvancedGroups(items =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, axis: event.target.value as 'columns' | 'rows' }
                                : item
                            )
                          )
                        }
                      >
                        <option value="columns">Columns</option>
                        <option value="rows">Rows</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
                      Units
                      <select
                        value={group.unit}
                        onChange={event =>
                          setAdvancedGroups(items =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, unit: event.target.value as GridUnit }
                                : item
                            )
                          )
                        }
                      >
                        <option value="px">Pixels</option>
                        <option value="percent">Percent</option>
                      </select>
                    </label>
                  </div>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr', gap: '7px' }}
                  >
                    {textField(
                      `${group.axis === 'columns' ? 'Column' : 'Row'} track sizes`,
                      group.tracks,
                      tracks =>
                        setAdvancedGroups(items =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, tracks } : item
                          )
                        )
                    )}
                    {textField('Gutters', group.gutters, gutters =>
                      setAdvancedGroups(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, gutters } : item
                        )
                      )
                    )}
                    {field('Gap before', group.gapBefore, gapBefore =>
                      setAdvancedGroups(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, gapBefore } : item
                        )
                      )
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '10px', color: muted }}>
                      <input
                        type="checkbox"
                        checked={group.visible}
                        onChange={event =>
                          setAdvancedGroups(items =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, visible: event.target.checked }
                                : item
                            )
                          )
                        }
                      />{' '}
                      Visible
                    </label>
                    <button
                      type="button"
                      disabled={advancedGroups.length === 1}
                      onClick={() =>
                        setAdvancedGroups(items =>
                          items.filter((_item, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      Remove group
                    </button>
                  </div>
                </fieldset>
              ))}
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['columns', 'rows'] as const).map(axis => (
                  <button
                    key={axis}
                    type="button"
                    onClick={() =>
                      setAdvancedGroups(items => [
                        ...items,
                        {
                          id: nextAvailableId(
                            axis === 'columns' ? 'columns' : 'rows',
                            items.map(item => item.id)
                          ),
                          axis,
                          tracks: '120, 120',
                          gutters: '24',
                          gapBefore: 0,
                          unit: advancedUnit,
                          visible: true,
                          color: axis === 'columns' ? DEFAULT_COLUMN_COLOR : DEFAULT_ROW_COLOR,
                        },
                      ])
                    }
                  >
                    Add {axis === 'columns' ? 'column' : 'row'} group
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
              <strong style={{ fontSize: '11px' }}>Nested subdivisions</strong>
              {advancedSubdivisions.map((subdivision, index) => (
                <fieldset
                  key={`${subdivision.id}-${index}`}
                  style={{ border: `1px solid ${border}`, display: 'grid', gap: '7px' }}
                >
                  <legend>Subdivision {index + 1}</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px' }}>
                    {textField('Subdivision ID', subdivision.id, id =>
                      setAdvancedSubdivisions(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, id } : item
                        )
                      )
                    )}
                    {textField('Parent track ID', subdivision.parentTrackId, parentTrackId =>
                      setAdvancedSubdivisions(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, parentTrackId } : item
                        )
                      )
                    )}
                    <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
                      Axis
                      <select
                        value={subdivision.axis}
                        onChange={event =>
                          setAdvancedSubdivisions(items =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, axis: event.target.value as 'columns' | 'rows' }
                                : item
                            )
                          )
                        }
                      >
                        <option value="rows">Rows</option>
                        <option value="columns">Columns</option>
                      </select>
                    </label>
                  </div>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr', gap: '7px' }}
                  >
                    {textField('Nested tracks', subdivision.tracks, tracks =>
                      setAdvancedSubdivisions(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, tracks } : item
                        )
                      )
                    )}
                    {textField('Nested gutters', subdivision.gutters, gutters =>
                      setAdvancedSubdivisions(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, gutters } : item
                        )
                      )
                    )}
                    <label style={{ display: 'grid', gap: '4px', fontSize: '10px', color: muted }}>
                      Units
                      <select
                        value={subdivision.unit}
                        onChange={event =>
                          setAdvancedSubdivisions(items =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, unit: event.target.value as GridUnit }
                                : item
                            )
                          )
                        }
                      >
                        <option value="px">Pixels</option>
                        <option value="percent">Percent</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px' }}>
                    {field('Nested start inset', subdivision.insetStart, insetStart =>
                      setAdvancedSubdivisions(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, insetStart } : item
                        )
                      )
                    )}
                    {field('Nested end inset', subdivision.insetEnd, insetEnd =>
                      setAdvancedSubdivisions(items =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, insetEnd } : item
                        )
                      )
                    )}
                    <label style={{ fontSize: '10px', color: muted }}>
                      <input
                        type="checkbox"
                        checked={subdivision.visible}
                        onChange={event =>
                          setAdvancedSubdivisions(items =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, visible: event.target.checked }
                                : item
                            )
                          )
                        }
                      />{' '}
                      Visible
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAdvancedSubdivisions(items =>
                        items.filter((_item, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    Remove subdivision
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() =>
                  setAdvancedSubdivisions(items => [
                    ...items,
                    {
                      id: nextAvailableId(
                        'nested',
                        items.map(item => item.id)
                      ),
                      parentTrackId: advancedGroups[0] ? `${advancedGroups[0].id}:0` : '',
                      axis: advancedGroups[0]?.axis === 'rows' ? 'columns' : 'rows',
                      tracks: '120, 120, 120',
                      gutters: '24, 24',
                      insetStart: 0,
                      insetEnd: 0,
                      unit: advancedUnit,
                      visible: true,
                      color: advancedGroups[0]?.color ?? DEFAULT_ROW_COLOR,
                    },
                  ])
                }
              >
                Add nested subdivision
              </button>
            </div>
          </fieldset>
        )}

        <fieldset style={{ marginTop: '12px', border: `1px solid ${border}` }}>
          <legend>
            <label>
              <input
                type="checkbox"
                checked={baselineEnabled}
                onChange={event => setBaselineEnabled(event.target.checked)}
              />{' '}
              Baseline
            </label>
          </legend>
          {baselineEnabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px' }}>
              {field('Interval', baseline, setBaseline, 1)}
              {field('Top inset', baselineInset, setBaselineInset)}
              <label style={{ fontSize: '10px', color: muted }}>
                <input
                  type="checkbox"
                  checked={baselineVisible}
                  onChange={event => setBaselineVisible(event.target.checked)}
                />{' '}
                Visible
              </label>
            </div>
          )}
        </fieldset>

        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: panel }}>
          <div style={{ fontSize: '10px', color: muted, marginBottom: '7px' }}>
            {preview.error
              ? preview.error
              : `Fits ${targetDimensions ? 'selected target' : 'reference'} ${Math.round(preview.target.width)}×${Math.round(preview.target.height)} · ${preview.value?.construction.realization.kind}`}
          </div>
          <div
            aria-label="Grid construction preview"
            style={{
              position: 'relative',
              width: `${preview.target.width * previewScale}px`,
              height: `${preview.target.height * previewScale}px`,
              margin: '0 auto',
              overflow: 'hidden',
              border: `1px solid ${border}`,
              background,
            }}
          >
            {preview.resolved?.tracks
              .filter(track => track.visible)
              .map(track => {
                const parent = track.parentTrackId
                  ? preview.resolved?.tracks.find(item => item.id === track.parentTrackId)
                  : undefined;
                const isColumn = track.axis === 'columns';
                const x = isColumn
                  ? track.start
                  : parent?.axis === 'columns'
                    ? parent.start
                    : preview.resolved!.contentBounds.x;
                const y = !isColumn
                  ? track.start
                  : parent?.axis === 'rows'
                    ? parent.start
                    : preview.resolved!.contentBounds.y;
                const trackWidth = isColumn
                  ? track.size
                  : parent?.axis === 'columns'
                    ? parent.size
                    : preview.resolved!.contentBounds.width;
                const trackHeight = !isColumn
                  ? track.size
                  : parent?.axis === 'rows'
                    ? parent.size
                    : preview.resolved!.contentBounds.height;
                return (
                  <div
                    key={track.id}
                    style={{
                      position: 'absolute',
                      left: `${x * previewScale}px`,
                      top: `${y * previewScale}px`,
                      width: `${trackWidth * previewScale}px`,
                      height: `${trackHeight * previewScale}px`,
                      background: `rgba(${Math.round(track.color.r * 255)}, ${Math.round(track.color.g * 255)}, ${Math.round(track.color.b * 255)}, ${Math.max(0.08, track.color.a)})`,
                    }}
                  />
                );
              })}
          </div>
        </div>

        {(error || preview.error) && (
          <div role="alert" style={{ marginTop: '10px', color: '#dc2626', fontSize: '11px' }}>
            {error ?? preview.error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={handleContinue} disabled={Boolean(preview.error)}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
