import type { ColorSystemAuthoringDirectionV1 } from './colorSystemAuthoringExecutionV1';
/** Version-only recipe inspection must not import calculation or policy initialization. */
export const COLOR_SYSTEM_CONSTRUCTION_V2_VERSION = 'teul.authored-scale-construction.v2' as const;
export const COLOR_SYSTEM_CONSTRUCTION_BRIEF_V2_SCHEMA =
  'teul.scale-construction-brief.v2' as const;
export const COLOR_SYSTEM_CONSTRUCTION_V1_VERSION = 'teul.authored-scale-construction.v1' as const;
export const COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA =
  'teul.scale-construction-brief.v1' as const;
export const COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V2_VERSION =
  'teul.construction-proposal.v2' as const;
export const COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION =
  'teul.construction-proposal.v1' as const;

/** A saved declaration must opt in with both versions; never retry V1 through V2. */
export function colorSystemConstructionUsesDerivedNumbersV2(
  brief: { readonly schemaVersion?: unknown },
  intent: { readonly version?: unknown }
): boolean {
  if (
    brief.schemaVersion === COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA &&
    intent.version === COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION
  )
    return false;
  if (
    brief.schemaVersion === COLOR_SYSTEM_CONSTRUCTION_BRIEF_V2_SCHEMA &&
    intent.version === COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V2_VERSION
  )
    return true;
  throw new Error('Unsupported or mismatched construction brief and intent versions.');
}

/** The whole application uses V2 evidence when any validated construction opts in. */
export function colorSystemGenerationUsesDerivedNumbersV2(
  generation: ColorSystemAuthoringDirectionV1['generation']
): boolean {
  const declarations =
    generation.kind === 'construction'
      ? [generation]
      : generation.kind === 'overlay'
        ? generation.proposal.fragments.filter(f => f.kind === 'construction')
        : [];
  // Check all declarations before selecting the policy; an invalid pair must not hide behind V2.
  const versions = declarations.map(item =>
    colorSystemConstructionUsesDerivedNumbersV2(item.brief, item.intent)
  );
  return versions.includes(true);
}

/** Source-only applications can opt into the same recorded-evidence policy as V2 scales. */
export function colorSystemDirectionUsesDerivedNumbersV2(
  direction: ColorSystemAuthoringDirectionV1
): boolean {
  const generated = colorSystemGenerationUsesDerivedNumbersV2(direction.generation);
  return direction.evidenceVersion === 2 || generated;
}
