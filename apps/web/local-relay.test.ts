import { describe, expect, it } from "vitest";
import { createLocalRelay } from "./local-relay.js";

const base = "http://localhost/mcp/inspector/api/local";
const fixture = `
console.error("audit fixture ready");
let buffer = "";
process.stdin.on("data", chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\\n")) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.method && message.id !== undefined) {
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:message.id,result:{method:message.method}}) + "\\n");
    }
  }
});
`;
const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("explicit local stdio relay", () => {
  it("forwards requests to a real process without a second initialization and stops it", async () => {
    const relay = createLocalRelay();
    try {
      const launched = await relay.handle(jsonRequest(base, { command: process.execPath, args: ["-e", fixture] }));
      expect(launched.status).toBe(201);
      const { id } = await launched.json();
      const response = await relay.handle(jsonRequest(`${base}/${id}/mcp`, { jsonrpc: "2.0", id: 7, method: "ping" }));
      expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 7, result: { method: "ping" } });
      const consoleResponse = await relay.handle(new Request(`${base}/${id}`));
      const diagnostics = await consoleResponse.json();
      expect(diagnostics.stderr).toContain("audit fixture ready");
      expect(diagnostics.pid).toBeGreaterThan(0);
      expect((await relay.handle(new Request(`${base}/${id}`, { method: "DELETE" }))).status).toBe(204);
      expect((await relay.handle(new Request(`${base}/${id}`))).status).toBe(404);
      expect(() => process.kill(diagnostics.pid, 0)).toThrow();
    } finally { await relay.close(); }
  });

  it("launches in the requested working directory and lists active sessions", async () => {
    const relay = createLocalRelay();
    const cwd = (await import("node:os")).tmpdir();
    try {
      const script = `${fixture}\nconsole.error("cwd=" + process.cwd());`;
      const launched = await relay.handle(jsonRequest(base, { command: process.execPath, args: ["-e", script], cwd }));
      expect(launched.status).toBe(201);
      const { id } = await launched.json();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const diagnostics = await (await relay.handle(new Request(`${base}/${id}`))).json();
      expect(diagnostics.stderr.toLowerCase()).toContain(`cwd=${cwd}`.toLowerCase());
      const listed = await (await relay.handle(new Request(base))).json();
      expect(listed.sessions).toEqual([expect.objectContaining({ id, pid: diagnostics.pid, command: process.execPath, cwd, closed: false, pending: 0, queued: 0 })]);
      expect(typeof listed.sessions[0].createdAt).toBe("string");
    } finally { await relay.close(); }
  });

  it("reports invalid profiles and launch failures instead of returning a working-looking URL", async () => {
    const relay = createLocalRelay();
    try {
      expect((await relay.handle(jsonRequest(base, { url: "https://example.com/mcp" }))).status).toBe(400);
      const failed = await relay.handle(jsonRequest(base, { command: "nonexistent-audit-fixture-command" }));
      expect(failed.status).toBe(400);
      expect(await failed.json()).toHaveProperty("error");
    } finally { await relay.close(); }
  });
});
