import { describe, expect, it } from "vitest";
import {
  authorizationServerMetadataUrls, decodeJwt, diffJson, filterLogs, filterProtocol, lintSchema, maskToken,
  validateToolOutput, verifySkill,
} from "./analysis.js";

describe("schema portability lint", () => {
  it("accepts a portable object schema", () => {
    expect(lintSchema({ type: "object", properties: { q: { type: "string", description: "Query" } }, required: ["q"] })).toEqual([]);
  });

  it("reports non-portable constructs with their paths and fixes", () => {
    const findings = lintSchema({
      anyOf: [{ type: "object" }],
      properties: {
        a: { type: ["string", "null"], description: "a" },
        b: { $ref: "https://example.com/s.json", description: "b" },
        c: { type: "string", pattern: "(?<=x)y", nullable: true, description: "c" },
        d: { type: "array", items: { type: "object", patternProperties: { x: {} } }, description: "d" },
      },
      required: ["a", "missing"],
    });
    const byIssue = (text: RegExp) => findings.find(({ issue }) => text.test(issue));
    expect(byIssue(/root.*object/i)).toMatchObject({ severity: "error", path: "#" });
    expect(byIssue(/combinator/i)).toMatchObject({ severity: "warning", path: "#" });
    expect(byIssue(/type array/i)).toMatchObject({ path: "#/properties/a" });
    expect(byIssue(/remote \$ref/i)).toMatchObject({ severity: "error", path: "#/properties/b" });
    expect(byIssue(/lookaround|backreference/i)).toMatchObject({ path: "#/properties/c" });
    expect(byIssue(/nullable/i)).toMatchObject({ path: "#/properties/c" });
    expect(byIssue(/patternProperties/)).toMatchObject({ path: "#/properties/d/items" });
    expect(byIssue(/required.*missing/i)).toMatchObject({ severity: "error" });
    expect(findings.every(({ fix }) => fix.length > 0)).toBe(true);
  });

  it("flags undocumented properties as informational", () => {
    expect(lintSchema({ type: "object", properties: { q: { type: "string" } } }))
      .toEqual([expect.objectContaining({ severity: "info", path: "#/properties/q" })]);
  });
});

describe("tool output validation", () => {
  const tool = { name: "t", inputSchema: { type: "object" }, outputSchema: { type: "object", properties: { n: { type: "number" } }, required: ["n"] } };

  it("validates structured content against the output schema", () => {
    expect(validateToolOutput(tool, { content: [], structuredContent: { n: 1 } })).toEqual({ valid: true, findings: [] });
    expect(validateToolOutput(tool, { content: [], structuredContent: { n: "1" } }).valid).toBe(false);
  });

  it.each(["https://json-schema.org/draft/2020-12/schema", "https://json-schema.org/draft/2020-12/schema#"])(
    "validates referenced MCP output envelopes declared with %s",
    ($schema) => {
      const auditTool = {
        name: "catalog_info",
        outputSchema: {
          $schema,
          type: "object",
          anyOf: [{ $ref: "#/$defs/Success" }, { $ref: "#/$defs/Error" }],
          $defs: {
            Success: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] },
            Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
          },
        },
      };
      expect(validateToolOutput(auditTool, { structuredContent: { n: 1 } })).toEqual({ valid: true, findings: [] });
      expect(validateToolOutput(auditTool, { structuredContent: { n: "1" } })).toMatchObject({
        valid: false, findings: expect.arrayContaining([expect.stringMatching(/\/n.*integer/)]),
      });
    },
  );

  it("enforces draft-2020-12 tuple constraints instead of ignoring newer keywords", () => {
    const tupleTool = {
      name: "tuple",
      outputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { values: { type: "array", prefixItems: [{ type: "integer" }], items: false } },
        required: ["values"],
      },
    };
    expect(validateToolOutput(tupleTool, { structuredContent: { values: [1] } }).valid).toBe(true);
    expect(validateToolOutput(tupleTool, { structuredContent: { values: ["1"] } }).valid).toBe(false);
    expect(validateToolOutput(tupleTool, { structuredContent: { values: [1, 2] } }).valid).toBe(false);
  });

  it("preserves explicitly declared draft-07 tuple validation", () => {
    const tupleTool = {
      name: "legacy",
      outputSchema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: { values: { type: "array", items: [{ type: "integer" }], additionalItems: false } },
      },
    };
    expect(validateToolOutput(tupleTool, { structuredContent: { values: [1] } }).valid).toBe(true);
    expect(validateToolOutput(tupleTool, { structuredContent: { values: ["1"] } }).valid).toBe(false);
    expect(validateToolOutput(tupleTool, { structuredContent: { values: [1, 2] } }).valid).toBe(false);
  });

  it.each([
    { type: "object", required: "n" },
    { type: "object", $ref: "#/$defs/Missing" },
    { type: "object", $schema: "https://example.com/unsupported-schema" },
  ])("reports uncompileable output schemas as findings rather than throwing: %j", (outputSchema) => {
    expect(validateToolOutput({ name: "broken", outputSchema }, { structuredContent: {} })).toMatchObject({
      valid: false, findings: [expect.stringMatching(/output schema.*:/i)],
    });
  });

  it("requires structured content when an output schema is declared", () => {
    expect(validateToolOutput(tool, { content: [] })).toMatchObject({ valid: false, findings: [expect.stringMatching(/structuredContent/)] });
  });

  it("does not validate error results", () => {
    expect(validateToolOutput(tool, { content: [], isError: true })).toMatchObject({ valid: true, findings: [expect.stringMatching(/error result/i)] });
  });
});

