import * as React from 'react';
import type { WorkspaceStorageResultMessage } from '../types/messages';

export type WorkspaceMainTab = 'colors' | 'werner' | 'grids' | 'a11y';
export type WorkspaceThemeMode = 'system' | 'light' | 'dark';
export type WorkspaceColorRole = 'primary' | 'secondary' | 'tertiary' | 'accent';
export type WorkspaceScaleMethod = 'custom' | 'radix-match' | 'wcag-constrained';
export type WorkspaceDetailLevel = 'minimal' | 'detailed' | 'presentation';
export type WorkspaceNeutralFamily =
  | 'auto'
  | 'gray'
  | 'mauve'
  | 'slate'
  | 'sage'
  | 'olive'
  | 'sand';
export type WorkspaceCollisionPolicy = 'cancel' | 'update-local' | 'create-copy';

export interface WorkspaceRoleAssignment {
  hex: string;
  name: string;
  role: WorkspaceColorRole | null;
  roles?: WorkspaceColorRole[];
}

export interface WorkspaceColorSystemDraft {
  sourceSignature: string;
  scaleMethod: WorkspaceScaleMethod;
  neutralFamily: WorkspaceNeutralFamily;
  detailLevel: WorkspaceDetailLevel;
  includeDarkMode: boolean;
  createStyles: boolean;
  createVariables: boolean;
  collisionPolicy: WorkspaceCollisionPolicy;
  systemName: string;
  multiSelectMode: boolean;
  roleAssignments: WorkspaceRoleAssignment[];
  stage: 1 | 2 | 3;
}

export interface WorkspaceState {
  version: 1;
  activeTab: WorkspaceMainTab;
  themeMode: WorkspaceThemeMode;
  wada: { searchTerm: string; selectedSwatch: number };
  werner: { searchTerm: string; selectedGroup: number };
  recentColors: Array<{ hex: string; name: string }>;
  generatorDraft?: WorkspaceColorSystemDraft;
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  version: 1,
  activeTab: 'colors',
  themeMode: 'system',
  wada: { searchTerm: '', selectedSwatch: -1 },
  werner: { searchTerm: '', selectedGroup: -1 },
  recentColors: [],
};

const TABS: WorkspaceMainTab[] = ['colors', 'werner', 'grids', 'a11y'];
const THEMES: WorkspaceThemeMode[] = ['system', 'light', 'dark'];
const METHODS: WorkspaceScaleMethod[] = ['custom', 'radix-match', 'wcag-constrained'];
const DETAILS: WorkspaceDetailLevel[] = ['minimal', 'detailed', 'presentation'];
const NEUTRALS: WorkspaceNeutralFamily[] = [
  'auto',
  'gray',
  'mauve',
  'slate',
  'sage',
  'olive',
  'sand',
];
const ROLES: WorkspaceColorRole[] = ['primary', 'secondary', 'tertiary', 'accent'];
const COLLISION_POLICIES: WorkspaceCollisionPolicy[] = ['cancel', 'update-local', 'create-copy'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.length <= max;
}

function parseDraft(value: unknown): WorkspaceColorSystemDraft | undefined {
  if (!record(value)) return undefined;
  if (
    !boundedText(value.sourceSignature, 4096) ||
    !METHODS.includes(value.scaleMethod as WorkspaceScaleMethod) ||
    !NEUTRALS.includes(value.neutralFamily as WorkspaceNeutralFamily) ||
    !DETAILS.includes(value.detailLevel as WorkspaceDetailLevel) ||
    typeof value.includeDarkMode !== 'boolean' ||
    typeof value.createStyles !== 'boolean' ||
    typeof value.createVariables !== 'boolean' ||
    (value.collisionPolicy !== undefined &&
      !COLLISION_POLICIES.includes(value.collisionPolicy as WorkspaceCollisionPolicy)) ||
    !boundedText(value.systemName) ||
    typeof value.multiSelectMode !== 'boolean' ||
    ![1, 2, 3].includes(value.stage as number) ||
    !Array.isArray(value.roleAssignments) ||
    value.roleAssignments.length > 64
  ) {
    return undefined;
  }
  const roleAssignments: WorkspaceRoleAssignment[] = [];
  for (const assignment of value.roleAssignments) {
    if (
      !record(assignment) ||
      typeof assignment.hex !== 'string' ||
      !HEX.test(assignment.hex) ||
      !boundedText(assignment.name) ||
      (assignment.role !== null && !ROLES.includes(assignment.role as WorkspaceColorRole)) ||
      (assignment.roles !== undefined &&
        (!Array.isArray(assignment.roles) ||
          !assignment.roles.every(role => ROLES.includes(role as WorkspaceColorRole))))
    ) {
      return undefined;
    }
    roleAssignments.push({
      hex: assignment.hex,
      name: assignment.name,
      role: assignment.role as WorkspaceColorRole | null,
      ...(assignment.roles === undefined
        ? {}
        : { roles: assignment.roles as WorkspaceColorRole[] }),
    });
  }
  return {
    sourceSignature: value.sourceSignature,
    scaleMethod: value.scaleMethod as WorkspaceScaleMethod,
    neutralFamily: value.neutralFamily as WorkspaceNeutralFamily,
    detailLevel: value.detailLevel as WorkspaceDetailLevel,
    includeDarkMode: value.includeDarkMode,
    createStyles: value.createStyles,
    createVariables: value.createVariables,
    collisionPolicy:
      value.collisionPolicy === undefined
        ? 'cancel'
        : (value.collisionPolicy as WorkspaceCollisionPolicy),
    systemName: value.systemName,
    multiSelectMode: value.multiSelectMode,
    roleAssignments,
    stage: value.stage as 1 | 2 | 3,
  };
}

