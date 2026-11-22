/** Candidate authoring transport. Create requires a separate current backend delivery review. */
export const COLOR_SYSTEM_AUTHORING_ACTIONS_V1 = [
  'inspect',
  'analyze',
  'import',
  'list',
  'open',
  'export',
  'lock',
  'unlock',
  'save',
  'delete',
  'source-check',
  'new',
  'resolve',
  'open-read-only',
  'prepare-delivery',
  'export-delivery',
  'create-delivery',
] as const;
export type ColorSystemAuthoringActionV1 = (typeof COLOR_SYSTEM_AUTHORING_ACTIONS_V1)[number];

export type ColorSystemAuthoringRequestV1 =
  | {
      type: 'color-system-authoring-v1';
      requestId: string;
      action: ColorSystemAuthoringActionV1;
      /** Import carries exact raw recipe JSON; other actions carry their action-record JSON. */
      payloadJson: string;
    }
  | {
      type: 'cancel-color-system-authoring-v1';
      requestId: string;
      targetRequestId: string;
    };

export type ColorSystemAuthoringResultV1 =
  | {
      type: 'color-system-authoring-result-v1';
      requestId: string;
      success: true;
      /** One bounded raw artifact, never another JSON envelope around its bytes. */
      artifactText: string;
      fileName: string;
    }
  | {
      type: 'color-system-authoring-result-v1';
      requestId: string;
      success: true;
      /** Opaque data for the authoring UI, never a serialized write capability. */
      dataJson: string;
    }
  | {
      type: 'color-system-authoring-result-v1';
      requestId: string;
      success: true;
      /** Exact raw recipe/unknown-version text, without a nested JSON envelope or view. */
      exportJson: string;
    }
  | {
      type: 'color-system-authoring-result-v1';
      requestId: string;
      success: false;
      code: string;
      error: string;
    };
