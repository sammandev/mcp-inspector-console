import { AccountError } from "./auth.js";
import { ACCOUNT_PATH, AccountService, keyForEndpoint, providerRecordId, storedProvider } from "./api.js";
import { providerInput, reasoningEfforts, type SavedProvider } from "./contracts.js";
import { parsePegaAiModelOptions } from "../vendor/mcp-use/client/components/chat/pegaAi.js";

const defaults = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
  "openai-compatible": "",
};
export function providerTarget(setting: SavedProvider, path: string, approvedOrigins: ReadonlySet<string>, pegaOrigin: URL): URL {
  const allowedPaths = setting.provider === "ollama" ? /^(api\/(?:chat|tags))$/
    : setting.provider === "google" ? /^(models|models\/[A-Za-z0-9_.-]+:(?:streamGenerateContent|generateContent))$/
    : setting.provider === "anthropic" ? /^(models|messages)$/
    : /^(models|chat\/completions|responses)$/;
  if (!allowedPaths.test(path)) throw new AccountError(400, "Unsupported provider request path");
  const isPega = setting.provider === "openai-compatible" && setting.baseUrl === "/mcp/inspector/api/pegaai/v1";
  const custom = setting.provider === "openai-compatible" || setting.provider === "ollama";
  const base = isPega ? new URL("/v1", pegaOrigin) : new URL(custom ? setting.baseUrl || defaults[setting.provider] : defaults[setting.provider]);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new AccountError(400, "Invalid provider endpoint");
  }
  if (custom && !isPega && !approvedOrigins.has(base.origin)) {
    throw new AccountError(403, "Provider origin is not approved. Configure MCP_INSPECTOR_PROVIDER_ORIGINS on the server.");
  }
  if (setting.provider === "ollama") base.pathname = base.pathname.replace(/\/api\/?$/, "");
  return new URL(`${base.href.replace(/\/+$/, "")}/${path}`);
}

function authHeaders(setting: SavedProvider): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (setting.provider === "anthropic") {
    headers.set("x-api-key", setting.apiKey || "");
    headers.set("anthropic-version", "2023-06-01");
  } else if (setting.provider === "google") headers.set("x-goog-api-key", setting.apiKey || "");
  else if (setting.apiKey) headers.set("Authorization", `Bearer ${setting.apiKey}`);
  return headers;
}

function modelRows(payload: unknown, provider: SavedProvider["provider"]): { id: string; displayName?: string }[] {
  if (!payload || typeof payload !== "object") throw new AccountError(502, "Invalid provider model response");
  const object = payload as Record<string, unknown>;
  const rows = provider === "ollama" || provider === "google" ? object.models : object.data;
  if (!Array.isArray(rows)) throw new AccountError(502, "Invalid provider model response");
  return rows.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = row.id ?? row.model ?? row.name;
    if (typeof id !== "string") return [];
    return [{ id: provider === "google" ? id.replace(/^models\//, "") : id,
      ...(typeof row.display_name === "string" ? { displayName: row.display_name } : {}) }];
  });
}

export const REASONING_EFFORT_HEADER = "X-Inspector-Reasoning-Effort";

