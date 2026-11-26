import { z } from "zod";
export const sessionSchema = z.object({
  id: z.string(), expiresAt: z.number(),
  user: z.object({ id: z.string(), username: z.string(), email: z.string(), kind: z.enum(["admin", "external"]) }),
});
export type BrowserSession = z.infer<typeof sessionSchema>;
export const okSchema = z.object({ ok: z.boolean() });
export const providerSchema = z.object({
  id: z.string(), provider: z.enum(["openai", "openai-compatible", "anthropic", "google", "openrouter", "ollama"]),
  model: z.string(), baseUrl: z.string(), keySaved: z.boolean(), temperature: z.number().optional(), updatedAt: z.string().optional(),
});
export type PublicProvider = z.infer<typeof providerSchema>;
export const loginSchema = z.union([sessionSchema, z.object({ otpRequired: z.literal(true), email: z.string(), expiresIn: z.number() })]);

export function accountResourceId(sessionId: string | undefined, resourceId: string): string {
  return sessionId ? `inspector-account:${encodeURIComponent(sessionId)}:${resourceId}` : resourceId;
}
export function accountOAuthPrefix(sessionId: string | undefined): string {
  return sessionId ? `mcp:inspector-account:${encodeURIComponent(sessionId)}` : "mcp:auth";
}
export function clearAccountBrowserState(sessionId: string): void {
  const scope = accountResourceId(sessionId, "");
  const prefixes = [accountOAuthPrefix(sessionId) + "_", `mcp-inspector-system-prompt:${scope}`,
    `__mcpUseInspectorPendingChatTurn:${encodeURIComponent(scope)}`,
    `__mcpUseInspectorActivePendingChatSession:${encodeURIComponent(scope)}`];
  for (const storage of [localStorage, sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key && prefixes.some(prefix => key.startsWith(prefix))) storage.removeItem(key);
  }
}
export function assertOAuthCallbackScope(sessionId: string | undefined): void {
  const state = new URLSearchParams(window.location.search).get("state");
  if (!state) return;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => Boolean(key?.endsWith(`_state_${state}`)));
  if (keys.some(key => !key.startsWith(accountOAuthPrefix(sessionId) + "_"))) {
    throw new Error("The account changed during MCP authentication. Start authentication again from your current workspace.");
  }
}

export function safeReturnPath(value: string | null): string {
  if (!value || !/^\/mcp\/inspector(?:\?|$)/.test(value) || value.includes("\\") || /[\r\n]/.test(value)) return "/mcp/inspector";
  return value;
}

export class AccountClient {
  constructor(
    readonly sessionId: string,
    readonly signal: AbortSignal,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  async request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown): Promise<T> {
    this.signal.throwIfAborted();
    const response = await this.fetcher(`/mcp/inspector/api/account/${path}`, {
      method, signal: this.signal, credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Inspector-Session": this.sessionId },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.signal.throwIfAborted();
    const payload: unknown = await response.json();
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(payload);
      throw new Error(error.success ? error.data.error : `Account request failed (HTTP ${response.status})`);
    }
    this.signal.throwIfAborted();
    return schema.parse(payload);
  }
  relayUrl(id: string): string {
    return `${window.location.origin}/mcp/inspector/api/account/relay/${this.sessionId}/${id}`;
  }
}
