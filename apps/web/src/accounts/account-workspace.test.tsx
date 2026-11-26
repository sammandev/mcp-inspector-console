// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173/mcp/inspector"}
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { McpClientProviderProps } from "@mcp-use/client/react";
import { AccountClient, type BrowserSession } from "./api.js";
const fixture = vi.hoisted(() => ({
  account: null as { session: BrowserSession; client: AccountClient; loading: boolean; logout: () => Promise<void> } | null,
  exposed: [] as { session: string; credentials: string }[],
}));
vi.mock("./AccountProvider.js", async importOriginal => ({
  ...await importOriginal<typeof import("./AccountProvider.js")>(),
  AccountProvider: ({ children }: { children: React.ReactNode }) => children,
  useOptionalAccount: () => fixture.account,
}));
vi.mock("@mcp-use/client/react", async importOriginal => ({
  ...await importOriginal<typeof import("@mcp-use/client/react")>(),
  McpClientProvider: ({ storageProvider }: McpClientProviderProps) => {
    fixture.exposed.push({ session: fixture.account?.session.id ?? "", credentials: JSON.stringify(storageProvider?.getServers() ?? {}) });
    return null;
  },
}));
import InspectorApp from "@/client/App";
afterEach(() => { cleanup(); fixture.exposed.length = 0; fixture.account = null; });
it("never hands the previous account's connections to a newly mounted MCP client", async () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  function account(id: string, fetcher: typeof fetch) {
    return { session: { id, expiresAt: Date.now() + 60000, user: { id, username: id, email: "", kind: "admin" as const } },
      client: new AccountClient(id, new AbortController().signal, fetcher), loading: false, logout: async () => {} };
  }
  fixture.account = account("first", async () => Response.json({ private: { url: "http://localhost:3000/mcp", headers: { Authorization: "first-account-private" } } }));
  const view = render(<InspectorApp />);
  await waitFor(() => expect(fixture.exposed.some(row => row.credentials.includes("first-account-private"))).toBe(true));
  fixture.account = account("second", () => new Promise<Response>(() => {}));
  view.rerender(<InspectorApp />);
  expect(fixture.exposed.filter(row => row.session === "second").some(row => row.credentials.includes("first-account-private"))).toBe(false);
});