// The browser agent cannot add body fields, so the chosen effort travels as a header and is applied here.
async function requestBody(request: Request, path: string): Promise<ArrayBuffer | string> {
  const effort = request.headers.get(REASONING_EFFORT_HEADER);
  if (!effort) return request.arrayBuffer();
  if (!(reasoningEfforts as readonly string[]).includes(effort)) throw new AccountError(400, "Unsupported reasoning effort");
  if (path !== "chat/completions" && path !== "responses") return request.arrayBuffer();
  let body: unknown;
  try { body = await request.json(); } catch { throw new AccountError(400, "Provider request body must be JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccountError(400, "Provider request body must be a JSON object");
  const record = body as Record<string, unknown>;
  if (path === "chat/completions") record.reasoning_effort = effort;
  else record.reasoning = { ...(record.reasoning && typeof record.reasoning === "object" ? record.reasoning : {}), effort };
  return JSON.stringify(record);
}

export async function relayProviderRequest(
  request: Request, accounts: AccountService, approvedOrigins: ReadonlySet<string>, pegaOrigin: URL,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const discover = url.pathname === `${ACCOUNT_PATH}discover`;
  const match = new RegExp(`^${ACCOUNT_PATH}relay/([a-f0-9-]{36})/([a-f0-9]{64})/(.+)$`).exec(url.pathname);
  if (!discover && !match) return;
  let unregister: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const session = await accounts.session(request, discover ? request.headers.get("X-Inspector-Session") ?? "" : match![1]!);
    let setting: SavedProvider, path: string;
    if (discover) {
      if (request.method !== "POST") throw new AccountError(405, "Method not allowed");
      const parsed = providerInput.safeParse(await request.json());
      if (!parsed.success) throw new AccountError(400, "Invalid provider configuration");
      const input = parsed.data;
      const id = input.id ?? providerRecordId(input.provider, input.baseUrl, input.name);
      const stored = await accounts.store.get(session, "provider", id);
      setting = { ...input, id, apiKey: input.apiKey?.trim() || keyForEndpoint(stored ? storedProvider.parse(stored) : null, input) };
      path = input.provider === "ollama" ? "api/tags" : "models";
    } else {
      if (request.method !== "POST" && request.method !== "GET") throw new AccountError(405, "Method not allowed");
      const stored = await accounts.store.get(session, "provider", match![2]!);
      if (!stored) throw new AccountError(404, "Provider settings were not found");
      setting = storedProvider.parse(stored);
      path = match![3]!;
      if (request.method === "GET" && !["models", "api/tags"].includes(path)) throw new AccountError(405, "Method not allowed");
    }
    if (!setting.apiKey && !["ollama", "openai-compatible"].includes(setting.provider)) {
      throw new AccountError(400, "Save an API key for this provider");
    }
    const target = providerTarget(setting, path, approvedOrigins, pegaOrigin);
    for (const [key, value] of url.searchParams) {
      if (key === "alt" && value === "sse") target.searchParams.set(key, value);
    }
    const controller = new AbortController();
    unregister = accounts.registerStream(session, controller);
    timer = setTimeout(() => controller.abort(), Math.min(300000, Math.max(1, session.expiresAt - Date.now())));
    const signal = AbortSignal.any([request.signal, controller.signal]);
    if (discover && setting.baseUrl === "/mcp/inspector/api/pegaai/v1") {
      const status = await fetch(new URL("/maas/api/v1/model-status/public/models", pegaOrigin), {
        headers: { Accept: "application/json" }, signal, redirect: "error",
      });
      if (status.ok) {
        const rows = parsePegaAiModelOptions(await status.json());
        if (rows.length) return Response.json(rows);
      }
    }
    const upstream = await fetch(target, {
      method: discover ? "GET" : request.method,
      headers: authHeaders(setting),
      body: !discover && request.method === "POST" ? await requestBody(request, path) : undefined,
      signal, redirect: "error",
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new AccountError(upstream.status === 401 || upstream.status === 403 ? 400 : 502,
        `Provider rejected the request (HTTP ${upstream.status}). Check the saved key and settings.`);
    }
    if (discover) return Response.json(modelRows(await upstream.json(), setting.provider));
    if (!upstream.body) return new Response(null, { status: upstream.status });
    const reader = upstream.body.getReader();
    const release = unregister;
    const timeout = timer;
    const cleanup = () => { release?.(); if (timeout) clearTimeout(timeout); };
    const stream = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const { done, value } = await reader.read();
          if (done) { cleanup(); streamController.close(); }
          else streamController.enqueue(value);
        } catch (error) { cleanup(); streamController.error(error); }
      },
      async cancel() { controller.abort(); cleanup(); await reader.cancel(); },
    });
    const response = new Response(stream, { headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    } });
    unregister = undefined; timer = undefined;
    return response;
  } catch (error) {
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Inspector provider relay failed");
    return Response.json({ error: "Provider request failed. Check server configuration and provider availability." }, { status: 502 });
  } finally {
    unregister?.(); if (timer) clearTimeout(timer);
  }
}
