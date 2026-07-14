import * as React from 'react';
import type { PluginToUIMessage, UIToPluginMessage } from '../types/messages';
import { validatePluginToUIMessage } from './messageValidation';

type RequestWithId = UIToPluginMessage & { requestId: string };
type ResultType = PluginToUIMessage['type'];
type ResultFor<T extends ResultType> = Extract<PluginToUIMessage, { type: T }>;

interface UsePluginOperationOptions<T extends ResultType> {
  resultType: T;
  timeoutMs?: number;
  onResult: (result: ResultFor<T>) => void;
  onTimeout: (requestId: string) => void;
  onSubmitError?: (error: Error) => void;
}

export interface PluginOperationController {
  pending: boolean;
  pendingRequestId: string | null;
  submit: (message: RequestWithId) => boolean;
  cancel: () => void;
}

/**
 * Owns one correlated plugin operation at a time. Invalid, stale, duplicate,
 * and late responses never reach the feature callback.
 */
export function usePluginOperation<T extends ResultType>(
  options: UsePluginOperationOptions<T>
): PluginOperationController {
  const { resultType, timeoutMs = 30_000, onResult, onTimeout, onSubmitError } = options;
  const [pendingRequestId, setPendingRequestId] = React.useState<string | null>(null);
  const pendingRef = React.useRef<string | null>(null);
  const timeoutRef = React.useRef<number | null>(null);
  const onResultRef = React.useRef(onResult);
  const onTimeoutRef = React.useRef(onTimeout);
  const onSubmitErrorRef = React.useRef(onSubmitError);
  React.useEffect(() => {
    onResultRef.current = onResult;
    onTimeoutRef.current = onTimeout;
    onSubmitErrorRef.current = onSubmitError;
  }, [onResult, onSubmitError, onTimeout]);

  const clearPending = React.useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    pendingRef.current = null;
    setPendingRequestId(null);
  }, []);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const validation = validatePluginToUIMessage(event.data?.pluginMessage);
      if (!validation.valid || validation.message.type !== resultType) return;
      const result = validation.message as ResultFor<T>;
      if (!('requestId' in result) || result.requestId !== pendingRef.current) return;
      clearPending();
      onResultRef.current(result);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clearPending, resultType]);

  React.useEffect(() => clearPending, [clearPending]);

  const submit = React.useCallback(
    (message: RequestWithId): boolean => {
      if (pendingRef.current !== null) return false;
      pendingRef.current = message.requestId;
      setPendingRequestId(message.requestId);
      timeoutRef.current = window.setTimeout(() => {
        const timedOutRequestId = pendingRef.current;
        clearPending();
        if (timedOutRequestId) onTimeoutRef.current(timedOutRequestId);
      }, timeoutMs);
      try {
        parent.postMessage({ pluginMessage: message }, '*');
        return true;
      } catch (error) {
        clearPending();
        onSubmitErrorRef.current?.(
          error instanceof Error ? error : new Error('Failed to submit plugin operation')
        );
        return false;
      }
    },
    [clearPending, timeoutMs]
  );

  return {
    pending: pendingRequestId !== null,
    pendingRequestId,
    submit,
    cancel: clearPending,
  };
}
