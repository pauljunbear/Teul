/** Abort background work when a parent edit or local-open operation invalidates its source. */
export function watchGuidelineOperationContext(
  controller: AbortController,
  captureContext: () => () => boolean
) {
  const contextIsCurrent = captureContext();
  const watcher = window.setInterval(() => {
    if (!contextIsCurrent()) controller.abort();
  }, 50);
  const stopWatching = () => window.clearInterval(watcher);
  controller.signal.addEventListener('abort', stopWatching, { once: true });
  return {
    current: () => !controller.signal.aborted && contextIsCurrent(),
    dispose: () => {
      stopWatching();
      controller.signal.removeEventListener('abort', stopWatching);
    },
  };
}
