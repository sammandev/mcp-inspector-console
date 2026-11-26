import { describe, expect, it, vi } from "vitest";
import { AccountClient } from "./api.js";
import { AccountChatStorageProvider, AccountConnectionStorageProvider } from "./storage.js";
describe("account connection persistence", () => {
  it("restores credential-bearing settings without passing them through browser-storage sanitization", async () => {
    const client = new AccountClient("fixture-session", new AbortController().signal, async () => Response.json({
      fixture: { url: "http://localhost:3000/mcp", storageKeyPrefix: "mcp:auth", headers: { Authorization: "Bearer fixture-private" }, requestTimeout: 25000 },
    }));
    const storage = new AccountConnectionStorageProvider(client);
    await storage.load();
    expect(storage.getServers().fixture).toMatchObject({
      headers: { Authorization: "Bearer fixture-private" }, requestTimeout: 25000,
      storageKeyPrefix: "mcp:inspector-account:fixture-session",
    });
  });
  it("keeps saved proxy and OAuth secrets when the SDK writes a sanitized config", async () => {
    const bodies: unknown[] = [];
    const client = new AccountClient("fixture-session", new AbortController().signal, async (_url, init) => {
      if (init?.method === "PUT") { bodies.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
      return Response.json({ fixture: {
        url: "http://localhost:3000/mcp",
        proxyConfig: { proxyAddress: "http://proxy.test", customHeaders: { Authorization: "proxy-private" } },
        oauth: { clientId: "client", clientSecret: "oauth-private" },
      } });
    });
    const storage = new AccountConnectionStorageProvider(client);
    await storage.load();
    await storage.setServers({ fixture: { url: "http://localhost:3000/mcp", proxyConfig: { proxyAddress: "http://proxy.test" }, oauth: { clientId: "client", scope: "read" } } });
    expect(bodies[0]).toMatchObject({ fixture: {
      proxyConfig: { proxyAddress: "http://proxy.test", customHeaders: { Authorization: "proxy-private" } },
      oauth: { clientId: "client", clientSecret: "oauth-private", scope: "read" },
    } });
  });
    it("coalesces streamed message snapshots into the final saved state", async () => {
      vi.useFakeTimers();
      try {
        const bodies: unknown[] = [];
        const client = new AccountClient("fixture-session", new AbortController().signal, async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Response.json({ id: "fixture", title: "Chat", agent_id: "server", agent_name: "Server", created_at: "now", updated_at: "now" });
        });
        const storage = new AccountChatStorageProvider(client);
        const first = storage.saveMessages("fixture", [{ id: "message", role: "assistant", content: "partial", timestamp: 1 }]);
        const final = storage.saveMessages("fixture", [{ id: "message", role: "assistant", content: "complete", timestamp: 1 }]);
        await vi.runAllTimersAsync(); await Promise.all([first, final]);
        expect(bodies).toEqual([{ messages: [{ id: "message", role: "assistant", content: "complete", timestamp: 1 }] }]);
      } finally { vi.useRealTimers(); }
    });
});
