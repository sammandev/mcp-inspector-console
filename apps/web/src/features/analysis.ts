import Ajv from "ajv";

export type Finding = { severity: "error" | "warning" | "info"; path: string; issue: string; fix: string };
type Schema = Record<string, unknown>;
const isSchema = (value: unknown): value is Schema => value !== null && typeof value === "object" && !Array.isArray(value);
const commonFormats = new Set(["date-time", "date", "time", "email", "uri", "uuid", "ipv4", "ipv6", "hostname"]);
const weakKeywords = ["patternProperties", "dependentSchemas", "dependentRequired", "if", "unevaluatedProperties", "propertyNames", "contains"];

/** Reports JSON Schema constructs that common MCP hosts and model providers handle inconsistently. */
export function lintSchema(schema: unknown): Finding[] {
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], path: string, issue: string, fix: string) => findings.push({ severity, path, issue, fix });
  if (!isSchema(schema)) return [{ severity: "error", path: "#", issue: "Schema is not an object", fix: "Provide a JSON Schema object" }];
  if (schema.type !== "object") add("error", "#", "The root schema type is not object", 'Declare "type": "object" at the root of tool schemas');
  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    if (keyword in schema) add("warning", "#", `Root-level ${keyword} combinator is rejected by several hosts`, "Move the combinator into a property or flatten the alternatives");
  }
  const visit = (node: unknown, path: string) => {
    if (!isSchema(node)) return;
    if (Array.isArray(node.type)) add("warning", path, "A type array is not portable", 'Use anyOf with separate schemas, or make the property optional instead of "null"');
    if (node.nullable === true) add("warning", path, "nullable is an OpenAPI keyword, not JSON Schema", 'Use anyOf: [{...}, {"type": "null"}] or omit the property');
    if (typeof node.$ref === "string" && !node.$ref.startsWith("#")) add("error", path, "A remote $ref cannot be resolved by hosts", "Inline the referenced schema or move it under $defs");
    if (typeof node.pattern === "string" && /\(\?<?[=!]|\\[1-9]/.test(node.pattern)) {
      add("warning", path, "The pattern uses lookaround or backreference syntax", "Use a linear-time regular expression without lookaround or backreferences");
    }
    if (typeof node.format === "string" && !commonFormats.has(node.format)) add("info", path, `The format "${node.format}" may be ignored`, "Validate the value server-side as well");
    for (const keyword of weakKeywords) {
      if (keyword in node) add("warning", path, `${keyword} is poorly supported by model providers`, "Express the constraint with properties, enum or server-side validation");
    }
    const properties = isSchema(node.properties) ? node.properties : undefined;
    if (Array.isArray(node.required)) {
      for (const name of node.required) {
        if (!properties || !(String(name) in properties)) add("error", path, `required lists "${String(name)}" (missing from properties)`, "Add the property definition or remove it from required");
      }
    }
    if (properties) {
      for (const [name, child] of Object.entries(properties)) {
        const childPath = `${path}/properties/${name}`;
        if (isSchema(child) && !child.description && !child.$ref) add("info", childPath, "The property has no description", "Describe the property so models can fill it correctly");
        visit(child, childPath);
      }
    }
    if (Array.isArray(node.items)) node.items.forEach((item, index) => visit(item, `${path}/items/${index}`));
    else visit(node.items, `${path}/items`);
    visit(node.additionalProperties, `${path}/additionalProperties`);
    for (const keyword of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(node[keyword])) (node[keyword] as unknown[]).forEach((item, index) => visit(item, `${path}/${keyword}/${index}`));
    }
    for (const keyword of ["$defs", "definitions"]) {
      if (isSchema(node[keyword])) for (const [name, child] of Object.entries(node[keyword] as Schema)) visit(child, `${path}/${keyword}/${name}`);
    }
  };
  visit(schema, "#");
  return findings;
}

