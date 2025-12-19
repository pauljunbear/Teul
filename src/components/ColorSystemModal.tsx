import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { 
  generateColorScale, 
  generateColorScales,
  hexToHsl,
  getContrastingTextColor,
  type ColorScale 
} from '../lib/utils';
import { 
  findClosestRadixFamily, 
  getNeutralForAccent, 
  getNeutralScale,
  radixColors,
  neutralFamilies,
  type NeutralName,
  type RadixColorFamily,
  type RadixScale
} from '../lib/radixColors';

// Types
type ColorRole = 'primary' | 'secondary' | 'accent';
type ScaleMethod = 'custom' | 'radix-match';
type OutputDetailLevel = 'minimal' | 'detailed' | 'presentation';
type ThemeMode = 'light' | 'dark';

interface RoleAssignment {
  hex: string;
  name: string;
  role: ColorRole | null;
}

interface ColorSystemConfig {
  sourceColors: { hex: string; name: string }[];
  roleAssignments: RoleAssignment[];
  scaleMethod: ScaleMethod;
  neutralFamily: NeutralName | 'auto';
  detailLevel: OutputDetailLevel;
  includeDarkMode: boolean;
  systemName: string;
}

interface ColorSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  colors: { hex: string; name: string }[];
  combinationName: string;
  isDark: boolean;
  onGenerate: (config: ColorSystemConfig) => void;
}

// Get styles based on theme
const getStyles = (isDark: boolean) => ({
  bg: isDark ? '#1a1a1a' : '#ffffff',
  cardBg: isDark ? '#262626' : '#ffffff',
  text: isDark ? '#ffffff' : '#1a1a1a',
  textMuted: isDark ? '#a3a3a3' : '#666666',
  border: isDark ? '#404040' : '#e5e5e5',
  inputBg: isDark ? '#333333' : '#f5f5f5',
  btnBg: isDark ? '#333333' : '#f0f0f0',
  btnHover: isDark ? '#404040' : '#e5e5e5',
  btnActive: isDark ? '#ffffff' : '#1a1a1a',
  btnActiveText: isDark ? '#1a1a1a' : '#ffffff',
  accent: '#3b82f6',
});

