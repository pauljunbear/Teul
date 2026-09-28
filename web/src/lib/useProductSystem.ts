import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioAuthoringResult, StudioAuthoringSettings } from './authoring';

/** One selected recipe owns all product paints. Async work can only adopt its own latest result. */
export function useProductSystem(initial: StudioAuthoringSettings) {
  const [result, setResult] = useState<StudioAuthoringResult | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function cancel() {
    if (!pending.current) return;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setMessage('Generation cancelled. Your previous result is still available.');
  }

  const run = useCallback(async (settings: StudioAuthoringSettings, recipeJson?: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const engine = await import('./authoring');
      if (controller.signal.aborted) return false;
      let next: StudioAuthoringResult;
      if (recipeJson) {
        const replay = await engine.reopenStudioAuthoring(recipeJson, controller.signal);
        if (!replay.direction || replay.status !== 'ready') {
          if (!controller.signal.aborted) setMessage(replay.message);
          return false;
        }
        next = {
          status: 'ready',
          settings: engine.normalizeStudioAuthoringSettings(settings),
          directions: [replay.direction],
          sourceRoles: engine.studioSourceRoles(settings.colors),
          diagnostics: [],
          receiptHash: null,
        };
      } else next = await engine.generateStudioAuthoring(settings, controller.signal);
      if (controller.signal.aborted || pending.current !== controller) return false;
      if (next.status === 'cancelled') return false;
      if (next.status === 'blocked') {
        setMessage(`No complete direction passed. ${next.diagnostics.slice(0, 3).join(' ')}`);
        return false;
      }
      setResult(next);
      setSelectedId(next.directions[0]?.id ?? '');
      return next.status === 'ready';
    } catch (error) {
      if (!controller.signal.aborted && pending.current === controller)
        setMessage(error instanceof Error ? error.message : 'Could not build this product system.');
      return false;
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    const start = setTimeout(() => void run(initial), 0);
    return () => clearTimeout(start);
  }, [initial, run]);

  const selected = result?.directions.find(direction => direction.id === selectedId) ?? null;
  return { result, selected, busy, message, run, cancel, select: setSelectedId };
}
