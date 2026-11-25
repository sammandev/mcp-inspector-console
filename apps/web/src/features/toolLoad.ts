/**
 * Browser load engine for the Tools "Load test" dialog. It follows the
 * Official Inspector's load-test semantics (templates, weighted scenarios,
 * rate grid with dropped slots, warm-up, stepped stages, circuit breaker and
 * summaries) with an injectable clock so runs can be tested in virtual time.
 */

export type LoadMethod = "tools/call" | "resources/read" | "prompts/get";
export type LoadCallOutcome = "ok" | { outcome: "tool_error"; message: string };
export type LoadCall = (worker: number, step: number, seq: number) => Promise<LoadCallOutcome>;
export type LoadRequest = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export interface LoadClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface LoadScenarioStep {
  name: string;
  method: LoadMethod;
  target: string;
  weight: number;
  args?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface LoadScenario {
  steps: LoadScenarioStep[];
}

export interface LoadStages {
  by: "concurrency" | "rate";
  levels: number[];
  stageMs: number;
}

export interface LoadOptions {
  concurrency: number;
  durationMs?: number;
  requests?: number;
  rate?: number;
  warmupMs?: number;
  progressMs?: number;
  stages?: LoadStages;
  scenario?: LoadScenario;
}

export interface LoadLatency {
  min: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
  max: number;
}

export interface LoadMessageCount {
  message: string;
  count: number;
}

export interface LoadStoppedEarly {
  reason: "consecutive_errors" | "interrupted";
  detail: string;
}

export interface LoadOutcomeSummary {
  requests: number;
  ok: number;
  toolErrors: number;
  errors: number;
  errorRate: number;
  throughput: number;
  okThroughput: number;
  latencyMs: LoadLatency | null;
  errorLatencyMs: LoadLatency | null;
  errorMessages: LoadMessageCount[];
  toolErrorMessages: LoadMessageCount[];
}

export interface LoadRateFigures {
  rate: number;
  plannedStarts: number;
  droppedSlots: number;
  achievedRate: number;
}

export interface LoadStepSummary extends LoadOutcomeSummary {
  name: string;
  method: LoadMethod;
  target: string;
  weight: number;
}

export interface LoadStageSummary extends LoadOutcomeSummary, Partial<LoadRateFigures> {
  stage: number;
  stepBy: LoadStages["by"];
  level: number;
  concurrency: number;
  elapsedMs: number;
  stoppedEarly?: LoadStoppedEarly;
}

export interface LoadWarmupSummary {
  durationMs: number;
  requests: number;
  ok: number;
  failed: number;
  stoppedEarly?: LoadStoppedEarly;
}

export interface LoadSummary extends LoadOutcomeSummary, Partial<LoadRateFigures> {
  concurrency: number;
  durationMs?: number;
  requestLimit?: number;
  elapsedMs: number;
  stoppedEarly?: LoadStoppedEarly;
  steps?: LoadStepSummary[];
  stages?: LoadStageSummary[];
  warmup?: LoadWarmupSummary;
}

export interface LoadProgress {
  phase: "warmup" | "run";
  stage?: number;
  elapsedMs: number;
  requests: number;
  ok: number;
  failed: number;
  throughput: number;
  latencyMs: { p50: number; p99: number } | null;
}

export interface LoadRunContext {
  clock?: LoadClock;
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
}

const MAX_ERROR_KINDS = 10;
const OTHER_ERRORS = "(other)";
const NO_TOOL_ERROR_TEXT = "(no text content)";
const MAX_TOOL_ERROR_CHARS = 200;
const BREAKER_STREAK = 50;
const BREAKER_MIN_STREAK = 5;
const BREAKER_WINDOW_MS = 1000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_DURATION_MS = 10_000;
const DEFAULT_STAGE_MS = 10_000;
const DEFAULT_PROGRESS_MS = 1000;
const LOAD_METHODS: readonly LoadMethod[] = ["tools/call", "resources/read", "prompts/get"];
const STEP_KEYS: Record<LoadMethod, { target: "tool" | "uri" | "prompt"; keys: string[] }> = {
  "tools/call": { target: "tool", keys: ["method", "name", "weight", "meta", "tool", "args"] },
  "resources/read": { target: "uri", keys: ["method", "name", "weight", "meta", "uri"] },
  "prompts/get": { target: "prompt", keys: ["method", "name", "weight", "meta", "prompt", "args"] },
};

const PLACEHOLDER = /\{\{(seq|worker|uuid|rand:(-?\d+)-(-?\d+))\}\}/g;
const WHOLE_NUMERIC = /^\{\{(seq|worker|rand:(-?\d+)-(-?\d+))\}\}$/;
const RAND_PLACEHOLDER = /\{\{rand:(-?\d+)-(-?\d+)\}\}/g;

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export const realLoadClock: LoadClock = {
  now: () => performance.now(),
  sleep: (ms, signal) => new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, Math.max(0, ms));
    signal?.addEventListener("abort", done, { once: true });
  }),
};

