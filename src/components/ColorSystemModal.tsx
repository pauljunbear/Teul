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
  tertiary?: ExportScale;
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
  const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
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
    const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
    
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
    const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
    
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
type ColorRole = 'primary' | 'secondary' | 'tertiary' | 'accent';
type ScaleMethod = 'custom' | 'radix-match';
type OutputDetailLevel = 'minimal' | 'detailed' | 'presentation';
type ThemeMode = 'light' | 'dark';

interface RoleAssignment {
  hex: string;
  name: string;
  role: ColorRole | null;
  // For multi-select mode (Werner colors with many related colors)
  roles?: ColorRole[];
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
  
  // Multi-select mode: allows multiple colors per role (useful for Werner colors with many related colors)
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  
  // Initialize role assignments from colors
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);

  // Auto-enable multi-select mode when there are more than 4 colors
  React.useEffect(() => {
    if (colors && colors.length > 4) {
      setMultiSelectMode(true);
    }
  }, [colors]);

  // Update role assignments when colors change (e.g., when modal opens with new colors)
  React.useEffect(() => {
    if (colors && colors.length > 0) {
      setRoleAssignments(
        colors.map((c, i) => ({
          hex: c.hex,
          name: c.name,
          role: i === 0 ? 'primary' : i === 1 ? 'secondary' : i === 2 ? 'tertiary' : i === 3 ? 'accent' : null,
          roles: i === 0 ? ['primary'] : i === 1 ? ['secondary'] : i === 2 ? ['tertiary'] : i === 3 ? ['accent'] : [],
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

  // Get all colors assigned to a specific role (supports multi-select mode)
  const getColorsForRole = (role: ColorRole): RoleAssignment[] => {
    if (multiSelectMode) {
      return roleAssignments.filter(r => r.roles?.includes(role));
    }
    const found = roleAssignments.find(r => r.role === role);
    return found ? [found] : [];
  };

  // Compute full scales for export
  const exportScales = useMemo(() => {
    const primaries = getColorsForRole('primary');
    const secondaries = getColorsForRole('secondary');
    const tertiaries = getColorsForRole('tertiary');
    const accents = getColorsForRole('accent');
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

    // For multi-select, use first color of each role for the main export
    // Additional colors will be exported separately
    const light: ExportScales = {
      primary: buildScale(primaries[0], 'Primary', 'light'),
      secondary: buildScale(secondaries[0], 'Secondary', 'light'),
      tertiary: buildScale(tertiaries[0], 'Tertiary', 'light'),
      accent: buildScale(accents[0], 'Accent', 'light'),
      neutral: {
        name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
        role: 'Neutral',
        steps: Object.entries(neutralScale.light).map(([step, hex]) => ({ step: parseInt(step), hex })),
      },
    };

    const dark: ExportScales | undefined = includeDarkMode ? {
      primary: buildScale(primaries[0], 'Primary', 'dark'),
      secondary: buildScale(secondaries[0], 'Secondary', 'dark'),
      tertiary: buildScale(tertiaries[0], 'Tertiary', 'dark'),
      accent: buildScale(accents[0], 'Accent', 'dark'),
      neutral: {
        name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
        role: 'Neutral',
        steps: Object.entries(neutralScale.dark).map(([step, hex]) => ({ step: parseInt(step), hex })),
      },
    } : undefined;

    return { light, dark };
  }, [roleAssignments, scaleMethod, effectiveNeutral, includeDarkMode, multiSelectMode]);

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
    if (multiSelectMode) {
      // Multi-select mode: toggle the role for this color (multiple colors can have same role)
      setRoleAssignments(prev => {
        return prev.map(r => {
          if (r.hex === colorHex) {
            const currentRoles = r.roles || [];
            if (role === null) {
              // Clear all roles
              return { ...r, role: null, roles: [] };
            }
            const hasRole = currentRoles.includes(role);
            const newRoles = hasRole 
              ? currentRoles.filter(cr => cr !== role) 
              : [...currentRoles, role];
            // Update legacy 'role' field to first role or null
            return { ...r, role: newRoles[0] || null, roles: newRoles };
          }
          return r;
        });
      });
    } else {
      // Single-select mode: only one color per role
      setRoleAssignments(prev => {
        // Remove this role from any other color
        const updated = prev.map(r => ({
          ...r,
          role: r.role === role ? null : r.role,
          roles: r.roles?.filter(cr => cr !== role) || [],
        }));
        // Assign to the clicked color
        return updated.map(r => {
          if (r.hex === colorHex) {
            if (role === null) {
              return { ...r, role: null, roles: [] };
            }
            return { ...r, role, roles: [role] };
          }
          return r;
        });
      });
    }
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
    // Get colors for each role (supports multiple colors per role in multi-select mode)
    const primaries = getColorsForRole('primary');
    const secondaries = getColorsForRole('secondary');
    const tertiaries = getColorsForRole('tertiary');
    const accents = getColorsForRole('accent');

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

    // Add primary scales (support multiple)
    if (primaries.length > 0) {
      lightScales.primary = generateScaleData(primaries[0].hex, 'Primary', primaries[0].name, 'light');
      // Add additional primaries with numbered keys
      primaries.slice(1).forEach((p, i) => {
        lightScales[`primary${i + 2}`] = generateScaleData(p.hex, `Primary ${i + 2}`, p.name, 'light');
      });
    }
    
    // Add secondary scales (support multiple)
    if (secondaries.length > 0) {
      lightScales.secondary = generateScaleData(secondaries[0].hex, 'Secondary', secondaries[0].name, 'light');
      secondaries.slice(1).forEach((s, i) => {
        lightScales[`secondary${i + 2}`] = generateScaleData(s.hex, `Secondary ${i + 2}`, s.name, 'light');
      });
    }
    
    // Add tertiary scales (support multiple)
    if (tertiaries.length > 0) {
      lightScales.tertiary = generateScaleData(tertiaries[0].hex, 'Tertiary', tertiaries[0].name, 'light');
      tertiaries.slice(1).forEach((t, i) => {
        lightScales[`tertiary${i + 2}`] = generateScaleData(t.hex, `Tertiary ${i + 2}`, t.name, 'light');
      });
    }
    
    // Add accent scales (support multiple)
    if (accents.length > 0) {
      lightScales.accent = generateScaleData(accents[0].hex, 'Accent', accents[0].name, 'light');
      accents.slice(1).forEach((a, i) => {
        lightScales[`accent${i + 2}`] = generateScaleData(a.hex, `Accent ${i + 2}`, a.name, 'light');
      });
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

      if (primaries.length > 0) {
        darkScales.primary = generateScaleData(primaries[0].hex, 'Primary', primaries[0].name, 'dark');
        primaries.slice(1).forEach((p, i) => {
          darkScales[`primary${i + 2}`] = generateScaleData(p.hex, `Primary ${i + 2}`, p.name, 'dark');
        });
      }
      if (secondaries.length > 0) {
        darkScales.secondary = generateScaleData(secondaries[0].hex, 'Secondary', secondaries[0].name, 'dark');
        secondaries.slice(1).forEach((s, i) => {
          darkScales[`secondary${i + 2}`] = generateScaleData(s.hex, `Secondary ${i + 2}`, s.name, 'dark');
        });
      }
      if (tertiaries.length > 0) {
        darkScales.tertiary = generateScaleData(tertiaries[0].hex, 'Tertiary', tertiaries[0].name, 'dark');
        tertiaries.slice(1).forEach((t, i) => {
          darkScales[`tertiary${i + 2}`] = generateScaleData(t.hex, `Tertiary ${i + 2}`, t.name, 'dark');
        });
      }
      if (accents.length > 0) {
        darkScales.accent = generateScaleData(accents[0].hex, 'Accent', accents[0].name, 'dark');
        accents.slice(1).forEach((a, i) => {
          darkScales[`accent${i + 2}`] = generateScaleData(a.hex, `Accent ${i + 2}`, a.name, 'dark');
        });
      }
    }

    // Calculate usage proportions based on assigned roles
    const totalAssigned = primaries.length + secondaries.length + tertiaries.length + accents.length;
    const usageProportions = {
      primary: primaries.length > 0 ? Math.round(35 / primaries.length) : 0,
      secondary: secondaries.length > 0 ? Math.round(20 / secondaries.length) : 0,
      tertiary: tertiaries.length > 0 ? Math.round(15 / tertiaries.length) : 0,
      accent: accents.length > 0 ? Math.round(10 / accents.length) : 0,
      neutral: 20,
    };

    // Adjust if some roles are missing
    const total = (usageProportions.primary * primaries.length) + 
                  (usageProportions.secondary * secondaries.length) + 
                  (usageProportions.tertiary * tertiaries.length) + 
                  (usageProportions.accent * accents.length) + 
                  usageProportions.neutral;
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
      scaleMethod,
      multiSelectMode,
      scales: {
        light: lightScales,
        dark: darkScales,
      },
      usageProportions,
      // Include counts for multi-select mode
      colorCounts: {
        primary: primaries.length,
        secondary: secondaries.length,
        tertiary: tertiaries.length,
        accent: accents.length,
      },
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

          {/* Multi-select Mode Toggle (show only when more than 4 colors) */}
          {colors.length > 4 && (
            <div style={sectionStyle}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  padding: '12px',
                  backgroundColor: multiSelectMode ? `${theme.accent}15` : theme.inputBg,
                  borderRadius: '8px',
                  border: multiSelectMode ? `2px solid ${theme.accent}` : `1px solid transparent`,
                }}
              >
                <input
                  type="checkbox"
                  checked={multiSelectMode}
                  onChange={(e) => setMultiSelectMode(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>
                    Multi-Select Mode
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>
                    Allow multiple colors per role (recommended for palettes with 5+ colors)
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Color Role Assignment */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Assign Color Roles</label>
            <p style={{ fontSize: '11px', color: theme.textMuted, margin: '0 0 12px' }}>
              {multiSelectMode 
                ? 'Click roles to toggle. Multiple colors can share the same role.'
                : 'Each role can only be assigned to one color. Click again to unassign.'
              }
              <br />
              <span style={{ opacity: 0.7 }}>Unassigned colors will not be included in the output.</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roleAssignments.map((assignment) => {
                const activeRoles = multiSelectMode ? (assignment.roles || []) : (assignment.role ? [assignment.role] : []);
                const isUnassigned = activeRoles.length === 0;
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
                      {(['primary', 'secondary', 'tertiary', 'accent'] as ColorRole[]).map((role) => {
                        const isSelected = activeRoles.includes(role);
                        const roleColors: Record<ColorRole, string> = {
                          primary: '#3b82f6',
                          secondary: '#8b5cf6',
                          tertiary: '#10b981',
                          accent: '#f59e0b',
                        };
                        return (
                          <button
                            key={role}
                            onClick={() => assignRole(assignment.hex, isSelected && !multiSelectMode ? null : role)}
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

