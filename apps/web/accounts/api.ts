import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccountError, ExternalAuthenticator } from "./auth.js";
import type { AccountConfig } from "./config.js";
import { chatInput, providerInput, type AccountSession, type AccountUser, type SavedProvider } from "./contracts.js";
import type { AccountStore } from "./store.js";
import { isSameOriginBrowserRequest } from "../same-origin-request.js";

export const ACCOUNT_PATH = "/mcp/inspector/api/account/";
const SESSION_COOKIE = "inspector_session";
const OTP_COOKIE = "inspector_otp";
type Store = Pick<AccountStore, "user" | "createSession" | "session" | "revoke" | "list" | "get" | "write" | "mutate" | "delete" | "challenge" | "attempt" | "consumeChallenge" | "close">;
const loginInput = z.object({
  username: z.string().trim().min(1).max(256), password: z.string().min(1).max(4096),
}).strict();
const storedChat = z.object({
  id: z.string(), title: z.string(), agent_id: z.string(), agent_name: z.string(),
  created_at: z.string(), updated_at: z.string(), messages: z.array(z.unknown()),
});
export const storedProvider = providerInput.omit({ removeKey: true }).extend({ id: z.string(), updatedAt: z.string().optional() });
const chatPatch = z.object({ title: z.string().trim().min(1).max(256).optional(), messages: z.array(z.unknown()).max(10000).optional() }).strict();