// --- Templates -------------------------------------------------------------

export interface LoadTemplateContext {
  seq: number;
  worker: number;
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function placeholderValue(token: string, lo: string | undefined, hi: string | undefined, context: LoadTemplateContext): number | string {
  if (token === "seq") return context.seq;
  if (token === "worker") return context.worker;
  if (token === "uuid") return randomUuid();
  const min = Number(lo);
  const max = Number(hi);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function hasPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return new RegExp(PLACEHOLDER.source).test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (isRecord(value)) return Object.values(value).some(hasPlaceholder);
  return false;
}

function fillTemplate(value: unknown, context: LoadTemplateContext): unknown {
  if (typeof value === "string") {
    const whole = WHOLE_NUMERIC.exec(value);
    if (whole) return placeholderValue(whole[1]!.startsWith("rand:") ? "rand" : whole[1]!, whole[2], whole[3], context);
    return value.replace(PLACEHOLDER, (_match, token: string, lo?: string, hi?: string) =>
      String(placeholderValue(token.startsWith("rand:") ? "rand" : token, lo, hi, context)));
  }
  if (Array.isArray(value)) return value.map((item) => fillTemplate(item, context));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillTemplate(item, context)]));
  return value;
}

/** A per-call filler for a value with placeholders, or `undefined` when it has none. */
export function compileLoadTemplate(value: unknown): ((context: LoadTemplateContext) => unknown) | undefined {
  if (!hasPlaceholder(value)) return undefined;
  return (context) => fillTemplate(value, context);
}

/** Throws when a `{{rand:min-max}}` placeholder could not produce safe integers. */
export function checkLoadTemplate(value: unknown, where: string): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(RAND_PLACEHOLDER)) {
      const min = Number(match[1]);
      const max = Number(match[2]);
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max || max - min + 1 > Number.MAX_SAFE_INTEGER) {
        throw new Error(`${where}: ${match[0]} needs safe integer bounds with min <= max and a span (max - min + 1) no larger than ${Number.MAX_SAFE_INTEGER}.`);
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => checkLoadTemplate(item, `${where}[${index}]`));
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) checkLoadTemplate(item, `${where}.${key}`);
  }
}

// --- Scenarios -------------------------------------------------------------

