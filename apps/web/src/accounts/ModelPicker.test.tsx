// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173"}
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../vendor/mcp-use/client/context/ThemeContext.js";
import { AccountClient, type PublicProvider } from "./api.js";
import { ModelPicker } from "./ModelPicker.js";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({ matches: false, media: "", onchange: null, addEventListener: () => undefined,
    removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
});
afterEach(cleanup);

const providers: PublicProvider[] = [
  { id: "a".repeat(64), provider: "openai-compatible", model: "Pega-Chat", baseUrl: "/mcp/inspector/api/pegaai/v1", keySaved: true },
  { id: "b".repeat(64), name: "Team", provider: "openai-compatible", model: "gpt-x", baseUrl: "http://localhost:11434/v1", keySaved: true },
];

it("switches between saved configurations' models and reasoning efforts without opening the provider dialog", async () => {
  const discovered: unknown[] = [];
  const client = new AccountClient("session-1", new AbortController().signal, async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { id: string };
    discovered.push(body);
    return Response.json(body.id === providers[0]!.id ? [{ id: "Pega-Chat" }, { id: "Pega-Code" }] : [{ id: "gpt-x" }, { id: "gpt-y" }]);
  });
  const onSelectModel = vi.fn(async () => true);
  const onReasoningEffortChange = vi.fn();
  const onManageProviders = vi.fn();
  render(createElement(ThemeProvider, { defaultTheme: "light", children: createElement(ModelPicker, { client, providers,
    activeProviderId: providers[0]!.id, onSelectModel, reasoningEffort: "default", onReasoningEffortChange, onManageProviders }) }));

  fireEvent.click(screen.getByTestId("chat-model-badge"));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "gpt-y" }));
  await waitFor(() => expect(onSelectModel).toHaveBeenCalledWith(providers[1]!.id, "gpt-y"));
  expect(discovered).toEqual([
    expect.objectContaining({ id: providers[0]!.id }),
    expect.objectContaining({ id: providers[1]!.id, name: "Team" }),
  ]);

  fireEvent.click(screen.getByTestId("chat-model-badge"));
  fireEvent.click(await screen.findByRole("radio", { name: "High" }));
  expect(onReasoningEffortChange).toHaveBeenCalledWith("high");
  fireEvent.click(screen.getByRole("button", { name: /Manage providers/ }));
  expect(onManageProviders).toHaveBeenCalled();
});
