/** Read-only candidate intake. No message in this contract grants write authority. */
export type ColorSystemModelRequestV1 =
  | {
      type: 'read-color-system-model-v1';
      requestId: string;
      source: 'guideline-json';
      json: string;
    }
  | {
      type: 'read-color-system-model-v1';
      requestId: string;
      source: 'current-file';
      scope: 'selection' | 'current-page' | 'whole-file';
      confirmWholeFile: boolean;
    }
  | {
      type: 'cancel-color-system-model-v1';
      requestId: string;
      targetRequestId: string;
    };

export type ColorSystemModelResultV1 =
  | {
      type: 'color-system-model-result-v1';
      requestId: string;
      success: true;
      modelHash: string;
      /** Opaque exact JSON for inspection/export; the UI does not reinterpret source rules. */
      modelJson: string;
      summary: string;
    }
  | {
      type: 'color-system-model-result-v1';
      requestId: string;
      success: false;
      code: string;
      error: string;
    };
