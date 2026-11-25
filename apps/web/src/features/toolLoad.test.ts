import { describe, expect, it } from "vitest";
import {
  buildLoadTestRequest,
  checkLoadTemplate,
  compileLoadTemplate,
  createLoadCall,
  createWeightedPicker,
  DEFAULT_LOAD_TEST_FORM,
  formatLoadProgress,
  loadSummaryWarnings,
  runLoad,
  validateLoadScenario,
  type LoadClock,
  type LoadOptions,
  type LoadProgress,
  type LoadToolSelection,
} from "./toolLoad.js";

function virtualClock() {
  let now = 0;
  const timers: { at: number; order: number; resolve: () => void }[] = [];
  let order = 0;
  const clock: LoadClock = {
    now: () => now,
    sleep: (ms, signal) => new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = { at: now + Math.max(0, ms), order: order++, resolve };
      timers.push(timer);
      signal?.addEventListener("abort", () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
        resolve();
      }, { once: true });
    }),
  };
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  async function drive<T>(promise: Promise<T>): Promise<T> {
    let done = false;
    let failure: unknown;
    let value!: T;
    promise.then((result) => { done = true; value = result; }, (error) => { done = true; failure = error ?? new Error("rejected"); });
    for (let guard = 0; guard < 100_000; guard++) {
      await settle();
      if (done) break;
      timers.sort((a, b) => a.at - b.at || a.order - b.order);
      const next = timers.shift();
      if (!next) throw new Error("the run is waiting on nothing");
      now = next.at;
      next.resolve();
    }
    if (failure) throw failure;
    return value;
  }
  return { clock, drive };
}

const options = (patch: Partial<LoadOptions>): LoadOptions => ({ concurrency: 1, ...patch });

