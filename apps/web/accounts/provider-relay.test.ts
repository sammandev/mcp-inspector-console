import { describe, expect, it } from "vitest";
import { providerTarget } from "./provider-relay.js";
import type { SavedProvider } from "./contracts.js";
const setting: SavedProvider = { id: "fixture", provider: "openai-compatible", model: "fixture", baseUrl: "http://localhost:4714/v1", apiKey: "fixture-key" };
describe("account provider target policy", () => {
  it("preserves the configured endpoint and allows only provider method paths", () => {
    expect(providerTarget(setting, "chat/completions", new Set(["http://localhost:4714"]), new URL("http://localhost:4714")).href)
      .toBe("http://localhost:4714/v1/chat/completions");
    expect(() => providerTarget(setting, "../other", new Set(["http://localhost:4714"]), new URL("http://localhost:4714"))).toThrow();
    expect(() => providerTarget(setting, "admin/keys", new Set(["http://localhost:4714"]), new URL("http://localhost:4714"))).toThrow();
  });
  it("does not allow a stored key to be forwarded to an unapproved custom origin", () => {
    expect(() => providerTarget({ ...setting, baseUrl: "https://attacker.example/v1" }, "models", new Set(), new URL("http://localhost:4714"))).toThrow();
  });
  it("maps the existing PegaAI same-origin configuration to the server-only upstream", () => {
    expect(providerTarget({ ...setting, baseUrl: "/mcp/inspector/api/pegaai/v1" }, "chat/completions",
      new Set(), new URL("http://localhost:4714")).href).toBe("http://localhost:4714/v1/chat/completions");
  });
});