export function validateLoadScenario(input: unknown): LoadScenario {
  let raw: unknown[];
  if (Array.isArray(input)) {
    raw = input;
  } else if (isRecord(input)) {
    const unknownKey = Object.keys(input).find((key) => key !== "steps");
    if (unknownKey !== undefined) throw new Error(`unknown key "${unknownKey}" (allowed: steps).`);
    if (!Array.isArray(input.steps)) throw new Error('a scenario must be an array of steps, or an object with a "steps" array.');
    raw = input.steps;
  } else {
    throw new Error('a scenario must be an array of steps, or an object with a "steps" array.');
  }
  if (raw.length === 0) throw new Error("a scenario needs at least one step.");

  const parsed = raw.map((step, index) => {
    const label = `step ${index + 1}`;
    if (!isRecord(step)) throw new Error(`${label} must be a JSON object.`);
    const method = step.method;
    if (typeof method !== "string" || !LOAD_METHODS.includes(method as LoadMethod)) {
      throw new Error(`${label}: "method" must be one of ${LOAD_METHODS.join(", ")}.`);
    }
    const shape = STEP_KEYS[method as LoadMethod];
    const unknownKey = Object.keys(step).find((key) => !shape.keys.includes(key));
    if (unknownKey !== undefined) throw new Error(`${label}: unknown key "${unknownKey}" for ${method} (allowed: ${shape.keys.join(", ")}).`);
    const target = step[shape.target];
    if (typeof target !== "string" || target.length === 0) throw new Error(`${label}: ${method} needs a non-empty "${shape.target}".`);
    const weight = step.weight ?? 1;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) throw new Error(`${label}: "weight" must be a positive number.`);
    if (step.name !== undefined && (typeof step.name !== "string" || step.name.length === 0)) throw new Error(`${label}: "name" must be a non-empty string.`);
    for (const key of ["args", "meta"] as const) {
      if (step[key] !== undefined && !isRecord(step[key])) throw new Error(`${label}: "${key}" must be a JSON object.`);
    }
    checkLoadTemplate(target, `${label} ${shape.target}`);
    checkLoadTemplate(step.args, `${label} args`);
    checkLoadTemplate(step.meta, `${label} meta`);
    return {
      explicitName: step.name as string | undefined,
      method: method as LoadMethod,
      target,
      weight,
      args: step.args as Record<string, unknown> | undefined,
      meta: step.meta as Record<string, unknown> | undefined,
    };
  });

  const defaultCounts = new Map<string, number>();
  for (const step of parsed) {
    if (step.explicitName === undefined) {
      const name = `${step.method} ${step.target}`;
      defaultCounts.set(name, (defaultCounts.get(name) ?? 0) + 1);
    }
  }
  const seen = new Set<string>();
  const steps = parsed.map(({ explicitName, ...step }, index) => {
    const base = `${step.method} ${step.target}`;
    const name = explicitName ?? ((defaultCounts.get(base) ?? 0) > 1 ? `${base} #${index + 1}` : base);
    if (seen.has(name)) throw new Error(`step ${index + 1}: duplicate name "${name}".`);
    seen.add(name);
    return {
      name,
      method: step.method,
      target: step.target,
      weight: step.weight,
      ...(step.args ? { args: step.args } : {}),
      ...(step.meta ? { meta: step.meta } : {}),
    };
  });
  return { steps };
}

/** Smooth weighted round-robin: weights 2:1 pick A, B, A, A, B, A. */
export function createWeightedPicker(weights: number[]): () => number {
  const current = weights.map(() => 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return () => {
    let best = 0;
    for (let index = 0; index < weights.length; index++) {
      current[index]! += weights[index]!;
      if (current[index]! > current[best]!) best = index;
    }
    current[best]! -= total;
    return best;
  };
}

// --- Statistics ------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const exact = Math.round(p * 1000) * sorted.length;
  const quotient = Math.floor(exact / 100_000);
  const rank = exact - quotient * 100_000 > 0 ? quotient + 1 : quotient;
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

function summarizeLatency(latencies: number[]): LoadLatency | null {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0]!,
    mean: round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    p999: percentile(sorted, 99.9),
    max: sorted[sorted.length - 1]!,
  };
}

class MessageTally {
  private readonly counts = new Map<string, number>();
  private other = 0;

  add(message: string): void {
    const count = this.counts.get(message);
    if (count !== undefined) this.counts.set(message, count + 1);
    else if (this.counts.size < MAX_ERROR_KINDS) this.counts.set(message, 1);
    else this.other++;
  }

  entries(): LoadMessageCount[] {
    const list = [...this.counts].map(([message, count]) => ({ message, count })).sort((a, b) => b.count - a.count);
    if (this.other > 0) list.push({ message: OTHER_ERRORS, count: this.other });
    return list;
  }
}

class OutcomeStats {
  ok = 0;
  toolErrors = 0;
  errors = 0;
  private readonly okLatencies: number[] = [];
  private readonly errorLatencies: number[] = [];
  private readonly tally = new MessageTally();
  private readonly toolTally = new MessageTally();

