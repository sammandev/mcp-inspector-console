// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173"}
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isManagedLlmConfig } from "../../vendor/mcp-use/client/components/chat/managedChatNotice.js";
import { AccountProvider } from "./AccountProvider.js";
import { REASONING_HEADER, useAccountConfig } from "./useAccountConfig.js";

const session = { id: "session-1", expiresAt: Date.now() + 3_600_000,
  user: { id: "u1", username: "tester", email: "t@example.com", kind: "external" } };
const pega = { id: "a".repeat(64), provider: "openai-compatible", model: "Pega-Chat",
  baseUrl: "/mcp/inspector/api/pegaai/v1", keySaved: true, updatedAt: "2026-01-02" };
const team = { id: "b".repeat(64), name: "Team", provider: "openai-compatible", model: "gpt-x",
  baseUrl: "http://localhost:11434/v1", keySaved: true, updatedAt: "2026-01-01" };
let posts: unknown[];

beforeEach(() => {
  localStorage.clear(); posts = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) return Response.json(session);
    if (url.endsWith("/providers") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(body);
      return Response.json({ ...(body.id === team.id ? team : pega), model: body.model, updatedAt: "2026-02-01" });
    }
    if (url.endsWith("/providers")) return Response.json([pega, team]);
    return Response.json({ error: "unexpected" }, { status: 500 });
  });
});
afterEach(() => vi.unstubAllGlobals());

function renderConfig() {
  const wrapper = ({ children }: PropsWithChildren) => createElement(AccountProvider, null, children);
  return renderHook(() => useAccountConfig(), { wrapper });
}

it("lists every saved configuration and does not treat the account relay as managed cloud chat", async () => {
  const { result } = renderConfig();
  await waitFor(() => expect(result.current.llmConfig?.model).toBe("Pega-Chat"));
  expect(result.current.providers.map(value => value.id)).toEqual([pega.id, team.id]);
  expect(result.current.activeProviderId).toBe(pega.id);
  expect(isManagedLlmConfig(result.current.llmConfig)).toBe(false);
});

it("switches the model of a saved configuration without reopening the dialog or resending its key", async () => {
  const { result } = renderConfig();
  await waitFor(() => expect(result.current.providers).toHaveLength(2));
  await act(async () => { await result.current.selectModel(team.id, "gpt-y"); });
  expect(posts).toEqual([{ id: team.id, name: "Team", provider: "openai-compatible", model: "gpt-y", baseUrl: team.baseUrl }]);
  expect(result.current.activeProviderId).toBe(team.id);
  expect(result.current.llmConfig).toMatchObject({ model: "gpt-y", baseUrl: expect.stringContaining(`/relay/session-1/${team.id}`) });
  expect(result.current.configDialogOpen).toBe(false);
});

it("remembers the reasoning effort per configuration and model and sends it as a relay header", async () => {
  const { result } = renderConfig();
  await waitFor(() => expect(result.current.llmConfig).not.toBeNull());
  expect(result.current.reasoningEffort).toBe("default");
  expect(result.current.llmConfig?.extraHeaders).toBeUndefined();
  act(() => result.current.setReasoningEffort("high"));
  expect(result.current.llmConfig?.extraHeaders).toEqual({ [REASONING_HEADER]: "high" });
  await act(async () => { await result.current.selectModel(team.id, "gpt-y"); });
  expect(result.current.reasoningEffort).toBe("default");
  await act(async () => { await result.current.selectModel(pega.id, "Pega-Chat"); });
  expect(result.current.reasoningEffort).toBe("high");
});