describe("run diff", () => {
  it("lists added, removed and changed paths", () => {
    expect(diffJson({ a: 1, b: { c: [1, 2] }, gone: true }, { a: 2, b: { c: [1, 3] }, added: "x" })).toEqual([
      { path: "a", kind: "changed", before: 1, after: 2 },
      { path: "b.c[1]", kind: "changed", before: 2, after: 3 },
      { path: "gone", kind: "removed", before: true },
      { path: "added", kind: "added", after: "x" },
    ]);
    expect(diffJson({ a: [1] }, { a: [1] })).toEqual([]);
  });
});

describe("monitoring filters", () => {
  const logs = [
    { level: "debug", logger: "db", data: "query", timestamp: 1 },
    { level: "error", logger: "db", data: "failed", timestamp: 3 },
    { level: "warning", logger: "http", data: "slow", timestamp: 2 },
  ];

  it("keeps logs at or above the selected level, searchable and sortable", () => {
    expect(filterLogs(logs, { level: "warning", search: "", order: "newest" }).map(({ data }) => data)).toEqual(["failed", "slow"]);
    expect(filterLogs(logs, { level: "debug", search: "db", order: "oldest" }).map(({ data }) => data)).toEqual(["query", "failed"]);
  });

  it("filters protocol traffic by method and direction", () => {
    const traffic = [
      { direction: "send", timestamp: "2026-01-01T00:00:01Z", message: { method: "tools/list", id: 1 } },
      { direction: "receive", timestamp: "2026-01-01T00:00:02Z", message: { id: 1, result: {} } },
      { direction: "send", timestamp: "2026-01-01T00:00:03Z", message: { method: "ping", id: 2 } },
    ];
    expect(filterProtocol(traffic, { method: "tools", direction: "all", search: "", order: "oldest" }).map(({ message }) => message.id)).toEqual([1, 1]);
    expect(filterProtocol(traffic, { method: "", direction: "send", search: "", order: "newest" }).map(({ message }) => message.id)).toEqual([2, 1]);
  });

  it("matches responses by the method of the request with the same id", () => {
    const traffic = [
      { direction: "send", timestamp: "2026-01-01T00:00:01Z", message: { jsonrpc: "2.0", id: 4, method: "tools/call" } },
      { direction: "receive", timestamp: "2026-01-01T00:00:02Z", message: { jsonrpc: "2.0", id: 4, result: { content: [] } } },
      { direction: "receive", timestamp: "2026-01-01T00:00:03Z", message: { jsonrpc: "2.0", id: 5, result: {} } },
    ];
    expect(filterProtocol(traffic, { method: "tools/call", direction: "receive", search: "", order: "oldest" }).map(({ message }) => message.id)).toEqual([4]);
  });
});

describe("OAuth helpers", () => {
  it("builds RFC 8414 and OpenID discovery URLs, including path-based issuers", () => {
    expect(authorizationServerMetadataUrls("https://auth.example.com/tenant")).toEqual([
      "https://auth.example.com/.well-known/oauth-authorization-server/tenant",
      "https://auth.example.com/.well-known/openid-configuration/tenant",
      "https://auth.example.com/tenant/.well-known/openid-configuration",
    ]);
    expect(authorizationServerMetadataUrls("https://auth.example.com/")).toEqual([
      "https://auth.example.com/.well-known/oauth-authorization-server",
      "https://auth.example.com/.well-known/openid-configuration",
    ]);
  });

  it("decodes JWT claims without exposing the signature and masks tokens", () => {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(decodeJwt(`${part({ alg: "RS256" })}.${part({ sub: "u", scope: "a b" })}.sig`)).toEqual({ header: { alg: "RS256" }, claims: { sub: "u", scope: "a b" } });
    expect(decodeJwt("opaque-token")).toBeNull();
    expect(maskToken("abcdefghijklmnop")).toBe("abcd…mnop");
    expect(maskToken("short")).toBe("•••••");
  });
});

describe("skill verification", () => {
  it("accepts a skill with valid frontmatter", () => {
    expect(verifySkill("audit", "---\nname: audit\ndescription: Audits scripts.\n---\n# Audit\n")).toEqual([]);
  });

  it("reports missing frontmatter, invalid names and mismatches", () => {
    expect(verifySkill("x", "# No frontmatter")).toEqual([expect.stringMatching(/frontmatter/i)]);
    const findings = verifySkill("audit", "---\nname: Bad_Name\n---\nbody");
    expect(findings).toEqual(expect.arrayContaining([
      expect.stringMatching(/lowercase/), expect.stringMatching(/description/), expect.stringMatching(/match/),
    ]));
  });
});
