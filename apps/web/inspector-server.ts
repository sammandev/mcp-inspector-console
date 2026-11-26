import { getRequestListener } from "@hono/node-server";
import { mountInspector } from "@mcp-use/inspector";
import type { IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { createLocalRelay } from "./local-relay.js";
import { readAccountConfig } from "./accounts/config.js";
import { AccountStore } from "./accounts/store.js";
import { AccountService, ACCOUNT_PATH } from "./accounts/api.js";
import { relayProviderRequest } from "./accounts/provider-relay.js";

const INSPECTOR_PATH = "/mcp/inspector";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function requestOrigin(request: IncomingMessage, server: ViteDevServer | PreviewServer): string | undefined {
  if (!request.socket.remoteAddress || !LOOPBACK_ADDRESSES.has(request.socket.remoteAddress)) return;
  if (!request.headers.host) return;

  let url: URL;
  try {
    url = new URL(`http://${request.headers.host}`);
  } catch {
    return;
  }
  const address = server.httpServer?.address();
  if (
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    !address || typeof address === "string" || Number(url.port || 80) !== address.port
  ) return;
  return url.origin;
}

function isSameOriginApiRequest(request: IncomingMessage, origin: string): boolean {
  const requestOrigin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite !== undefined && fetchSite !== "same-origin") return false;
  if (requestOrigin !== undefined && requestOrigin !== origin) return false;
  return requestOrigin === origin || fetchSite === "same-origin";
}

async function boundedRequest(request: Request, maxBytes: number): Promise<Request | Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) {
      return new Response("Request body too large", { status: 413 });
    }
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) return new Response("Request body too large", { status: 413 });
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    body,
  });
}

export function parseApprovedMcpTargets(value: string | undefined): ReadonlySet<string> {
  const targets = new Set<string>();
  for (const rawTarget of (value ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    let target: URL;
    try {
      target = new URL(rawTarget);
    } catch {
      throw new Error(`MCP_INSPECTOR_ALLOWED_TARGETS contains an invalid URL: ${rawTarget}`);
    }
    if ((target.protocol !== "http:" && target.protocol !== "https:") || target.username || target.password) {
      throw new Error(`MCP_INSPECTOR_ALLOWED_TARGETS must contain HTTP(S) URLs without credentials: ${rawTarget}`);
    }
    targets.add(target.href);
  }
  return targets;
}

const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function stripHopByHopHeaders(headers: Headers): void {
  const connectionHeaders = (headers.get("connection") ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  for (const header of [...HOP_BY_HOP_HEADERS, ...connectionHeaders]) {
    headers.delete(header);
  }
}

export async function proxyApprovedMcpRequest(
  request: Request,
  allowedTargets: ReadonlySet<string>,
): Promise<Response | undefined> {
  const rawTarget = request.headers.get("X-Target-URL");
  if (!rawTarget) return;

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    return;
  }
  if (!allowedTargets.has(target.href)) return;
  if ((target.protocol !== "http:" && target.protocol !== "https:") || target.username || target.password) return;

  const headers = new Headers(request.headers);
  stripHopByHopHeaders(headers);
  for (const header of [
    "content-length", "cookie", "host", "origin", "referer", "x-target-url",
  ]) headers.delete(header);
  for (const header of Array.from(headers.keys())) {
    if (header.startsWith("sec-fetch-")) headers.delete(header);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "error",
      signal: request.signal,
    });
    const responseHeaders = new Headers(upstream.headers);
    stripHopByHopHeaders(responseHeaders);
    for (const header of ["content-encoding", "content-length", "set-cookie"]) {
      responseHeaders.delete(header);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "Approved MCP target unavailable" }, { status: 502 });
  }
}

const DEFAULT_PEGA_AI_PROXY_URL = "http://10.176.2.139:4714";
const PEGA_AI_PROXY_PREFIX = "/mcp/inspector/api/pegaai/";
const PEGA_AI_MODEL_STATUS_PATH = "/maas/api/v1/model-status/public/models";

export function parsePegaAiProxyUrl(value: string | undefined): URL {
  const rawUrl = value?.trim() || DEFAULT_PEGA_AI_PROXY_URL;
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error(`MCP_INSPECTOR_PEGA_AI_URL contains an invalid URL: ${rawUrl}`);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`MCP_INSPECTOR_PEGA_AI_URL must use HTTP(S): ${rawUrl}`);
  }
  if (target.username || target.password) {
    throw new Error(`MCP_INSPECTOR_PEGA_AI_URL must not contain credentials: ${rawUrl}`);
  }
  if (target.pathname !== "/" || target.search || target.hash) {
    throw new Error(`MCP_INSPECTOR_PEGA_AI_URL must be an origin without a path, query, or fragment: ${rawUrl}`);
  }
  return target;
}

