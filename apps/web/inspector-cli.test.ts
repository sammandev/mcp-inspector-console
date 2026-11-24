import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./inspector-cli.ts", import.meta.url));
const run = (args: string[]) => promisify(execFile)(process.execPath, ["--experimental-strip-types", script, ...args]);
async function withFixture(test: (url: string) => Promise<void>) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: message.method === "initialize"
      ? { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "cli-fixture", version: "1" } }
      : { audit: "passed" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server port");
  try { await test(`http://127.0.0.1:${address.port}/mcp`); } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Inspector automation CLI", () => {
  it("lists configured servers without connecting or printing secrets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inspector-cli-"));
    try {
      const config = join(directory, "mcp.json");
      await writeFile(config, JSON.stringify({ mcpServers: { audit: { command: "python", env: { TOKEN: "secret" } }, web: { url: "http://h/mcp" } } }));
      const { stdout } = await run(["--config", config, "--list-servers"]);
      expect(JSON.parse(stdout)).toEqual([{ name: "audit", transport: "stdio", target: "python" }, { name: "web", transport: "http", target: "http://h/mcp" }]);
      const text = await run(["--config", config, "--list-servers", "--format", "text"]);
      expect(text.stdout).toMatch(/audit\s+stdio\s+python/);
      expect(text.stdout).not.toContain("secret");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("writes results to an output file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inspector-cli-"));
    try {
      await withFixture(async (url) => {
        const output = join(directory, "result.json");
        await run(["--url", url, "--method", "ping", "--output-file", output]);
        expect(JSON.parse(await readFile(output, "utf8"))).toEqual({ audit: "passed" });
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("runs a bounded load test and fails when a latency threshold is exceeded", async () => {
    await withFixture(async (url) => {
      const { stdout } = await run(["--url", url, "--method", "ping", "--load", "6", "--concurrency", "2"]);
      expect(JSON.parse(stdout)).toMatchObject({ requests: 6, failures: 0, concurrency: 2 });
      expect(JSON.parse(stdout).p95Ms).toBeGreaterThanOrEqual(0);
      await expect(run(["--url", url, "--method", "ping", "--load", "2", "--max-p95-ms", "0"])).rejects.toMatchObject({ code: 1 });
      await expect(run(["--url", url, "--method", "ping", "--load", "1001"])).rejects.toMatchObject({ code: 1 });
    });
  });

  it("prints an MCP result and returns a failure exit code for an unmet assertion", async () => {
    await withFixture(async (url) => {
      const args = ["--url", url, "--method", "ping"];
      const { stdout } = await run(args);
      expect(JSON.parse(stdout)).toEqual({ audit: "passed" });
      await expect(run([...args, "--expect", '{"audit":"failed"}'])).rejects.toMatchObject({ code: 1 });
    });
  });
});
