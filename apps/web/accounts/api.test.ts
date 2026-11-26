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
  it("keeps several named OpenAI-compatible configurations and updates one by id without losing its key", async () => {
    const { service, cookie, session } = await relayFixture();
    const save = async (body: unknown) => (await service.handle(request("providers", body, cookie, session.id)))!;
    const second = await (await save({ provider: "openai-compatible", name: "Team key", model: "other-model",
      baseUrl: "http://localhost:4714/v1", apiKey: "second-private-key" })).json() as { id: string; name: string };
    expect(second.name).toBe("Team key");
    const rows = await (await service.handle(request("providers", undefined, cookie, session.id)))!.json() as { id: string }[];
    expect(rows).toHaveLength(2);
    const updated = await save({ id: second.id, provider: "openai-compatible", name: "Team key", model: "switched-model",
      baseUrl: "http://localhost:4714/v1" });
    expect(await updated.json()).toMatchObject({ id: second.id, model: "switched-model", keySaved: true });
    expect((await service.handle(request("providers", undefined, cookie, session.id)))!.status).toBe(200);
    expect(await (await service.handle(request("providers", undefined, cookie, session.id)))!.json()).toHaveLength(2);
    const missing = await save({ id: "f".repeat(64), provider: "openai-compatible", model: "m", baseUrl: "http://localhost:4714/v1" });
    expect(missing.status).toBe(404);
    const moved = await save({ id: second.id, provider: "openai-compatible", name: "Team key", model: "m",
      baseUrl: "http://localhost:11434/v1" });
    expect(await moved.json()).toMatchObject({ id: second.id, keySaved: false });
  });
  it("discovers models for a saved configuration by id but never sends its key to another endpoint", async () => {
    const { service, cookie, session, target } = await relayFixture();
    const id = /relay\/[^/]+\/([a-f0-9]{64})\//.exec(target)![1]!;
    const seen: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init.headers).get("authorization") });
      return Response.json({ data: [{ id: "m1" }] });
    });
    const discover = (baseUrl: string) => relayProviderRequest(request("discover",
      { id, provider: "openai-compatible", model: "fixture-model", baseUrl }, cookie, session.id),
      service, new Set(["http://localhost:4714", "http://localhost:11434"]), new URL("http://localhost:4714"));
    expect((await discover("http://localhost:4714/v1"))!.status).toBe(200);
    expect((await discover("http://localhost:11434/v1"))!.status).toBe(200);
    expect(seen).toEqual([
      { url: "http://localhost:4714/v1/models", auth: "Bearer fixture-private-key" },
      { url: "http://localhost:11434/v1/models", auth: null },
    ]);
  });
  it("applies the selected reasoning effort to chat completions and rejects unknown values", async () => {
    const { service, cookie, target } = await relayFixture();
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
      bodies.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as ArrayBuffer)));
      return Response.json({ choices: [] });
    });
    const send = (effort?: string) => relayProviderRequest(new Request(target, { method: "POST",
      headers: { Cookie: cookie, ...(effort ? { "X-Inspector-Reasoning-Effort": effort } : {}) },
      body: JSON.stringify({ model: "fixture-model", messages: [] }),
    }), service, new Set(["http://localhost:4714"]), new URL("http://localhost:4714"));
    expect((await send("high"))!.status).toBe(200);
    expect((await send())!.status).toBe(200);
    expect((await send("extreme"))!.status).toBe(400);
    expect(bodies).toEqual([
      { model: "fixture-model", messages: [], reasoning_effort: "high" },
      { model: "fixture-model", messages: [] },
    ]);
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
  it("accepts plain-HTTP same-origin reads identified only by Referer", async () => {
    const service = fixture();
    const me = (referer?: string) => service.handle(new Request("http://10.176.2.139:7000/mcp/inspector/api/account/me",
      { headers: referer ? { Referer: referer } : {} }));
    expect((await me("http://10.176.2.139:7000/mcp/inspector/sign-in"))!.status).toBe(200);
    expect((await me("http://attacker.example/page"))!.status).toBe(403);
    expect((await me())!.status).toBe(403);
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
