declare module "*.json" {
    const value: any;
    export default value;
}

// ============================================
// Color System Generator Types
// ============================================

/** Color role assignment in a color system */
type ColorRole = 'primary' | 'secondary' | 'accent' | 'neutral'

/** Scale generation method */
type ScaleMethod = 'custom' | 'radix-match'

/** Neutral family options */
type NeutralFamily = 'gray' | 'mauve' | 'slate' | 'sage' | 'olive' | 'sand'

/** Output detail level */
type OutputDetailLevel = 'minimal' | 'detailed' | 'presentation'

/** Theme mode */
type ThemeMode = 'light' | 'dark'

/** A color with its assigned role */
interface RoleAssignment {
  hex: string
  role: ColorRole
  name?: string
}

/** Configuration for generating a color system */
interface ColorSystemConfig {
  /** The source colors from Wado Sanzo combination */
  sourceColors: string[]
  /** How roles are assigned to source colors */
  roleAssignments: RoleAssignment[]
  /** Method for generating scales */
  scaleMethod: ScaleMethod
  /** Selected neutral family (or 'auto') */
  neutralFamily: NeutralFamily | 'auto'
  /** Output detail level */
  detailLevel: OutputDetailLevel
  /** Whether to generate dark mode */
  includeDarkMode: boolean
  /** Name for the color system */
  systemName: string
}

/** A complete generated color system */
interface GeneratedColorSystem {
  name: string
  config: ColorSystemConfig
  scales: {
    primary?: import('./lib/utils').ColorScale
    secondary?: import('./lib/utils').ColorScale
    accent?: import('./lib/utils').ColorScale
    neutral: import('./lib/utils').ColorScale
  }
  darkScales?: {
    primary?: import('./lib/utils').ColorScale
    secondary?: import('./lib/utils').ColorScale
    accent?: import('./lib/utils').ColorScale
    neutral: import('./lib/utils').ColorScale
  }
  usageProportions: {
    primary: number
    secondary: number
    accent: number
    neutral: number
  }
}

/** Message types for plugin communication */
interface GenerateColorSystemMessage {
  type: 'generate-color-system'
  config: ColorSystemConfig
}

interface CreateColorStylesMessage {
  type: 'create-color-styles'
  system: GeneratedColorSystem
}

interface ExportColorSystemMessage {
  type: 'export-color-system'
  system: GeneratedColorSystem
  format: 'css' | 'tailwind' | 'json'
}

type PluginMessage = 
  | GenerateColorSystemMessage 
  | CreateColorStylesMessage 
  | ExportColorSystemMessage 