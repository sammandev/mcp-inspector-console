import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

type ProxyApprovedMcpRequest = (
  request: Request,
  allowedTargets: ReadonlySet<string>,
) => Promise<Response | undefined>;

describe("approved MCP proxy targets", () => {
  it("forwards an explicitly allowed target without browser-only headers", async () => {
    let receivedHeaders: IncomingHttpHeaders | undefined;
    let receivedBody = "";
    const targetServer = createServer(async (request, response) => {
      receivedHeaders = request.headers;
      for await (const chunk of request) receivedBody += chunk.toString();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }));
    });

    await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = targetServer.address() as AddressInfo;
      const targetUrl = `http://127.0.0.1:${address.port}/mcp`;
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
      const request = new Request("http://localhost:5173/mcp/inspector/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          Origin: "http://localhost:5173",
          Referer: "http://localhost:5173/mcp/inspector",
          "X-Target-URL": targetUrl,
        },
        body,
      });
      const module = await import("./inspector-server.js") as unknown as {
        proxyApprovedMcpRequest: ProxyApprovedMcpRequest;
      };

      const response = await module.proxyApprovedMcpRequest(request, new Set([targetUrl]));

      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
      expect(receivedBody).toBe(body);
      expect(receivedHeaders?.["mcp-protocol-version"]).toBe("2025-06-18");
      expect(receivedHeaders?.origin).toBeUndefined();
      expect(receivedHeaders?.referer).toBeUndefined();
      expect(receivedHeaders?.["x-target-url"]).toBeUndefined();
    } finally {
      await new Promise<void>((resolve, reject) => {
        targetServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("parses exact targets from explicit proxy configuration", async () => {
    const module = await import("./inspector-server.js") as unknown as {
      parseApprovedMcpTargets: (value: string | undefined) => ReadonlySet<string>;
    };

    expect(module.parseApprovedMcpTargets(" http://10.176.2.139:39064/mcp,https://example.test/mcp "))
      .toEqual(new Set(["http://10.176.2.139:39064/mcp", "https://example.test/mcp"]));
    expect(() => module.parseApprovedMcpTargets("file:///tmp/mcp")).toThrow(/http/i);
  });
});

describe("shared deployment origins", () => {
  const publicOrigin = "https://10.176.2.139:7000";
  const incoming = (host: string, remoteAddress = "127.0.0.1", headers: IncomingHttpHeaders = {}) =>
    ({ socket: { remoteAddress }, headers: { host, ...headers } }) as unknown as IncomingMessage;

  it("identifies same-origin API calls from Fetch Metadata, Origin, or a plain-HTTP Referer", async () => {
    const { isSameOriginBrowserRequest } = await import("./same-origin-request.js");
    const origin = "http://10.176.2.139:7000";

    expect(isSameOriginBrowserRequest(origin, { fetchSite: "same-origin" })).toBe(true);
    expect(isSameOriginBrowserRequest(origin, { origin })).toBe(true);
    expect(isSameOriginBrowserRequest(origin, { referer: `${origin}/mcp/inspector?tab=tools` })).toBe(true);
    expect(isSameOriginBrowserRequest(origin, {})).toBe(false);
    expect(isSameOriginBrowserRequest(origin, { referer: "http://attacker.example/" })).toBe(false);
    expect(isSameOriginBrowserRequest(origin, { referer: "not a url" })).toBe(false);
    expect(isSameOriginBrowserRequest(origin, { origin: "null", referer: `${origin}/` })).toBe(false);
    expect(isSameOriginBrowserRequest(origin, { fetchSite: "cross-site", referer: `${origin}/` })).toBe(false);
    expect(isSameOriginBrowserRequest(origin, { origin: "http://attacker.example", fetchSite: "same-origin" })).toBe(false);
  });

  it("accepts a plain-HTTP public origin forwarded by the edge", async () => {
    const { parsePublicOrigins, requestOrigin } = await import("./inspector-server.js");
    const origins = parsePublicOrigins("http://10.176.2.139:7000");

    expect(requestOrigin(incoming("10.176.2.139:7000", "127.0.0.1", { "x-forwarded-proto": "http" }), 27001, origins))
      .toEqual({ origin: "http://10.176.2.139:7000", remote: true });
    expect(requestOrigin(incoming("10.176.2.139:7000", "10.0.0.5"), 27001, origins)).toBeUndefined();
  });

  it("accepts the configured public origin only from the loopback edge with its forwarded scheme", async () => {
    const { parsePublicOrigins, requestOrigin } = await import("./inspector-server.js");
    const origins = parsePublicOrigins(` ${publicOrigin}/ `);

    expect(requestOrigin(incoming("10.176.2.139:7000", "127.0.0.1", { "x-forwarded-proto": "https" }), 27001, origins))
      .toEqual({ origin: publicOrigin, remote: true });
    expect(requestOrigin(incoming("10.176.2.139:7000", "10.0.0.5", { "x-forwarded-proto": "https" }), 27001, origins))
      .toBeUndefined();
    expect(requestOrigin(incoming("10.176.2.139:7000"), 27001, origins)).toBeUndefined();
    expect(requestOrigin(incoming("attacker.example", "127.0.0.1", { "x-forwarded-proto": "https" }), 27001, origins))
      .toBeUndefined();
  });

  it("keeps loopback-only behavior and rejects non-origin public settings", async () => {
    const { parsePublicOrigins, requestOrigin } = await import("./inspector-server.js");

    expect(requestOrigin(incoming("127.0.0.1:27001"), 27001, parsePublicOrigins(publicOrigin)))
      .toEqual({ origin: "http://127.0.0.1:27001", remote: false });
    expect(requestOrigin(incoming("127.0.0.1:7000"), 27001)).toBeUndefined();
    expect(requestOrigin(incoming("10.176.2.139:7000"), 27001)).toBeUndefined();
    for (const value of ["http://localhost:7000", "https://10.176.2.139:7000/path", "https://user:pw@host", "ftp://host"]) {
      expect(() => parsePublicOrigins(value)).toThrow(/MCP_INSPECTOR_PUBLIC_ORIGINS/);
    }
  });

  it("refuses the stdio relay only for shared-deployment requests", async () => {
    const { remoteLocalRelayRequest } = await import("./inspector-server.js");

    expect(remoteLocalRelayRequest("/mcp/inspector/api/local/sessions", { origin: publicOrigin, remote: true })).toBe(true);
    expect(remoteLocalRelayRequest("/mcp/inspector/api/local", { origin: publicOrigin, remote: true })).toBe(true);
    expect(remoteLocalRelayRequest("/mcp/inspector/api/proxy", { origin: publicOrigin, remote: true })).toBe(false);
    expect(remoteLocalRelayRequest("/mcp/inspector/api/local", { origin: "http://127.0.0.1:4173", remote: false })).toBe(false);
  });
});

type ProxyPegaAiRequest = (
  request: Request,
  upstreamBaseUrl: URL,
) => Promise<Response | undefined>;

describe("PegaAI same-origin adapter", () => {
  it("forwards approved PegaAI chat requests and streams without browser headers", async () => {
    let receivedHeaders: IncomingHttpHeaders | undefined;
    let receivedUrl: string | undefined;
    let receivedBody = "";
    let finishUpstream: (() => void) | undefined;
    const targetServer = createServer(async (request, response) => {
      receivedHeaders = request.headers;
      receivedUrl = request.url;
      for await (const chunk of request) receivedBody += chunk.toString();
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write("data: first\n\n");
      finishUpstream = () => response.end("data: second\n\n");
    });

    await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = targetServer.address() as AddressInfo;
      const upstream = new URL(`http://127.0.0.1:${address.port}`);
      const body = JSON.stringify({ model: "Pega-Chat", messages: [{ role: "user", content: "hello" }], stream: true });
      const request = new Request("http://localhost:5173/mcp/inspector/api/pegaai/v1/chat/completions?stream=true", {
        method: "POST",
        headers: {
          Authorization: "Bearer pega-user-key",
          "Content-Type": "application/json",
          Cookie: "session=secret",
          Origin: "http://localhost:5173",
          Referer: "http://localhost:5173/mcp/inspector?tab=chat",
          "Sec-Fetch-Site": "same-origin",
          Connection: "x-sensitive-hop, keep-alive",
          "Keep-Alive": "timeout=5",
          "Proxy-Authorization": "Basic leaked-proxy-key",
          TE: "trailers",
          Trailer: "X-Checksum",
          Upgrade: "websocket",
          "X-Sensitive-Hop": "secret-hop-value",
        },
        body,
      });
      const module = await import("./inspector-server.js") as unknown as {
        proxyPegaAiRequest: ProxyPegaAiRequest;
      };

      const response = await module.proxyPegaAiRequest(request, upstream);
      const reader = response?.body?.getReader();
      const firstChunk = reader ? await reader.read() : undefined;

      expect(response?.status).toBe(200);
      expect(response?.headers.get("content-type")).toContain("text/event-stream");
      expect(new TextDecoder().decode(firstChunk?.value)).toBe("data: first\n\n");
      expect(receivedUrl).toBe("/v1/chat/completions?stream=true");
      expect(receivedBody).toBe(body);
      expect(receivedHeaders?.authorization).toBe("Bearer pega-user-key");
      expect(receivedHeaders?.origin).toBeUndefined();
      expect(receivedHeaders?.referer).toBeUndefined();
      expect(receivedHeaders?.cookie).toBeUndefined();
      expect(receivedHeaders?.["sec-fetch-site"]).toBeUndefined();
      expect(receivedHeaders?.["proxy-authorization"]).toBeUndefined();
      expect(receivedHeaders?.te).toBeUndefined();
      expect(receivedHeaders?.trailer).toBeUndefined();
      expect(receivedHeaders?.upgrade).toBeUndefined();
      expect(receivedHeaders?.["keep-alive"]).toBeUndefined();
      expect(receivedHeaders?.["x-sensitive-hop"]).toBeUndefined();

      finishUpstream?.();
      const rest = [];
      while (reader) {
        const chunk = await reader.read();
        if (chunk.done) break;
        rest.push(new TextDecoder().decode(chunk.value));
      }
      expect(rest.join("")).toBe("data: second\n\n");
    } finally {
      finishUpstream?.();
      await new Promise<void>((resolve, reject) => {
        targetServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("forwards the public model-status path and ignores unrelated paths", async () => {
    const received: string[] = [];
    const targetServer = createServer((request, response) => {
      received.push(request.url ?? "");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ online: [] }));
    });

    await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = targetServer.address() as AddressInfo;
      const upstream = new URL(`http://127.0.0.1:${address.port}`);
      const module = await import("./inspector-server.js") as unknown as {
        parsePegaAiProxyUrl: (value: string | undefined) => URL;
        proxyPegaAiRequest: ProxyPegaAiRequest;
      };
      const allowed = new Request("http://localhost:5173/mcp/inspector/api/pegaai/maas/api/v1/model-status/public/models?scope=public");
      const ignored = new Request("http://localhost:5173/mcp/inspector/api/pegaai/not-allowed");

      expect(module.parsePegaAiProxyUrl(undefined).href).toBe("http://10.176.2.139:4714/");
      expect(() => module.parsePegaAiProxyUrl("file:///tmp/pegaai")).toThrow(/http/i);
      expect(() => module.parsePegaAiProxyUrl("http://user:secret@example.test")).toThrow(/credentials/i);
      expect(await module.proxyPegaAiRequest(ignored, upstream)).toBeUndefined();
      expect(await module.proxyPegaAiRequest(
        new Request("http://localhost:5173/mcp/inspector/api/pegaai/v1/%2Fmodels"),
        upstream,
      )).toBeUndefined();
      expect(await module.proxyPegaAiRequest(
        new Request("http://localhost:5173/mcp/inspector/api/pegaai/v1/%5Cmodels"),
        upstream,
      )).toBeUndefined();
      const response = await module.proxyPegaAiRequest(allowed, upstream);
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ online: [] });
      expect(received).toEqual(["/maas/api/v1/model-status/public/models?scope=public"]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        targetServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("removes compression metadata from decompressed upstream responses", async () => {
    const payload = JSON.stringify({ data: [{ id: "Pega-Chat" }] });
    const targetServer = createServer((_request, response) => {
      const compressed = gzipSync(payload);
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Content-Length": compressed.byteLength,
      });
      response.end(compressed);
    });
    await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = targetServer.address() as AddressInfo;
      const module = await import("./inspector-server.js") as unknown as {
        proxyPegaAiRequest: ProxyPegaAiRequest;
      };
      const response = await module.proxyPegaAiRequest(
        new Request("http://localhost:5173/mcp/inspector/api/pegaai/v1/models"),
        new URL(`http://127.0.0.1:${address.port}`),
      );

      expect(response?.status).toBe(200);
      expect(response?.headers.get("content-encoding")).toBeNull();
      expect(response?.headers.get("content-length")).toBeNull();
      expect(await response?.json()).toEqual({ data: [{ id: "Pega-Chat" }] });
    } finally {
      await new Promise<void>((resolve, reject) => {
        targetServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  for (const hookName of ["configureServer", "configurePreviewServer"] as const) {
    it(`wires ${hookName} through the same-origin PegaAI adapter`, async () => {
      let upstreamRequests = 0;
      let upstreamOrigin: string | undefined;
      const targetServer = createServer((request, response) => {
        upstreamRequests += 1;
        upstreamOrigin = request.headers.origin;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ data: [{ id: "Pega-Chat" }] }));
      });
      await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));

      let middleware: ((
        request: IncomingMessage,
        response: ServerResponse,
        next: () => void,
      ) => void) | undefined;
      const appServer = createServer((request, response) => {
        middleware?.(request, response, () => {
          response.writeHead(404);
          response.end();
        });
      });
      const previousProxyUrl = process.env.MCP_INSPECTOR_PEGA_AI_URL;
      try {
        const targetAddress = targetServer.address() as AddressInfo;
        process.env.MCP_INSPECTOR_PEGA_AI_URL = `http://127.0.0.1:${targetAddress.port}`;
        const module = await import("./inspector-server.js") as unknown as {
          mcpUseInspector: () => Record<string, unknown>;
        };
        const plugin = module.mcpUseInspector();
        const configure = plugin[hookName] as (server: unknown) => void;
        configure({
          httpServer: appServer,
          middlewares: {
            use(handler: typeof middleware) {
              middleware = handler;
            },
          },
        });
        await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));

        const appAddress = appServer.address() as AddressInfo;
        const origin = `http://127.0.0.1:${appAddress.port}`;
        const url = `${origin}/mcp/inspector/api/pegaai/v1/models`;
        const allowed = await fetch(url, {
          headers: {
            Authorization: "Bearer middleware-key",
            Origin: origin,
          },
        });
        const denied = await fetch(url, {
          headers: { Origin: `http://localhost:${appAddress.port}` },
        });

        expect(allowed.status).toBe(200);
        expect(await allowed.json()).toEqual({ data: [{ id: "Pega-Chat" }] });
        expect(denied.status).toBe(403);
        expect(upstreamRequests).toBe(1);
        expect(upstreamOrigin).toBeUndefined();
      } finally {
        if (previousProxyUrl === undefined) delete process.env.MCP_INSPECTOR_PEGA_AI_URL;
        else process.env.MCP_INSPECTOR_PEGA_AI_URL = previousProxyUrl;
        await new Promise<void>((resolve) => appServer.close(() => resolve()));
        await new Promise<void>((resolve) => targetServer.close(() => resolve()));
      }
    });
  }

  it("does not replay the bearer key to redirects", async () => {
    let redirectedRequests = 0;
    const redirectTarget = createServer((_request, response) => {
      redirectedRequests += 1;
      response.end("secret destination");
    });
    await new Promise<void>((resolve) => redirectTarget.listen(0, "127.0.0.1", resolve));
    const redirectAddress = redirectTarget.address() as AddressInfo;
    const redirectServer = createServer((_request, response) => {
      response.writeHead(302, { Location: `http://127.0.0.1:${redirectAddress.port}/stolen` });
      response.end();
    });
    await new Promise<void>((resolve) => redirectServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = redirectServer.address() as AddressInfo;
      const module = await import("./inspector-server.js") as unknown as {
        proxyPegaAiRequest: ProxyPegaAiRequest;
      };
      const response = await module.proxyPegaAiRequest(
        new Request("http://localhost:5173/mcp/inspector/api/pegaai/v1/models", {
          headers: { Authorization: "Bearer pega-user-key" },
        }),
        new URL(`http://127.0.0.1:${address.port}`),
      );

      expect(response?.status).toBe(502);
      expect(redirectedRequests).toBe(0);
    } finally {
      await Promise.all([
        new Promise<void>((resolve, reject) => redirectServer.close((error) => error ? reject(error) : resolve())),
        new Promise<void>((resolve, reject) => redirectTarget.close((error) => error ? reject(error) : resolve())),
      ]);
    }
  });
});
