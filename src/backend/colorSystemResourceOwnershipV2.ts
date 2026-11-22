export const COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION = 'teul-color-resource-owner/v2' as const;

export const COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION =
  'teul-authored-resource-owner/v1' as const;

/** Delivery evidence only. None of these persisted hashes restores Create authority. */
export interface ColorSystemAuthoredCreateIdentityV1 {
  authoringRecipeId: string;
  recipeHash: string;
  sourceModelHash: string;
  designContentHash: string;
  deliveryBlueprintHash: string;
  geometryHash: string;
  assessmentHash: string;
  reviewHash: string;
  approvalHash: string;
  createAuthorizationHash: string;
}

export interface ColorSystemAuthoredResourceOwnershipV1 extends ColorSystemAuthoredCreateIdentityV1 {
  version: typeof COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION;
  transactionId: string;
  systemId: string;
  /** Stable individual resource identity, distinct from authoringRecipeId. */
  recipeId: string;
}

export const COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1 = {
  authoringRecipeId: 'teul-authored-recipe-id',
  recipeHash: 'teul-authored-recipe-hash',
  sourceModelHash: 'teul-authored-source-model-hash',
  designContentHash: 'teul-authored-design-content-hash',
  deliveryBlueprintHash: 'teul-authored-delivery-blueprint-hash',
  geometryHash: 'teul-authored-geometry-hash',
  assessmentHash: 'teul-authored-assessment-hash',
  reviewHash: 'teul-authored-review-hash',
  approvalHash: 'teul-authored-approval-hash',
  createAuthorizationHash: 'teul-authored-create-authorization-hash',
} as const;

export const COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA = {
  version: 'teul-v2-owner-version',
  transactionId: 'teul-v2-transaction-id',
  systemId: 'teul-v2-system-id',
  recipeId: 'teul-v2-recipe-id',
  resourceBlueprintHash: 'teul-v2-resource-blueprint-hash',
  sectionBlueprintHash: 'teul-v2-section-blueprint-hash',
  resourceKind: 'teul-v2-resource-kind',
  collectionRole: 'teul-v2-collection-role',
  frameRole: 'teul-v2-frame-role',
  frameOrder: 'teul-v2-frame-order',
  paintClassification: 'teul-v2-paint-classification',
  sceneRole: 'teul-v2-scene-role',
} as const;
