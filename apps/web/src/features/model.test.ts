import { describe, expect, it } from "vitest";
import { redact, parseRoots, parseConfiguration, loadSettings, serializeConfiguration } from "./model.js";

describe("Inspector workflow validation", () => {
  it("redacts nested credentials without changing useful diagnostic data", () => {
    expect(redact({ headers: { Authorization: "Bearer secret", "X-Api-Key": "secret", Accept: "application/json" }, nested: [{ clientSecret: "secret" }] }))
      .toEqual({ headers: { Authorization: "[redacted]", "X-Api-Key": "[redacted]", Accept: "application/json" }, nested: [{ clientSecret: "[redacted]" }] });
    expect(redact("https://user:password@example.com/mcp?access_token=secret&name=a"))
      .toBe("https://example.com/mcp?access_token=%5Bredacted%5D&name=a");
  });

  it("keeps public OAuth discovery metadata while redacting credential headers", () => {
    expect(redact({ authorization_servers: ["https://a/"], authorization_endpoint: "https://a/authorize", headers: { "Proxy-Authorization": "Basic x", authorization: "Bearer y" } }))
      .toEqual({ authorization_servers: ["https://a/"], authorization_endpoint: "https://a/authorize", headers: { "Proxy-Authorization": "[redacted]", authorization: "[redacted]" } });
  });

  it("redacts URL credentials embedded in free-text log messages", () => {
    expect(redact('Connecting to http://u:p@127.0.0.1:1/mcp?api_key=secret&x=1... "url:" "https://h/mcp?token=a"'))
      .toBe('Connecting to http://127.0.0.1:1/mcp?api_key=%5Bredacted%5D&x=1... "url:" "https://h/mcp?token=%5Bredacted%5D"');
  });

  it("requires unique file-URI roots rather than arbitrary remote URLs", () => {
    expect(parseRoots('[{"uri":"file:///C:/audit","name":"audit"}]')).toHaveLength(1);
    expect(() => parseRoots('[{"uri":"https://example.com"}]')).toThrow(/file/);
    expect(() => parseRoots('[{"uri":"file:///a"},{"uri":"file:///a"}]')).toThrow(/duplicate/i);
  });

  it("validates all configuration entries before any server can be imported", () => {
    expect(parseConfiguration('mcpServers:\n  audit:\n    command: python\n    args: [server.py]\n')).toEqual({ audit: { command: "python", args: ["server.py"] } });
    expect(() => parseConfiguration('{"mcpServers":{"bad":{"url":"file:///secret"}}}')).toThrow();
    expect(() => parseConfiguration('{"mcpServers":{"bad":{"command":"python","args":"server.py"}}}')).toThrow();
  });

  it("imports VS Code server configurations with stdio working directories", () => {
    expect(parseConfiguration('{"servers":{"audit":{"type":"stdio","command":"python","cwd":"C:/audit"},"web":{"type":"sse","url":"http://localhost:3000/sse"}}}'))
      .toEqual({ audit: { type: "stdio", command: "python", cwd: "C:/audit" }, web: { type: "sse", url: "http://localhost:3000/sse" } });
    expect(() => parseConfiguration('{"servers":{"bad":{"type":"stdio","url":"http://localhost"}}}')).toThrow(/stdio/);
    expect(() => parseConfiguration('{"mcpServers":{"a":{"url":"http://a"}},"servers":{"b":{"url":"http://b"}}}')).toThrow(/either/i);
  });

  it("serializes configurations for mcp.json and VS Code without secrets", () => {
    const servers = { audit: { command: "python", env: { API_KEY: "secret" } }, web: { url: "http://h/mcp", headers: { Authorization: "Bearer x" } } };
    expect(JSON.parse(serializeConfiguration(servers, "mcp"))).toEqual({ mcpServers: {
      audit: { command: "python", env: { API_KEY: "[redacted]" } }, web: { url: "http://h/mcp", headers: { Authorization: "[redacted]" } },
    } });
    expect(JSON.parse(serializeConfiguration(servers, "vscode")).servers).toEqual({
      audit: { type: "stdio", command: "python", env: { API_KEY: "[redacted]" } }, web: { type: "http", url: "http://h/mcp", headers: { Authorization: "[redacted]" } },
    });
  });

  it("bounds load tests and rejects fractional or excessive settings", () => {
    expect(loadSettings(20, 2)).toEqual({ count: 20, concurrency: 2 });
    expect(() => loadSettings(1001, 1)).toThrow();
    expect(() => loadSettings(20, 21)).toThrow();
    expect(() => loadSettings(2.5, 1)).toThrow();
  });
});