  get completed(): number {
    return this.ok + this.toolErrors + this.errors;
  }

  addResult(outcome: LoadCallOutcome, latency: number): void {
    if (outcome === "ok") {
      this.ok++;
      this.okLatencies.push(latency);
      return;
    }
    this.toolErrors++;
    this.errorLatencies.push(latency);
    this.toolTally.add(outcome.message || NO_TOOL_ERROR_TEXT);
  }

  addThrown(message: string, latency: number): void {
    this.errors++;
    this.errorLatencies.push(latency);
    this.tally.add(message);
  }

  summarize(elapsedMs: number): LoadOutcomeSummary {
    const completed = this.completed;
    return {
      requests: completed,
      ok: this.ok,
      toolErrors: this.toolErrors,
      errors: this.errors,
      errorRate: completed === 0 ? 0 : round((this.toolErrors + this.errors) / completed, 4),
      throughput: elapsedMs > 0 ? round((completed * 1000) / elapsedMs) : 0,
      okThroughput: elapsedMs > 0 ? round((this.ok * 1000) / elapsedMs) : 0,
      latencyMs: summarizeLatency(this.okLatencies),
      errorLatencyMs: summarizeLatency(this.errorLatencies),
      errorMessages: this.tally.entries(),
      toolErrorMessages: this.toolTally.entries(),
    };
  }
}

// --- Engine ----------------------------------------------------------------

interface RunState {
  clock: LoadClock;
  stop: AbortController;
  pick?: () => number;
  seq: number;
  streak: number;
  streakStartedAt: number;
  stoppedEarly?: LoadStoppedEarly;
  onProgress?: (progress: LoadProgress) => void;
  progressMs?: number;
}

interface WindowSpec {
  phase: LoadProgress["phase"];
  stage?: number;
  concurrency: number;
  rate?: number;
  durationMs?: number;
  requests?: number;
  hold?: boolean;
  totals?: { stats: OutcomeStats; steps?: OutcomeStats[] };
}

interface WindowResult {
  stats: OutcomeStats;
  elapsedMs: number;
  rateFigures?: LoadRateFigures;
  stoppedEarly?: LoadStoppedEarly;
}

