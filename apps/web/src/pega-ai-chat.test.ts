// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173"}
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigurationDialog } from "../vendor/mcp-use/client/components/chat/ConfigurationDialog.js";
import {
  PEGA_AI_BASE_URL,
  PEGA_AI_DEFAULT_MODEL,
  fetchPegaAiModelOptions,
  isPegaAiBaseUrl,
  parsePegaAiModelOptions,
} from "../vendor/mcp-use/client/components/chat/pegaAi.js";
import {
  DEFAULT_MODELS,
  getDefaultBaseUrl,
  providerRequiresApiKey,
} from "../vendor/mcp-use/client/components/chat/types.js";
import { useConfig } from "../vendor/mcp-use/client/components/chat/useConfig.js";
import {
  InspectorProvider,
  useInspector,
} from "../vendor/mcp-use/client/context/InspectorContext.js";
import { ThemeProvider } from "../vendor/mcp-use/client/context/ThemeContext.js";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const healthyPegaModel = {
  model_id: "Qwen/Qwen3.8-27B",
  name: "Qwen3.8-27B",
  aliases: ["Pega-Chat"],
  status: "online",
  health_status: "running",
  api_endpoint: "https://aicc-gateway.pegatroncorp.com/pegaai/v1",
  model_type: "llm",
  modalities: {
    input: ["text", "image"],
    output: ["text"],
  },
};

describe("PegaAI model catalog", () => {
  it("keeps only online healthy text models routed through the generic PegaAI API", () => {
    const options = parsePegaAiModelOptions({
      online: [
        healthyPegaModel,
        { ...healthyPegaModel, model_id: "", name: "Missing ID" },
        { ...healthyPegaModel, model_id: "degraded", health_status: "degraded" },
        {
          ...healthyPegaModel,
          model_id: "tts-model",
          model_type: "tts",
          modalities: { input: ["text"], output: ["audio"] },
        },
        {
          ...healthyPegaModel,
          model_id: "deployment-model",
          api_endpoint: "https://aicc-gateway.pegatroncorp.com/tpe/deployment/v1",
        },
        {
          ...healthyPegaModel,
          model_id: "credentialed-endpoint",
          api_endpoint: "https://user:secret@aicc-gateway.pegatroncorp.com/pegaai/v1",
        },
        {
          ...healthyPegaModel,
          model_id: "query-endpoint",
          api_endpoint: "https://aicc-gateway.pegatroncorp.com/pegaai/v1?tenant=other",
        },
        {
          ...healthyPegaModel,
          model_id: "file-endpoint",
          api_endpoint: "file:///pegaai/v1",
        },
      ],
      offline: [{ ...healthyPegaModel, model_id: "offline-model" }],
    });

    expect(options).toEqual([
      {
        id: "Qwen/Qwen3.8-27B",
        displayName: "Qwen3.8-27B",
        aliases: ["Pega-Chat"],
      },
    ]);
    expect(parsePegaAiModelOptions({ online: "not-an-array" })).toEqual([]);
  });

  it("falls back to authenticated OpenAI model discovery when status is unavailable", async () => {
    const calls: Array<{
      url: string;
      authorization: string | null;
      redirect: RequestRedirect | undefined;
    }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        authorization: headers.get("authorization"),
        redirect: init?.redirect,
      });
      if (url.endsWith("/maas/api/v1/model-status/public/models")) {
        return new Response("status unavailable", { status: 502, statusText: "Bad Gateway" });
      }
      return Response.json({ data: [{ id: "Pega-Chat" }] });
    }) as unknown as typeof fetch;

    const options = await fetchPegaAiModelOptions(
      PEGA_AI_BASE_URL,
      "pega-user-key",
      fetcher,
    );

    expect(options).toEqual([{ id: "Pega-Chat" }]);
    expect(calls).toEqual([
      {
        url: `${PEGA_AI_BASE_URL.replace(/\/v1$/, "")}/maas/api/v1/model-status/public/models`,
        authorization: "Bearer pega-user-key",
        redirect: "error",
      },
      {
        url: `${PEGA_AI_BASE_URL}/models`,
        authorization: "Bearer pega-user-key",
        redirect: "error",
      },
    ]);
    expect(PEGA_AI_DEFAULT_MODEL).toBe("Pega-Chat");
  });
});

