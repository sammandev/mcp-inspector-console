import { parse } from "yaml";
import { z } from "zod";

const secretKey = /^(proxy-)?authorization$|cookie|password|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|credential|verifier/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, secretKey.test(key) ? "[redacted]" : redact(item)]));
  }
  if (typeof value === "string") {
    return value
      .replace(/https?:\/\/[^\s"'<>`]+/gi, (match) => {
        const [, candidate, trailing] = /^(.*?)([.,;:!?)\]}]*)$/.exec(match) ?? [match, match, ""];
        if (!URL.canParse(candidate)) return match;
        const url = new URL(candidate);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) {
          if (secretKey.test(key) || /^(token|key|sig|signature|code)$/i.test(key)) url.searchParams.set(key, "[redacted]");
        }
        return url.toString() + trailing;
      })
      .replace(/\bBearer\s+[^\s"',]+/gi, "Bearer [redacted]");
  }
  return value;
}

const rootSchema = z.array(z.object({
  uri: z.string().url().refine((uri) => new URL(uri).protocol === "file:", "Roots must use file: URIs"),
  name: z.string().optional(),
})).max(128).refine((roots) => new Set(roots.map(({ uri }) => uri)).size === roots.length, "Duplicate root URI");

export function parseRoots(text: string) {
  return rootSchema.parse(JSON.parse(text));
}

const safeText = z.string().min(1).max(4096).refine((value) => !value.includes("\0"), "NUL is not allowed");
export const serverConfigurationSchema = z.object({
  type: z.enum(["stdio", "http", "streamable-http", "sse"]).optional(),
  url: z.string().url().refine((url) => ["http:", "https:"].includes(new URL(url).protocol), "An HTTP(S) URL is required").optional(),
  command: safeText.optional(),
  args: z.array(z.string().max(4096).refine((value) => !value.includes("\0"))).max(128).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: safeText.optional(),
  headers: z.record(z.string(), z.string()).optional(),
}).refine((config) => Boolean(config.url) !== Boolean(config.command), "Specify either url or command")
  .refine((config) => !config.type || (config.type === "stdio") === Boolean(config.command), "A stdio type requires a command; HTTP types require a url")
  .refine((config) => !config.cwd || Boolean(config.command), "Only stdio servers accept a working directory");

export type ServerConfiguration = z.infer<typeof serverConfigurationSchema>;
export function parseConfiguration(text: string): Record<string, ServerConfiguration> {
  const document = parse(text, { maxAliasCount: 50 });
  const servers = z.record(z.string().min(1), serverConfigurationSchema);
  const parsed = z.union([
    z.object({ mcpServers: servers }).strict().transform(({ mcpServers }) => mcpServers),
    z.object({ servers, inputs: z.array(z.unknown()).optional() }).strict().transform(({ servers }) => servers),
  ], { error: "Provide either an mcpServers (mcp.json) or a servers (VS Code) mapping" }).parse(document);
  const count = Object.keys(parsed).length;
  if (count < 1 || count > 50) throw new Error("Import between 1 and 50 servers");
  return parsed;
}

export function serializeConfiguration(servers: Record<string, ServerConfiguration>, format: "mcp" | "vscode") {
  const entries = Object.entries(servers).map(([name, config]) => {
    const { type, ...rest } = config;
    const value = format === "vscode" ? { type: type ?? (config.command ? "stdio" : "http"), ...rest } : rest;
    return [name, redact(value)];
  });
  return JSON.stringify(format === "vscode" ? { servers: Object.fromEntries(entries) } : { mcpServers: Object.fromEntries(entries) }, null, 2);
}

export function loadSettings(count: number, concurrency: number) {
  return z.object({
    count: z.number().int().min(1).max(1000),
    concurrency: z.number().int().min(1).max(20),
  }).parse({ count, concurrency });
}

export const parametersSchema = z.record(z.string(), z.unknown());
export function parseParameters(text: string) {
  return parametersSchema.parse(JSON.parse(text));
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(redact(value), null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
