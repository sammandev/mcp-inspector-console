import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AccountClient, safeReturnPath } from "./api.js";

describe("account browser isolation", () => {
  it("rejects late responses after logout even if fetch ignores cancellation", async () => {
    const controller = new AbortController();
    const client = new AccountClient("fixture-session", controller.signal, async () => {
      controller.abort();
      return Response.json({ ok: true });
    });
    await expect(client.request("providers", z.object({ ok: z.boolean() }))).rejects.toThrow();
  });
  it("binds account writes to their original session", async () => {
    const client = new AccountClient("fixture-session", new AbortController().signal, async (_url, init) => {
      expect(new Headers(init?.headers).get("X-Inspector-Session")).toBe("fixture-session");
      expect(init?.credentials).toBe("same-origin");
      return Response.json({ ok: true });
    });
    expect(await client.request("connections", z.object({ ok: z.boolean() }), "PUT", {})).toEqual({ ok: true });
  });
  it("calls the global fetch without rebinding it to the client, as browsers require", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ ok: true }));
    });
    try {
      const client = new AccountClient("", new AbortController().signal);
      expect(await client.request("me", z.object({ ok: z.boolean() }))).toEqual({ ok: true });
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps return navigation inside the Inspector and excludes sign-in loops", () => {
    expect(safeReturnPath("https://attacker.example")).toBe("/mcp/inspector");
    expect(safeReturnPath("/mcp/inspector/sign-in")).toBe("/mcp/inspector");
    expect(safeReturnPath("/mcp/inspector?tab=chat")).toBe("/mcp/inspector?tab=chat");
  });
});
