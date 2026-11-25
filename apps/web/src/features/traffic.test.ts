import { describe, expect, it } from "vitest";
import type { RpcTrafficEntry } from "../../vendor/mcp-use/client/rpc-traffic-store.js";
import { buildProtocolExchanges, filterExchanges, networkRpcLabel } from "./traffic.js";

const entry = (
  id: string,
  direction: RpcTrafficEntry["direction"],
  timestamp: string,
  message: unknown,
  serverId = "server",
): RpcTrafficEntry => ({ id, source: "mcp", serverId, direction, timestamp, message });

describe("protocol exchanges", () => {
  it("pairs requests with their responses and reports timing and outcome", () => {
    const exchanges = buildProtocolExchanges([
      entry("1", "send", "2026-01-01T00:00:00.000Z", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo" } }),
      entry("2", "send", "2026-01-01T00:00:00.010Z", { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "x://y" } }),
      entry("3", "receive", "2026-01-01T00:00:00.040Z", { jsonrpc: "2.0", id: 2, error: { code: -32002, message: "missing" } }),
      entry("4", "receive", "2026-01-01T00:00:00.125Z", { jsonrpc: "2.0", id: 1, result: { content: [] } }),
    ]);

    expect(exchanges).toEqual([
      expect.objectContaining({ id: "1", kind: "request", method: "tools/call", status: "ok", durationMs: 125, params: { name: "echo" }, response: { content: [] } }),
      expect.objectContaining({ id: "2", kind: "request", method: "resources/read", status: "error", durationMs: 30, response: { code: -32002, message: "missing" } }),
    ]);
  });

  it("keeps notifications, pending requests and server-initiated requests separate per server", () => {
    const exchanges = buildProtocolExchanges([
      entry("1", "send", "2026-01-01T00:00:00.000Z", { jsonrpc: "2.0", id: 7, method: "ping" }, "a"),
      entry("2", "receive", "2026-01-01T00:00:00.005Z", { jsonrpc: "2.0", id: 7, result: {} }, "b"),
      entry("3", "receive", "2026-01-01T00:00:00.006Z", { jsonrpc: "2.0", method: "notifications/message", params: { level: "info" } }, "a"),
      entry("4", "receive", "2026-01-01T00:00:00.007Z", { jsonrpc: "2.0", id: "s1", method: "roots/list" }, "a"),
      entry("5", "send", "2026-01-01T00:00:00.009Z", { jsonrpc: "2.0", id: "s1", result: { roots: [] } }, "a"),
    ]);

    expect(exchanges.map(({ id, kind, method, status, direction }) => ({ id, kind, method, status, direction }))).toEqual([
      { id: "1", kind: "request", method: "ping", status: "pending", direction: "send" },
      { id: "2", kind: "response", method: "response", status: "ok", direction: "receive" },
      { id: "3", kind: "notification", method: "notifications/message", status: "ok", direction: "receive" },
      { id: "4", kind: "request", method: "roots/list", status: "ok", direction: "receive" },
    ]);
    expect(exchanges[3].durationMs).toBe(2);
  });

  it("filters exchanges by either message direction, method, text and order", () => {
    const exchanges = buildProtocolExchanges([
      entry("1", "send", "2026-01-01T00:00:00.000Z", { jsonrpc: "2.0", id: 1, method: "resources/list" }),
      entry("2", "receive", "2026-01-01T00:00:00.010Z", { jsonrpc: "2.0", id: 1, result: { resources: [{ uri: "resource://page-2" }] } }),
      entry("3", "send", "2026-01-01T00:00:00.020Z", { jsonrpc: "2.0", id: 2, method: "ping" }),
      entry("4", "send", "2026-01-01T00:00:00.030Z", { jsonrpc: "2.0", method: "notifications/initialized" }),
    ]);
    const ids = (options: Partial<Parameters<typeof filterExchanges>[1]>) =>
      filterExchanges(exchanges, { method: "", direction: "all", search: "", order: "oldest", ...options }).map(({ id }) => id);

    expect(ids({ direction: "receive" })).toEqual(["1"]);
    expect(ids({ direction: "send" })).toEqual(["1", "3", "4"]);
    expect(ids({ method: "resources" })).toEqual(["1"]);
    expect(ids({ search: "PAGE-2" })).toEqual(["1"]);
    expect(ids({ order: "newest" })).toEqual(["4", "3", "1"]);
  });
});

describe("network RPC label", () => {
  it("names the JSON-RPC message an HTTP request carried", () => {
    expect(networkRpcLabel({ requestHeaders: { "mcp-method": "tools/call", "mcp-name": "echo" } })).toBe("tools/call echo");
    expect(networkRpcLabel({ requestHeaders: [["Content-Type", "application/json"]], requestBody: '{"jsonrpc":"2.0","id":1,"method":"ping"}' })).toBe("ping");
    expect(networkRpcLabel({ requestHeaders: {}, requestBody: '[{"method":"ping"},{"method":"tools/list"}]' })).toBe("ping +1");
    expect(networkRpcLabel({ requestHeaders: {}, requestBody: '{"jsonrpc":"2.0","id":1,"result":{}}' })).toBe("response");
    expect(networkRpcLabel({ requestHeaders: {}, requestBody: "not json" })).toBeUndefined();
    expect(networkRpcLabel({ requestHeaders: {} })).toBeUndefined();
  });
});