export async function proxyPegaAiRequest(
  request: Request,
  upstreamBaseUrl: URL,
): Promise<Response | undefined> {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith(PEGA_AI_PROXY_PREFIX)) return;

  const relativePath = `/${requestUrl.pathname.slice(PEGA_AI_PROXY_PREFIX.length)}`;
  const segments = relativePath.split("/");
  if (
    relativePath.includes("%") ||
    relativePath.includes("\\") ||
    relativePath.includes("//") ||
    segments.includes(".") ||
    segments.includes("..")
  ) return;
  if (
    !relativePath.startsWith("/v1/") &&
    relativePath !== PEGA_AI_MODEL_STATUS_PATH
  ) return;

  const target = new URL(relativePath, upstreamBaseUrl);
  if (target.origin !== upstreamBaseUrl.origin || target.pathname !== relativePath) {
    return;
  }
  target.search = requestUrl.search;
  const headers = new Headers(request.headers);
  stripHopByHopHeaders(headers);
  for (const header of [
    "content-length",
    "cookie",
    "host",
    "origin",
    "referer",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
  ]) headers.delete(header);
  for (const header of Array.from(headers.keys())) {
    if (header.startsWith("sec-fetch-")) headers.delete(header);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "error",
      signal: request.signal,
    });
    const responseHeaders = new Headers(upstream.headers);
    stripHopByHopHeaders(responseHeaders);
    for (const header of [
      "content-encoding",
      "content-length",
      "set-cookie",
    ]) responseHeaders.delete(header);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "PegaAI upstream unavailable" }, { status: 502 });
  }
}

// Boot globals normally injected by mountInspector's embedded HTML document.
const PROCESS_SHIM = "if(typeof window.process===\"undefined\"){window.process={env:{},platform:\"browser\",browser:true," +
  "version:\"v18.0.0\",versions:{node:\"18.0.0\"},cwd:()=>\"/\",nextTick:(fn,...args)=>queueMicrotask(()=>fn(...args))};}";

function alternateLoopbackOrigin(origin: string): string | null {
  const url = new URL(origin);
  const host = url.hostname === "localhost" ? "127.0.0.1"
    : url.hostname === "127.0.0.1" || url.hostname === "[::1]" ? "localhost" : undefined;
  if (!host) return null;
  url.hostname = host;
  return url.origin;
}

export function inspectorDocument(html: string, origin: string): string {
  const globals = {
    __MCP_BASE_PATH__: "/mcp",
    __MCP_DEV_MODE__: true,
    __MCP_SANDBOX_ORIGIN__: alternateLoopbackOrigin(origin),
    __MCP_PROXY_URL__: `${INSPECTOR_PATH}/api/proxy`,
    __MCP_INSPECTOR_MODE__: "embedded",
    __INSPECTOR_VERSION__: "20.3.33",
    __MCP_USE_ANONYMIZED_TELEMETRY__: false,
  };
  const assignments = Object.entries(globals)
    .map(([name, value]) => `window.${name}=${JSON.stringify(value).replace(/</g, "\\u003c")};`).join("");
  const head = [
    '<link rel="icon" type="image/svg+xml" href="/mcp-use/favicon-black.svg" />',
    `<script>${assignments}try{localStorage.setItem("MCP_USE_ANONYMIZED_TELEMETRY","false");}catch(e){}${PROCESS_SHIM}</script>`,
  ].join("\n    ");
  return html
    .replace(/<title>[^<]*<\/title>/, "<title>Inspector</title>")
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="MCP Inspector Console: the mcp-use Inspector with Official Inspector workflows" />')
    .replace("</head>", `  ${head}\n  </head>`);
}

