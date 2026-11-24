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
});