function cookie(request: Request, name: string): string {
  return request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
function setCookie(request: Request, name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/mcp/inspector; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function equalSecret(left: string, right: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}
export function providerRecordId(provider: string, baseUrl: string, name?: string): string {
  const endpoint = `${provider}:${baseUrl.replace(/\/+$/, "")}`;
  // Unnamed records keep their original id so existing saved providers remain addressable.
  return createHash("sha256").update(name ? `${endpoint}:${name}` : endpoint).digest("hex");
}
/** A saved key never follows a configuration to a different provider endpoint. */
export function keyForEndpoint(saved: SavedProvider | null, input: { provider: string; baseUrl: string }): string {
  const endpoint = (value: string) => value.replace(/\/+$/, "");
  return saved && saved.provider === input.provider && endpoint(saved.baseUrl) === endpoint(input.baseUrl) ? saved.apiKey ?? "" : "";
}
function publicProvider(value: SavedProvider) {
  const { apiKey, ...setting } = value;
  return { ...setting, keySaved: Boolean(apiKey) };
}
function method(request: Request, expected: string): void {
  if (request.method !== expected) throw new AccountError(405, "Method not allowed");
}

export class AccountService {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private readonly streams = new Map<string, Set<AbortController>>();
  constructor(
    private readonly config: AccountConfig,
    readonly store: Store,
    private readonly external = new ExternalAuthenticator(config.externalOrigin),
  ) {}

  async session(request: Request, generation?: string): Promise<AccountSession> {
    const token = cookie(request, SESSION_COOKIE);
    const session = token ? await this.store.session(token) : null;
    if (!session || (generation !== undefined && generation !== session.id)) {
      throw new AccountError(401, "Sign in to continue");
    }
    return session;
  }
  async requireUser(request: Request): Promise<AccountUser> {
    return (await this.session(request, request.headers.get("X-Inspector-Session") ?? "")).user;
  }
  registerStream(session: AccountSession, controller: AbortController): () => void {
    const set = this.streams.get(session.id) ?? new Set();
    set.add(controller); this.streams.set(session.id, set);
    return () => { set.delete(controller); if (!set.size) this.streams.delete(session.id); };
  }
  private throttle(): void {
    const now = Date.now();
    const key = "loopback";
    const entry = this.attempts.get(key);
    if (!entry || entry.until <= now) this.attempts.set(key, { count: 1, until: now + 60000 });
    else if (++entry.count > 10) throw new AccountError(429, "Too many sign-in attempts. Please wait a minute.");
  }
  private async signedIn(request: Request, user: AccountUser): Promise<Response> {
    const previous = cookie(request, SESSION_COOKIE);
    if (previous) {
      const old = await this.store.session(previous);
      if (old) await this.revoke(old);
    }
    const { token, session } = await this.store.createSession(user);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", setCookie(request, SESSION_COOKIE, token, 8 * 60 * 60));
    headers.append("Set-Cookie", setCookie(request, OTP_COOKIE, "", 0));
    return Response.json(session, { headers });
  }
  private async revoke(session: AccountSession): Promise<void> {
    await this.store.revoke(session);
    for (const controller of this.streams.get(session.id) ?? []) controller.abort();
    this.streams.delete(session.id);
  }
  async handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(ACCOUNT_PATH)) return;
    if (!isSameOriginBrowserRequest(url.origin, {
      origin: request.headers.get("origin"), fetchSite: request.headers.get("sec-fetch-site"),
      referer: request.headers.get("referer"),
    })) {
      return Response.json({ error: "Cross-origin account requests are forbidden" }, { status: 403 });
    }
    try {
      const path = url.pathname.slice(ACCOUNT_PATH.length);
      const response = await this.route(request, path);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
      if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Invalid request data" }, { status: 400 });
      console.error("Inspector account operation failed; check database configuration and migration");
      return Response.json({ error: "Account storage is unavailable. Check database configuration and migration." }, { status: 503 });
    }
  }
  private async route(request: Request, path: string): Promise<Response> {
    if (path === "me") {
      method(request, "GET");
      const token = cookie(request, SESSION_COOKIE);
      return Response.json(token ? await this.store.session(token) : null);
    }
    if (path === "login") {
      method(request, "POST"); this.throttle();
      const input = loginInput.parse(await request.json());
      const identifier = input.username.toLowerCase();
      if (identifier === this.config.adminUsername.toLowerCase() || identifier === this.config.adminEmail.toLowerCase()) {
        if (!equalSecret(input.password, this.config.adminPassword)) throw new AccountError(401, "Invalid username or password");
        return this.signedIn(request, await this.store.user("admin", "environment-admin", this.config.adminUsername, this.config.adminEmail));
      }
      const result = await this.external.login(input.username, input.password);
      if (result.otpRequired) {
        const token = await this.store.challenge(input.username);
        return Response.json({ otpRequired: true, email: result.email, expiresIn: 300 }, {
          headers: { "Set-Cookie": setCookie(request, OTP_COOKIE, token, 300) },
        });
      }
      return this.signedIn(request, await this.store.user("external", result.identity, result.username, result.email));
    }
    if (path === "otp") {
      method(request, "POST"); this.throttle();
      const input = z.object({ otp: z.string().regex(/^\d{6}$/) }).strict().parse(await request.json());
      const token = cookie(request, OTP_COOKIE);
      const username = await this.store.attempt(token);
      const result = await this.external.verifyOtp(username, input.otp);
      await this.store.consumeChallenge(token);
      return this.signedIn(request, await this.store.user("external", result.identity, result.username, result.email));
    }
    const session = await this.session(request, request.headers.get("X-Inspector-Session") ?? "");
    if (path === "logout") {
      method(request, "POST"); await this.revoke(session);
      return Response.json({ ok: true }, { headers: { "Set-Cookie": setCookie(request, SESSION_COOKIE, "", 0) } });
    }
    if (path === "providers") {
      if (request.method === "GET") {
        return Response.json((await this.store.list(session, "provider")).map(value => publicProvider(storedProvider.parse(value))));
      }
      method(request, "POST");
      const input = providerInput.parse(await request.json());
      if (input.baseUrl && input.baseUrl !== "/mcp/inspector/api/pegaai/v1") {
        let endpoint: URL;
        try { endpoint = new URL(input.baseUrl); } catch { throw new AccountError(400, "Invalid provider endpoint"); }
        if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          throw new AccountError(400, "Provider endpoint must be an HTTP(S) URL without credentials, query or fragment");
        }
      }
      const id = input.id ?? providerRecordId(input.provider, input.baseUrl, input.name);
      if (input.id && !(await this.store.get(session, "provider", input.id))) throw new AccountError(404, "Provider settings were not found");
      const value = await this.store.mutate(session, "provider", id, previous => {
        const old = previous ? storedProvider.parse(previous) : null;
        const { removeKey, apiKey, ...setting } = input;
        return { ...setting, id, apiKey: removeKey ? "" : apiKey?.trim() || keyForEndpoint(old, input), updatedAt: new Date().toISOString() };
      });
      return Response.json(publicProvider(storedProvider.parse(value)));
    }
    const providerDelete = /^providers\/([a-f0-9]{64})$/.exec(path);
    if (providerDelete) {
      method(request, "DELETE"); await this.store.delete(session, "provider", providerDelete[1]!);
      return Response.json({ ok: true });
    }
    if (path === "connections") {
      if (request.method === "GET") return Response.json(await this.store.get(session, "connections", "all") ?? {});
      method(request, "PUT");
      const connections = z.record(z.string().max(256), z.record(z.string(), z.unknown())).parse(await request.json());
      if (Object.keys(connections).length > 100) throw new AccountError(400, "Too many saved connections");
      await this.store.write(session, "connections", "all", connections);
      return Response.json({ ok: true });
    }
    if (path === "chats") {
      if (request.method === "GET") {
        const chats = (await this.store.list(session, "chat")).map(value => storedChat.parse(value));
        return Response.json(chats.map(({ messages: _messages, ...chat }) => chat));
      }
      method(request, "POST");
      const input = chatInput.parse(await request.json());
      const id = input.id ?? randomUUID(), now = new Date().toISOString();
      const chat = await this.store.mutate(session, "chat", id, previous => previous ? storedChat.parse(previous) : {
        id, title: input.title ?? "New Chat", agent_id: input.agentId,
        agent_name: input.agentName ?? "MCP Server", created_at: now, updated_at: now, messages: [],
      });
      return Response.json(chat);
    }
    const chatMatch = /^chats\/([a-f0-9-]{36})$/.exec(path);
    if (chatMatch) {
      const id = z.string().uuid().parse(chatMatch[1]);
      if (request.method === "DELETE") {
        await this.store.delete(session, "chat", id); return Response.json({ ok: true });
      }
      if (request.method === "PATCH") {
        const patch = chatPatch.parse(await request.json());
        const chat = await this.store.mutate(session, "chat", id, previous => {
          if (!previous) throw new AccountError(404, "Chat was not found");
          return { ...storedChat.parse(previous), ...patch, updated_at: new Date().toISOString() };
        });
        return Response.json(chat);
      }
      method(request, "GET");
      const chat = await this.store.get(session, "chat", id);
      if (!chat) throw new AccountError(404, "Chat was not found");
      return Response.json(storedChat.parse(chat));
    }
    throw new AccountError(404, "Account endpoint was not found");
  }
  async close(): Promise<void> {
    for (const set of this.streams.values()) for (const controller of set) controller.abort();
    await this.store.close();
  }
}
