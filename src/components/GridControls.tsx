import * as React from 'react'
import type { 
  GridConfig, 
  ColumnGridConfig, 
  RowGridConfig, 
  BaselineGridConfig,
  GridColor,
  GridUnit,
  GridAlignment
} from '../types/grid'
import { gridColorToCSS, cssToGridColor } from '../lib/gridUtils'

interface GridControlsProps {
  /** Current grid configuration */
  config: GridConfig
  /** Callback when config changes */
  onChange: (config: GridConfig) => void
  /** Reset to original/detected values */
  onReset?: () => void
  /** Whether there are changes to reset */
  hasChanges?: boolean
  /** Frame dimensions for percentage calculations */
  frameWidth: number
  frameHeight: number
  /** Dark mode */
  isDark: boolean
  /** Compact mode for smaller spaces */
  compact?: boolean
}

const styles = {
  light: {
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#ffffff',
    sectionBg: '#f8f8f8',
    labelBg: '#f0f0f0',
  },
  dark: {
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#2a2a2a',
    sectionBg: '#262626',
    labelBg: '#333333',
  }
}

// ============================================
// Number Input Component
// ============================================

interface NumberInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  isDark: boolean
  compact?: boolean
}

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  isDark,
  compact,
}) => {
  const theme = isDark ? styles.dark : styles.light
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: compact ? 'row' : 'column',
      gap: compact ? '8px' : '4px',
      alignItems: compact ? 'center' : 'stretch',
    }}>
      <label style={{
        fontSize: '10px',
        fontWeight: 600,
        color: theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        minWidth: compact ? '60px' : undefined,
      }}>
        {label}
      </label>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            if (!isNaN(val)) {
              onChange(Math.min(max, Math.max(min, val)))
            }
          }}
          min={min}
          max={max}
          step={step}
          style={{
            width: compact ? '60px' : '100%',
            padding: '6px 8px',
            borderRadius: '6px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            color: theme.text,
            fontSize: '12px',
            outline: 'none',
          }}
        />
        {suffix && (
          <span style={{
            fontSize: '10px',
            color: theme.textMuted,
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================
// Unit Toggle Component
// ============================================

interface UnitToggleProps {
  value: GridUnit
  onChange: (unit: GridUnit) => void
  isDark: boolean
}

const UnitToggle: React.FC<UnitToggleProps> = ({ value, onChange, isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  
  return (
    <div style={{
      display: 'flex',
      borderRadius: '6px',
      overflow: 'hidden',
      border: `1px solid ${theme.border}`,
    }}>
      {(['px', 'percent'] as GridUnit[]).map(unit => (
        <button
          key={unit}
          onClick={() => onChange(unit)}
          style={{
            padding: '4px 8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
            backgroundColor: value === unit ? (isDark ? '#3b82f6' : '#3b82f6') : 'transparent',
            color: value === unit ? '#ffffff' : theme.textMuted,
            transition: 'all 0.15s ease',
          }}
        >
          {unit === 'percent' ? '%' : 'px'}
        </button>
      ))}
    </div>
  )
}

// ============================================
// Color Picker Component
// ============================================

interface ColorPickerProps {
  label: string
  value: GridColor
  onChange: (color: GridColor) => void
  isDark: boolean
}

const PRESET_COLORS = [
  { name: 'Red', hex: '#ff3b3b' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Gray', hex: '#6b7280' },
]

const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange, isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  const currentHex = `#${Math.round(value.r * 255).toString(16).padStart(2, '0')}${Math.round(value.g * 255).toString(16).padStart(2, '0')}${Math.round(value.b * 255).toString(16).padStart(2, '0')}`
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{
        fontSize: '10px',
        fontWeight: 600,
        color: theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {PRESET_COLORS.map(preset => (
          <button
            key={preset.hex}
            onClick={() => onChange(cssToGridColor(preset.hex, value.a))}
            title={preset.name}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              border: currentHex.toLowerCase() === preset.hex.toLowerCase() 
                ? '2px solid #3b82f6' 
                : `1px solid ${theme.border}`,
              backgroundColor: preset.hex,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================
// Opacity Slider Component
// ============================================

interface OpacitySliderProps {
  value: number
  onChange: (value: number) => void
  isDark: boolean
}

const OpacitySlider: React.FC<OpacitySliderProps> = ({ value, onChange, isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <label style={{
          fontSize: '10px',
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Opacity
        </label>
        <span style={{
          fontSize: '10px',
          color: theme.textMuted,
          fontFamily: 'monospace',
        }}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: '4px',
          borderRadius: '2px',
          appearance: 'none',
          backgroundColor: theme.border,
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

// ============================================
// Section Header Component
// ============================================

interface SectionHeaderProps {
  title: string
  icon: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  isDark: boolean
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  title, 
  icon, 
  enabled, 
  onToggle, 
  isDark 
}) => {
  const theme = isDark ? styles.dark : styles.light
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      backgroundColor: theme.labelBg,
      borderRadius: '6px',
      marginBottom: '8px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span style={{
          fontSize: '12px',
          fontWeight: 600,
          color: theme.text,
        }}>
          {title}
        </span>
      </div>
      <button
        onClick={() => onToggle(!enabled)}
        style={{
          padding: '4px 10px',
          borderRadius: '4px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '10px',
          fontWeight: 600,
          backgroundColor: enabled ? '#22c55e' : theme.border,
          color: enabled ? '#ffffff' : theme.textMuted,
          transition: 'all 0.15s ease',
        }}
      >
        {enabled ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

// ============================================
// Main Grid Controls Component
// ============================================

export const GridControls: React.FC<GridControlsProps> = ({
  config,
  onChange,
  onReset,
  hasChanges,
  frameWidth,
  frameHeight,
  isDark,
  compact = false,
}) => {
  const theme = isDark ? styles.dark : styles.light
  
  // Update column config
  const updateColumns = (updates: Partial<ColumnGridConfig>) => {
    if (!config.columns) return
    onChange({
      ...config,
      columns: { ...config.columns, ...updates },
    })
  }
  
  // Update row config
  const updateRows = (updates: Partial<RowGridConfig>) => {
    if (!config.rows) return
    onChange({
      ...config,
      rows: { ...config.rows, ...updates },
    })
  }
  
  // Update baseline config
  const updateBaseline = (updates: Partial<BaselineGridConfig>) => {
    if (!config.baseline) return
    onChange({
      ...config,
      baseline: { ...config.baseline, ...updates },
    })
  }
  
  // Toggle sections
  const toggleColumns = (enabled: boolean) => {
    if (enabled && !config.columns) {
      onChange({
        ...config,
        columns: {
          count: 4,
          gutterSize: 3,
          gutterUnit: 'percent',
          margin: 5,
          marginUnit: 'percent',
          alignment: 'STRETCH',
          visible: true,
          color: { r: 1, g: 0.2, b: 0.2, a: 0.1 },
        },
      })
    } else if (!enabled) {
      const { columns, ...rest } = config
      onChange(rest)
    }
  }
  
  const toggleRows = (enabled: boolean) => {
    if (enabled && !config.rows) {
      onChange({
        ...config,
        rows: {
          count: 4,
          gutterSize: 3,
          gutterUnit: 'percent',
          margin: 5,
          marginUnit: 'percent',
          alignment: 'STRETCH',
          visible: true,
          color: { r: 0.2, g: 0.4, b: 1, a: 0.1 },
        },
      })
    } else if (!enabled) {
      const { rows, ...rest } = config
      onChange(rest)
    }
  }
  
  const toggleBaseline = (enabled: boolean) => {
    if (enabled && !config.baseline) {
      onChange({
        ...config,
        baseline: {
          height: 8,
          offset: 0,
          visible: true,
          color: { r: 0.2, g: 0.8, b: 0.9, a: 0.15 },
        },
      })
    } else if (!enabled) {
      const { baseline, ...rest } = config
      onChange(rest)
    }
  }
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      {/* Column Grid Section */}
      <div>
        <SectionHeader
          title="Columns"
          icon="▤"
          enabled={!!config.columns}
          onToggle={toggleColumns}
          isDark={isDark}
        />
        
        {config.columns && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px',
            backgroundColor: theme.sectionBg,
            borderRadius: '8px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <NumberInput
                label="Columns"
                value={config.columns.count}
                onChange={(v) => updateColumns({ count: v })}
                min={1}
                max={24}
                isDark={isDark}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <NumberInput
                  label="Gutter"
                  value={config.columns.gutterSize}
                  onChange={(v) => updateColumns({ gutterSize: v })}
                  min={0}
                  max={config.columns.gutterUnit === 'percent' ? 20 : 100}
                  step={config.columns.gutterUnit === 'percent' ? 0.5 : 1}
                  suffix={config.columns.gutterUnit === 'percent' ? '%' : 'px'}
                  isDark={isDark}
                />
                <UnitToggle
                  value={config.columns.gutterUnit}
                  onChange={(unit) => updateColumns({ gutterUnit: unit })}
                  isDark={isDark}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <NumberInput
                label="Margin"
                value={config.columns.margin}
                onChange={(v) => updateColumns({ margin: v })}
                min={0}
                max={config.columns.marginUnit === 'percent' ? 25 : 200}
                step={config.columns.marginUnit === 'percent' ? 0.5 : 1}
                suffix={config.columns.marginUnit === 'percent' ? '%' : 'px'}
                isDark={isDark}
              />
              <UnitToggle
                value={config.columns.marginUnit}
                onChange={(unit) => updateColumns({ marginUnit: unit })}
                isDark={isDark}
              />
            </div>
            
            <ColorPicker
              label="Color"
              value={config.columns.color}
              onChange={(color) => updateColumns({ color })}
              isDark={isDark}
            />
            
            <OpacitySlider
              value={config.columns.color.a}
              onChange={(a) => updateColumns({ 
                color: { ...config.columns!.color, a } 
              })}
              isDark={isDark}
            />
          </div>
        )}
      </div>
      
      {/* Row Grid Section */}
      <div>
        <SectionHeader
          title="Rows"
          icon="▥"
          enabled={!!config.rows}
          onToggle={toggleRows}
          isDark={isDark}
        />
        
        {config.rows && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px',
            backgroundColor: theme.sectionBg,
            borderRadius: '8px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <NumberInput
                label="Rows"
                value={config.rows.count}
                onChange={(v) => updateRows({ count: v })}
                min={1}
                max={24}
                isDark={isDark}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <NumberInput
                  label="Gutter"
                  value={config.rows.gutterSize}
                  onChange={(v) => updateRows({ gutterSize: v })}
                  min={0}
                  max={config.rows.gutterUnit === 'percent' ? 20 : 100}
                  step={config.rows.gutterUnit === 'percent' ? 0.5 : 1}
                  suffix={config.rows.gutterUnit === 'percent' ? '%' : 'px'}
                  isDark={isDark}
                />
                <UnitToggle
                  value={config.rows.gutterUnit}
                  onChange={(unit) => updateRows({ gutterUnit: unit })}
                  isDark={isDark}
                />
              </div>
            </div>
            
            <ColorPicker
              label="Color"
              value={config.rows.color}
              onChange={(color) => updateRows({ color })}
              isDark={isDark}
            />
            
            <OpacitySlider
              value={config.rows.color.a}
              onChange={(a) => updateRows({ 
                color: { ...config.rows!.color, a } 
              })}
              isDark={isDark}
            />
          </div>
        )}
      </div>
      
      {/* Baseline Grid Section */}
      <div>
        <SectionHeader
          title="Baseline"
          icon="📏"
          enabled={!!config.baseline}
          onToggle={toggleBaseline}
          isDark={isDark}
        />
        
        {config.baseline && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px',
            backgroundColor: theme.sectionBg,
            borderRadius: '8px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <NumberInput
                label="Height"
                value={config.baseline.height}
                onChange={(v) => updateBaseline({ height: v })}
                min={2}
                max={48}
                suffix="px"
                isDark={isDark}
              />
              <NumberInput
                label="Offset"
                value={config.baseline.offset}
                onChange={(v) => updateBaseline({ offset: v })}
                min={0}
                max={48}
                suffix="px"
                isDark={isDark}
              />
            </div>
            
            {/* Quick baseline presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{
                fontSize: '10px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Presets
              </label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {[4, 8, 12, 16, 24].map(h => (
                  <button
                    key={h}
                    onClick={() => updateBaseline({ height: h })}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: config.baseline?.height === h 
                        ? '1px solid #3b82f6' 
                        : `1px solid ${theme.border}`,
                      backgroundColor: config.baseline?.height === h 
                        ? (isDark ? '#1e3a5f' : '#e6f0ff')
                        : 'transparent',
                      color: theme.text,
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {h}px
                  </button>
                ))}
              </div>
            </div>
            
            <ColorPicker
              label="Color"
              value={config.baseline.color}
              onChange={(color) => updateBaseline({ color })}
              isDark={isDark}
            />
            
            <OpacitySlider
              value={config.baseline.color.a}
              onChange={(a) => updateBaseline({ 
                color: { ...config.baseline!.color, a } 
              })}
              isDark={isDark}
            />
          </div>
        )}
      </div>
      
      {/* Reset Button */}
      {onReset && hasChanges && (
        <button
          onClick={onReset}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent',
            color: theme.textMuted,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          ↺ Reset to Original
        </button>
      )}
    </div>
  )
}

export default GridControls

