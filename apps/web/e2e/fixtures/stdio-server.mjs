// Minimal newline-delimited JSON-RPC MCP server used by browser tests.
console.error("stdio fixture ready");
let buffer = "";
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\n")) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (!message.method) continue;
    console.error(`method:${message.method}`);
    if (message.id === undefined) continue;
    if (message.method === "initialize") {
      reply(message.id, {
        protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "stdio-fixture", version: "1.0.0" },
      });
    } else if (message.method === "tools/list") {
      reply(message.id, { tools: [{ name: "local-echo", inputSchema: { type: "object" } }] });
    } else {
      reply(message.id, {});
    }
  }
});
