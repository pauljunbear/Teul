/** Hold only delivery from real gradient workers, so built-app races are deterministic. */
export async function holdGradientResults(page) {
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    const trace = (window.gradientResultHold = { holding: true, held: [] });
    window.Worker = class extends NativeWorker {
      set onmessage(handler) {
        super.onmessage =
          handler === null
            ? null
            : event => {
                if (
                  trace.holding &&
                  event.data?.version === 'teul.gradient-worker.v1' &&
                  event.data.type === 'result'
                ) {
                  trace.held.push(() => handler(event));
                  return;
                }
                handler(event);
              };
      }
      get onmessage() {
        return super.onmessage;
      }
    };
    trace.restore = () => {
      trace.holding = false;
      window.Worker = NativeWorker;
    };
    trace.release = () => {
      const held = trace.held.splice(0);
      for (const deliver of held) deliver();
      return held.length;
    };
  });
}