async function runWindow(call: LoadCall, spec: WindowSpec, state: RunState): Promise<WindowResult> {
  const { clock, stop } = state;
  const start = clock.now();
  const deadline = spec.durationMs === undefined ? Infinity : start + spec.durationMs;
  const interval = spec.rate === undefined ? undefined : 1000 / spec.rate;
  const stats = new OutcomeStats();
  let started = 0;
  let nextStart = start;
  let stopAt: number | undefined = stop.signal.aborted ? start : undefined;
  const markStop = () => { stopAt ??= clock.now(); };
  stop.signal.addEventListener("abort", markStop, { once: true });

  const canStart = (now: number) =>
    !stop.signal.aborted && (spec.requests === undefined || started < spec.requests) && now < deadline;

  const claimNow = async (): Promise<{ seq: number; step: number } | undefined> => {
    if (!canStart(clock.now())) return undefined;
    if (interval !== undefined) {
      const now = clock.now();
      if (nextStart > now) {
        if (nextStart >= deadline) return undefined;
        await clock.sleep(nextStart - now, stop.signal);
        if (!canStart(clock.now())) return undefined;
      }
      const at = clock.now();
      // A late start drops the slots it missed rather than bursting to catch up.
      nextStart = at - nextStart < interval ? nextStart + interval : at + interval;
    }
    started++;
    return { seq: ++state.seq, step: state.pick ? state.pick() : 0 };
  };

  // Workers claim start slots one at a time, in arrival order.
  let turnstile: Promise<unknown> = Promise.resolve();
  const claim = () => {
    const next = turnstile.then(claimNow);
    turnstile = next.catch(() => undefined);
    return next;
  };

  const tick = { count: 0, okLatencies: [] as number[], at: start };
  const sinksFor = (step: number) => {
    tick.count++;
    return [stats, spec.totals?.stats, spec.totals?.steps?.[step]].filter((sink): sink is OutcomeStats => sink !== undefined);
  };
  const recordResult = (step: number, latency: number, outcome: LoadCallOutcome) => {
    if (outcome === "ok") tick.okLatencies.push(latency);
    for (const sink of sinksFor(step)) sink.addResult(outcome, latency);
  };
  const recordThrown = (step: number, latency: number, message: string) => {
    for (const sink of sinksFor(step)) sink.addThrown(message, latency);
  };

  const worker = async (index: number) => {
    for (;;) {
      const slot = await claim();
      if (!slot) return;
      const begin = clock.now();
      let outcome: LoadCallOutcome;
      try {
        outcome = await call(index, slot.step, slot.seq);
      } catch (error) {
        const now = clock.now();
        recordThrown(slot.step, now - begin, errorMessage(error));
        if (state.streak++ === 0) state.streakStartedAt = now;
        const span = now - state.streakStartedAt;
        if ((state.streak >= BREAKER_STREAK || (state.streak >= BREAKER_MIN_STREAK && span >= BREAKER_WINDOW_MS)) && canStart(now)) {
          state.stoppedEarly ??= {
            reason: "consecutive_errors",
            detail: `${state.streak} calls in a row threw over ${Math.round(span)}ms; the server looks unavailable`,
          };
          stop.abort();
        }
        continue;
      }
      recordResult(slot.step, clock.now() - begin, outcome);
      state.streak = 0;
    }
  };

  const tickerStop = new AbortController();
  const ticker = (async () => {
    if (!state.onProgress || !state.progressMs) return;
    for (;;) {
      await clock.sleep(state.progressMs, tickerStop.signal);
      if (tickerStop.signal.aborted) return;
      const now = clock.now();
      const sinceTick = now - tick.at;
      const latency = summarizeLatency(tick.okLatencies);
      state.onProgress({
        phase: spec.phase,
        ...(spec.stage !== undefined ? { stage: spec.stage } : {}),
        elapsedMs: now - start,
        requests: stats.completed,
        ok: stats.ok,
        failed: stats.toolErrors + stats.errors,
        throughput: sinceTick > 0 ? round((tick.count * 1000) / sinceTick) : 0,
        latencyMs: latency ? { p50: latency.p50, p99: latency.p99 } : null,
      });
      tick.count = 0;
      tick.okLatencies = [];
      tick.at = now;
    }
  })();

  await Promise.all(Array.from({ length: spec.concurrency }, (_, index) => worker(index)));
  if (spec.hold && !stop.signal.aborted && clock.now() < deadline) await clock.sleep(deadline - clock.now(), stop.signal);
  const end = clock.now();
  tickerStop.abort();
  await ticker;
  stop.signal.removeEventListener("abort", markStop);

  const requestCapped = spec.requests !== undefined && started >= spec.requests;
  const ranFull = spec.durationMs !== undefined && stopAt === undefined && !requestCapped;
  const elapsedMs = ranFull ? Math.max(end - start, spec.durationMs!) : end - start;

  let rateFigures: LoadRateFigures | undefined;
  if (spec.rate !== undefined) {
    const windowMs = stopAt !== undefined
      ? stopAt - start
      : requestCapped ? nextStart - start : Number.isFinite(deadline) ? deadline - start : end - start;
    const slots = Math.ceil((windowMs * spec.rate) / 1000 - 1e-9);
    const plannedStarts = Math.max(started, slots);
    rateFigures = {
      rate: spec.rate,
      plannedStarts,
      droppedSlots: plannedStarts - started,
      achievedRate: windowMs > 0 ? round((started * 1000) / windowMs) : 0,
    };
  }
  return { stats, elapsedMs, rateFigures, stoppedEarly: stopAt !== undefined ? state.stoppedEarly : undefined };
}

