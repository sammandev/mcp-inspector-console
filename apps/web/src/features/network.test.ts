import { afterEach, describe, expect, it, vi } from "vitest";
import { networkStore, recordingFetch } from "./network.js";

afterEach(() => { networkStore.setLimit(256); networkStore.clear(); vi.unstubAllGlobals(); });

describe("network log", () => {
  it("keeps only the configured number of most recent entries", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok"));
    const serverUrl = "http://h/mcp";
    networkStore.setLimit(2);
    const requestPaths = () => networkStore.snapshot().map(({ requestHeaders }) =>
      requestHeaders && typeof requestHeaders === "object" && "x-request-path" in requestHeaders
        ? requestHeaders["x-request-path"]
        : undefined);
    for (const path of ["a", "b", "c"]) {
      await recordingFetch("http://localhost/proxy", {
        headers: { "X-Target-URL": serverUrl, "X-Request-Path": path },
      });
    }
    expect(requestPaths()).toEqual(["b", "c"]);
    networkStore.setLimit(1);
    expect(requestPaths()).toEqual(["c"]);
    expect(() => networkStore.setLimit(0)).toThrow(/between/);
  });

  it("keeps limits and clearing scoped to the selected server URL", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok"));
    const firstServer = "http://first.test/mcp";
    const secondServer = "http://second.test/mcp";
    const record = (url: string) => recordingFetch("http://localhost/proxy", {
      headers: { "X-Target-URL": url },
    });

    networkStore.setLimit(2, firstServer);
    networkStore.setLimit(3, secondServer);
    for (let index = 0; index < 3; index += 1) {
      await record(firstServer);
      await record(secondServer);
    }

    expect(networkStore.snapshot().filter((entry) => entry.url === firstServer)).toHaveLength(2);
    expect(networkStore.snapshot().filter((entry) => entry.url === secondServer)).toHaveLength(3);

    networkStore.setLimit(1, firstServer);
    expect(networkStore.snapshot().filter((entry) => entry.url === firstServer)).toHaveLength(1);
    expect(networkStore.snapshot().filter((entry) => entry.url === secondServer)).toHaveLength(3);

    networkStore.clear(firstServer);
    expect(networkStore.snapshot().filter((entry) => entry.url === firstServer)).toHaveLength(0);
    expect(networkStore.snapshot().filter((entry) => entry.url === secondServer)).toHaveLength(3);
  });

  it("records redacted request and response bodies once the caller reads the response", async () => {
    vi.stubGlobal("fetch", async () => new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { access_token: "leak", ok: true } }),
      { status: 200, statusText: "OK", headers: { "content-type": "application/json", "mcp-session-id": "abc" } },
    ));
    const response = await recordingFetch("http://localhost/proxy", {
      method: "POST",
      headers: { "X-Target-URL": "http://h/mcp", Authorization: "Bearer fixture-secret", "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { password: "hunter2" } } }),
    });

    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { access_token: "leak", ok: true } });
    const [entry] = networkStore.snapshot();
    expect(entry).toMatchObject({ method: "POST", status: 200, statusText: "OK", url: "http://h/mcp" });
    expect(entry.requestHeaders).toMatchObject({ authorization: "[redacted]", "mcp-protocol-version": "2025-11-25" });
    expect(entry.responseHeaders).toMatchObject({ "mcp-session-id": "abc" });
    expect(JSON.parse(entry.requestBody!)).toMatchObject({ method: "tools/call", params: { arguments: { password: "[redacted]" } } });
    expect(JSON.parse(entry.responseBody!)).toEqual({ jsonrpc: "2.0", id: 1, result: { access_token: "[redacted]", ok: true } });
    expect(entry.responseBodyTruncated).toBeFalsy();
  });

  it("tracks server-sent event streams without buffering past the cap and stops when the caller cancels", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"api_key":"k"}}\n\n'));
        controller.enqueue(encoder.encode('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n'));
      },
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "text/event-stream" } }));

    const response = await recordingFetch("http://localhost/proxy", { method: "GET", headers: { "X-Target-URL": "http://h/mcp" } });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();

    const [entry] = networkStore.snapshot();
    expect(cancelled).toBe(true);
    expect(entry.stream).toMatchObject({ events: 2 });
    expect(entry.stream?.closedAt).toEqual(expect.any(String));
    expect(entry.responseBody).toContain('"api_key":"[redacted]"');
    expect(entry.responseBody).not.toContain('"k"');
  });

  it("caps captured bodies and marks them as truncated", async () => {
    vi.stubGlobal("fetch", async () => new Response("x".repeat(70_000)));
    const response = await recordingFetch("http://localhost/proxy", { headers: { "X-Target-URL": "http://h/mcp" } });
    expect((await response.text()).length).toBe(70_000);
    const [entry] = networkStore.snapshot();
    expect(entry.responseBody!.length).toBe(64 * 1024);
    expect(entry.responseBodyTruncated).toBe(true);
  });

  it("records an empty body for responses without one", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 202, statusText: "Accepted" }));
    await recordingFetch("http://localhost/proxy", { method: "POST", headers: { "X-Target-URL": "http://h/mcp" }, body: "{}" });
    expect(networkStore.snapshot()[0]).toMatchObject({ status: 202, responseBody: "" });
  });
});
