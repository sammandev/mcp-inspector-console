import { Client, SSEClientTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { parseConfiguration, parseParameters, redact, serverConfigurationSchema } from "./src/features/model.ts";

const usage = [
  "pnpm inspect (--url URL | --config FILE --server NAME) --method METHOD [--params JSON] [--expect JSON]",
  "             [--transport streamable-http|sse] [--format json|text] [--output-file FILE]",
  "             [--load COUNT [--concurrency N] [--max-p95-ms MS] [--max-failures N]]",
  "pnpm inspect --config FILE --list-servers [--format json|text]",
].join("\n");
const integer = (value: string | undefined, name: string, min: number, max: number, fallback: number) => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return number;
};

const client = new Client({ name: "combined-inspector-cli", version: "1.0.0" });
try {
  const { values } = parseArgs({ options: {
    url: { type: "string" }, config: { type: "string" }, server: { type: "string" },
    method: { type: "string" }, params: { type: "string", default: "{}" },
    expect: { type: "string" }, transport: { type: "string", default: "streamable-http" },
    format: { type: "string", default: "json" }, "output-file": { type: "string" }, "list-servers": { type: "boolean" },
    load: { type: "string" }, concurrency: { type: "string" }, "max-p95-ms": { type: "string" }, "max-failures": { type: "string" },
    help: { type: "boolean" },
  } });
  if (!["json", "text"].includes(values.format)) throw new Error("--format must be json or text");
  const emit = async (value: unknown, text: () => string) => {
    const output = values.format === "text" ? text() : JSON.stringify(redact(value));
    if (values["output-file"]) await writeFile(values["output-file"], `${output}\n`, "utf8");
    else console.log(output);
  };
  if (values.help) {
    console.log(usage);
  } else if (values["list-servers"]) {
    if (!values.config) throw new Error("--list-servers requires --config");
    const servers = Object.entries(parseConfiguration(await readFile(values.config, "utf8"))).map(([name, config]) => ({
      name, transport: config.command ? "stdio" : config.type === "sse" ? "sse" : "http", target: config.command ?? config.url,
    }));
    await emit(servers, () => servers.map((server) => `${server.name}\t${server.transport}\t${server.target}`).join("\n"));
  } else {
    if (Boolean(values.url) === Boolean(values.config)) throw new Error("Specify either --url or --config");
    if (!values.method?.trim()) throw new Error("--method is required");
    if (!["streamable-http", "sse"].includes(values.transport)) throw new Error("--transport must be streamable-http or sse");
    const load = values.load === undefined ? undefined : {
      count: integer(values.load, "--load", 1, 1000, 1),
      concurrency: integer(values.concurrency, "--concurrency", 1, 32, 4),
      maxP95: values["max-p95-ms"] === undefined ? undefined : integer(values["max-p95-ms"], "--max-p95-ms", 0, 600_000, 0),
      maxFailures: integer(values["max-failures"], "--max-failures", 0, 1000, 0),
    };
    const profile = values.config
      ? parseConfiguration(await readFile(values.config, "utf8"))[values.server ?? ""]
      : serverConfigurationSchema.parse({ url: values.url });
    if (!profile) throw new Error("Select an existing --server from the configuration");
    let transport;
    if (profile.command) {
      transport = new StdioClientTransport({ command: profile.command, args: profile.args, env: { ...getDefaultEnvironment(), ...profile.env }, cwd: profile.cwd });
    } else {
      if (!profile.url) throw new Error("An HTTP profile URL is required");
      const sse = values.transport === "sse" || profile.type === "sse";
      transport = sse
        ? new SSEClientTransport(new URL(profile.url), { requestInit: { headers: profile.headers } })
        : new StreamableHTTPClientTransport(new URL(profile.url), { requestInit: { headers: profile.headers } });
    }
    await client.connect(transport, { timeout: 30_000 });
    const params = parseParameters(values.params);
    const call = () => client.request({ method: values.method!, params }, z.object({}).passthrough(), { timeout: 30_000 });
    if (load) {
      const durations: number[] = [];
      const errors: string[] = [];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(load.concurrency, load.count) }, async () => {
        while (next < load.count) {
          next++;
          const started = performance.now();
          try {
            const result = await call();
            if (result.isError === true) throw new Error("Tool returned isError");
            durations.push(performance.now() - started);
          } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
        }
      }));
      durations.sort((a, b) => a - b);
      const percentile = (p: number) => (durations.length ? durations[Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)] : 0);
      const report = { requests: load.count, concurrency: load.concurrency, failures: errors.length, p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), maxMs: Math.round(percentile(1)), errors: [...new Set(errors)].slice(0, 5) };
      await emit(report, () => `requests ${report.requests}\nfailures ${report.failures}\np50 ${report.p50Ms}ms\np95 ${report.p95Ms}ms\nmax ${report.maxMs}ms`);
      if (report.failures > load.maxFailures) throw new Error(`Load test had ${report.failures} failures (allowed ${load.maxFailures})`);
      if (load.maxP95 !== undefined && percentile(0.95) > load.maxP95) {
        throw new Error(`Load test p95 ${report.p95Ms}ms exceeded ${load.maxP95}ms`);
      }
    } else {
      const result = await call();
      if (values.expect !== undefined && !isDeepStrictEqual(result, JSON.parse(values.expect))) throw new Error("Result did not match --expect");
      if (result.isError === true) throw new Error(`Server tool failed: ${JSON.stringify(redact(result))}`);
      await emit(result, () => JSON.stringify(redact(result), null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ error: redact(error instanceof Error ? error.message : String(error)) }));
  process.exitCode = 1;
} finally {
  await client.close();
}
