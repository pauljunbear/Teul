import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { generateColorScale, type ColorScale } from '../lib/colorScale';
import { copyToClipboard } from '../lib/clipboard';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { ColorScaleValidationSummary } from './ColorScaleValidationSummary';
import { SemanticPolicySummary } from './SemanticPolicySummary';
import { buildSemanticColorPolicy } from '../lib/semanticColorPolicy';
import type {
  ColorSystemOperationResultMessage,
  NormalizedDocumentColorProfile,
} from '../types/messages';
import {
  findClosestRadixFamily,
  getNeutralForAccent,
  RADIX_COLORS_VERSION,
  radixColors,
  neutralFamilies,
  type NeutralName,
} from '../lib/radixColors';
import {
  exportAsCSS,
  exportAsTailwind,
  exportAsJSON,
  type ExportScales,
  type ExportScale,
} from '../lib/colorExport';

// Types
type ColorRole = 'primary' | 'secondary' | 'tertiary' | 'accent';
type ScaleMethod = 'custom' | 'radix-match' | 'wcag-constrained';
type OutputDetailLevel = 'minimal' | 'detailed' | 'presentation';
const MAX_SYSTEM_NAME_LENGTH = 512;

const getSystemNameError = (systemName: string): string | null => {
  if (systemName.trim().length === 0) {
    return 'Enter a system name.';
  }
  if (systemName.length > MAX_SYSTEM_NAME_LENGTH) {
    return `System name must be ${MAX_SYSTEM_NAME_LENGTH} characters or fewer.`;
  }
  return null;
};

interface RoleAssignment {
  hex: string;
  name: string;
  role: ColorRole | null;
  // For multi-select mode when a source palette assigns several colors to one role.
  roles?: ColorRole[];
}

