import { loadSettings, parseParameters } from "./model.js";

export async function runLoad(
  count: number, concurrency: number, text: string, signal: AbortSignal,
  request: (method: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>,
) {
  const settings = loadSettings(count, concurrency);
  const input = parseParameters(text);
  if (typeof input.method !== "string" || !input.method.trim()) throw new Error("A request method is required");
  const method = input.method;
  const params = input.params === undefined ? {} : parseParameters(JSON.stringify(input.params));
  const samples: { durationMs: number; error?: string }[] = [];
  let next = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: Math.min(settings.concurrency, settings.count) }, async () => {
    while (!signal.aborted && next++ < settings.count) {
      const started = performance.now();
      try {
        await request(method, params, signal);
        samples.push({ durationMs: performance.now() - started });
      } catch (error) {
        samples.push({ durationMs: performance.now() - started,
          error: error instanceof Error ? error.message : String(error) });
      }
    }
  }));
  const durations = samples.map(({ durationMs }) => durationMs).sort((a, b) => a - b);
  const elapsedMs = performance.now() - start;
  return {
    requested: settings.count, completed: samples.length,
    succeeded: samples.filter(({ error }) => !error).length,
    failed: samples.filter(({ error }) => error).length, cancelled: signal.aborted,
    elapsedMs, requestsPerSecond: samples.length * 1000 / elapsedMs,
    p50Ms: durations[Math.floor(durations.length * .5)],
    p95Ms: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))],
    samples,
  };
}
