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

// ============================================
// Export Functions
// ============================================

interface ExportScale {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
}

interface ExportScales {
  primary?: ExportScale;
  secondary?: ExportScale;
  accent?: ExportScale;
  neutral: ExportScale;
}

// Convert step number to CSS variable name suffix
function stepToVarSuffix(step: number): string {
  const mapping: Record<number, string> = {
    1: '50', 2: '100', 3: '200', 4: '300', 5: '400', 6: '500',
    7: '600', 8: '700', 9: '800', 10: '900', 11: '950', 12: '1000',
  };
  return mapping[step] || step.toString();
}

// Export as CSS custom properties
function exportAsCSS(
  scales: ExportScales, 
  darkScales: ExportScales | undefined,
  systemName: string
): string {
  const prefix = systemName.toLowerCase().replace(/\s+/g, '-');
  let css = `/* ${systemName} Color System */\n`;
  css += `/* Generated with Wado Sanzo Colors */\n\n`;
  
  css += `:root {\n`;
  
  // Light mode variables
  const scaleOrder = ['primary', 'secondary', 'accent', 'neutral'] as const;
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale) {
      css += `  /* ${scale.role} */\n`;
      for (const step of scale.steps) {
        css += `  --${prefix}-${key}-${stepToVarSuffix(step.step)}: ${step.hex};\n`;
      }
      css += `\n`;
    }
  }
  css += `}\n`;

  // Dark mode variables
  if (darkScales) {
    css += `\n/* Dark Mode */\n`;
    css += `[data-theme="dark"],\n.dark {\n`;
    for (const key of scaleOrder) {
      const scale = darkScales[key];
      if (scale) {
        css += `  /* ${scale.role} */\n`;
        for (const step of scale.steps) {
          css += `  --${prefix}-${key}-${stepToVarSuffix(step.step)}: ${step.hex};\n`;
        }
        css += `\n`;
      }
    }
    css += `}\n`;
  }

  return css;
}

// Export as Tailwind config
function exportAsTailwind(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string
): string {
  const prefix = systemName.toLowerCase().replace(/\s+/g, '-');
  
  const buildColorObject = (scalesData: ExportScales): Record<string, Record<string, string>> => {
    const colors: Record<string, Record<string, string>> = {};
    const scaleOrder = ['primary', 'secondary', 'accent', 'neutral'] as const;
    
    for (const key of scaleOrder) {
      const scale = scalesData[key];
      if (scale) {
        colors[key] = {};
        for (const step of scale.steps) {
          colors[key][stepToVarSuffix(step.step)] = step.hex;
        }
      }
    }
    return colors;
  };

  const lightColors = buildColorObject(scales);
  
  let config = `// ${systemName} - Tailwind CSS Config\n`;
  config += `// Generated with Wado Sanzo Colors\n\n`;
  config += `module.exports = {\n`;
  config += `  theme: {\n`;
  config += `    extend: {\n`;
  config += `      colors: ${JSON.stringify(lightColors, null, 8).replace(/"/g, "'").split('\n').map((line, i) => i === 0 ? line : '      ' + line).join('\n')},\n`;
  config += `    },\n`;
  config += `  },\n`;
  config += `};\n`;

  if (darkScales) {
    const darkColors = buildColorObject(darkScales);
    config += `\n// Dark mode colors (use with darkMode: 'class')\n`;
    config += `// Add to your CSS or use CSS variables approach:\n`;
    config += `/*\n${JSON.stringify(darkColors, null, 2)}\n*/\n`;
  }

  return config;
}

// Export as JSON
function exportAsJSON(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string
): string {
  const buildScaleObject = (scalesData: ExportScales) => {
    const result: Record<string, any> = {};
    const scaleOrder = ['primary', 'secondary', 'accent', 'neutral'] as const;
    
    for (const key of scaleOrder) {
      const scale = scalesData[key];
      if (scale) {
        result[key] = {
          name: scale.name,
          role: scale.role,
          colors: scale.steps.reduce((acc, step) => {
            acc[stepToVarSuffix(step.step)] = step.hex;
            return acc;
          }, {} as Record<string, string>),
        };
      }
    }
    return result;
  };

  const data: Record<string, any> = {
    name: systemName,
    generatedAt: new Date().toISOString(),
    generator: 'Wado Sanzo Colors',
    light: buildScaleObject(scales),
  };

  if (darkScales) {
    data.dark = buildScaleObject(darkScales);
  }

  return JSON.stringify(data, null, 2);
}