interface ColorSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  colors: { hex: string; name: string }[];
  combinationName: string;
  isDark: boolean;
  documentColorProfile?: NormalizedDocumentColorProfile;
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
  documentColorProfile = 'unknown',
}) => {
  const theme = getStyles(isDark);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useModalAccessibility({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  // State
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>('custom');
  const [neutralFamily, setNeutralFamily] = useState<NeutralName | 'auto'>('auto');
  const [detailLevel, setDetailLevel] = useState<OutputDetailLevel>('detailed');
  const [includeDarkMode, setIncludeDarkMode] = useState(true);
  const [createStyles, setCreateStyles] = useState(false);
  const [systemName, setSystemName] = useState(combinationName || 'My Color System');
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'css' | 'tailwind' | 'json'>('css');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const pendingRequestIdRef = React.useRef<string | null>(null);
  const nextRequestIdRef = React.useRef(0);
  const systemNameError = getSystemNameError(systemName);

  // Multi-select mode allows multiple source colors per role.
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Initialize role assignments from colors
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);

  // Auto-enable multi-select mode when there are more than 4 colors
  React.useEffect(() => {
    setMultiSelectMode(Boolean(colors && colors.length > 4));
  }, [colors]);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const message = event.data?.pluginMessage as Partial<ColorSystemOperationResultMessage>;
      if (
        message.type !== 'color-system-operation-result' ||
        typeof message.requestId !== 'string' ||
        message.requestId !== pendingRequestIdRef.current ||
        typeof message.success !== 'boolean'
      ) {
        return;
      }

      pendingRequestIdRef.current = null;
      setIsSubmitting(false);
      if (message.success) {
        setSubmissionError(null);
        onClose();
      } else {
        setSubmissionError(message.error || 'Failed to generate color system');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);

  React.useEffect(() => {
    if (isOpen) setSubmissionError(null);
  }, [isOpen]);

  // Update role assignments when colors change (e.g., when modal opens with new colors)
  React.useEffect(() => {
    if (colors && colors.length > 0) {
      setRoleAssignments(
        colors.map((c, i) => ({
          hex: c.hex,
          name: c.name,
          role:
            i === 0
              ? 'primary'
              : i === 1
                ? 'secondary'
                : i === 2
                  ? 'tertiary'
                  : i === 3
                    ? 'accent'
                    : null,
          roles:
            i === 0
              ? ['primary']
              : i === 1
                ? ['secondary']
                : i === 2
                  ? ['tertiary']
                  : i === 3
                    ? ['accent']
                    : [],
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
    const primary = roleAssignments.find(r => r.role === 'primary' || r.roles?.includes('primary'));
    if (primary) {
      return getNeutralForAccent(primary.hex);
    }
    return 'gray';
  }, [roleAssignments]);

  const effectiveNeutral = neutralFamily === 'auto' ? suggestedNeutral : neutralFamily;

  // Generate preview scales (light mode)
  const previewScales = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary' || r.roles?.includes('primary'));
    if (!primary) return null;

    if (scaleMethod !== 'radix-match') {
      return generateColorScale(primary.hex, 'light', 'Primary');
    } else {
      const family = findClosestRadixFamily(primary.hex);
      return {
        name: family.displayName,
        baseHex: primary.hex,
        steps: Object.entries(family.light).map(([step, hex]) => ({
          step: parseInt(step),
          hex,
          oklch: { l: 0, c: 0, h: 0 },
          usage: '',
        })),
        mode: 'light' as const,
      } as ColorScale;
    }
  }, [roleAssignments, scaleMethod]);

  // Generate dark preview scales
  const darkPreviewScales = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary' || r.roles?.includes('primary'));
    if (!primary) return null;

    if (scaleMethod !== 'radix-match') {
      return generateColorScale(primary.hex, 'dark', 'Primary');
    } else {
      const family = findClosestRadixFamily(primary.hex);
      return {
        name: family.displayName,
        baseHex: primary.hex,
        steps: Object.entries(family.dark).map(([step, hex]) => ({
          step: parseInt(step),
          hex,
          oklch: { l: 0, c: 0, h: 0 },
          usage: '',
        })),
        mode: 'dark' as const,
      } as ColorScale;
    }
  }, [roleAssignments, scaleMethod]);

  // Get all colors assigned to a specific role (supports multi-select mode)
  const getColorsForRole = useCallback(
    (role: ColorRole): RoleAssignment[] => {
      if (multiSelectMode) {
        return roleAssignments.filter(r => r.roles?.includes(role));
      }
      const found = roleAssignments.find(r => r.role === role);
      return found ? [found] : [];
    },
    [multiSelectMode, roleAssignments]
  );

  // Compute full scales for export
  const exportScales = useMemo(() => {
    const primaries = getColorsForRole('primary');
    const secondaries = getColorsForRole('secondary');
    const tertiaries = getColorsForRole('tertiary');
    const accents = getColorsForRole('accent');
    const neutralScale = radixColors[effectiveNeutral];

    const buildScale = (
      assignment: RoleAssignment | undefined,
      role: string,
      mode: 'light' | 'dark'
    ): ExportScale | undefined => {
      if (!assignment) return undefined;
      if (scaleMethod !== 'radix-match') {
        const scale = generateColorScale(assignment.hex, mode, assignment.name);
        return {
          name: assignment.name,
          role,
          steps: scale.steps.map(s => ({ step: s.step, hex: s.hex })),
          profile: scale.profile,
          method: scale.method,
          mode,
          validation: scale.validation,
        };
      } else {
        const family = findClosestRadixFamily(assignment.hex);
        const radixScale = mode === 'light' ? family.light : family.dark;
        return {
          name: family.displayName,
          role,
          method: 'Radix Colors',
          profile: 'sRGB',
          mode,
          sourceVersion: RADIX_COLORS_VERSION,
          sourceFamily: family.name,
          sourceInputHex: assignment.hex.toLowerCase(),
          steps: Object.entries(radixScale).map(([step, hex]) => ({ step: parseInt(step), hex })),
        };
      }
    };

    const light: ExportScales = {
      neutral: {
        name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
        role: 'Neutral',
        profile: 'sRGB',
        method: 'Radix Colors',
        mode: 'light',
        sourceVersion: RADIX_COLORS_VERSION,
        sourceFamily: neutralScale.name,
        steps: Object.entries(neutralScale.light).map(([step, hex]) => ({
          step: parseInt(step),
          hex,
        })),
      },
    };

    const addRoleScales = (
      target: ExportScales,
      assignments: RoleAssignment[],
      key: ColorRole,
      label: string,
      mode: 'light' | 'dark'
    ) => {
      assignments.forEach((assignment, index) => {
        const scale = buildScale(assignment, index === 0 ? label : `${label} ${index + 1}`, mode);
        if (scale) {
          target[index === 0 ? key : `${key}${index + 1}`] = scale;
        }
      });
    };

    addRoleScales(light, primaries, 'primary', 'Primary', 'light');
    addRoleScales(light, secondaries, 'secondary', 'Secondary', 'light');
    addRoleScales(light, tertiaries, 'tertiary', 'Tertiary', 'light');
    addRoleScales(light, accents, 'accent', 'Accent', 'light');

    const dark: ExportScales | undefined = includeDarkMode
      ? {
          neutral: {
            name: effectiveNeutral.charAt(0).toUpperCase() + effectiveNeutral.slice(1),
            role: 'Neutral',
            profile: 'sRGB',
            method: 'Radix Colors',
            mode: 'dark',
            sourceVersion: RADIX_COLORS_VERSION,
            sourceFamily: neutralScale.name,
            steps: Object.entries(neutralScale.dark).map(([step, hex]) => ({
              step: parseInt(step),
              hex,
            })),
          },
        }
      : undefined;

    if (dark) {
      addRoleScales(dark, primaries, 'primary', 'Primary', 'dark');
      addRoleScales(dark, secondaries, 'secondary', 'Secondary', 'dark');
      addRoleScales(dark, tertiaries, 'tertiary', 'Tertiary', 'dark');
      addRoleScales(dark, accents, 'accent', 'Accent', 'dark');
    }

    return { light, dark };
  }, [getColorsForRole, scaleMethod, effectiveNeutral, includeDarkMode]);

  const semanticPolicy = useMemo(
    () =>
      scaleMethod === 'wcag-constrained'
        ? buildSemanticColorPolicy(exportScales.light, exportScales.dark)
        : undefined,
    [exportScales, scaleMethod]
  );

  const primaryRadixMatch = useMemo(() => {
    if (scaleMethod !== 'radix-match') return null;
    const primary = getColorsForRole('primary')[0];
    if (!primary) return null;
    const family = findClosestRadixFamily(primary.hex);
    return {
      inputHex: primary.hex.toUpperCase(),
      familyName: family.displayName,
      familyStep9: family.light[9].toUpperCase(),
    };
  }, [getColorsForRole, scaleMethod]);

  // Generate export content
  const exportContent = useMemo(() => {
    const exportOptions = {
      scaleMethod,
      semanticPolicy: semanticPolicy?.valid ? semanticPolicy : undefined,
    };
    try {
      switch (exportFormat) {
        case 'css':
          return exportAsCSS(exportScales.light, exportScales.dark, systemName, exportOptions);
        case 'tailwind':
          return exportAsTailwind(exportScales.light, exportScales.dark, systemName, exportOptions);
        case 'json':
          return exportAsJSON(exportScales.light, exportScales.dark, systemName, exportOptions);
        default:
          return '';
      }
    } catch (error) {
      return error instanceof Error ? error.message : 'Export unavailable';
    }
  }, [exportFormat, exportScales, scaleMethod, semanticPolicy, systemName]);

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

  // Handle generate
  const handleGenerate = () => {
    if (systemNameError || pendingRequestIdRef.current) return;

    // Get colors for each role (supports multiple colors per role in multi-select mode)
    const primaries = getColorsForRole('primary');
    const secondaries = getColorsForRole('secondary');
    const tertiaries = getColorsForRole('tertiary');
    const accents = getColorsForRole('accent');

    // Usage proportions describe the aggregate role, even when it has multiple colors.
    const usageProportions = {
      primary: primaries.length > 0 ? 35 : 0,
      secondary: secondaries.length > 0 ? 20 : 0,
      tertiary: tertiaries.length > 0 ? 15 : 0,
      accent: accents.length > 0 ? 10 : 0,
      neutral: 20,
    };

    // Adjust if some roles are missing
    const total =
      usageProportions.primary +
      usageProportions.secondary +
      usageProportions.tertiary +
      usageProportions.accent +
      usageProportions.neutral;
    if (total < 100) {
      usageProportions.neutral += 100 - total;
    }

    const config = {
      sourceColors: colors,
      roleAssignments,
      scaleMethod,
      neutralFamily,
      detailLevel,
      includeDarkMode,
      systemName,
      documentColorProfile,
    };

    // Prepare scales data for messages
    const scalesPayload = {
      systemName,
      documentColorProfile,
      detailLevel,
      includeDarkMode,
      scaleMethod,
      multiSelectMode,
      scales: {
        light: exportScales.light,
        dark: exportScales.dark,
      },
      usageProportions,
      // Include counts for multi-select mode
      colorCounts: {
        primary: primaries.length,
        secondary: secondaries.length,
        tertiary: tertiaries.length,
        accent: accents.length,
      },
      semanticPolicy,
    };

    const requestId = `color-system-${Date.now()}-${++nextRequestIdRef.current}`;
    pendingRequestIdRef.current = requestId;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      parent.postMessage(
        {
          pluginMessage: {
            type: 'generate-color-system',
            requestId,
            createStyles,
            config,
            scales: scalesPayload,
          },
        },
        '*'
      );
    } catch (error) {
      pendingRequestIdRef.current = null;
      setIsSubmitting(false);
      setSubmissionError(error instanceof Error ? error.message : 'Failed to submit color system');
    }
  };

  if (!isOpen) return null;

  const generatedOutputScales = [
    ...Object.values(exportScales.light),
    ...Object.values(exportScales.dark ?? {}),
  ].filter(scale => scale?.method === 'Teul OKLCH v2');
  const generatedScalesValid =
    scaleMethod === 'radix-match' ||
    generatedOutputScales.every(scale => scale?.validation?.valid === true);
  const semanticPolicyValid = scaleMethod !== 'wcag-constrained' || semanticPolicy?.valid === true;
  const canGenerate = generatedScalesValid && semanticPolicyValid;
  const canSubmit = canGenerate && !systemNameError && !isSubmitting;
  const generationErrorMessage = !generatedScalesValid
    ? 'Generated scale fails structural or required contrast validation. Choose Exact Radix Colors or another source color.'
    : 'The declared WCAG 2.2 semantic-token policy has failing pairings. Choose another source color or Exact Radix Colors.';
  const generatedValidationItems = generatedOutputScales.flatMap(scale =>
    scale?.validation && scale.mode
      ? [{ name: scale.name, mode: scale.mode, validation: scale.validation }]
      : []
  );

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-system-dialog-title"
        tabIndex={-1}
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
        <div
          style={{
            padding: '20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              id="color-system-dialog-title"
              style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: theme.text }}
            >
              Generate Color System
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: theme.textMuted }}>
              Create a complete design system from your palette
            </p>
          </div>
          {documentColorProfile === 'display-p3' && (
            <div
              role="status"
              style={{
                margin: '0 20px 12px',
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: isDark ? '#422006' : '#fffbeb',
                color: isDark ? '#fcd34d' : '#92400e',
                fontSize: '10px',
                lineHeight: 1.4,
              }}
            >
              The Figma document is Display P3. Generated and bundled hex values remain labeled
              sRGB; preserving their numeric channels can change their appearance in this document.
            </div>
          )}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close color system generator"
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
            <label htmlFor="color-system-name" style={labelStyle}>
              System Name
            </label>
            <input
              id="color-system-name"
              type="text"
              value={systemName}
              onChange={e => setSystemName(e.target.value)}
              aria-invalid={Boolean(systemNameError)}
              aria-describedby={systemNameError ? 'color-system-name-error' : undefined}
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
            {systemNameError && (
              <span
                id="color-system-name-error"
                role="alert"
                style={{ display: 'block', marginTop: '6px', color: '#ef4444', fontSize: '10px' }}
              >
                {systemNameError}
              </span>
            )}
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
                  onChange={e => setMultiSelectMode(e.target.checked)}
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
                : 'Each role can only be assigned to one color. Click again to unassign.'}
              <br />
              <span style={{ opacity: 0.7 }}>
                Unassigned colors will not be included in the output.
              </span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roleAssignments.map(assignment => {
                const activeRoles = multiSelectMode
                  ? assignment.roles || []
                  : assignment.role
                    ? [assignment.role]
                    : [];
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
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.text,
                          marginBottom: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {assignment.name}
                        {isUnassigned && (
                          <span
                            style={{
                              fontSize: '9px',
                              color: theme.textMuted,
                              fontWeight: 400,
                              fontStyle: 'italic',
                            }}
                          >
                            (not included)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: theme.textMuted,
                          fontFamily: 'monospace',
                        }}
                      >
                        {assignment.hex.toUpperCase()}
                      </div>
                    </div>

                    {/* Role buttons */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['primary', 'secondary', 'tertiary', 'accent'] as ColorRole[]).map(role => {
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
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? 'Remove' : 'Assign'} ${assignment.name} as ${role}`}
                            onClick={() =>
                              assignRole(
                                assignment.hex,
                                isSelected && !multiSelectMode ? null : role
                              )
                            }
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
            <div id="scale-generation-method-label" style={labelStyle}>
              Scale Generation Method
            </div>
            <div
              role="group"
              aria-labelledby="scale-generation-method-label"
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <button
                onClick={() => setScaleMethod('custom')}
                aria-pressed={scaleMethod === 'custom'}
                style={{
                  ...buttonStyle(scaleMethod === 'custom'),
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Teul Generated</span>
                <span style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                  Preserve your source colors and report tested guarantees
                </span>
              </button>
              <button
                onClick={() => setScaleMethod('radix-match')}
                aria-pressed={scaleMethod === 'radix-match'}
                style={{
                  ...buttonStyle(scaleMethod === 'radix-match'),
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Exact Radix Colors</span>
                <span style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                  Use the closest unmodified @radix-ui/colors v{RADIX_COLORS_VERSION} family
                </span>
              </button>
              <button
                onClick={() => setScaleMethod('wcag-constrained')}
                aria-pressed={scaleMethod === 'wcag-constrained'}
                style={{
                  ...buttonStyle(scaleMethod === 'wcag-constrained'),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>WCAG-Constrained Tokens</span>
                <span style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                  Derive semantic tokens and block output unless every declared pairing passes
                </span>
              </button>
            </div>
          </div>

          {/* Neutral Family */}
          <div style={sectionStyle}>
            <div id="neutral-family-label" style={labelStyle}>
              Neutral Family
            </div>
            <div
              role="group"
              aria-labelledby="neutral-family-label"
              style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
            >
              <button
                onClick={() => setNeutralFamily('auto')}
                aria-pressed={neutralFamily === 'auto'}
                style={{
                  ...buttonStyle(neutralFamily === 'auto'),
                  padding: '8px 12px',
                  fontSize: '12px',
                }}
              >
                Auto ({suggestedNeutral})
              </button>
              {neutralFamilies.map(nf => {
                const scale = radixColors[nf].light;
                return (
                  <button
                    key={nf}
                    onClick={() => setNeutralFamily(nf)}
                    aria-pressed={neutralFamily === nf}
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
            <div id="output-detail-label" style={labelStyle}>
              Output Detail Level
            </div>
            <div
              role="group"
              aria-labelledby="output-detail-label"
              style={{ display: 'flex', gap: '8px' }}
            >
              {(
                [
                  {
                    id: 'minimal',
                    label: 'Minimal',
                    desc:
                      scaleMethod === 'wcag-constrained'
                        ? 'Scales and required policy report'
                        : 'Scales only',
                  },
                  { id: 'detailed', label: 'Detailed', desc: 'Scales + labels' },
                  { id: 'presentation', label: 'Presentation', desc: 'Full framework' },
                ] as const
              ).map(level => (
                <button
                  key={level.id}
                  onClick={() => setDetailLevel(level.id)}
                  aria-pressed={detailLevel === level.id}
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
              {scaleMethod === 'radix-match'
                ? `Exact unmodified Radix Colors v${RADIX_COLORS_VERSION}; the source color selects the closest family`
                : scaleMethod === 'wcag-constrained'
                  ? 'Teul-generated candidate scales plus a blocking WCAG 2.2 semantic-token policy'
                  : 'Teul-generated scale; only the reported pairings and structural guarantees have been tested'}
            </p>

            {primaryRadixMatch && (
              <div
                role="status"
                style={{
                  marginBottom: '12px',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: theme.inputBg,
                  color: theme.textMuted,
                  fontSize: '10px',
                  lineHeight: 1.4,
                }}
              >
                Primary input {primaryRadixMatch.inputHex} selects{' '}
                <strong style={{ color: theme.text }}>{primaryRadixMatch.familyName}</strong>. Exact
                Radix step 9 is {primaryRadixMatch.familyStep9}; the input color is not inserted
                into the exact Radix scale.
              </div>
            )}

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
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#888',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ☀️ Light
                </div>
                {previewScales && (
                  <>
                    <div style={{ display: 'flex', gap: '1px' }}>
                      {previewScales.steps.map(step => (
                        <div
                          key={step.step}
                          style={{
                            flex: 1,
                            height: '24px',
                            backgroundColor: step.hex,
                            borderRadius:
                              step.step === 1
                                ? '3px 0 0 3px'
                                : step.step === 12
                                  ? '0 3px 3px 0'
                                  : '0',
                          }}
                          title={`Step ${step.step}: ${step.hex}`}
                        />
                      ))}
                    </div>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}
                    >
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
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      color: '#888',
                      marginBottom: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    🌙 Dark
                  </div>
                  {darkPreviewScales && (
                    <>
                      <div style={{ display: 'flex', gap: '1px' }}>
                        {darkPreviewScales.steps.map(step => (
                          <div
                            key={step.step}
                            style={{
                              flex: 1,
                              height: '24px',
                              backgroundColor: step.hex,
                              borderRadius:
                                step.step === 1
                                  ? '3px 0 0 3px'
                                  : step.step === 12
                                    ? '0 3px 3px 0'
                                    : '0',
                            }}
                            title={`Step ${step.step}: ${step.hex}`}
                          />
                        ))}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '2px',
                        }}
                      >
                        <span style={{ fontSize: '7px', color: '#666' }}>1</span>
                        <span style={{ fontSize: '7px', color: '#666' }}>12</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {scaleMethod !== 'radix-match' && generatedValidationItems.length > 0 && (
              <ColorScaleValidationSummary items={generatedValidationItems} isDark={isDark} />
            )}
            {semanticPolicy && <SemanticPolicySummary report={semanticPolicy} isDark={isDark} />}
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
                onChange={e => setIncludeDarkMode(e.target.checked)}
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
                onChange={e => setCreateStyles(e.target.checked)}
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
              onClick={() => setShowExport(current => (canGenerate ? !current : false))}
              aria-disabled={!canGenerate}
              aria-expanded={showExport && canGenerate}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '13px',
                fontWeight: 600,
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>📤 Export Code</span>
              <span style={{ fontSize: '16px' }}>{showExport ? '▲' : '▼'}</span>
            </button>

            {showExport && canGenerate && (
              <div style={{ marginTop: '12px' }}>
                {/* Format selector */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {(
                    [
                      { id: 'css', label: 'CSS' },
                      { id: 'tailwind', label: 'Tailwind' },
                      { id: 'json', label: 'JSON' },
                    ] as const
                  ).map(format => (
                    <button
                      key={format.id}
                      onClick={() => setExportFormat(format.id)}
                      aria-pressed={exportFormat === format.id}
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
                  onClick={() =>
                    canGenerate && copyToClipboard(exportContent, exportFormat.toUpperCase())
                  }
                  aria-disabled={!canGenerate}
                  style={{
                    ...buttonStyle(true),
                    width: '100%',
                    marginTop: '8px',
                    padding: '10px',
                    backgroundColor: canGenerate ? '#22c55e' : theme.btnBg,
                    cursor: canGenerate ? 'pointer' : 'not-allowed',
                    opacity: canGenerate ? 1 : 0.6,
                  }}
                >
                  📋 Copy {exportFormat.toUpperCase()}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
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
            disabled={!canSubmit}
            aria-busy={isSubmitting}
            aria-describedby={
              systemNameError
                ? 'color-system-name-error'
                : !canGenerate
                  ? 'color-system-generation-error'
                  : undefined
            }
            style={{
              ...buttonStyle(true),
              flex: 2,
              backgroundColor: canSubmit ? theme.accent : theme.btnBg,
              color: '#ffffff',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            {isSubmitting ? 'Generating Color System…' : '🎨 Generate Color System'}
          </button>
          {submissionError && (
            <span
              id="color-system-submission-error"
              role="alert"
              style={{ width: '100%', color: '#ef4444', fontSize: '10px' }}
            >
              {submissionError}
            </span>
          )}
          {!canGenerate && (
            <span
              id="color-system-generation-error"
              role="alert"
              style={{ width: '100%', color: theme.textMuted, fontSize: '10px' }}
            >
              {generationErrorMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