export function mcpUseInspector(): Plugin {
  const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
  if (existsSync(envPath)) loadEnvFile(envPath);
  const maxBytes = Number.parseInt(process.env.GATEWAY_MAX_REQUEST_BYTES ?? "1048576", 10);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("GATEWAY_MAX_REQUEST_BYTES must be a positive integer");
  }

  process.env.MCP_USE_ANONYMIZED_TELEMETRY = "false";
  const localRelay = createLocalRelay();
  const approvedMcpTargets = parseApprovedMcpTargets(process.env.MCP_INSPECTOR_ALLOWED_TARGETS);
  const pegaAiProxyUrl = parsePegaAiProxyUrl(process.env.MCP_INSPECTOR_PEGA_AI_URL);
  let accounts: AccountService | undefined;
  try {
    const config = readAccountConfig(process.env);
    accounts = new AccountService(config, new AccountStore(config.databaseUrl, config.encryptionKey));
  } catch {
    console.warn("Inspector accounts are unavailable: configure DATABASE_URL, MCP_INSPECTOR_ENCRYPTION_KEY and ADMIN_* on the server.");
  }
  const approvedProviderOrigins = new Set([
    pegaAiProxyUrl.origin, "http://localhost:11434", "http://127.0.0.1:11434",
    ...(process.env.MCP_INSPECTOR_PROVIDER_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean).map(value => {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
          url.pathname !== "/" || url.search || url.hash) throw new Error("MCP_INSPECTOR_PROVIDER_ORIGINS must contain HTTP(S) origins without credentials");
      return url.origin;
    }),
  ]);
  const inspector = mountInspector({
    basePath: "/mcp",
    autoConnectUrl: null,
    oauthProxyAllowLoopback: true,
  });
  const listener = getRequestListener(async (request) => {
    if (new URL(request.url).pathname.startsWith(`${INSPECTOR_PATH}/api/`)) {
      const bounded = await boundedRequest(request, maxBytes);
      if (bounded instanceof Response) return bounded;
      if (new URL(request.url).pathname.startsWith(ACCOUNT_PATH)) {
        if (!accounts) return Response.json({ error: "Inspector accounts are not configured on this server" }, { status: 503 });
        const relayed = await relayProviderRequest(bounded, accounts, approvedProviderOrigins, pegaAiProxyUrl);
        return relayed ?? (await accounts.handle(bounded)) ?? new Response("Not found", { status: 404 });
      }
      if (/^\/mcp\/inspector\/api\/local(?:\/|$)/.test(new URL(request.url).pathname)) {
        return localRelay.handle(bounded);
      }
      const pegaAiProxyResponse = await proxyPegaAiRequest(bounded, pegaAiProxyUrl);
      if (pegaAiProxyResponse) return pegaAiProxyResponse;
      const approvedProxyResponse = await proxyApprovedMcpRequest(bounded, approvedMcpTargets);
      if (approvedProxyResponse) return approvedProxyResponse;
      return inspector(bounded);
    }
    return inspector(request);
  }, {
    overrideGlobalObjects: false,
    errorHandler(error) {
      console.error("Inspector request failed:", error);
      return new Response("Inspector request failed", { status: 500 });
    },
  });

  function configure(server: ViteDevServer | PreviewServer) {
    server.httpServer?.once("close", () => {
      void localRelay.close().catch((error) => console.error("Local MCP cleanup failed:", error));
      void accounts?.close().catch(() => console.error("Inspector account database cleanup failed"));
    });
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/" && request.method === "GET") {
        response.writeHead(302, { Location: `${INSPECTOR_PATH}${url.search}` });
        response.end();
        return;
      }
      if (url.pathname !== INSPECTOR_PATH && !url.pathname.startsWith(`${INSPECTOR_PATH}/`)) {
        next();
        return;
      }

      const origin = requestOrigin(request, server);
      if (!origin || (
        url.pathname.startsWith(`${INSPECTOR_PATH}/api/`) &&
        !isSameOriginApiRequest(request, origin)
      )) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Inspector requests must come from this local origin");
        return;
      }
      const uiRoute = /^\/mcp\/inspector(?:\/(?:sign-in|oauth\/callback|auth\/callback|preview\/[^/]+))?\/?$/.test(url.pathname);
      if (uiRoute && (request.method === "GET" || request.method === "HEAD")) {
        const preview = !("transformIndexHtml" in server);
        const path = fileURLToPath(new URL(preview ? "./dist/index.html" : "./index.html", import.meta.url));
        void readFile(path, "utf8").then(async (html) => {
          const output = inspectorDocument(preview ? html : await server.transformIndexHtml(INSPECTOR_PATH, html), origin);
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          response.end(request.method === "HEAD" ? undefined : output);
        }).catch(next);
        return;
      }
      void listener(request, response).catch(next);
    });
  }

  return {
    name: "mcp-use-inspector",
    configureServer: configure,
    configurePreviewServer: configure,
    closeBundle: async () => { await localRelay.close(); await accounts?.close(); },
  };
}
