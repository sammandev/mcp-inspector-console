import { useMcpClient } from "@mcp-use/client/react";
import { Download, Gauge, Play, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { TabsSubtle, TabsSubtleItem } from "@/client/components/ui/tabs-subtle";
import { Textarea } from "@/client/components/ui/textarea";
import { cn } from "@/client/lib/utils";
import { downloadJson } from "./model.js";
import { getSelectedConnector } from "./OfficialPanels.js";
import { StyledSelect } from "./StyledSelect.js";
import {
  buildLoadTestRequest,
  createLoadCall,
  DEFAULT_LOAD_TEST_FORM,
  formatLoadProgress,
  loadSummaryWarnings,
  runLoad,
  type LoadLatency,
  type LoadMessageCount,
  type LoadOutcomeSummary,
  type LoadSummary,
  type LoadTestForm,
  type LoadTestRequest,
  type LoadToolSelection,
} from "./toolLoad.js";

const SCENARIO_PLACEHOLDER = `[
  { "method": "tools/call", "tool": "echo", "args": { "message": "hi {{seq}}" }, "weight": 3 },
  { "method": "resources/read", "uri": "demo://resource/1" }
]`;

const LATENCY_COLUMNS: [keyof LoadLatency, string][] = [
  ["min", "Min"],
  ["mean", "Mean"],
  ["p50", "p50"],
  ["p90", "p90"],
  ["p95", "p95"],
  ["p99", "p99"],
  ["p999", "p99.9"],
  ["max", "Max"],
];

type FinishedRun = { request: LoadTestRequest; summary: LoadSummary; finishedAt: string };

function ms(value: number | undefined) {
  return value === undefined ? "—" : `${value.toFixed(1)} ms`;
}

function percent(rate: number) {
  return `${(rate * 100).toFixed(2)}%`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  disabled,
  step,
}: {
  label: string;
  hint?: string;
  value: LoadTestForm["concurrency"];
  onChange: (value: string) => void;
  disabled: boolean;
  step?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={step ?? "any"}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function SummaryTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {head.map((label, index) => (
              <th key={label || index} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium", index === 0 ? "text-left" : "text-right")}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="px-3 py-2 text-left font-medium">{cell}</th>
                ) : (
                  <td key={index} className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{cell}</td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function outcomeRow(label: string, outcome: LoadOutcomeSummary): ReactNode[] {
  return [
    label,
    outcome.requests,
    outcome.ok,
    outcome.toolErrors + outcome.errors,
    percent(outcome.errorRate),
    outcome.throughput,
    ms(outcome.latencyMs?.p50),
    ms(outcome.latencyMs?.p99),
  ];
}

const OUTCOME_HEAD = ["", "Requests", "OK", "Failed", "Error rate", "Throughput /s", "p50", "p99"];

export function LoadTestSummary({ summary }: { summary: LoadSummary }) {
  const warnings = loadSummaryWarnings(summary);
  const figures: [string, ReactNode][] = [
    ["Requests", summary.requests],
    ["OK", summary.ok],
    ["Tool errors", summary.toolErrors],
    ["Errors", summary.errors],
    ["Error rate", percent(summary.errorRate)],
    ["Throughput /s", summary.throughput],
    ["OK throughput /s", summary.okThroughput],
    ["Elapsed", `${(summary.elapsedMs / 1000).toFixed(1)} s`],
    ["Concurrency", summary.concurrency],
  ];
  if (summary.rate !== undefined) {
    figures.push(
      ["Target rate /s", summary.rate],
      ["Achieved rate /s", summary.achievedRate ?? "—"],
      ["Dropped slots", summary.droppedSlots ?? "—"],
    );
  }
  const tallies: [string, LoadMessageCount][] = [
    ...summary.errorMessages.map((entry): [string, LoadMessageCount] => ["Error", entry]),
    ...summary.toolErrorMessages.map((entry): [string, LoadMessageCount] => ["Tool error", entry]),
  ];

  return (
    <section aria-label="Load test summary" data-testid="load-test-summary" className="space-y-4">
      {warnings.map((warning) => (
        <p key={warning} role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {warning}
        </p>
      ))}
      {summary.stoppedEarly?.reason === "interrupted" && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          Stopped early: {summary.stoppedEarly.detail}. The figures cover the calls made before the stop.
        </p>
      )}
      {summary.warmup && (
        <p className="text-sm text-muted-foreground">
          Warm-up: {summary.warmup.requests} calls over {(summary.warmup.durationMs / 1000).toFixed(1)} s ({summary.warmup.ok} ok, {summary.warmup.failed} failed), not counted below.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-base tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <SummaryTable
        caption="Latency"
        head={["Latency", ...LATENCY_COLUMNS.map(([, label]) => label)]}
        rows={[
          ["Successful", ...LATENCY_COLUMNS.map(([key]) => ms(summary.latencyMs?.[key]))],
          ["Failed", ...LATENCY_COLUMNS.map(([key]) => ms(summary.errorLatencyMs?.[key]))],
        ]}
      />
      {summary.steps && (
        <SummaryTable caption="Steps" head={["Step", ...OUTCOME_HEAD.slice(1)]} rows={summary.steps.map((step) => outcomeRow(`${step.name} (×${step.weight})`, step))} />
      )}
      {summary.stages && (
        <SummaryTable
          caption="Stages"
          head={["Stage", ...OUTCOME_HEAD.slice(1)]}
          rows={summary.stages.map((stage) => outcomeRow(`${stage.stage}: ${stage.stepBy} ${stage.level}`, stage))}
        />
      )}
      {tallies.length > 0 && (
        <SummaryTable
          caption="Errors"
          head={["Kind", "Message", "Count"]}
          rows={tallies.map(([kind, entry]) => [kind, <span className="whitespace-pre-wrap break-all font-sans">{entry.message}</span>, entry.count])}
        />
      )}
    </section>
  );
}

export function ToolLoadTestPanel({
  onClose,
  serverId,
  tool,
}: {
  onClose: () => void;
  serverId: string;
  tool: LoadToolSelection | undefined;
}) {
  const { servers } = useMcpClient();
  const [form, setForm] = useState<LoadTestForm>(DEFAULT_LOAD_TEST_FORM);
  const [formError, setFormError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [finished, setFinished] = useState<FinishedRun>();
  const [running, setRunning] = useState(false);
  const runController = useRef<AbortController | null>(null);
  const callController = useRef<AbortController | null>(null);

  const stop = () => runController.current?.abort();
  const abortAll = () => {
    runController.current?.abort();
    callController.current?.abort();
  };
  useEffect(() => abortAll, []);

  const update = (patch: Partial<LoadTestForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setFormError(undefined);
  };

  const start = async () => {
    const built = buildLoadTestRequest(form, tool);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    const run = new AbortController();
    const calls = new AbortController();
    runController.current = run;
    callController.current = calls;
    setFormError(undefined);
    setFailure(undefined);
    setFinished(undefined);
    setProgress("Starting…");
    setRunning(true);
    try {
      const server = servers.find((item) => item.id === serverId);
      if (!server) throw new Error("The selected server is not connected");
      const connector = getSelectedConnector(server);
      // Stop lets in-flight calls finish so they count; closing the panel cancels them too.
      const call = createLoadCall(
        (method, params) => connector.request(method, params, { signal: calls.signal, timeout: 30_000 }),
        built.request,
      );
      const summary = await runLoad(call, built.request.options, {
        signal: run.signal,
        onProgress: (report) => {
          if (runController.current === run) setProgress(formatLoadProgress(report));
        },
      });
      if (runController.current === run) {
        setFinished({ request: built.request, summary, finishedAt: new Date().toISOString() });
        setProgress(undefined);
      }
    } catch (error) {
      if (runController.current === run) {
        setFailure(errorText(error));
        setProgress(undefined);
      }
    } finally {
      if (runController.current === run) setRunning(false);
    }
  };

  const close = () => {
    abortAll();
    runController.current = null;
    onClose();
  };

  const exportRun = () => {
    if (!finished) return;
    const { request, summary, finishedAt } = finished;
    const target = "scenario" in request
      ? { scenario: request.scenario }
      : { tool: request.toolName, arguments: request.toolArgs };
    const { scenario: _scenario, ...options } = request.options;
    const name = "scenario" in request ? "scenario" : request.toolName;
    downloadJson(`load-test-${name}-${Date.now()}.json`, {
      serverId,
      finishedAt,
      target,
      options,
      summary,
    });
  };

  const stepped = form.steps.trim() !== "";
  const steppingRate = stepped && form.stepBy === "rate";
  const steppingConcurrency = stepped && form.stepBy === "concurrency";

  return (
    <section
      aria-label="Load test"
      data-testid="load-test-panel"
      className="relative flex h-full flex-col bg-white dark:bg-black"
    >
      <div className="flex-1 overflow-y-auto h-full">
        <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-gray-200 bg-white/50 px-4 py-2 backdrop-blur-xs dark:border-zinc-600 dark:bg-black/50">
          <Gauge className="h-4 w-4 text-gray-400" aria-hidden />
          <h3 className="text-sm font-medium">Load test</h3>
          <span className="hidden truncate text-xs text-gray-500 sm:inline dark:text-gray-400">
            {form.target === "scenario" ? "Scenario" : (tool?.name ?? "No tool selected")}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {finished && !running && (
              <Button variant="ghost" size="sm" onClick={exportRun} data-testid="load-test-export">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export JSON</span>
              </Button>
            )}
            {running ? (
              <Button variant="destructive" size="sm" onClick={stop}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={() => void start()}>
                <Play className="h-4 w-4" />
                Start
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={close} aria-label="Close load test" title="Close load test">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Repeats calls against the connected server and summarizes throughput, latency and errors. Only run it against servers where repeated calls are safe.
          </p>
          {formError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}
          <p aria-live="polite" data-testid="load-test-progress" className={cn("font-mono text-xs text-muted-foreground", !progress && "sr-only")}>
            {progress}
          </p>
          {failure && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">The load test could not run</p>
              <p className="mt-1 break-all">{failure}</p>
            </div>
          )}
          {finished && <LoadTestSummary summary={finished.summary} />}
          <div className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-zinc-900">
            <span className="text-sm font-medium" id="load-target-label">Load target</span>
            <TabsSubtle
              aria-labelledby="load-target-label"
              selectedIndex={form.target === "scenario" ? 1 : 0}
              onSelect={(index) => update({ target: index === 1 ? "scenario" : "tool" })}
            >
              <TabsSubtleItem index={0} label={`Tool: ${tool?.name ?? "none"}`} />
              <TabsSubtleItem index={1} label="Scenario" />
            </TabsSubtle>
            {form.target === "tool" ? (
              <p className="text-xs text-muted-foreground">
                Each call sends the arguments currently in the Tools form, with {"{{seq}}"}, {"{{worker}}"}, {"{{uuid}}"} and {"{{rand:1-100}}"} filled in per call.
              </p>
            ) : (
              <Field label="Scenario" hint="Steps run by weight; tools/call, resources/read and prompts/get are supported.">
                <Textarea
                  aria-label="Scenario"
                  className="min-h-36 font-mono text-xs"
                  placeholder={SCENARIO_PLACEHOLDER}
                  value={form.scenarioText}
                  disabled={running}
                  onChange={(event) => update({ scenarioText: event.target.value })}
                />
              </Field>
            )}
          </div>

          <div className="grid gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2 dark:bg-zinc-900">
            <NumberField
              label="Concurrency"
              hint={steppingConcurrency ? "Set by the steps" : "Calls in flight at once"}
              value={steppingConcurrency ? "" : form.concurrency}
              step="1"
              disabled={running || steppingConcurrency}
              onChange={(value) => update({ concurrency: value })}
            />
            {!steppingRate && (
              <NumberField
                label="Rate (calls/s)"
                hint="Empty for as fast as possible"
                value={form.rate}
                disabled={running}
                onChange={(value) => update({ rate: value })}
              />
            )}
            {!stepped && (
              <>
                <NumberField label="Duration (s)" hint="Defaults to 10 s without Requests" value={form.durationSec} disabled={running} onChange={(value) => update({ durationSec: value })} />
                <NumberField label="Requests" hint="Stop after this many calls" value={form.requests} step="1" disabled={running} onChange={(value) => update({ requests: value })} />
                <NumberField label="Warm-up (s)" hint="Runs first; not counted" value={form.warmupSec} disabled={running} onChange={(value) => update({ warmupSec: value })} />
              </>
            )}
            <Field label="Steps" hint="Optional: run one stage per level">
              <Input
                aria-label="Steps"
                placeholder="5,10,20"
                value={form.steps}
                disabled={running}
                onChange={(event) => update({ steps: event.target.value })}
              />
            </Field>
            {stepped && (
              <>
                <Field label="Step by">
                  <StyledSelect
                    label="Step by"
                    value={form.stepBy}
                    disabled={running}
                    onValueChange={(value) => update({ stepBy: value === "rate" ? "rate" : "concurrency" })}
                    options={[
                      { value: "concurrency", label: "Concurrency" },
                      { value: "rate", label: "Rate" },
                    ]}
                  />
                </Field>
                <NumberField label="Step duration (s)" hint="Defaults to 10 s" value={form.stepDurationSec} disabled={running} onChange={(value) => update({ stepDurationSec: value })} />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