/** Runs a load test and summarizes it. Aborting `signal` stops new calls and lets in-flight ones finish. */
export async function runLoad(call: LoadCall, options: LoadOptions, context: LoadRunContext = {}): Promise<LoadSummary> {
  const stop = new AbortController();
  const state: RunState = {
    clock: context.clock ?? realLoadClock,
    stop,
    pick: options.scenario && options.scenario.steps.length > 1 ? createWeightedPicker(options.scenario.steps.map((step) => step.weight)) : undefined,
    seq: 0,
    streak: 0,
    streakStartedAt: 0,
    onProgress: context.onProgress,
    progressMs: options.progressMs,
  };
  const interrupt = () => {
    state.stoppedEarly ??= { reason: "interrupted", detail: "the run was interrupted" };
    stop.abort();
  };
  if (context.signal?.aborted) interrupt();
  else context.signal?.addEventListener("abort", interrupt, { once: true });

  try {
    let warmup: LoadWarmupSummary | undefined;
    if (options.warmupMs !== undefined && !options.stages && !stop.signal.aborted) {
      const result = await runWindow(call, { phase: "warmup", concurrency: options.concurrency, rate: options.rate, durationMs: options.warmupMs }, state);
      warmup = {
        durationMs: result.elapsedMs,
        requests: result.stats.completed,
        ok: result.stats.ok,
        failed: result.stats.toolErrors + result.stats.errors,
        ...(result.stoppedEarly ? { stoppedEarly: result.stoppedEarly } : {}),
      };
      state.seq = 0;
    }

    const totals = { stats: new OutcomeStats(), steps: options.scenario?.steps.map(() => new OutcomeStats()) };
    let elapsedMs = 0;
    let rateFigures: LoadRateFigures | undefined;
    let stages: LoadStageSummary[] | undefined;

    if (options.stages) {
      const { by, levels, stageMs } = options.stages;
      stages = [];
      for (const [index, level] of levels.entries()) {
        if (stop.signal.aborted) break;
        const concurrency = by === "concurrency" ? level : options.concurrency;
        const result = await runWindow(call, {
          phase: "run",
          stage: index + 1,
          concurrency,
          rate: by === "rate" ? level : options.rate,
          durationMs: stageMs,
          hold: index < levels.length - 1,
          totals,
        }, state);
        elapsedMs += result.elapsedMs;
        stages.push({
          stage: index + 1,
          stepBy: by,
          level,
          concurrency,
          ...result.rateFigures,
          ...result.stats.summarize(result.elapsedMs),
          elapsedMs: result.elapsedMs,
          ...(result.stoppedEarly ? { stoppedEarly: result.stoppedEarly } : {}),
        });
      }
    } else if (!stop.signal.aborted) {
      const result = await runWindow(call, {
        phase: "run",
        concurrency: options.concurrency,
        rate: options.rate,
        durationMs: options.durationMs,
        requests: options.requests,
        totals,
      }, state);
      elapsedMs = result.elapsedMs;
      rateFigures = result.rateFigures;
    }

    const steps = options.scenario?.steps.map((step, index) => ({
      name: step.name,
      method: step.method,
      target: step.target,
      weight: step.weight,
      ...totals.steps![index]!.summarize(elapsedMs),
    }));

    return {
      concurrency: options.concurrency,
      ...(options.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
      ...(options.requests !== undefined ? { requestLimit: options.requests } : {}),
      ...rateFigures,
      ...totals.stats.summarize(elapsedMs),
      elapsedMs,
      ...(state.stoppedEarly ? { stoppedEarly: state.stoppedEarly } : {}),
      ...(steps ? { steps } : {}),
      ...(stages ? { stages } : {}),
      ...(warmup ? { warmup } : {}),
    };
  } finally {
    context.signal?.removeEventListener("abort", interrupt);
  }
}

// --- Reporting -------------------------------------------------------------

export function formatLoadProgress(progress: LoadProgress): string {
  const phase = progress.phase === "warmup" ? "warm-up " : progress.stage !== undefined ? `stage ${progress.stage} ` : "";
  const latency = progress.latencyMs
    ? `p50 ${round(progress.latencyMs.p50, 1)} / p99 ${round(progress.latencyMs.p99, 1)} ms`
    : "no successes";
  return `[load ${phase}${(progress.elapsedMs / 1000).toFixed(1)}s] ${progress.requests} calls (${progress.ok} ok, ${progress.failed} failed), ${progress.throughput}/s, ${latency}`;
}

function rateShortfall(figures: Partial<LoadRateFigures> & { requests: number }, prefix: string): string | undefined {
  if (figures.rate === undefined || figures.plannedStarts === undefined) return undefined;
  if (figures.requests >= 0.9 * figures.plannedStarts) return undefined;
  return `${prefix}only ${figures.requests} of ${figures.plannedStarts} planned calls started (${figures.achievedRate}/s of the ${figures.rate}/s target); raise Concurrency so more calls can be in flight at once, or lower the Rate.`;
}

export function loadSummaryWarnings(summary: LoadSummary): string[] {
  const warnings: string[] = [];
  if (summary.stoppedEarly && summary.stoppedEarly.reason !== "interrupted") {
    warnings.push(`Warning: the load run stopped early (${summary.stoppedEarly.reason}): ${summary.stoppedEarly.detail}.`);
  }
  const overall = rateShortfall(summary, "Warning: ");
  if (overall) warnings.push(overall);
  for (const stage of summary.stages ?? []) {
    const shortfall = rateShortfall(stage, `Warning: stage ${stage.stage}: `);
    if (shortfall) warnings.push(shortfall);
  }
  return warnings;
}

// --- Form ------------------------------------------------------------------

export type LoadNumberField = number | string;

export interface LoadTestForm {
  target: "tool" | "scenario";
  scenarioText: string;
  concurrency: LoadNumberField;
  durationSec: LoadNumberField;
  requests: LoadNumberField;
  rate: LoadNumberField;
  warmupSec: LoadNumberField;
  steps: string;
  stepBy: LoadStages["by"];
  stepDurationSec: LoadNumberField;
}

export const DEFAULT_LOAD_TEST_FORM: LoadTestForm = {
  target: "tool",
  scenarioText: "",
  concurrency: DEFAULT_CONCURRENCY,
  durationSec: "",
  requests: "",
  rate: "",
  warmupSec: "",
  steps: "",
  stepBy: "concurrency",
  stepDurationSec: "",
};

export interface LoadToolSelection {
  name: string;
  args: Record<string, unknown>;
  argsReady: boolean;
}

export type LoadTarget = { toolName: string; toolArgs: Record<string, unknown> } | { scenario: LoadScenario };
export type LoadTestRequest = LoadTarget & { options: LoadOptions };
export type LoadTestBuild = { ok: true; request: LoadTestRequest } | { ok: false; error: string };

class FormError extends Error {}

function readNumber(raw: LoadNumberField, label: string, whole: boolean): number | undefined {
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const value = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0 || (whole && !Number.isInteger(value))) {
    throw new FormError(`${label} must be a positive ${whole ? "whole number" : "number"}.`);
  }
  return value;
}