describe("load templates", () => {
  it("fills placeholders per call and keeps a whole numeric placeholder a number", () => {
    const template = compileLoadTemplate({
      n: "{{seq}}",
      w: "{{worker}}",
      s: "id-{{seq}}-{{worker}}",
      r: "{{rand:5-5}}",
      u: "{{uuid}}",
      keep: "{{name}}",
      list: ["{{seq}}", 4],
      fixed: true,
    });
    expect(template).toBeDefined();
    const value = template!({ seq: 3, worker: 1 }) as Record<string, unknown>;
    expect(value).toMatchObject({ n: 3, w: 1, s: "id-3-1", r: 5, keep: "{{name}}", list: [3, 4], fixed: true });
    expect(value.u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(compileLoadTemplate({ plain: "text" })).toBeUndefined();
  });

  it("rejects reversed random ranges before a run", () => {
    expect(() => checkLoadTemplate({ id: "{{rand:9-1}}" }, "Tool arguments")).toThrow(
      "Tool arguments.id: {{rand:9-1}} needs safe integer bounds with min <= max",
    );
  });
});

describe("load scenarios", () => {
  it("validates steps, defaults weights and names duplicate targets by position", () => {
    const scenario = validateLoadScenario({
      steps: [
        { method: "tools/call", tool: "echo", args: { message: "{{seq}}" }, weight: 3 },
        { method: "tools/call", tool: "echo" },
        { method: "resources/read", uri: "demo://1", name: "read" },
        { method: "prompts/get", prompt: "greet", args: { name: "a" } },
      ],
    });
    expect(scenario.steps.map(({ name, weight }) => ({ name, weight }))).toEqual([
      { name: "tools/call echo #1", weight: 3 },
      { name: "tools/call echo #2", weight: 1 },
      { name: "read", weight: 1 },
      { name: "prompts/get greet", weight: 1 },
    ]);
  });

  it("names the first problem in a malformed scenario", () => {
    expect(() => validateLoadScenario([])).toThrow("a scenario needs at least one step.");
    expect(() => validateLoadScenario({ step: [] })).toThrow('unknown key "step" (allowed: steps).');
    expect(() => validateLoadScenario([{ method: "tools/list" }])).toThrow('step 1: "method" must be one of tools/call, resources/read, prompts/get.');
    expect(() => validateLoadScenario([{ method: "tools/call", tool: "a", uri: "x" }])).toThrow('step 1: unknown key "uri" for tools/call');
    expect(() => validateLoadScenario([{ method: "resources/read", uri: "" }])).toThrow('step 1: resources/read needs a non-empty "uri".');
    expect(() => validateLoadScenario([{ method: "tools/call", tool: "a", weight: 0 }])).toThrow('step 1: "weight" must be a positive number.');
    expect(() => validateLoadScenario([{ method: "tools/call", tool: "a", name: "x" }, { method: "tools/call", tool: "b", name: "x" }])).toThrow('step 2: duplicate name "x".');
  });

  it("interleaves steps by smooth weighted round-robin", () => {
    const pick = createWeightedPicker([2, 1]);
    expect(Array.from({ length: 6 }, pick)).toEqual([0, 1, 0, 0, 1, 0]);
  });
});

describe("load form", () => {
  const tool: LoadToolSelection = { name: "echo", args: { message: "hi" }, argsReady: true };

  it("applies the engine defaults for a tool run", () => {
    const built = buildLoadTestRequest(DEFAULT_LOAD_TEST_FORM, tool);
    expect(built).toEqual({
      ok: true,
      request: {
        toolName: "echo",
        toolArgs: { message: "hi" },
        options: { concurrency: 10, durationMs: 10_000, progressMs: 1000 },
      },
    });
  });

  it("builds stepped runs whose level replaces the stepped knob", () => {
    const built = buildLoadTestRequest({ ...DEFAULT_LOAD_TEST_FORM, steps: "2, 5", concurrency: "oops", rate: 4 }, tool);
    expect(built).toMatchObject({
      ok: true,
      request: { options: { concurrency: 5, rate: 4, stages: { by: "concurrency", levels: [2, 5], stageMs: 10_000 } } },
    });
    expect(built.ok && built.request.options.durationMs).toBeUndefined();
  });

  it("explains what is wrong with the form", () => {
    const error = (values: Partial<typeof DEFAULT_LOAD_TEST_FORM>, target: typeof tool | null = tool) => {
      const built = buildLoadTestRequest({ ...DEFAULT_LOAD_TEST_FORM, ...values }, target ?? undefined);
      return built.ok ? undefined : built.error;
    };
    expect(error({ concurrency: 1.5 })).toBe("Concurrency must be a positive whole number.");
    expect(error({ rate: -1 })).toBe("Rate must be a positive number.");
    expect(error({ steps: "5,,10" })).toBe("Steps must be a comma-separated list of positive numbers, e.g. 5,10,20.");
    expect(error({ steps: "1.5" })).toBe("Steps must be whole numbers when stepping concurrency.");
    expect(error({ steps: "1.5", stepBy: "rate" })).toBeUndefined();
    expect(error({ target: "scenario" })).toBe("Paste a scenario: an array of steps.");
    expect(error({ target: "scenario", scenarioText: "[" })).toMatch(/^Scenario is not valid JSON: /);
    expect(error({ target: "scenario", scenarioText: "[]" })).toBe("Scenario: a scenario needs at least one step.");
    expect(error({}, null)).toBe("Select a tool to load, or paste a scenario.");
    expect(error({}, { ...tool, argsReady: false })).toBe("Fill in the tool's required arguments, and fix any field the form cannot send, before a tool run.");
    expect(error({}, { ...tool, args: { id: "{{rand:3-1}}" } })).toMatch(/^Tool arguments\.id: \{\{rand:3-1\}\}/);
  });
});

describe("load engine", () => {
  it("caps calls in flight at the concurrency and started calls at the request count", async () => {
    const { clock, drive } = virtualClock();
    let inFlight = 0;
    let maxInFlight = 0;
    const summary = await drive(runLoad(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await clock.sleep(10);
      inFlight--;
      return "ok";
    }, options({ concurrency: 4, requests: 20 }), { clock }));

    expect(maxInFlight).toBe(4);
    expect(summary).toMatchObject({ requests: 20, ok: 20, errors: 0, toolErrors: 0, errorRate: 0, elapsedMs: 50, throughput: 400, concurrency: 4, requestLimit: 20 });
    expect(summary.latencyMs).toMatchObject({ min: 10, p50: 10, p99: 10, max: 10 });
    expect(summary.errorLatencyMs).toBeNull();
  });

  it("separates tool errors from thrown errors and tallies their messages", async () => {
    const { clock, drive } = virtualClock();
    const summary = await drive(runLoad(async (_worker, _step, seq) => {
      await clock.sleep(seq);
      if (seq % 5 === 0) throw new Error("boom");
      if (seq % 3 === 0) return { outcome: "tool_error", message: "bad input" };
      return "ok";
    }, options({ requests: 15 }), { clock }));

    expect(summary).toMatchObject({ requests: 15, ok: 8, toolErrors: 4, errors: 3, errorRate: 0.4667 });
    expect(summary.errorMessages).toEqual([{ message: "boom", count: 3 }]);
    expect(summary.toolErrorMessages).toEqual([{ message: "bad input", count: 4 }]);
    expect(summary.latencyMs).toMatchObject({ min: 1, max: 14 });
    expect(summary.errorLatencyMs).toMatchObject({ min: 3, max: 15 });
  });

  it("stops early when every call throws", async () => {
    const { clock, drive } = virtualClock();
    const summary = await drive(runLoad(async () => {
      await clock.sleep(1);
      throw new Error("connection refused");
    }, options({ durationMs: 60_000 }), { clock }));

    expect(summary.requests).toBe(50);
    expect(summary.stoppedEarly).toEqual({ reason: "consecutive_errors", detail: "50 calls in a row threw over 49ms; the server looks unavailable" });
    expect(loadSummaryWarnings(summary)).toEqual(["Warning: the load run stopped early (consecutive_errors): 50 calls in a row threw over 49ms; the server looks unavailable."]);
  });

  it("spaces starts on the rate grid and reports dropped slots", async () => {
    const { clock, drive } = virtualClock();
    const starts: number[] = [];
    const summary = await drive(runLoad(async () => {
      starts.push(clock.now());
      await clock.sleep(250);
      return "ok";
    }, options({ rate: 10, durationMs: 1000 }), { clock }));

    expect(starts).toEqual([0, 250, 500, 750]);
    expect(summary).toMatchObject({ rate: 10, plannedStarts: 10, droppedSlots: 6, achievedRate: 4, elapsedMs: 1000 });
    expect(loadSummaryWarnings(summary)[0]).toContain("4 of 10 planned calls started");
  });

  it("runs each stage at its own level and totals the stages", async () => {
    const { clock, drive } = virtualClock();
    const summary = await drive(runLoad(async () => {
      await clock.sleep(10);
      return "ok";
    }, options({ concurrency: 2, stages: { by: "concurrency", levels: [1, 2], stageMs: 100 } }), { clock }));

    expect(summary.stages?.map(({ stage, level, stepBy, requests, concurrency }) => ({ stage, level, stepBy, requests, concurrency }))).toEqual([
      { stage: 1, level: 1, stepBy: "concurrency", requests: 10, concurrency: 1 },
      { stage: 2, level: 2, stepBy: "concurrency", requests: 20, concurrency: 2 },
    ]);
    expect(summary).toMatchObject({ requests: 30, ok: 30, elapsedMs: 200 });
  });

  it("leaves the warm-up out of the figures", async () => {
    const { clock, drive } = virtualClock();
    const seqs: number[] = [];
    const summary = await drive(runLoad(async (_worker, _step, seq) => {
      seqs.push(seq);
      await clock.sleep(10);
      return "ok";
    }, options({ warmupMs: 50, durationMs: 100 }), { clock }));

    expect(summary.warmup).toEqual({ durationMs: 50, requests: 5, ok: 5, failed: 0 });
    expect(summary).toMatchObject({ requests: 10, elapsedMs: 100 });
    expect(seqs).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("follows scenario weights and summarizes each step", async () => {
    const { clock, drive } = virtualClock();
    const scenario = validateLoadScenario([
      { method: "tools/call", tool: "a", weight: 2 },
      { method: "resources/read", uri: "demo://b" },
    ]);
    const summary = await drive(runLoad(async () => {
      await clock.sleep(1);
      return "ok";
    }, options({ requests: 9, scenario }), { clock }));

    expect(summary.steps?.map(({ name, method, target, weight, requests }) => ({ name, method, target, weight, requests }))).toEqual([
      { name: "tools/call a", method: "tools/call", target: "a", weight: 2, requests: 6 },
      { name: "resources/read demo://b", method: "resources/read", target: "demo://b", weight: 1, requests: 3 },
    ]);
  });

  it("reports progress and stops when interrupted", async () => {
    const { clock, drive } = virtualClock();
    const controller = new AbortController();
    const progress: LoadProgress[] = [];
    const summary = await drive(runLoad(async () => {
      await clock.sleep(10);
      return "ok";
    }, options({ durationMs: 10_000, progressMs: 100 }), {
      clock,
      signal: controller.signal,
      onProgress: (report) => {
        progress.push(report);
        if (progress.length === 2) controller.abort();
      },
    }));

    expect(progress[0]).toEqual({ phase: "run", elapsedMs: 100, requests: 9, ok: 9, failed: 0, throughput: 90, latencyMs: { p50: 10, p99: 10 } });
    expect(formatLoadProgress(progress[0])).toBe("[load 0.1s] 9 calls (9 ok, 0 failed), 90/s, p50 10 / p99 10 ms");
    expect(formatLoadProgress({ ...progress[0], phase: "warmup", latencyMs: null })).toBe("[load warm-up 0.1s] 9 calls (9 ok, 0 failed), 90/s, no successes");
    expect(summary.stoppedEarly).toEqual({ reason: "interrupted", detail: "the run was interrupted" });
    expect(summary.requests).toBe(20);
    expect(loadSummaryWarnings(summary)).toEqual([]);
  });
});

describe("MCP load calls", () => {
  it("sends templated tool, resource and prompt requests and reads tool errors", async () => {
    const sent: { method: string; params: unknown }[] = [];
    const request = async (method: string, params: Record<string, unknown>) => {
      sent.push({ method, params });
      return method === "tools/call" && (params.arguments as { n: number }).n === 2
        ? { isError: true, content: [{ type: "text", text: `  ${"x".repeat(250)}  ` }] }
        : {};
    };
    const toolCall = createLoadCall(request, { toolName: "echo", toolArgs: { n: "{{seq}}", label: "w{{worker}}" } });
    expect(await toolCall(0, 0, 1)).toBe("ok");
    expect(await toolCall(1, 0, 2)).toEqual({ outcome: "tool_error", message: `${"x".repeat(200)}…` });

    const scenario = validateLoadScenario([
      { method: "resources/read", uri: "demo://{{seq}}", meta: { trace: true } },
      { method: "prompts/get", prompt: "greet", args: { name: "n{{seq}}" } },
      { method: "tools/call", tool: "empty" },
    ]);
    const scenarioCall = createLoadCall(request, { scenario });
    await scenarioCall(0, 0, 7);
    await scenarioCall(0, 1, 8);
    await scenarioCall(0, 2, 9);

    expect(sent).toEqual([
      { method: "tools/call", params: { name: "echo", arguments: { n: 1, label: "w0" } } },
      { method: "tools/call", params: { name: "echo", arguments: { n: 2, label: "w1" } } },
      { method: "resources/read", params: { uri: "demo://7", _meta: { trace: true } } },
      { method: "prompts/get", params: { name: "greet", arguments: { name: "n8" } } },
      { method: "tools/call", params: { name: "empty", arguments: {} } },
    ]);
  });
});
