import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { generateColorScale } from '../lib/colorScale';
import { copyToClipboard } from '../lib/clipboard';
import { ColorScaleValidationSummary } from './ColorScaleValidationSummary';
import { SemanticPolicySummary } from './SemanticPolicySummary';
import { buildSemanticColorPolicy } from '../lib/semanticColorPolicy';
import type {
  ColorSystemOperationResultMessage,
  GenerateColorSystemMessage,
  NormalizedDocumentColorProfile,
} from '../types/messages';
import {
  findClosestRadixFamily,
  matchRadixFamily,
  getNeutralForAccent,
  RADIX_COLORS_VERSION,
  RADIX_FAMILY_MATCH_METHOD,
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
import { useOptionalWorkspaceState } from '../lib/workspaceState';
import { usePluginOperation } from '../lib/usePluginOperation';
import { themeFor, type as typeScale } from '../lib/theme';
import { ArrowLeft, Copy } from './TeulIcons';
import {
  Disclosure,
  Notice,
  SectionLabel,
  Segmented,
  buttonStyle,
  inputStyle,
  monoStyle,
  selectStyle,
} from './TeulUI';

// Types
type ColorRole = 'primary' | 'secondary' | 'tertiary' | 'accent';
type ScaleMethod = 'custom' | 'radix-match' | 'wcag-constrained';
type OutputDetailLevel = 'minimal' | 'detailed' | 'presentation';
type GeneratorStage = 1 | 2 | 3;
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

interface ColorSystemBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  colors: { hex: string; name: string }[];
  combinationName: string;
  isDark: boolean;
  documentColorProfile?: NormalizedDocumentColorProfile;
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Systems this plugin session created, by output name. Figma's file is the authority:
 * this only lets step 2 warn early that a create with "Cancel" would be refused. It
 * never blocks a request, because the person may have removed the output since.
 */
const createdThisSession = new Map<string, { variables: boolean; styles: boolean }>();

/** The backend's refusal sentences that a choice in this screen resolves (colorSystemCollision.ts). */
const EXISTING_OUTPUT_PREFIX = 'Local output already exists for "';
const NOT_TEUL_OWNED_MARKER = 'is not marked as Teul-owned. Choose Create copy';

/** code.ts answers a create that fails runtime validation with exactly this sentence. */
const INVALID_REQUEST_ERROR = 'Invalid color system request';
const INVALID_REQUEST_GUIDANCE =
  'Figma rejected this request as invalid (“Invalid color system request”), so nothing was created. Your draft is kept and code export still works. If it happens again with Teul generated or WCAG tokens, try Exact Radix.';

type CollisionNotice = {
  name: string;
  kind: 'exists' | 'session' | 'not-owned';
};

const mutedParagraph: React.CSSProperties = {
  margin: 0,
  fontSize: typeScale.meta,
  lineHeight: 1.5,
};

const counted = (count: number | undefined, one: string, many: string): string | null =>
  count ? `${count} ${count === 1 ? one : many}` : null;

function collisionSentence(notice: CollisionNotice, justCreated: boolean): string {
  if (justCreated) {
    return `To create “${notice.name}” again, update it, make a copy or rename it.`;
  }
  switch (notice.kind) {
    case 'exists':
      return `A system named “${notice.name}” is already in this file.`;
    case 'session':
      return `Teul created a system named “${notice.name}” in this file earlier in this session.`;
    default:
      return `“${notice.name}” in this file was not made by Teul, so Teul will not update it.`;
  }
}

/** What the confirmed create wrote, leaving out anything it wrote none of. */
function receiptSummary(result: ColorSystemOperationResultMessage): string {
  return [
    `${result.modes?.join(' and ') || 'Light'} ${result.modes && result.modes.length > 1 ? 'modes' : 'mode'}`,
    counted(result.primitiveCount, 'primitive', 'primitives'),
    counted(result.semanticAliasCount, 'semantic alias', 'semantic aliases'),
    counted(result.styleCount, 'style', 'styles'),
    counted(result.frameCount, 'frame', 'frames'),
    counted(result.skippedCount, 'skipped', 'skipped'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Build a color system inside the plugin window, in two steps: shape (roles, scales,
 * method, neutral, dark mode, validation) and create (what Figma gets, code export,
 * the sRGB status, the create receipt). It replaced the three-stage modal on
 * 2026-11-21; generation, validation, export and the posted message are unchanged.
 */
export const ColorSystemBuilder: React.FC<ColorSystemBuilderProps> = ({
  isOpen,
  onClose,
  colors,
  combinationName,
  isDark,
  documentColorProfile = 'unknown',
}) => {
  const documentProfileLabel =
    documentColorProfile === 'display-p3'
      ? 'Display P3'
      : documentColorProfile === 'srgb'
        ? 'sRGB'
        : documentColorProfile === 'legacy'
          ? 'Legacy'
          : 'Unknown';
  const workspaceContext = useOptionalWorkspaceState();
  const updateWorkspace = workspaceContext?.update;
  const sourceSignature = useMemo(
    () => colors.map(color => `${color.hex.toLowerCase()}|${color.name}`).join('\u001f'),
    [colors]
  );
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // State
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>('custom');
  const [neutralFamily, setNeutralFamily] = useState<NeutralName | 'auto'>('auto');
  const [detailLevel, setDetailLevel] = useState<OutputDetailLevel>('detailed');
  const [includeDarkMode, setIncludeDarkMode] = useState(true);
  const [createStyles, setCreateStyles] = useState(false);
  const [createVariables, setCreateVariables] = useState(true);
  const [collisionPolicy, setCollisionPolicy] = useState<'cancel' | 'update-local' | 'create-copy'>(
    'cancel'
  );
  const [systemName, setSystemName] = useState(combinationName || 'My Color System');
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'css' | 'tailwind' | 'json'>('css');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [stage, setStage] = useState<GeneratorStage>(1);
  const [creationComplete, setCreationComplete] = useState(false);
  /** The receipt belongs to the visit to step 2 that produced it. */
  const [receiptDismissed, setReceiptDismissed] = useState(false);
  const [operationResult, setOperationResult] = useState<ColorSystemOperationResultMessage | null>(
    null
  );
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

  const [collision, setCollision] = useState<CollisionNotice | null>(null);
  const collisionRef = React.useRef<HTMLDivElement>(null);
  const focusCollisionRef = React.useRef(false);
  const focusNameRef = React.useRef(false);
  const submittedRef = React.useRef<{ name: string; variables: boolean; styles: boolean } | null>(
    null
  );

  const colorSystemOperation = usePluginOperation({
    resultType: 'color-system-operation-result',
    onResult: message => {
      const submitted = submittedRef.current;
      if (message.success) {
        if (submitted) {
          const name = message.outputName ?? submitted.name;
          const prior = createdThisSession.get(name);
          createdThisSession.set(name, {
            variables: submitted.variables || Boolean(prior?.variables),
            styles: submitted.styles || Boolean(prior?.styles),
          });
        }
        setCollision(null);
        setSubmissionError(null);
        setReceiptDismissed(false);
        setCreationComplete(true);
        setOperationResult(message);
        updateWorkspace?.(current => {
          if (!current.generatorDraft) return current;
          const { generatorDraft: _completedDraft, ...rest } = current;
          return rest;
        });
      } else {
        setOperationResult(null);
        const error = message.error || 'Failed to generate color system';
        // An existing output is not a failure to report but a choice to make: show it at
        // the "If this output already exists" row with the actions that resolve it.
        if (error.startsWith(EXISTING_OUTPUT_PREFIX) || error.includes(NOT_TEUL_OWNED_MARKER)) {
          const named = error.startsWith(EXISTING_OUTPUT_PREFIX)
            ? error.slice(EXISTING_OUTPUT_PREFIX.length).split('". Choose')[0]
            : (submitted?.name ?? '');
          setSubmissionError(null);
          focusCollisionRef.current = true;
          setCollision({
            name: named,
            kind: error.startsWith(EXISTING_OUTPUT_PREFIX) ? 'exists' : 'not-owned',
          });
        } else if (error === INVALID_REQUEST_ERROR) {
          // The backend re-validates every scale; a refusal here names no next step.
          setSubmissionError(INVALID_REQUEST_GUIDANCE);
        } else {
          setSubmissionError(error);
        }
      }
    },
    onTimeout: () => {
      setOperationResult(null);
      setSubmissionError(
        'Figma did not finish this operation within 30 seconds. The draft is preserved; inspect the file before retrying.'
      );
    },
    onSubmitError: error => {
      setOperationResult(null);
      setSubmissionError(error.message);
    },
  });
  const isSubmitting = colorSystemOperation.pending;

  React.useEffect(() => {
    if (isOpen) {
      setSubmissionError(null);
      setCreationComplete(false);
      setOperationResult(null);
    }
  }, [isOpen]);

  const restoredDraftKeyRef = React.useRef<string | null>(null);

  // Restore an unfinished draft only when it belongs to the exact source palette.
  React.useEffect(() => {
    if (!isOpen || colors.length === 0) return;
    const restoreKey = `${sourceSignature}:${workspaceContext?.hydrated ? 'hydrated' : 'local'}`;
    if (restoredDraftKeyRef.current === restoreKey) return;
    restoredDraftKeyRef.current = restoreKey;
    const draft = workspaceContext?.state.generatorDraft;
    if (draft?.sourceSignature === sourceSignature) {
      setScaleMethod(draft.scaleMethod);
      setNeutralFamily(draft.neutralFamily);
      setDetailLevel(draft.detailLevel);
      setIncludeDarkMode(draft.includeDarkMode);
      setCreateStyles(draft.createStyles);
      setCreateVariables(draft.createVariables);
      setCollisionPolicy(draft.collisionPolicy);
      setSystemName(draft.systemName);
      setMultiSelectMode(draft.multiSelectMode);
      setRoleAssignments(draft.roleAssignments);
      setStage(draft.stage);
      return;
    }
    setMultiSelectMode(colors.length > 4);
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
    setSystemName(combinationName || 'My Color System');
    setStage(1);
  }, [colors, combinationName, isOpen, sourceSignature, workspaceContext]);

  React.useEffect(() => {
    if (
      !isOpen ||
      !workspaceContext?.hydrated ||
      roleAssignments.length === 0 ||
      creationComplete
    ) {
      return;
    }
    const generatorDraft = {
      sourceSignature,
      scaleMethod,
      neutralFamily,
      detailLevel,
      includeDarkMode,
      createStyles,
      createVariables,
      collisionPolicy,
      systemName,
      multiSelectMode,
      roleAssignments,
      stage,
    } as const;
    workspaceContext.update(current => {
      if (JSON.stringify(current.generatorDraft) === JSON.stringify(generatorDraft)) return current;
      return { ...current, generatorDraft };
    });
  }, [
    createStyles,
    createVariables,
    collisionPolicy,
    creationComplete,
    detailLevel,
    includeDarkMode,
    isOpen,
    multiSelectMode,
    neutralFamily,
    roleAssignments,
    scaleMethod,
    sourceSignature,
    stage,
    systemName,
    workspaceContext,
  ]);

  // Auto-suggested neutral based on primary color
  const suggestedNeutral = useMemo(() => {
    const primary = roleAssignments.find(r => r.role === 'primary' || r.roles?.includes('primary'));
    if (primary) {
      return getNeutralForAccent(primary.hex);
    }
    return 'gray';
  }, [roleAssignments]);

  const effectiveNeutral = neutralFamily === 'auto' ? suggestedNeutral : neutralFamily;

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
    const match = matchRadixFamily(primary.hex);
    return {
      inputHex: primary.hex.toUpperCase(),
      familyName: match.family.displayName,
      matchedMode: match.matchedMode,
      matchedStep: match.matchedStep,
      matchedHex: match.matchedHex.toUpperCase(),
      deltaEOK: match.deltaEOK,
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
  const handleGenerate = (policy: typeof collisionPolicy = collisionPolicy) => {
    if (systemNameError || colorSystemOperation.pending) return;

    // Get colors for each role (supports multiple colors per role in multi-select mode)
    const primaries = getColorsForRole('primary');
    const secondaries = getColorsForRole('secondary');
    const tertiaries = getColorsForRole('tertiary');
    const accents = getColorsForRole('accent');

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
    setSubmissionError(null);
    submittedRef.current = { name: systemName, variables: createVariables, styles: createStyles };
    colorSystemOperation.submit({
      type: 'generate-color-system',
      requestId,
      createStyles,
      createVariables,
      collisionPolicy: policy,
      config,
      scales: scalesPayload as GenerateColorSystemMessage['scales'],
    });
  };

  // Keyboard continuity: each step starts on its back button.
  const focusStep = stage === 3 ? 2 : 1;
  React.useEffect(() => {
    if (!isOpen) return;
    if (focusNameRef.current && focusStep === 1) {
      focusNameRef.current = false;
      const name = document.getElementById('color-system-name') as HTMLInputElement | null;
      name?.focus({ preventScroll: true });
      name?.select();
      return;
    }
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [isOpen, focusStep]);

  // A refused create moves focus to the resolver; an early notice is only scrolled into view.
  const priorOutput = createdThisSession.get(systemName);
  const knownFromSession =
    Boolean(priorOutput) &&
    ((createVariables && Boolean(priorOutput?.variables)) ||
      (createStyles && Boolean(priorOutput?.styles)));
  const visibleCollision: CollisionNotice | null =
    collision && collision.name === systemName
      ? collision
      : focusStep === 2 && collisionPolicy === 'cancel' && knownFromSession
        ? { name: systemName, kind: 'session' }
        : null;
  const collisionKey = visibleCollision ? `${visibleCollision.kind}:${visibleCollision.name}` : '';
  React.useEffect(() => {
    if (!collisionKey) return;
    const node = collisionRef.current;
    node?.scrollIntoView?.({ block: 'nearest' });
    if (focusCollisionRef.current) {
      focusCollisionRef.current = false;
      node?.focus({ preventScroll: true });
    }
  }, [collisionKey]);

  if (!isOpen) return null;

  const generatedOutputScales = [
    ...Object.values(exportScales.light),
    ...Object.values(exportScales.dark ?? {}),
  ].filter(scale => scale?.method === 'Teul OKLCH v3');
  const generatedScalesValid =
    scaleMethod === 'radix-match' ||
    generatedOutputScales.every(scale => scale?.validation?.valid === true);
  const srgbMutationSupported = documentColorProfile === 'srgb';
  const semanticPolicyValid = scaleMethod !== 'wcag-constrained' || semanticPolicy?.valid === true;
  const canGenerate = generatedScalesValid && semanticPolicyValid;
  const canSubmit = canGenerate && srgbMutationSupported && !systemNameError && !isSubmitting;
  const hasPrimary = getColorsForRole('primary').length > 0;
  const generationErrorMessage = !generatedScalesValid
    ? 'Generated scale fails structural or required contrast validation. Choose Exact Radix sRGB Solid or another source color.'
    : !srgbMutationSupported
      ? 'On-canvas creation requires a confirmed sRGB Figma document because Teul Generated and Exact Radix values are sRGB. Export remains available.'
      : 'The declared WCAG 2.2 semantic-token policy has failing pairings. Choose another source color or Exact Radix sRGB Solid.';
  const generatedValidationItems = generatedOutputScales.flatMap(scale =>
    scale?.validation && scale.mode
      ? [{ name: scale.name, mode: scale.mode, validation: scale.validation }]
      : []
  );

  const step: 1 | 2 = stage === 3 ? 2 : 1;
  /** Leaving step 2 ends the last receipt: the next create is a new one. */
  const backToShape = () => {
    setReceiptDismissed(true);
    setStage(1);
  };
  const showReceipt = creationComplete && !receiptDismissed;
  // With the receipt still showing, the same-name notice only explains the next step.
  const justCreated = showReceipt && visibleCollision?.kind === 'session';
  const resolveCollision = (policy: 'update-local' | 'create-copy') => {
    setCollisionPolicy(policy);
    setCollision(null);
    handleGenerate(policy);
  };
  const renameAfterCollision = () => {
    focusNameRef.current = true;
    backToShape();
  };
  const theme = themeFor(isDark);
  const quietAction: React.CSSProperties = {
    ...buttonStyle(theme, 'secondary', { height: 28 }),
    color: theme.text,
    backgroundColor: theme.sheetBg,
  };
  const methodSentence =
    scaleMethod === 'custom'
      ? 'Preserve your source colors and report tested guarantees'
      : scaleMethod === 'radix-match'
        ? `Teul match: ${RADIX_FAMILY_MATCH_METHOD}; source @radix-ui/colors v${RADIX_COLORS_VERSION}`
        : srgbMutationSupported
          ? 'Derive sRGB semantic tokens and block output unless every declared pairing passes'
          : 'Requires a confirmed sRGB Figma document';
  const previewExplanation =
    scaleMethod === 'radix-match'
      ? `Exact unmodified Radix sRGB solid values v${RADIX_COLORS_VERSION}; Delta E OK selects the family containing the nearest published light or dark step`
      : scaleMethod === 'wcag-constrained'
        ? 'Teul-generated candidate scales plus a blocking WCAG 2.2 semantic-token policy'
        : 'Teul-generated scale; only the reported pairings and structural guarantees have been tested';

  // One row per included source color (in role order) plus the neutral family.
  const scaleRows = (
    [
      ['primary', 'Primary'],
      ['secondary', 'Secondary'],
      ['tertiary', 'Tertiary'],
      ['accent', 'Accent'],
    ] as const
  ).flatMap(([role, label]) =>
    getColorsForRole(role).map((assignment, index) => {
      const key = index === 0 ? role : `${role}${index + 1}`;
      return {
        key,
        label: index === 0 ? label : `${label} ${index + 1}`,
        name: assignment.name,
        sourceHex: assignment.hex.toLowerCase(),
        light: exportScales.light[key],
        dark: exportScales.dark?.[key],
      };
    })
  );
  scaleRows.push({
    key: 'neutral',
    label: 'Neutral',
    name: exportScales.light.neutral.name,
    sourceHex: '',
    light: exportScales.light.neutral,
    dark: exportScales.dark?.neutral,
  });

  const contrastChecks = generatedValidationItems.flatMap(item => item.validation.contrast);
  const passingChecks = contrastChecks.filter(check => check.pass).length;
  const semanticPairings = semanticPolicy
    ? Object.values(semanticPolicy.modes).flatMap(mode => mode?.pairings ?? [])
    : [];
  const semanticPassing = semanticPairings.filter(pairing => pairing.pass).length;
  const validationLine =
    scaleMethod === 'radix-match'
      ? `Exact Radix sRGB Solid v${RADIX_COLORS_VERSION} values, published and not regenerated`
      : scaleMethod === 'wcag-constrained' && semanticPolicy
        ? `${semanticPassing} of ${semanticPairings.length} declared token pairings pass`
        : `${generatedScalesValid ? 'Structure validated' : 'Generation blocked'} · ${passingChecks} of ${contrastChecks.length} tested pairings pass`;
  const validationOk = canGenerate;

  const roleOptions: Array<{ value: ColorRole | 'none'; label: string }> = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'tertiary', label: 'Tertiary' },
    { value: 'accent', label: 'Accent' },
    { value: 'none', label: 'Not included' },
  ];

  const scaleStrip = (
    scale: ExportScale | undefined,
    sourceHex: string,
    dark: boolean,
    label: string
  ) =>
    scale ? (
      <div
        role="img"
        aria-label={`${label} ${dark ? 'dark' : 'light'} scale, steps 1 to 12${
          sourceHex && scale.steps.some(s => s.hex.toLowerCase() === sourceHex)
            ? `; your color at step ${scale.steps.find(s => s.hex.toLowerCase() === sourceHex)?.step}`
            : ''
        }`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gap: '2px',
          padding: dark ? '3px' : 0,
          borderRadius: '5px',
          backgroundColor: dark ? '#111111' : 'transparent',
        }}
      >
        {scale.steps.map(s => {
          const isSource = sourceHex !== '' && s.hex.toLowerCase() === sourceHex;
          return (
            <i
              key={s.step}
              title={`Step ${s.step}: ${s.hex}${isSource ? ' (your color)' : ''}`}
              data-teul-source-step={isSource ? '' : undefined}
              style={{
                display: 'block',
                height: dark ? '16px' : '22px',
                borderRadius: '3px',
                backgroundColor: s.hex,
                boxShadow: isSource
                  ? `0 0 0 2px ${dark ? '#111111' : theme.bg}, 0 0 0 3px ${dark ? '#ffffff' : theme.text}`
                  : dark
                    ? 'none'
                    : 'inset 0 0 0 1px rgba(0,0,0,0.05)',
              }}
            />
          );
        })}
      </div>
    ) : null;

  const lineRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 0',
    borderBottom: `1px solid ${theme.border}`,
  };
  const lineText = (title: string, detail?: React.ReactNode) => (
    <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <span style={{ fontWeight: 500, color: theme.text }}>{title}</span>
      {detail && (
        <span style={{ color: theme.textMuted, fontSize: typeScale.meta, lineHeight: 1.4 }}>
          {detail}
        </span>
      )}
    </span>
  );
  const checkboxStyle: React.CSSProperties = {
    width: '16px',
    height: '16px',
    margin: 0,
    flex: 'none',
    accentColor: theme.text,
    cursor: 'pointer',
  };
  const detailLevels = [
    {
      id: 'minimal',
      label: 'Minimal',
      desc:
        scaleMethod === 'wcag-constrained' ? 'Scales and required policy report' : 'Scales only',
    },
    { id: 'detailed', label: 'Detailed', desc: 'Scales + labels' },
    { id: 'presentation', label: 'Presentation', desc: 'Full framework' },
  ] as const;
  const profileOk = srgbMutationSupported;
  const errorText =
    !canGenerate || (step === 2 && !srgbMutationSupported) ? generationErrorMessage : null;
  const primaryEnabled = step === 1 ? !systemNameError && hasPrimary && canGenerate : canSubmit;

  return (
    <div
      role="region"
      aria-labelledby="color-system-dialog-title"
      data-teul-system-builder={step}
      onKeyDown={event => {
        // Escape steps back, as the modal's Escape closed it; never while Figma is working.
        if (event.key !== 'Escape' || isSubmitting || event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        if (target.tagName === 'SELECT') return;
        event.preventDefault();
        if (step === 1) onClose();
        else backToShape();
      }}
      style={{
        flex: 1,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <h2 id="color-system-dialog-title" style={visuallyHidden}>
        Build a color system, step {step} of 2: {step === 1 ? 'shape' : 'create'}
      </h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label={step === 1 ? 'Back to colors' : 'Back to shape the system'}
          title={step === 1 ? 'Back to colors' : 'Back to shape the system'}
          onClick={() => (step === 1 ? onClose() : backToShape())}
          disabled={isSubmitting}
          className="teul-hover"
          style={{
            ...buttonStyle(theme),
            width: '32px',
            padding: 0,
            border: 0,
            backgroundColor: theme.inputBg,
            flex: 'none',
          }}
        >
          <ArrowLeft size={16} />
        </button>
        {step === 1 ? (
          <input
            id="color-system-name"
            type="text"
            aria-label="System name"
            value={systemName}
            onChange={e => setSystemName(e.target.value)}
            aria-invalid={Boolean(systemNameError)}
            aria-describedby={systemNameError ? 'color-system-name-error' : undefined}
            placeholder="My Color System"
            className="teul-hover"
            style={{
              ...inputStyle(theme),
              flex: 1,
              border: `1px solid ${systemNameError ? theme.no : 'transparent'}`,
              backgroundColor: 'transparent',
              fontSize: typeScale.emphasis,
              fontWeight: 600,
              padding: '0 8px',
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: '0 8px',
              fontSize: typeScale.emphasis,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {systemName}
          </div>
        )}
        <span style={{ color: theme.textMuted, fontSize: typeScale.meta, whiteSpace: 'nowrap' }}>
          {step} of 2
        </span>
      </div>
      {systemNameError && step === 1 && (
        <span
          id="color-system-name-error"
          role="alert"
          style={{ padding: '6px 14px 0', color: theme.no, fontSize: typeScale.meta }}
        >
          {systemNameError}
        </span>
      )}

      <div
        data-teul-builder-body=""
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 16px' }}
      >
        {step === 1 ? (
          <>
            {colors.length > 4 && (
              <label
                style={{
                  ...lineRow,
                  justifyContent: 'flex-start',
                  paddingTop: 0,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={multiSelectMode}
                  onChange={e => setMultiSelectMode(e.target.checked)}
                  style={checkboxStyle}
                />
                {lineText(
                  'Multi-Select Mode',
                  'Allow multiple colors per role (recommended for palettes with 5+ colors)'
                )}
              </label>
            )}
            <div
              role="group"
              aria-label="Color roles"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(4, Math.max(roleAssignments.length, 2))}, minmax(0, 1fr))`,
                gap: '8px',
              }}
            >
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
                    data-teul-role-card={activeRoles[0] ?? 'none'}
                    style={{
                      minWidth: 0,
                      padding: '8px',
                      border: `1px ${isUnassigned ? 'dashed' : 'solid'} ${theme.border}`,
                      borderRadius: '10px',
                      backgroundColor: theme.cardBg,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <i
                      aria-hidden="true"
                      style={{
                        display: 'block',
                        height: '40px',
                        borderRadius: '6px',
                        backgroundColor: assignment.hex,
                        marginBottom: '2px',
                        opacity: isUnassigned ? 0.45 : 1,
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                      }}
                    />
                    {multiSelectMode ? (
                      <div
                        role="group"
                        aria-label={`Roles for ${assignment.name}`}
                        style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}
                      >
                        {(['primary', 'secondary', 'tertiary', 'accent'] as ColorRole[]).map(
                          role => {
                            const isSelected = activeRoles.includes(role);
                            return (
                              <button
                                key={role}
                                type="button"
                                aria-pressed={isSelected}
                                aria-label={`${isSelected ? 'Remove' : 'Assign'} ${assignment.name} as ${role}`}
                                onClick={() => assignRole(assignment.hex, role)}
                                style={{
                                  minHeight: '28px',
                                  minWidth: '28px',
                                  padding: '0 4px',
                                  borderRadius: '6px',
                                  border: `1px solid ${isSelected ? theme.text : theme.border}`,
                                  backgroundColor: isSelected ? theme.text : 'transparent',
                                  color: isSelected ? theme.bg : theme.textMuted,
                                  fontFamily: 'inherit',
                                  fontSize: typeScale.meta,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {role.slice(0, 3)}
                              </button>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <select
                        aria-label={`Role for ${assignment.name}`}
                        value={assignment.role ?? 'none'}
                        onChange={event =>
                          assignRole(
                            assignment.hex,
                            event.target.value === 'none' ? null : (event.target.value as ColorRole)
                          )
                        }
                        style={{
                          ...selectStyle(theme),
                          height: '28px',
                          padding: '0 2px',
                          border: 0,
                          backgroundColor: 'transparent',
                          color: isUnassigned ? theme.textMuted : theme.text,
                          fontWeight: 600,
                          width: '100%',
                        }}
                      >
                        {roleOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <span
                      title={`${assignment.name} ${assignment.hex.toUpperCase()}`}
                      style={{
                        color: theme.textMuted,
                        fontSize: typeScale.meta,
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingLeft: '2px',
                      }}
                    >
                      {assignment.name}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ ...mutedParagraph, marginTop: '6px', color: theme.textMuted }}>
              {multiSelectMode
                ? 'Click roles to toggle. Multiple colors can share the same role.'
                : 'Each role can only be assigned to one color.'}{' '}
              Unassigned colors will not be included in the output.
            </p>

            <SectionLabel
              isDark={isDark}
              aside={
                scaleMethod === 'radix-match'
                  ? 'Published values; your color is not inserted'
                  : 'Your color stays at step 9'
              }
            >
              Scales, light and dark
            </SectionLabel>
            {!hasPrimary && (
              <Notice isDark={isDark} tone="neutral" style={{ marginBottom: '8px' }}>
                Choose a primary color to preview the scales.
              </Notice>
            )}
            <div style={{ display: 'grid', gap: '8px' }}>
              {hasPrimary &&
                scaleRows.map(row => (
                  <div
                    key={row.key}
                    data-teul-scale-row={row.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '72px minmax(0, 1fr)',
                      gap: '4px 8px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      title={row.name}
                      style={{
                        color: theme.textMuted,
                        fontSize: typeScale.meta,
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.label}
                    </span>
                    {scaleStrip(row.light, row.sourceHex, false, row.label)}
                    {includeDarkMode && (
                      <>
                        <span />
                        {scaleStrip(row.dark, row.sourceHex, true, row.label)}
                      </>
                    )}
                  </div>
                ))}
            </div>

            <SectionLabel isDark={isDark} id="scale-generation-method-label">
              Method
            </SectionLabel>
            <Segmented<ScaleMethod>
              label="Scale generation method"
              isDark={isDark}
              wide
              value={scaleMethod}
              onChange={method => {
                if (method !== 'wcag-constrained' || srgbMutationSupported) setScaleMethod(method);
              }}
              options={[
                { value: 'custom', label: 'Teul generated', title: 'Teul Generated' },
                { value: 'radix-match', label: 'Exact Radix', title: 'Exact Radix sRGB Solid' },
                {
                  value: 'wcag-constrained',
                  label: 'WCAG tokens',
                  disabled: !srgbMutationSupported,
                  title: srgbMutationSupported
                    ? 'WCAG-Constrained Tokens: create sRGB semantic tokens with blocking pair tests'
                    : 'WCAG-Constrained Tokens: requires a confirmed sRGB Figma document',
                },
              ]}
            />
            <p
              style={{ ...mutedParagraph, marginTop: '6px', color: theme.textMuted }}
              data-teul-method-sentence=""
            >
              {methodSentence}
            </p>
            {!srgbMutationSupported && scaleMethod !== 'wcag-constrained' && (
              <p
                data-teul-method-blocked=""
                style={{ ...mutedParagraph, marginTop: '4px', color: theme.warnText }}
              >
                WCAG tokens: Requires a confirmed sRGB Figma document ({documentProfileLabel}{' '}
                reported).
              </p>
            )}
            {primaryRadixMatch && (
              <p role="status" style={{ ...mutedParagraph, marginTop: '6px' }}>
                Primary input {primaryRadixMatch.inputHex} selects{' '}
                <strong style={{ color: theme.text }}>{primaryRadixMatch.familyName}</strong>. Exact
                Radix {primaryRadixMatch.matchedMode} step {primaryRadixMatch.matchedStep} at{' '}
                {primaryRadixMatch.matchedHex} is nearest by Delta E OK (
                {primaryRadixMatch.deltaEOK.toFixed(4)}); the input color is not inserted into the
                exact Radix scale.
              </p>
            )}

            <div
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: '12px',
                color: theme.textMuted,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Neutral
                <select
                  aria-label="Neutral family"
                  value={neutralFamily}
                  onChange={event => setNeutralFamily(event.target.value as NeutralName | 'auto')}
                  style={selectStyle(theme)}
                >
                  <option value="auto">Auto ({suggestedNeutral})</option>
                  {neutralFamilies.map(nf => (
                    <option key={nf} value={nf}>
                      {nf.charAt(0).toUpperCase() + nf.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '28px',
                  cursor: 'pointer',
                  color: theme.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={includeDarkMode}
                  onChange={e => setIncludeDarkMode(e.target.checked)}
                  style={checkboxStyle}
                />
                Include dark mode
              </label>
            </div>

            {hasPrimary && (
              <div style={{ marginTop: '12px' }}>
                <Disclosure
                  isDark={isDark}
                  first
                  dataAttr={{ 'data-teul-validation': '' }}
                  summary={
                    <span style={{ color: validationOk ? theme.ok : theme.no }}>
                      {validationLine}
                    </span>
                  }
                >
                  <p style={{ margin: '0 0 6px' }}>{previewExplanation}</p>
                  {scaleMethod !== 'radix-match' && generatedValidationItems.length > 0 && (
                    <ColorScaleValidationSummary items={generatedValidationItems} isDark={isDark} />
                  )}
                  {semanticPolicy && (
                    <SemanticPolicySummary report={semanticPolicy} isDark={isDark} />
                  )}
                </Disclosure>
              </div>
            )}
          </>
        ) : (
          <>
            {showReceipt && (
              <div
                role="status"
                style={{
                  padding: '12px',
                  marginBottom: '12px',
                  borderRadius: '10px',
                  border: `1px solid ${theme.okBorder}`,
                  backgroundColor: theme.okBg,
                }}
              >
                <h3 style={{ margin: 0, fontSize: typeScale.emphasis, fontWeight: 600 }}>
                  Created “{operationResult?.outputName ?? systemName}”
                </h3>
                {operationResult && (
                  <p style={{ margin: '4px 0 0', color: theme.ok, fontSize: typeScale.meta }}>
                    {receiptSummary(operationResult)}
                  </p>
                )}
                {operationResult?.warnings?.map(warning => (
                  <p
                    key={warning}
                    style={{ margin: '6px 0 0', color: theme.warnText, fontSize: typeScale.meta }}
                  >
                    {warning}
                  </p>
                ))}
                <p style={{ margin: '6px 0 0', color: theme.textMuted, fontSize: typeScale.meta }}>
                  The output is selected on the canvas. Go back to adjust the draft, or create
                  another system.
                </p>
              </div>
            )}

            <div
              role="img"
              aria-label="Light scales that will be created"
              style={{ display: 'grid', gap: '2px', borderRadius: '8px', overflow: 'hidden' }}
            >
              {scaleRows.map(row => (
                <div
                  key={row.key}
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
                >
                  {row.light?.steps.map(s => (
                    <i
                      key={s.step}
                      style={{ display: 'block', height: '14px', backgroundColor: s.hex }}
                    />
                  ))}
                </div>
              ))}
            </div>

            <SectionLabel
              isDark={isDark}
              aside={
                <span
                  data-teul-profile-status=""
                  style={{ color: profileOk ? theme.ok : theme.warnText }}
                >
                  {documentProfileLabel} document
                </span>
              }
            >
              What will be created
            </SectionLabel>
            {!profileOk && (
              <Notice isDark={isDark} tone="warn" role="status" style={{ marginBottom: '6px' }}>
                The Figma document profile is {documentProfileLabel}. Generated and bundled hex
                values remain sRGB. On-canvas frames, variables, and styles are blocked because
                Figma would reinterpret those numeric channels in this document profile; export
                remains available.
              </Notice>
            )}
            <label style={{ ...lineRow, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={createVariables}
                onChange={event => setCreateVariables(event.target.checked)}
                style={checkboxStyle}
              />
              {lineText(
                'Create Figma Variables',
                `A native color collection with ${includeDarkMode ? 'light and dark modes' : 'a light mode'}`
              )}
            </label>
            <label style={{ ...lineRow, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={createStyles}
                onChange={e => setCreateStyles(e.target.checked)}
                style={checkboxStyle}
              />
              {lineText('Create Figma Color Styles', 'Add colors to your Figma styles library')}
            </label>
            <div style={{ ...lineRow, flexWrap: 'wrap' }}>
              {lineText(
                'A color-system frame on this page',
                detailLevels.find(level => level.id === detailLevel)?.desc
              )}
              <Segmented<OutputDetailLevel>
                label="Output detail level"
                isDark={isDark}
                value={detailLevel}
                onChange={setDetailLevel}
                options={detailLevels.map(level => ({ value: level.id, label: level.label }))}
              />
            </div>
            <div style={lineRow}>
              {lineText('If this output already exists')}
              <select
                id="color-system-collision-policy"
                aria-label="Existing local output"
                value={collisionPolicy}
                onChange={event => {
                  setSubmissionError(null);
                  setCollisionPolicy(
                    event.target.value as 'cancel' | 'update-local' | 'create-copy'
                  );
                }}
                style={{ ...selectStyle(theme), maxWidth: '58%' }}
              >
                <option value="cancel">Cancel — make no changes</option>
                <option value="update-local">Update local — Teul-owned resources only</option>
                <option value="create-copy">Create copy — use a new output name</option>
              </select>
            </div>
            {visibleCollision && (
              <div
                ref={collisionRef}
                role="group"
                tabIndex={-1}
                aria-labelledby="color-system-collision-sentence"
                data-teul-collision-resolver={visibleCollision.kind}
                style={{
                  margin: '8px 0 4px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: justCreated ? theme.inputBg : theme.warnBg,
                  color: justCreated ? theme.textMuted : theme.warnText,
                  outlineOffset: '2px',
                }}
              >
                <p
                  id="color-system-collision-sentence"
                  style={{ margin: 0, fontSize: typeScale.body, lineHeight: 1.45 }}
                >
                  {collisionSentence(visibleCollision, justCreated)}
                </p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {visibleCollision.kind !== 'not-owned' && (
                    <button
                      type="button"
                      title="Update local — Teul-owned resources only"
                      onClick={() => resolveCollision('update-local')}
                      disabled={isSubmitting}
                      className={justCreated ? 'teul-hover' : undefined}
                      style={
                        justCreated ? quietAction : buttonStyle(theme, 'primary', { height: 28 })
                      }
                    >
                      Update it
                    </button>
                  )}
                  <button
                    type="button"
                    title="Create copy — use a new output name"
                    onClick={() => resolveCollision('create-copy')}
                    disabled={isSubmitting}
                    className="teul-hover"
                    style={
                      visibleCollision.kind === 'not-owned'
                        ? buttonStyle(theme, 'primary', { height: 28 })
                        : quietAction
                    }
                  >
                    Create a copy
                  </button>
                  <button
                    type="button"
                    onClick={renameAfterCollision}
                    disabled={isSubmitting}
                    className="teul-hover"
                    style={quietAction}
                  >
                    Rename
                  </button>
                </div>
              </div>
            )}

            <Disclosure isDark={isDark} summary="Planned changes" first>
              <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.6 }}>
                <li>
                  Use {getColorsForRole('primary').length} primary,{' '}
                  {getColorsForRole('secondary').length} secondary,{' '}
                  {getColorsForRole('tertiary').length} tertiary, and{' '}
                  {getColorsForRole('accent').length} accent source colors.
                </li>
                <li>
                  Build {includeDarkMode ? 'light and dark' : 'light'} output with{' '}
                  {scaleMethod === 'radix-match'
                    ? `exact Radix sRGB solid values v${RADIX_COLORS_VERSION}`
                    : scaleMethod === 'wcag-constrained'
                      ? 'blocking WCAG-constrained semantic tokens'
                      : 'Teul Generated scales'}
                  .
                </li>
                <li>Create one {detailLevel} Figma color-system frame.</li>
                <li>
                  {createVariables ? 'Create' : 'Do not create'} a native Figma variable collection;{' '}
                  {createStyles ? 'create' : 'do not create'} local color styles.
                </li>
                <li>
                  If matching local output exists:{' '}
                  {collisionPolicy === 'cancel'
                    ? 'cancel without changing the file'
                    : collisionPolicy === 'update-local'
                      ? 'update only resources previously created by Teul'
                      : 'create a collision-free copy'}
                  .
                </li>
              </ul>
            </Disclosure>

            <SectionLabel isDark={isDark}>Or take it as code</SectionLabel>
            <div
              role="group"
              aria-label="Export code format"
              style={{ display: 'flex', gap: '6px' }}
            >
              {(
                [
                  { id: 'css', label: 'CSS' },
                  { id: 'tailwind', label: 'Tailwind' },
                  { id: 'json', label: 'JSON' },
                ] as const
              ).map(format => {
                const pressed = showExport && exportFormat === format.id;
                return (
                  <button
                    key={format.id}
                    type="button"
                    aria-pressed={pressed}
                    aria-disabled={!canGenerate}
                    onClick={() => {
                      if (!canGenerate) return;
                      if (pressed) setShowExport(false);
                      else {
                        setExportFormat(format.id);
                        setShowExport(true);
                      }
                    }}
                    className="teul-hover"
                    style={{
                      ...buttonStyle(theme),
                      backgroundColor: pressed ? theme.segActive : 'transparent',
                      opacity: canGenerate ? 1 : 0.55,
                      cursor: canGenerate ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {format.label}
                  </button>
                );
              })}
            </div>
            {showExport && canGenerate && (
              <>
                <pre
                  data-teul-export-preview=""
                  style={{
                    margin: '8px 0 0',
                    padding: '10px',
                    maxHeight: '140px',
                    overflow: 'auto',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.codeBg,
                    color: theme.text,
                    fontSize: typeScale.meta,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    ...monoStyle,
                  }}
                >
                  {exportContent}
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    canGenerate && copyToClipboard(exportContent, exportFormat.toUpperCase())
                  }
                  className="teul-hover"
                  style={{ ...buttonStyle(theme), marginTop: '8px' }}
                >
                  <Copy size={14} /> Copy {exportFormat.toUpperCase()}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div
        style={{
          padding: '10px 14px',
          borderTop: `1px solid ${theme.border}`,
          backgroundColor: theme.rail,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: hasPrimary ? (validationOk ? theme.ok : theme.no) : theme.textMuted,
            fontSize: typeScale.meta,
          }}
        >
          {hasPrimary ? validationLine : 'Choose a primary color to continue.'}
        </span>
        <button
          type="button"
          onClick={() => {
            if (step === 1) setStage(3);
            else handleGenerate();
          }}
          disabled={!primaryEnabled}
          aria-busy={isSubmitting}
          aria-describedby={
            systemNameError && step === 1
              ? 'color-system-name-error'
              : errorText
                ? 'color-system-generation-error'
                : undefined
          }
          style={buttonStyle(theme, 'primary')}
        >
          {step === 1
            ? 'Continue'
            : isSubmitting
              ? 'Creating…'
              : showReceipt
                ? 'Create another'
                : 'Create in Figma'}
        </button>
        {submissionError && (
          <span
            id="color-system-submission-error"
            role="alert"
            style={{ width: '100%', color: theme.no, fontSize: typeScale.meta }}
          >
            {submissionError}
          </span>
        )}
        {errorText && (
          <span
            id="color-system-generation-error"
            role="alert"
            style={{
              width: '100%',
              color: theme.textMuted,
              fontSize: typeScale.meta,
              lineHeight: 1.45,
            }}
          >
            {errorText}
          </span>
        )}
      </div>
    </div>
  );
};
