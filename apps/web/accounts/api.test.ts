import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountService } from "./api.js";
import { ExternalAuthenticator } from "./auth.js";
import type { AccountStore } from "./store.js";
import type { AccountSession, AccountUser } from "./contracts.js";
import type { AccountConfig } from "./config.js";
import { relayProviderRequest } from "./provider-relay.js";
afterEach(() => vi.unstubAllGlobals());

const config: AccountConfig = {
  databaseUrl: "postgresql://localhost/fixture", encryptionKey: Buffer.alloc(32, 7),
  adminUsername: "fixture-admin", adminEmail: "admin@example.test", adminPassword: "fixture-secret",
  externalOrigin: new URL("https://auth.example"),
};
function fixture() {
  const sessions = new Map<string, AccountSession>();
  const records = new Map<string, unknown>();
  const store: Pick<AccountStore, "user" | "createSession" | "session" | "revoke" | "list" | "get" | "write" | "mutate" | "delete" | "challenge" | "attempt" | "consumeChallenge" | "close"> = {
    async user(kind, identity, username, email) { return { id: identity, kind, username, email }; },
    async createSession(user: AccountUser) {
      const token = crypto.randomUUID();
      const session = { id: crypto.randomUUID(), user, expiresAt: Date.now() + 100000 };
      sessions.set(token, session); return { token, session };
    },
    async session(token) { return sessions.get(token) ?? null; },
    async revoke(session) { for (const [token, value] of sessions) if (value.id === session.id) sessions.delete(token); },
    async list(session, kind) { return [...records].filter(([key]) => key.startsWith(`${session.user.id}:${kind}:`)).map(([, value]) => value); },
    async get(session, kind, id) { return records.get(`${session.user.id}:${kind}:${id}`) ?? null; },
    async write(session, kind, id, value) { records.set(`${session.user.id}:${kind}:${id}`, value); },
    async mutate(session, kind, id, update) {
      const key = `${session.user.id}:${kind}:${id}`;
      const value = update(records.get(key) ?? null); records.set(key, value); return value;
    },
    async delete(session, kind, id) { records.delete(`${session.user.id}:${kind}:${id}`); },
    async challenge() { return "fixture-challenge"; },
    async attempt() { return "fixture"; },
    async consumeChallenge() {},
    async close() {},
  };
  return new AccountService(config, store, new ExternalAuthenticator(config.externalOrigin));
}
function request(path: string, body?: unknown, cookie?: string, generation?: string) {
  return new Request(`http://localhost:5173/mcp/inspector/api/account/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}), ...(generation ? { "X-Inspector-Session": generation } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
describe("Inspector account API", () => {
  async function relayFixture() {
    const service = fixture();
    const login = (await service.handle(request("login", { username: "fixture-admin", password: "fixture-secret" })))!;
    const session: AccountSession = await login.json();
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const saved = (await service.handle(request("providers", {
      provider: "openai-compatible", model: "fixture-model", baseUrl: "http://localhost:4714/v1", apiKey: "fixture-private-key",
    }, cookie, session.id)))!;
    const provider = await saved.json() as { id: string };
    const target = `http://localhost:5173/mcp/inspector/api/account/relay/${session.id}/${provider.id}/chat/completions`;
    return { service, session, cookie, target };
  }
  it("forwards only the saved account key, never browser cookies or browser authorization", async () => {
    const { service, cookie, target } = await relayFixture();
    let forwarded: Request | null = null;
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      forwarded = new Request(url, init); return Response.json({ choices: [] });
    });
    const result = (await relayProviderRequest(new Request(target, { method: "POST",
      headers: { Cookie: cookie, Authorization: "Bearer browser-only", Origin: "http://localhost:5173" },
      body: JSON.stringify({ model: "fixture-model" }),
    }), service, new Set(["http://localhost:4714"]), new URL("http://localhost:4714")))!;
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ choices: [] });
    const outbound = forwarded as Request | null;
    expect(outbound?.url).toBe("http://localhost:4714/v1/chat/completions");
    expect(outbound?.headers.get("Authorization")).toBe("Bearer fixture-private-key");
    expect(outbound?.headers.has("Cookie")).toBe(false);
    expect(outbound?.headers.has("Origin")).toBe(false);
  });
  it("aborts provider streams when their account signs out", async () => {
    const { service, session, cookie, target } = await relayFixture();
    let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
      upstreamSignal = init.signal ?? undefined;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      } }));
    });
    const result = (await relayProviderRequest(new Request(target, { method: "POST", headers: { Cookie: cookie }, body: "{}" }),
      service, new Set(["http://localhost:4714"]), new URL("http://localhost:4714")))!;
    const reader = result.body!.getReader(); await reader.read();
    await service.handle(request("logout", {}, cookie, session.id));
    expect(upstreamSignal?.aborted).toBe(true);
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("reports malformed discovery input as a client error instead of a provider outage", async () => {
    const { service, cookie, session } = await relayFixture();
    const response = (await relayProviderRequest(request("discover", { provider: "unsupported" }, cookie, session.id),
      service, new Set(), new URL("http://localhost:4714")))!;
    expect(response.status).toBe(400);
  });
  it("accepts the admin email and issues an HttpOnly cookie without returning credentials", async () => {
    const service = fixture();
    const response = (await service.handle(request("login", { username: "admin@example.test", password: "fixture-secret" })))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(await response.text()).not.toContain("fixture-secret");
  });
  it("routes non-admin usernames from the single sign-in form to external token2", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      paths.push(url.pathname);
      return Response.json({ otp_required: true, email: "fixture@example.test" });
    });
    const service = fixture();
    const response = (await service.handle(request("login", { username: "fixture-user", password: "fixture-secret" })))!;
    expect(await response.json()).toMatchObject({ otpRequired: true, email: "fixture@example.test" });
    expect(paths).toEqual(["/api/user/token2/"]);
  });
  it("rejects incorrect credentials and cross-origin requests", async () => {
    const service = fixture();
    expect((await service.handle(request("login", { username: "fixture-admin", password: "wrong" })))!.status).toBe(401);
    expect((await service.handle(new Request("http://localhost:5173/mcp/inspector/api/account/me", {
      headers: { Origin: "https://attacker.example" },
    })))!.status).toBe(403);
  });
  it("blocks anonymous account data and rejects a stale session generation", async () => {
    const service = fixture();
    expect((await service.handle(request("providers")))!.status).toBe(401);
    const login = (await service.handle(request("login", { username: "fixture-admin", password: "fixture-secret" })))!;
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    expect((await service.handle(request("providers", undefined, cookie, "old-session")))!.status).toBe(401);
  });
  it("does not return saved keys and revokes access on logout", async () => {
    const service = fixture();
    const login = (await service.handle(request("login", { username: "fixture-admin", password: "fixture-secret" })))!;
    const session: AccountSession = await login.json();
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const saved = (await service.handle(request("providers", {
      provider: "openai-compatible", model: "fixture-model", baseUrl: "http://localhost:4714", apiKey: "fixture-private-key",
    }, cookie, session.id)))!;
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain("fixture-private-key");
    expect(await (await service.handle(request("providers", undefined, cookie, session.id)))!.text()).not.toContain("fixture-private-key");
    expect((await service.handle(request("logout", {}, cookie, session.id)))!.status).toBe(200);
    expect((await service.handle(request("providers", undefined, cookie, session.id)))!.status).toBe(401);
  });
});