export const ColorSystemModal: React.FC<ColorSystemModalProps> = ({
  isOpen,
  onClose,
  colors,
  combinationName,
  isDark,
  onGenerate,
}) => {
  const theme = getStyles(isDark);
  
  // State
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>('custom');
  const [neutralFamily, setNeutralFamily] = useState<NeutralName | 'auto'>('auto');
  const [detailLevel, setDetailLevel] = useState<OutputDetailLevel>('detailed');
  const [includeDarkMode, setIncludeDarkMode] = useState(true);
  const [createStyles, setCreateStyles] = useState(false);
  const [systemName, setSystemName] = useState(combinationName || 'My Color System');
  
  // Initialize role assignments from colors
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>(() => 
    colors.map((c, i) => ({
      hex: c.hex,
      name: c.name,
      role: i === 0 ? 'primary' : i === 1 ? 'secondary' : i === 2 ? 'accent' : null,
    }))
  );

  // Auto-suggested neutral based on primary color
  const suggestedNeutral = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary');
    if (primary) {
      return getNeutralForAccent(primary.hex);
    }
    return 'gray';
  }, [roleAssignments]);

  const effectiveNeutral = neutralFamily === 'auto' ? suggestedNeutral : neutralFamily;

  // Generate preview scales (light mode)
  const previewScales = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary');
    if (!primary) return null;

    if (scaleMethod === 'custom') {
      return generateColorScale(primary.hex, 'light', 'Primary');
    } else {
      const family = findClosestRadixFamily(primary.hex);
      return {
        name: family.displayName,
        baseHex: primary.hex,
        steps: Object.entries(family.light).map(
          ([step, hex]) => ({ step: parseInt(step), hex, oklch: { l: 0, c: 0, h: 0 }, usage: '' })
        ),
        mode: 'light' as const,
      } as ColorScale;
    }
  }, [roleAssignments, scaleMethod]);

  // Generate dark preview scales
  const darkPreviewScales = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary');
    if (!primary) return null;

    if (scaleMethod === 'custom') {
      return generateColorScale(primary.hex, 'dark', 'Primary');
    } else {
      const family = findClosestRadixFamily(primary.hex);
      return {
        name: family.displayName,
        baseHex: primary.hex,
        steps: Object.entries(family.dark).map(
          ([step, hex]) => ({ step: parseInt(step), hex, oklch: { l: 0, c: 0, h: 0 }, usage: '' })
        ),
        mode: 'dark' as const,
      } as ColorScale;
    }
  }, [roleAssignments, scaleMethod]);

  // Handle role assignment
  const assignRole = (colorHex: string, role: ColorRole | null) => {
    setRoleAssignments(prev => {
      // Remove this role from any other color
      const updated = prev.map(r => ({
        ...r,
        role: r.role === role ? null : r.role,
      }));
      // Assign to the clicked color
      return updated.map(r => 
        r.hex === colorHex ? { ...r, role } : r
      );
    });
  };

  // Convert Radix scale to array format
  const radixScaleToSteps = (scale: RadixScale): { step: number; hex: string }[] => {
    return Object.entries(scale).map(([step, hex]) => ({
      step: parseInt(step),
      hex,
    }));
  };

  // Generate scale data for a color
  const generateScaleData = useCallback((
    hex: string,
    role: string,
    name: string,
    mode: 'light' | 'dark'
  ) => {
    if (scaleMethod === 'custom') {
      const scale = generateColorScale(hex, mode, name);
      return {
        name,
        role,
        steps: scale.steps.map(s => ({ step: s.step, hex: s.hex })),
      };
    } else {
      const family = findClosestRadixFamily(hex);
      const radixScale = mode === 'light' ? family.light : family.dark;
      return {
        name: family.displayName,
        role,
        steps: radixScaleToSteps(radixScale),
      };
    }
  }, [scaleMethod]);

  // Handle generate
  const handleGenerate = () => {
    // Build scales data
    const primary = roleAssignments.find(r => r.role === 'primary');
    const secondary = roleAssignments.find(r => r.role === 'secondary');
    const accent = roleAssignments.find(r => r.role === 'accent');

    // Get neutral scale
    const neutralScale = radixColors[effectiveNeutral];

    // Build light mode scales
    const lightScales: any = {
      neutral: {
        name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
        role: 'Neutral',
        steps: radixScaleToSteps(neutralScale.light),
      },
    };

    if (primary) {
      lightScales.primary = generateScaleData(primary.hex, 'Primary', primary.name, 'light');
    }
    if (secondary) {
      lightScales.secondary = generateScaleData(secondary.hex, 'Secondary', secondary.name, 'light');
    }
    if (accent) {
      lightScales.accent = generateScaleData(accent.hex, 'Accent', accent.name, 'light');
    }

    // Build dark mode scales if needed
    let darkScales: any = undefined;
    if (includeDarkMode) {
      darkScales = {
        neutral: {
          name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
          role: 'Neutral',
          steps: radixScaleToSteps(neutralScale.dark),
        },
      };

      if (primary) {
        darkScales.primary = generateScaleData(primary.hex, 'Primary', primary.name, 'dark');
      }
      if (secondary) {
        darkScales.secondary = generateScaleData(secondary.hex, 'Secondary', secondary.name, 'dark');
      }
      if (accent) {
        darkScales.accent = generateScaleData(accent.hex, 'Accent', accent.name, 'dark');
      }
    }

    // Calculate usage proportions based on assigned roles
    const usageProportions = {
      primary: primary ? 40 : 0,
      secondary: secondary ? 25 : 0,
      accent: accent ? 15 : 0,
      neutral: 20,
    };

    // Adjust if some roles are missing
    const total = usageProportions.primary + usageProportions.secondary + usageProportions.accent + usageProportions.neutral;
    if (total < 100) {
      usageProportions.neutral += (100 - total);
    }

    // Send to plugin
    onGenerate({
      sourceColors: colors,
      roleAssignments,
      scaleMethod,
      neutralFamily,
      detailLevel,
      includeDarkMode,
      systemName,
    });

    // Prepare scales data for messages
    const scalesPayload = {
      systemName,
      detailLevel,
      includeDarkMode,
      scales: {
        light: lightScales,
        dark: darkScales,
      },
      usageProportions,
    };

    // Send frame generation message
    parent.postMessage({
      pluginMessage: {
        type: 'generate-color-system',
        config: {
          sourceColors: colors,
          roleAssignments,
          scaleMethod,
          neutralFamily,
          detailLevel,
          includeDarkMode,
          systemName,
        },
        scales: scalesPayload,
      },
    }, '*');

    // Also create Figma color styles if requested
    if (createStyles) {
      parent.postMessage({
        pluginMessage: {
          type: 'create-color-styles',
          scales: scalesPayload,
          systemName,
        },
      }, '*');
    }

    onClose();
  };

  if (!isOpen) return null;

  const buttonStyle = (active = false): React.CSSProperties => ({
    padding: '10px 16px',
    borderRadius: '8px',
    border: active ? 'none' : `1px solid ${theme.border}`,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    backgroundColor: active ? theme.btnActive : theme.btnBg,
    color: active ? theme.btnActiveText : theme.text,
    transition: 'all 0.15s ease',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.textMuted,
    marginBottom: '8px',
    display: 'block',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '20px',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.cardBg,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: theme.text }}>
              Generate Color System
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: theme.textMuted }}>
              Create a complete design system from your palette
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.cardBg,
              color: theme.text,
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* System Name */}
          <div style={sectionStyle}>
            <label style={labelStyle}>System Name</label>
            <input
              type="text"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="My Color System"
            />
          </div>

          {/* Color Role Assignment */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Assign Color Roles</label>
            <p style={{ fontSize: '11px', color: theme.textMuted, margin: '0 0 12px' }}>
              Click a role button to assign it to a color
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roleAssignments.map((assignment) => (
                <div
                  key={assignment.hex}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px',
                    backgroundColor: theme.inputBg,
                    borderRadius: '8px',
                  }}
                >
                  {/* Color swatch */}
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      backgroundColor: assignment.hex,
                      flexShrink: 0,
                    }}
                  />
                  
                  {/* Color info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: theme.text, marginBottom: '2px' }}>
                      {assignment.name}
                    </div>
                    <div style={{ fontSize: '10px', color: theme.textMuted, fontFamily: 'monospace' }}>
                      {assignment.hex.toUpperCase()}
                    </div>
                  </div>

                  {/* Role buttons */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['primary', 'secondary', 'accent'] as ColorRole[]).map((role) => (
                      <button
                        key={role}
                        onClick={() => assignRole(assignment.hex, assignment.role === role ? null : role)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: assignment.role === role ? 'none' : `1px solid ${theme.border}`,
                          backgroundColor: assignment.role === role ? theme.accent : 'transparent',
                          color: assignment.role === role ? '#ffffff' : theme.textMuted,
                          fontSize: '9px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                        }}
                      >
                        {role.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scale Method */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Scale Generation Method</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setScaleMethod('custom')}
                style={{
                  ...buttonStyle(scaleMethod === 'custom'),
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Custom Scales</span>
                <span style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                  Generate from your exact colors
                </span>
              </button>
              <button
                onClick={() => setScaleMethod('radix-match')}
                style={{
                  ...buttonStyle(scaleMethod === 'radix-match'),
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Radix Match</span>
                <span style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                  Use closest Radix UI scale
                </span>
              </button>
            </div>
          </div>

          {/* Neutral Family */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Neutral Family</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setNeutralFamily('auto')}
                style={{
                  ...buttonStyle(neutralFamily === 'auto'),
                  padding: '8px 12px',
                  fontSize: '12px',
                }}
              >
                Auto ({suggestedNeutral})
              </button>
              {neutralFamilies.map((nf) => (
                <button
                  key={nf}
                  onClick={() => setNeutralFamily(nf)}
                  style={{
                    ...buttonStyle(neutralFamily === nf),
                    padding: '8px 12px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '3px',
                      backgroundColor: radixColors[nf].light[9],
                    }}
                  />
                  {nf.charAt(0).toUpperCase() + nf.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Output Detail Level */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Output Detail Level</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {([
                { id: 'minimal', label: 'Minimal', desc: 'Scales only' },
                { id: 'detailed', label: 'Detailed', desc: 'Scales + labels' },
                { id: 'presentation', label: 'Presentation', desc: 'Full framework' },
              ] as const).map((level) => (
                <button
                  key={level.id}
                  onClick={() => setDetailLevel(level.id)}
                  style={{
                    ...buttonStyle(detailLevel === level.id),
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '12px 8px',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{level.label}</span>
                  <span style={{ fontSize: '9px', opacity: 0.7, marginTop: '2px' }}>
                    {level.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scale Preview - Side by Side */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Scale Preview</label>
            <p style={{ fontSize: '11px', color: theme.textMuted, margin: '0 0 12px' }}>
              {scaleMethod === 'radix-match' ? 'Matched to closest Radix scale' : 'Custom generated scale'}
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Light Mode Preview */}
              <div
                style={{
                  flex: 1,
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  padding: '10px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ 
                  fontSize: '9px', 
                  fontWeight: 600, 
                  color: '#888',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  ☀️ Light
                </div>
                {previewScales && (
                  <>
                    <div style={{ display: 'flex', gap: '1px' }}>
                      {previewScales.steps.map((step) => (
                        <div
                          key={step.step}
                          style={{
                            flex: 1,
                            height: '24px',
                            backgroundColor: step.hex,
                            borderRadius: step.step === 1 ? '3px 0 0 3px' : step.step === 12 ? '0 3px 3px 0' : '0',
                          }}
                          title={`Step ${step.step}: ${step.hex}`}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span style={{ fontSize: '7px', color: '#aaa' }}>1</span>
                      <span style={{ fontSize: '7px', color: '#aaa' }}>12</span>
                    </div>
                  </>
                )}
              </div>

              {/* Dark Mode Preview */}
              {includeDarkMode && (
                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#1a1a1a',
                    borderRadius: '8px',
                    padding: '10px',
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <div style={{ 
                    fontSize: '9px', 
                    fontWeight: 600, 
                    color: '#888',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    🌙 Dark
                  </div>
                  {darkPreviewScales && (
                    <>
                      <div style={{ display: 'flex', gap: '1px' }}>
                        {darkPreviewScales.steps.map((step) => (
                          <div
                            key={step.step}
                            style={{
                              flex: 1,
                              height: '24px',
                              backgroundColor: step.hex,
                              borderRadius: step.step === 1 ? '3px 0 0 3px' : step.step === 12 ? '0 3px 3px 0' : '0',
                            }}
                            title={`Step ${step.step}: ${step.hex}`}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span style={{ fontSize: '7px', color: '#666' }}>1</span>
                        <span style={{ fontSize: '7px', color: '#666' }}>12</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Include Dark Mode Toggle */}
          <div style={sectionStyle}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                padding: '12px',
                backgroundColor: theme.inputBg,
                borderRadius: '8px',
              }}
            >
              <input
                type="checkbox"
                checked={includeDarkMode}
                onChange={(e) => setIncludeDarkMode(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>
                  Include Dark Mode
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  Generate both light and dark variants
                </div>
              </div>
            </label>
          </div>

          {/* Create Color Styles Toggle */}
          <div style={sectionStyle}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                padding: '12px',
                backgroundColor: theme.inputBg,
                borderRadius: '8px',
                border: createStyles ? `2px solid ${theme.accent}` : `1px solid transparent`,
              }}
            >
              <input
                type="checkbox"
                checked={createStyles}
                onChange={(e) => setCreateStyles(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>
                  Create Figma Color Styles
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  Add colors to your Figma styles library
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          gap: '12px',
        }}>
          <button
            onClick={onClose}
            style={{
              ...buttonStyle(),
              flex: 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            style={{
              ...buttonStyle(true),
              flex: 2,
              backgroundColor: theme.accent,
              color: '#ffffff',
            }}
          >
            🎨 Generate Color System
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColorSystemModal;

