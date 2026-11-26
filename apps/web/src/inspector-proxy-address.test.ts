import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toEditableConnectionConfig, toMcpServerConfig } from "@/client/utils/connectionUpdates";

const currentProxy = "http://10.176.2.139:7000/mcp/inspector/api/proxy";
const staleProxy = "https://10.176.2.139:7000/mcp/inspector/api/proxy";

describe("Inspector proxy address", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "http://10.176.2.139:7000", host: "10.176.2.139:7000" },
      __MCP_PROXY_URL__: "/mcp/inspector/api/proxy",
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rebases a stored proxy saved under another scheme of this host", () => {
    const editable = toEditableConnectionConfig(
      { url: "http://10.176.2.139:39064/mcp" } as never,
      { url: "http://10.176.2.139:39064/mcp", connectionMode: "auto", autoProxyFallback: { enabled: true, proxyAddress: staleProxy } } as never,
    );
    expect(editable.autoProxyFallback).toMatchObject({ proxyAddress: currentProxy });
  });

  it("rebases a pasted or typed proxy address for this host", () => {
    const config = toMcpServerConfig({
      url: "http://10.176.2.139:39064/mcp", name: "script-audit", transportType: "http", connectionMode: "proxy",
      proxyConfig: { proxyAddress: staleProxy },
    });
    expect(config.proxyConfig?.proxyAddress).toBe(currentProxy);
  });

  it("rebases a stale auto-fallback proxy on new connections", () => {
    const config = toMcpServerConfig({
      url: "http://10.176.2.139:39064/mcp", name: "script-audit", transportType: "http", connectionMode: "auto",
      autoProxyFallback: { enabled: true, proxyAddress: staleProxy },
    });
    expect(config.autoProxyFallback).toEqual({ enabled: true, proxyAddress: currentProxy });
  });

  it("keeps a proxy on another host", () => {
    const config = toMcpServerConfig({
      url: "https://example.com/mcp", name: "x", transportType: "http", connectionMode: "proxy",
      proxyConfig: { proxyAddress: "https://proxy.example/mcp/inspector/api/proxy" },
    });
    expect(config.proxyConfig?.proxyAddress).toBe("https://proxy.example/mcp/inspector/api/proxy");
  });
});