describe("PegaAI chat defaults", () => {
  it("does not seed Manufact hosted chat or free-tier upgrade defaults", () => {
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(InspectorProvider, null, children);
    const { result } = renderHook(() => useInspector(), { wrapper });

    expect(result.current.embeddedConfig.chatApiUrl).toBeUndefined();
    expect(result.current.embeddedConfig.chatEnableFreeTierUpgrade).toBe(false);

    act(() => result.current.setEmbeddedMode(true));
    expect(result.current.embeddedConfig.chatApiUrl).toBeUndefined();
    expect(result.current.embeddedConfig.chatEnableFreeTierUpgrade).toBe(false);
  });

  it("starts unsaved chat on PegaAI and requires a key only for the PegaAI route", () => {
    const { result } = renderHook(() => useConfig({ mcpServerUrl: "http://localhost:39064/mcp" }));
    const requiresApiKey = providerRequiresApiKey as (
      provider: "openai-compatible",
      baseUrl?: string,
    ) => boolean;

    expect(result.current.tempProvider).toBe("openai-compatible");
    expect(result.current.tempBaseUrl).toBe(PEGA_AI_BASE_URL);
    expect(result.current.tempModel).toBe(PEGA_AI_DEFAULT_MODEL);
    expect(DEFAULT_MODELS["openai-compatible"]).toBe(PEGA_AI_DEFAULT_MODEL);
    expect(getDefaultBaseUrl("openai-compatible")).toBe(PEGA_AI_BASE_URL);
    expect(requiresApiKey("openai-compatible", PEGA_AI_BASE_URL)).toBe(true);
    expect(requiresApiKey("openai-compatible", "http://localhost:11434/v1")).toBe(false);
    expect(isPegaAiBaseUrl(`http://localhost:5173${PEGA_AI_BASE_URL}`)).toBe(true);
    expect(isPegaAiBaseUrl(`https://untrusted.example${PEGA_AI_BASE_URL}`)).toBe(false);
  });

  it("loads a persisted provider instead of replacing it with PegaAI defaults", async () => {
    localStorage.setItem(
      "mcp-inspector-llm-config",
      JSON.stringify({
        provider: "anthropic",
        model: "claude-test-model",
        apiKey: "legacy-inline-key",
      }),
    );
    localStorage.setItem(
      "mcp-inspector-api-keys",
      JSON.stringify({ anthropic: "legacy-provider-key" }),
    );

    const { result } = renderHook(() => useConfig({ mcpServerUrl: "http://localhost:39064/mcp" }));

    await waitFor(() => expect(result.current.llmConfig?.provider).toBe("anthropic"));
    expect(result.current.llmConfig?.model).toBe("claude-test-model");
    expect(result.current.tempApiKey).toBe("legacy-provider-key");
    expect(result.current.tempModel).toBe("claude-test-model");
    expect(result.current.tempBaseUrl).toBe("");
  });

  it("clears only the key scoped to the active endpoint", () => {
    const customBaseUrl = "https://custom-openai.example/v1";
    localStorage.setItem(
      "mcp-inspector-api-keys",
      JSON.stringify({
        [`openai-compatible:${PEGA_AI_BASE_URL}`]: "pega-key",
        [`openai-compatible:${customBaseUrl}`]: "custom-key",
      }),
    );
    const { result } = renderHook(() => useConfig({ mcpServerUrl: "http://localhost:39064/mcp" }));

    act(() => result.current.setTempBaseUrl(customBaseUrl));
    expect(result.current.tempApiKey).toBe("custom-key");
    act(() => result.current.clearConfig());

    const remainingKeys = JSON.parse(
      localStorage.getItem("mcp-inspector-api-keys") ?? "{}",
    ) as Record<string, string>;
    expect(remainingKeys[`openai-compatible:${customBaseUrl}`]).toBeUndefined();
    expect(remainingKeys[`openai-compatible:${PEGA_AI_BASE_URL}`]).toBe("pega-key");
  });

  it("scopes an OpenAI-compatible key and hydrated form state to its endpoint", () => {
    const customBaseUrl = "https://custom-openai.example/v1";
    localStorage.setItem(
      "mcp-inspector-llm-config",
      JSON.stringify({
        provider: "openai-compatible",
        model: "custom-model",
        apiKey: "custom-key",
        baseUrl: customBaseUrl,
      }),
    );

    const { result } = renderHook(() => useConfig({ mcpServerUrl: "http://localhost:39064/mcp" }));

    expect(result.current.tempProvider).toBe("openai-compatible");
    expect(result.current.tempBaseUrl).toBe(customBaseUrl);
    expect(result.current.tempModel).toBe("custom-model");
    expect(result.current.tempApiKey).toBe("custom-key");

    act(() => result.current.setTempBaseUrl(PEGA_AI_BASE_URL));
    expect(result.current.tempApiKey).toBe("");

    act(() => result.current.setTempApiKey("  pega-user-key  "));
    act(() => {
      expect(result.current.saveLLMConfig()).toBe(true);
    });
    const savedKeys = JSON.parse(
      localStorage.getItem("mcp-inspector-api-keys") ?? "{}",
    ) as Record<string, string>;
    expect(savedKeys["openai-compatible"]).toBeUndefined();
    expect(
      savedKeys[`openai-compatible:${PEGA_AI_BASE_URL}`],
    ).toBe("pega-user-key");
    expect(
      JSON.parse(localStorage.getItem("mcp-inspector-llm-config") ?? "{}"),
    ).toMatchObject({
      apiKey: "pega-user-key",
      model: PEGA_AI_DEFAULT_MODEL,
    });
  });

  it("does not render Manufact onboarding even when legacy free-tier props are supplied", () => {
    render(
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: "openai-compatible",
          tempModel: PEGA_AI_DEFAULT_MODEL,
          tempApiKey: "pega-user-key",
          tempBaseUrl: PEGA_AI_BASE_URL,
          onProviderChange: vi.fn(),
          onModelChange: vi.fn(),
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
          hostedInspector: true,
          freeTierInfo: { onLoginClick: vi.fn() },
        }),
      }),
    );

    expect(screen.queryByTestId("chat-config-sign-in-card")).toBeNull();
    expect(screen.queryByText(/Chat requires an LLM/)).toBeNull();
    expect(screen.queryByText(/Manufact account/)).toBeNull();
  });

  it("disables Save while model discovery is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: "openai-compatible",
          tempModel: PEGA_AI_DEFAULT_MODEL,
          tempApiKey: "pega-user-key",
          tempBaseUrl: PEGA_AI_BASE_URL,
          onProviderChange: vi.fn(),
          onModelChange: vi.fn(),
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
        }),
      }),
    );

    expect(
      (screen.getByTestId("chat-config-save-button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("does not reuse the generic model cache for PegaAI status", async () => {
    const staleModel = {
      ...healthyPegaModel,
      model_id: "stale-model",
      name: "Stale model",
      aliases: ["Pega-Chat"],
    };
    localStorage.setItem(
      "mcp-inspector-models-cache",
      JSON.stringify({
        [`openai-compatible:${PEGA_AI_BASE_URL}`]: {
          models: [{ id: staleModel.model_id, displayName: staleModel.name }],
          timestamp: Date.now(),
        },
      }),
    );
    const fetchMock = vi.fn(async () =>
      Response.json({ online: [healthyPegaModel] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: "openai-compatible",
          tempModel: PEGA_AI_DEFAULT_MODEL,
          tempApiKey: "pega-user-key",
          tempBaseUrl: PEGA_AI_BASE_URL,
          onProviderChange: vi.fn(),
          onModelChange: vi.fn(),
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
        }),
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 2_000 });
    await waitFor(
      () => expect(
        screen.getByTestId("chat-config-model-select").textContent,
      ).toContain("Qwen3.8-27B"),
      { timeout: 2_000 },
    );
  });

  it("ignores a model response started with an older API key", async () => {
    let resolveOld: ((response: Response) => void) | undefined;
    const oldModel = {
      ...healthyPegaModel,
      model_id: "old-model",
      name: "Old model",
    };
    const newModel = {
      ...healthyPegaModel,
      model_id: "new-model",
      name: "New model",
    };
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization === "Bearer old-key") {
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      }
      return Response.json({ online: [newModel] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const dialog = (apiKey: string) =>
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: "openai-compatible",
          tempModel: PEGA_AI_DEFAULT_MODEL,
          tempApiKey: apiKey,
          tempBaseUrl: PEGA_AI_BASE_URL,
          onProviderChange: vi.fn(),
          onModelChange: vi.fn(),
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
        }),
      });
    const { rerender } = render(dialog("old-key"));

    await waitFor(
      () => expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: "Bearer old-key" },
        }),
      ),
      { timeout: 2_000 },
    );
    rerender(dialog("new-key"));
    await waitFor(
      () => expect(
        screen.getByTestId("chat-config-model-select").textContent,
      ).toContain("New model"),
      { timeout: 2_000 },
    );

    await act(async () => {
      resolveOld?.(Response.json({ online: [oldModel] }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("chat-config-model-select").textContent)
      .toContain("New model");
  });

  it("disables Save when the selected model is absent from discovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({
        online: [{
          ...healthyPegaModel,
          model_id: "other-model",
          name: "Other model",
          aliases: [],
        }],
      })),
    );

    render(
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: "openai-compatible",
          tempModel: PEGA_AI_DEFAULT_MODEL,
          tempApiKey: "pega-user-key",
          tempBaseUrl: PEGA_AI_BASE_URL,
          onProviderChange: vi.fn(),
          onModelChange: vi.fn(),
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
        }),
      }),
    );

    await waitFor(
      () => expect(screen.getByTestId("chat-config-model-select").textContent)
        .toContain("Select a model"),
      { timeout: 2_000 },
    );
    expect(
      (screen.getByTestId("chat-config-save-button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("leaves model transitions to the explicit provider callback", async () => {
    const onModelChange = vi.fn();
    const dialog = (provider: "openai-compatible" | "openai") =>
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: provider,
          tempModel: DEFAULT_MODELS[provider],
          tempApiKey: provider === "openai-compatible" ? "" : "openai-key",
          tempBaseUrl: getDefaultBaseUrl(provider),
          onProviderChange: vi.fn(),
          onModelChange,
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
        }),
      });
    const { rerender } = render(dialog("openai-compatible"));

    await act(async () => {
      rerender(dialog("openai"));
    });

    expect(onModelChange).not.toHaveBeenCalled();
  });

  it("loads PegaAI status model IDs and names into the dialog", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/maas/api/v1/model-status/public/models")) {
        return Response.json({ online: [healthyPegaModel] });
      }
      return Response.json({ data: [{ id: "generic-model-fallback" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(ThemeProvider, {
        defaultTheme: "light",
        forcedTheme: "light",
        children: createElement(ConfigurationDialog, {
          open: true,
          onOpenChange: vi.fn(),
          tempProvider: "openai-compatible",
          tempModel: PEGA_AI_DEFAULT_MODEL,
          tempApiKey: "pega-user-key",
          tempBaseUrl: PEGA_AI_BASE_URL,
          onProviderChange: vi.fn(),
          onModelChange: vi.fn(),
          onApiKeyChange: vi.fn(),
          onBaseUrlChange: vi.fn(),
          onSave: vi.fn(),
        }),
      }),
    );

    await waitFor(
      () => expect(fetchMock).toHaveBeenCalledWith(
        `${PEGA_AI_BASE_URL.replace(/\/v1$/, "")}/maas/api/v1/model-status/public/models`,
        expect.objectContaining({
          headers: { Authorization: "Bearer pega-user-key" },
        }),
      ),
      { timeout: 2_000 },
    );
    await waitFor(
      () => expect(
        screen.getByTestId("chat-config-model-select").textContent,
      ).toContain("Qwen3.8-27B"),
      { timeout: 2_000 },
    );
  });
});