function readSteps(raw: string, by: LoadStages["by"]): number[] | undefined {
  if (raw.trim() === "") return undefined;
  const levels = raw.split(",").map((part) => part.trim());
  const values = levels.map(Number);
  if (levels.some((part) => part === "") || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new FormError("Steps must be a comma-separated list of positive numbers, e.g. 5,10,20.");
  }
  if (by === "concurrency" && values.some((value) => !Number.isInteger(value))) {
    throw new FormError("Steps must be whole numbers when stepping concurrency.");
  }
  return values;
}

/** Validates the dialog form; only the knobs a run will use are checked. */
export function buildLoadTestRequest(form: LoadTestForm, tool: LoadToolSelection | undefined): LoadTestBuild {
  try {
    const levels = readSteps(form.steps, form.stepBy);
    const stepsConcurrency = levels !== undefined && form.stepBy === "concurrency";
    const stepsRate = levels !== undefined && form.stepBy === "rate";
    const concurrency = stepsConcurrency ? Math.max(...levels) : readNumber(form.concurrency, "Concurrency", true) ?? DEFAULT_CONCURRENCY;
    const rate = stepsRate ? Math.max(...levels) : readNumber(form.rate, "Rate", false);

    const options: LoadOptions = { concurrency, ...(rate !== undefined ? { rate } : {}) };
    if (levels) {
      const stepSec = readNumber(form.stepDurationSec, "Step duration", false);
      options.stages = { by: form.stepBy, levels, stageMs: stepSec === undefined ? DEFAULT_STAGE_MS : stepSec * 1000 };
    } else {
      const durationSec = readNumber(form.durationSec, "Duration", false);
      const requests = readNumber(form.requests, "Requests", true);
      const warmupSec = readNumber(form.warmupSec, "Warm-up", false);
      if (durationSec !== undefined) options.durationMs = durationSec * 1000;
      else if (requests === undefined) options.durationMs = DEFAULT_DURATION_MS;
      if (requests !== undefined) options.requests = requests;
      if (warmupSec !== undefined) options.warmupMs = warmupSec * 1000;
    }
    options.progressMs = DEFAULT_PROGRESS_MS;

    if (form.target === "scenario") {
      if (form.scenarioText.trim() === "") throw new FormError("Paste a scenario: an array of steps.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(form.scenarioText);
      } catch (error) {
        throw new FormError(`Scenario is not valid JSON: ${errorMessage(error)}`);
      }
      let scenario: LoadScenario;
      try {
        scenario = validateLoadScenario(parsed);
      } catch (error) {
        throw new FormError(`Scenario: ${errorMessage(error)}`);
      }
      return { ok: true, request: { scenario, options: { ...options, scenario } } };
    }

    if (!tool) throw new FormError("Select a tool to load, or paste a scenario.");
    if (!tool.argsReady) throw new FormError("Fill in the tool's required arguments, and fix any field the form cannot send, before a tool run.");
    try {
      checkLoadTemplate(tool.args, "Tool arguments");
    } catch (error) {
      throw new FormError(errorMessage(error));
    }
    return { ok: true, request: { toolName: tool.name, toolArgs: tool.args, options } };
  } catch (error) {
    if (error instanceof FormError) return { ok: false, error: error.message };
    throw error;
  }
}