type ToolLike = { name: string; outputSchema?: unknown };
type ResultLike = { isError?: boolean; structuredContent?: unknown; [key: string]: unknown };
export function validateToolOutput(tool: ToolLike, result: ResultLike): { valid: boolean; findings: string[] } {
  if (result.isError) return { valid: true, findings: ["The tool returned an error result; output schema validation does not apply"] };
  if (!isSchema(tool.outputSchema)) {
    return { valid: true, findings: result.structuredContent === undefined ? [] : ["structuredContent was returned but the tool declares no outputSchema"] };
  }
  if (result.structuredContent === undefined) return { valid: false, findings: ["The tool declares an outputSchema but returned no structuredContent"] };
  const validate = new Ajv({ allErrors: true, strict: false }).compile(tool.outputSchema);
  if (validate(result.structuredContent)) return { valid: true, findings: [] };
  return { valid: false, findings: (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`) };
}

export type Difference = { path: string; kind: "added" | "removed" | "changed"; before?: unknown; after?: unknown };
export function diffJson(before: unknown, after: unknown, path = ""): Difference[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => {
      const child = `${path}[${index}]`;
      if (index >= before.length) return [{ path: child, kind: "added" as const, after: after[index] }];
      if (index >= after.length) return [{ path: child, kind: "removed" as const, before: before[index] }];
      return diffJson(before[index], after[index], child);
    }).flat();
  }
  if (isSchema(before) && isSchema(after)) {
    const join = (key: string) => (path ? `${path}.${key}` : key);
    return [
      ...Object.keys(before).flatMap((key) => key in after ? diffJson(before[key], after[key], join(key)) : [{ path: join(key), kind: "removed" as const, before: before[key] }]),
      ...Object.keys(after).filter((key) => !(key in before)).map((key) => ({ path: join(key), kind: "added" as const, after: after[key] })),
    ];
  }
  return Object.is(before, after) ? [] : [{ path: path || "$", kind: "changed", before, after }];
}

export const logLevels = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"] as const;
type Order = "newest" | "oldest";
type LogLike = { level: string; logger?: string; data?: unknown; timestamp: number };
export function filterLogs<T extends LogLike>(entries: readonly T[], options: { level: string; search: string; order: Order }) {
  const minimum = Math.max(0, logLevels.indexOf(options.level as (typeof logLevels)[number]));
  const search = options.search.toLowerCase();
  return entries
    .filter((entry) => logLevels.indexOf(entry.level as (typeof logLevels)[number]) >= minimum)
    .filter((entry) => !search || JSON.stringify(entry).toLowerCase().includes(search))
    .sort((a, b) => (options.order === "newest" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));
}

type TrafficLike = { direction: string; timestamp: string | number; message: Record<string, unknown> };
export function filterProtocol<T extends TrafficLike>(entries: readonly T[], options: { method: string; direction: string; search: string; order: Order }) {
  const search = options.search.toLowerCase();
  const time = (entry: T) => new Date(entry.timestamp).getTime();
  const requestMethods = new Map(entries.filter((entry) => typeof entry.message.method === "string" && entry.message.id !== undefined)
    .map((entry) => [String(entry.message.id), String(entry.message.method)]));
  const methodOf = (entry: T) => String(entry.message.method ?? (entry.message.id === undefined ? "" : requestMethods.get(String(entry.message.id)) ?? ""));
  return entries
    .filter((entry) => options.direction === "all" || entry.direction === options.direction)
    .filter((entry) => !options.method || methodOf(entry).includes(options.method))
    .filter((entry) => !search || JSON.stringify(entry).toLowerCase().includes(search))
    .sort((a, b) => (options.order === "newest" ? time(b) - time(a) : time(a) - time(b)));
}

/** Candidate metadata URLs for an issuer, per RFC 8414 section 3 and OpenID Connect Discovery. */
export function authorizationServerMetadataUrls(issuer: string) {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/+$/, "");
  return path
    ? [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}/.well-known/openid-configuration${path}`, `${url.origin}${path}/.well-known/openid-configuration`]
    : [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
}

const decodePart = (part: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")), (c) => c.charCodeAt(0))));
export function decodeJwt(token: string): { header: unknown; claims: unknown } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try { return { header: decodePart(parts[0]), claims: decodePart(parts[1]) }; } catch { return null; }
}
export const maskToken = (token: string) => (token.length < 12 ? "•".repeat(token.length) : `${token.slice(0, 4)}…${token.slice(-4)}`);

/** Checks SKILL.md frontmatter against the Agent Skills naming and description rules. */
export function verifySkill(expectedName: string, markdown: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return ["SKILL.md has no YAML frontmatter"];
  const fields = Object.fromEntries(match[1].split(/\r?\n/).map((line) => /^([A-Za-z-]+):\s*(.*)$/.exec(line)).filter(Boolean).map((m) => [m![1], m![2].trim()]));
  const findings: string[] = [];
  const name = fields.name ?? "";
  if (!name) findings.push("Frontmatter is missing name");
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) findings.push("name must be at most 64 lowercase letters, digits and single hyphens");
  if (name && name !== expectedName) findings.push(`name "${name}" does not match the skill "${expectedName}"`);
  const description = fields.description ?? "";
  if (!description) findings.push("Frontmatter is missing description");
  else if (description.length > 1024) findings.push("description must be at most 1024 characters");
  return findings;
}