// Copy to clipboard helper
function copyToClipboard(text: string, label: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    parent.postMessage({ pluginMessage: { type: 'notify', text: `Copied ${label} to clipboard` } }, '*');
  } catch {
    parent.postMessage({ pluginMessage: { type: 'notify', text: 'Copy failed' } }, '*');
  }
  document.body.removeChild(textarea);
}

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
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'css' | 'tailwind' | 'json'>('css');
  
  // Initialize role assignments from colors
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);

  // Update role assignments when colors change (e.g., when modal opens with new colors)
  React.useEffect(() => {
    if (colors && colors.length > 0) {
      setRoleAssignments(
        colors.map((c, i) => ({
          hex: c.hex,
          name: c.name,
          role: i === 0 ? 'primary' : i === 1 ? 'secondary' : i === 2 ? 'accent' : null,
        }))
      );
    }
  }, [colors]);

  // Update system name when combinationName changes
  React.useEffect(() => {
    if (combinationName) {
      setSystemName(combinationName);
    }
  }, [combinationName]);

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

  // Compute full scales for export
  const exportScales = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary');
    const secondary = roleAssignments.find(r => r.role === 'secondary');
    const accent = roleAssignments.find(r => r.role === 'accent');
    const neutralScale = radixColors[effectiveNeutral];

    const buildScale = (assignment: RoleAssignment | undefined, role: string, mode: 'light' | 'dark'): ExportScale | undefined => {
      if (!assignment) return undefined;
      if (scaleMethod === 'custom') {
        const scale = generateColorScale(assignment.hex, mode, assignment.name);
        return {
          name: assignment.name,
          role,
          steps: scale.steps.map(s => ({ step: s.step, hex: s.hex })),
        };
      } else {
        const family = findClosestRadixFamily(assignment.hex);
        const radixScale = mode === 'light' ? family.light : family.dark;
        return {
          name: family.displayName,
          role,
          steps: Object.entries(radixScale).map(([step, hex]) => ({ step: parseInt(step), hex })),
        };
      }
    };

    const light: ExportScales = {
      primary: buildScale(primary, 'Primary', 'light'),
      secondary: buildScale(secondary, 'Secondary', 'light'),
      accent: buildScale(accent, 'Accent', 'light'),
      neutral: {
        name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
        role: 'Neutral',
        steps: Object.entries(neutralScale.light).map(([step, hex]) => ({ step: parseInt(step), hex })),
      },
    };

    const dark: ExportScales | undefined = includeDarkMode ? {
      primary: buildScale(primary, 'Primary', 'dark'),
      secondary: buildScale(secondary, 'Secondary', 'dark'),
      accent: buildScale(accent, 'Accent', 'dark'),
      neutral: {
        name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
        role: 'Neutral',
        steps: Object.entries(neutralScale.dark).map(([step, hex]) => ({ step: parseInt(step), hex })),
      },
    } : undefined;

    return { light, dark };
  }, [roleAssignments, scaleMethod, effectiveNeutral, includeDarkMode]);

  // Generate export content
  const exportContent = useMemo(() => {
    switch (exportFormat) {
      case 'css':
        return exportAsCSS(exportScales.light, exportScales.dark, systemName);
      case 'tailwind':
        return exportAsTailwind(exportScales.light, exportScales.dark, systemName);
      case 'json':
        return exportAsJSON(exportScales.light, exportScales.dark, systemName);
      default:
        return '';
    }
  }, [exportFormat, exportScales, systemName]);

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
              Each role can only be assigned to one color. Click again to unassign.
              <br />
              <span style={{ opacity: 0.7 }}>Unassigned colors will not be included in the output.</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roleAssignments.map((assignment) => {
                const isUnassigned = assignment.role === null;
                return (
                  <div
                    key={assignment.hex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px',
                      backgroundColor: theme.inputBg,
                      borderRadius: '8px',
                      opacity: isUnassigned ? 0.5 : 1,
                      border: isUnassigned ? `1px dashed ${theme.border}` : '1px solid transparent',
                      transition: 'opacity 0.2s, border 0.2s',
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
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 600, 
                        color: theme.text, 
                        marginBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        {assignment.name}
                        {isUnassigned && (
                          <span style={{ 
                            fontSize: '9px', 
                            color: theme.textMuted, 
                            fontWeight: 400,
                            fontStyle: 'italic',
                          }}>
                            (not included)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: theme.textMuted, fontFamily: 'monospace' }}>
                        {assignment.hex.toUpperCase()}
                      </div>
                    </div>

                    {/* Role buttons */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['primary', 'secondary', 'accent'] as ColorRole[]).map((role) => {
                        const isSelected = assignment.role === role;
                        const roleColors: Record<ColorRole, string> = {
                          primary: '#3b82f6',
                          secondary: '#8b5cf6', 
                          accent: '#f59e0b',
                        };
                        return (
                          <button
                            key={role}
                            onClick={() => assignRole(assignment.hex, isSelected ? null : role)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: isSelected ? 'none' : `1px solid ${theme.border}`,
                              backgroundColor: isSelected ? roleColors[role] : 'transparent',
                              color: isSelected ? '#ffffff' : theme.textMuted,
                              fontSize: '9px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textTransform: 'uppercase',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {role.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
              {neutralFamilies.map((nf) => {
                const scale = radixColors[nf].light;
                return (
                  <button
                    key={nf}
                    onClick={() => setNeutralFamily(nf)}
                    style={{
                      ...buttonStyle(neutralFamily === nf),
                      padding: '8px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {/* Mini gradient strip showing the neutral family's tint */}
                    <div style={{ display: 'flex', borderRadius: '3px', overflow: 'hidden' }}>
                      <span style={{ width: '8px', height: '16px', backgroundColor: scale[3] }} />
                      <span style={{ width: '8px', height: '16px', backgroundColor: scale[6] }} />
                      <span style={{ width: '8px', height: '16px', backgroundColor: scale[9] }} />
                      <span style={{ width: '8px', height: '16px', backgroundColor: scale[11] }} />
                    </div>
                    {nf.charAt(0).toUpperCase() + nf.slice(1)}
                  </button>
                );
              })}
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

          {/* Export Section */}
          <div style={sectionStyle}>
            <button
              onClick={() => setShowExport(!showExport)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>📤 Export Code</span>
              <span style={{ fontSize: '16px' }}>{showExport ? '▲' : '▼'}</span>
            </button>

            {showExport && (
              <div style={{ marginTop: '12px' }}>
                {/* Format selector */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {([
                    { id: 'css', label: 'CSS' },
                    { id: 'tailwind', label: 'Tailwind' },
                    { id: 'json', label: 'JSON' },
                  ] as const).map((format) => (
                    <button
                      key={format.id}
                      onClick={() => setExportFormat(format.id)}
                      style={{
                        ...buttonStyle(exportFormat === format.id),
                        flex: 1,
                        padding: '8px',
                        fontSize: '12px',
                      }}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>

                {/* Preview area */}
                <div
                  style={{
                    backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
                    borderRadius: '8px',
                    padding: '12px',
                    border: `1px solid ${theme.border}`,
                    maxHeight: '200px',
                    overflow: 'auto',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: '10px',
                      fontFamily: 'Monaco, Consolas, monospace',
                      color: theme.text,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      lineHeight: 1.4,
                    }}
                  >
                    {exportContent}
                  </pre>
                </div>

                {/* Copy button */}
                <button
                  onClick={() => copyToClipboard(exportContent, exportFormat.toUpperCase())}
                  style={{
                    ...buttonStyle(true),
                    width: '100%',
                    marginTop: '8px',
                    padding: '10px',
                    backgroundColor: '#22c55e',
                  }}
                >
                  📋 Copy {exportFormat.toUpperCase()}
                </button>
              </div>
            )}
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