// --- MCP calls -------------------------------------------------------------

/** The first non-empty text block of an `isError` tool result, cut to 200 characters. */
export function toolErrorText(result: unknown): string {
  const content = isRecord(result) && Array.isArray(result.content) ? result.content : [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      const text = block.text.trim();
      if (text) return text.length > MAX_TOOL_ERROR_CHARS ? `${text.slice(0, MAX_TOOL_ERROR_CHARS)}…` : text;
    }
  }
  return NO_TOOL_ERROR_TEXT;
}

function promptArguments(args: unknown): Record<string, unknown> {
  if (!isRecord(args)) return {};
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, typeof value === "number" ? String(value) : value]));
}

/** Turns a tool or scenario target into a {@link LoadCall} over an MCP request function. */
export function createLoadCall(request: LoadRequest, target: LoadTarget): LoadCall {
  const steps: LoadScenarioStep[] = "scenario" in target
    ? target.scenario.steps
    : [{ name: `tools/call ${target.toolName}`, method: "tools/call", target: target.toolName, weight: 1, args: target.toolArgs }];
  const compiled = steps.map((step) => ({
    step,
    target: compileLoadTemplate(step.target),
    args: compileLoadTemplate(step.args),
    meta: compileLoadTemplate(step.meta),
  }));

  return async (worker, stepIndex, seq) => {
    const entry = compiled[stepIndex] ?? compiled[0]!;
    const context = { seq, worker };
    const name = entry.target ? String(entry.target(context)) : entry.step.target;
    const args = entry.args ? entry.args(context) : entry.step.args;
    const meta = entry.meta ? entry.meta(context) : entry.step.meta;
    const params: Record<string, unknown> =
      entry.step.method === "tools/call" ? { name, arguments: args ?? {} }
      : entry.step.method === "resources/read" ? { uri: name }
      : { name, ...(args !== undefined ? { arguments: promptArguments(args) } : {}) };
    if (meta !== undefined) params._meta = meta;
    const result = await request(entry.step.method, params);
    if (entry.step.method === "tools/call" && isRecord(result) && result.isError === true) {
      return { outcome: "tool_error", message: toolErrorText(result) };
    }
    return "ok";
  };
}