export function parseWorkspaceState(value: unknown): WorkspaceState {
  if (!record(value) || value.version !== 1) return DEFAULT_WORKSPACE_STATE;
  const wada = record(value.wada) ? value.wada : {};
  const werner = record(value.werner) ? value.werner : {};
  const recentColors = Array.isArray(value.recentColors)
    ? value.recentColors
        .filter(
          color =>
            record(color) &&
            typeof color.hex === 'string' &&
            HEX.test(color.hex) &&
            boundedText(color.name)
        )
        .slice(0, 12)
        .map(color => ({ hex: color.hex as string, name: color.name as string }))
    : [];
  const generatorDraft = parseDraft(value.generatorDraft);
  return {
    version: 1,
    activeTab: TABS.includes(value.activeTab as WorkspaceMainTab)
      ? (value.activeTab as WorkspaceMainTab)
      : 'colors',
    themeMode: THEMES.includes(value.themeMode as WorkspaceThemeMode)
      ? (value.themeMode as WorkspaceThemeMode)
      : 'system',
    wada: {
      searchTerm: boundedText(wada.searchTerm, 200) ? wada.searchTerm : '',
      selectedSwatch:
        typeof wada.selectedSwatch === 'number' && Number.isInteger(wada.selectedSwatch)
          ? wada.selectedSwatch
          : -1,
    },
    werner: {
      searchTerm: boundedText(werner.searchTerm, 200) ? werner.searchTerm : '',
      selectedGroup:
        typeof werner.selectedGroup === 'number' && Number.isInteger(werner.selectedGroup)
          ? werner.selectedGroup
          : -1,
    },
    recentColors,
    ...(generatorDraft ? { generatorDraft } : {}),
  };
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  hydrated: boolean;
  update: (updater: (state: WorkspaceState) => WorkspaceState) => void;
  addRecentColor: (color: { hex: string; name: string }) => void;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, setState] = React.useState(DEFAULT_WORKSPACE_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const getRequestId = React.useRef('workspace-get');
  const saveSequence = React.useRef(0);
  const lastSerialized = React.useRef('');

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const message = event.data?.pluginMessage as Partial<WorkspaceStorageResultMessage>;
      if (
        message.type !== 'workspace-storage-result' ||
        message.operation !== 'get' ||
        message.requestId !== getRequestId.current
      ) {
        return;
      }
      if (message.success && typeof message.value === 'string') {
        try {
          const parsed = parseWorkspaceState(JSON.parse(message.value));
          setState(parsed);
          lastSerialized.current = JSON.stringify(parsed);
        } catch {
          setState(DEFAULT_WORKSPACE_STATE);
        }
      }
      setHydrated(true);
    };
    window.addEventListener('message', handleMessage);
    parent.postMessage(
      { pluginMessage: { type: 'get-workspace-storage', requestId: getRequestId.current } },
      '*'
    );
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return undefined;
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized.current) return undefined;
    const timeout = window.setTimeout(() => {
      lastSerialized.current = serialized;
      parent.postMessage(
        {
          pluginMessage: {
            type: 'set-workspace-storage',
            requestId: `workspace-set-${Date.now()}-${++saveSequence.current}`,
            value: serialized,
          },
        },
        '*'
      );
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [hydrated, state]);

  const update = React.useCallback(
    (updater: (current: WorkspaceState) => WorkspaceState) => setState(updater),
    []
  );
  const addRecentColor = React.useCallback((color: { hex: string; name: string }) => {
    setState(current => ({
      ...current,
      recentColors: [
        color,
        ...current.recentColors.filter(item => item.hex.toLowerCase() !== color.hex.toLowerCase()),
      ].slice(0, 12),
    }));
  }, []);

  return (
    <WorkspaceContext.Provider value={{ state, hydrated, update, addRecentColor }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspaceState(): WorkspaceContextValue {
  const context = React.useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspaceState must be used inside WorkspaceProvider.');
  return context;
}

export function useOptionalWorkspaceState(): WorkspaceContextValue | null {
  return React.useContext(WorkspaceContext);
}
