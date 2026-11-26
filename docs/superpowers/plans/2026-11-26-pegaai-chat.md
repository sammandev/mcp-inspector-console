# PegaAI Chat Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Manufact chat onboarding with a PegaAI OpenAI-compatible provider that uses the existing per-user key flow.

**Architecture:** A narrow same-origin Inspector adapter forwards approved PegaAI paths to the deployed LAN tunnel without exposing a shared key. The chat layer reuses its OpenAI-compatible transport, gains a PegaAI status-model catalog, and defaults to local BYOK while retaining all existing providers.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 5, Node `fetch`, existing `@mcp-use/agent` OpenAI-compatible driver.

**Spec:** `docs/superpowers/specs/2026-11-26-pegaai-chat-design.md`

## Global Constraints

- The AICC bearer key stays in per-user local storage and is never embedded in the Inspector server or browser bundle.
- Proxy only the configured PegaAI origin and the approved `/v1/*` or model-status paths.
- Never forward browser `Origin`, `Referer`, cookies, or hop-by-hop headers upstream.
- Do not follow upstream redirects with the bearer key attached.
- Keep existing BYOK providers available.

## Review Focus

- Redirects: return `502` and never replay the bearer key to a different origin.
- Malformed model status: do not populate the picker from partial/untrusted shapes.
- Valid but unavailable model metadata: show only running text-to-text `/pegaai/v1` models and let AICC authorization remain authoritative.
- Persisted legacy config: loading an existing provider must still override the PegaAI defaults.
- Mixed dev/preview execution: the same-origin route must work through the Inspector Vite plugin in both server modes.

---

### Task 1: Add the same-origin PegaAI adapter

**Files:**

- Modify: `apps/web/inspector-server.ts`
- Test: `apps/web/inspector-server.test.ts`

**Interfaces:**

- Produces: `parsePegaAiProxyUrl(value: string | undefined): URL`
- Produces: `proxyPegaAiRequest(request: Request, upstreamBaseUrl: URL): Promise<Response | undefined>`
- The proxy accepts requests below `/mcp/inspector/api/pegaai/v1/` plus the exact `/maas/api/v1/model-status/public/models` path.

- [ ] **Step 1: Write failing tests** for forwarding `Authorization`, preserving a streaming response and request body, stripping browser headers, ignoring non-PegaAI paths, and rejecting redirects without replaying credentials.
- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --dir apps/web exec vitest run --config ../../vitest.config.ts inspector-server.test.ts`

Expected: FAIL because the PegaAI proxy exports do not exist.

- [ ] **Step 3: Implement the adapter in `apps/web/inspector-server.ts`** with default upstream `http://10.176.2.139:4714`, HTTP(S)-only URL validation, path allowlisting, `redirect: "error"`, streaming response passthrough, and `502` on network failure.
- [ ] **Step 4: Wire the adapter ahead of the generic Inspector API handler** in `mcpUseInspector()`, reading `MCP_INSPECTOR_PEGA_AI_URL` from the server environment.
- [ ] **Step 5: Run the focused test and verify it passes**

Expected: all existing approved MCP proxy tests and new PegaAI tests pass.

### Task 2: Add PegaAI model catalog rules

**Files:**

- Create: `apps/web/vendor/mcp-use/client/components/chat/pegaAi.ts`
- Create: `apps/web/src/pega-ai-chat.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**

- Produces: `PEGA_AI_BASE_URL`
- Produces: `PEGA_AI_DEFAULT_MODEL`
- Produces: `isPegaAiBaseUrl(value: string): boolean`
- Produces: `parsePegaAiModelOptions(payload: unknown): ModelOption[]`
- Produces: `fetchPegaAiModelOptions(baseUrl: string, apiKey: string, fetcher?: typeof fetch): Promise<ModelOption[]>`

- [ ] **Step 1: Add the new test file to the web package test command.**
- [ ] **Step 2: Write failing tests** asserting that only online/running text-in/text-out models on `/pegaai/v1` survive, that empty IDs are rejected, and that status failure falls back to `/v1/models` with the bearer key.
- [ ] **Step 3: Run the focused test and verify it fails**

Run: `pnpm --dir apps/web exec vitest run --config ../../vitest.config.ts src/pega-ai-chat.test.ts`

Expected: FAIL because the PegaAI catalog module does not exist.

- [ ] **Step 4: Implement the catalog helper.** Derive the status URL from the PegaAI base URL, validate every status record before use, and preserve the existing OpenAI `{ data: [{ id }] }` fallback shape.
- [ ] **Step 5: Run the focused test and verify it passes**

Expected: model filtering and authenticated fallback behavior pass.

### Task 3: Replace Manufact defaults with PegaAI BYOK

**Files:**

- Modify: `apps/web/vendor/mcp-use/client/context/InspectorContext.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/chat/types.ts`
- Modify: `apps/web/vendor/mcp-use/client/components/chat/useConfig.ts`
- Modify: `apps/web/vendor/mcp-use/client/components/chat/ConfigurationDialog.tsx`
- Modify: `apps/web/src/pega-ai-chat.test.ts`

**Interfaces:**

- Consumes: `PEGA_AI_BASE_URL`, `PEGA_AI_DEFAULT_MODEL`, `isPegaAiBaseUrl`
- Consumes: `fetchPegaAiModelOptions`

- [ ] **Step 1: Write failing React/pure-behavior tests** for no default hosted `chatApiUrl`, no free-tier upgrade by default, PegaAI initial provider/base/model values, PegaAI-key requirement, and absence of the Manufact description/sign-in card even when free-tier props are supplied.
- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --dir apps/web exec vitest run --config ../../vitest.config.ts src/pega-ai-chat.test.ts`

Expected: FAIL on current OpenAI/Manufact defaults and visible onboarding text.

- [ ] **Step 3: Change Inspector context defaults and chat config defaults** to PegaAI `openai-compatible`, require a key only for the PegaAI base URL, and continue honoring persisted legacy configuration.
- [ ] **Step 4: Replace the Manufact description/sign-in render branch** with generic LLM configuration copy, remove unused wordmark/mesh code from the dialog, and preserve managed-cloud compatibility without making it the default.
- [ ] **Step 5: Run the focused test and verify it passes**

Expected: PegaAI defaults and Manufact-free dialog behavior pass.

### Task 4: Wire model discovery and verify the slice

**Files:**

- Modify: `apps/web/vendor/mcp-use/client/components/chat/ConfigurationDialog.tsx`
- Modify: `apps/web/src/pega-ai-chat.test.ts`

**Interfaces:**

- Consumes: `fetchPegaAiModelOptions`
- Preserves: provider-specific model cache and existing OpenAI, Anthropic, Google, OpenRouter, and Ollama discovery.

- [ ] **Step 1: Add a failing test** that supplies a PegaAI status response and asserts the returned options use status model IDs and names.
- [ ] **Step 2: Run the focused test and verify it fails**

Expected: FAIL until the dialog's PegaAI branch uses the catalog helper.

- [ ] **Step 3: Update ConfigurationDialog's model-loading effect** to use `fetchPegaAiModelOptions` for `isPegaAiBaseUrl(tempBaseUrl)` and retain the current generic OpenAI-compatible fetch for other base URLs.
- [ ] **Step 4: Run the focused web tests and verify they pass**

Run: `pnpm --dir apps/web exec vitest run --config ../../vitest.config.ts inspector-server.test.ts src/pega-ai-chat.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Run the complete required gates**

Run: `pnpm --dir apps/web test`

Run: `pnpm --dir apps/web typecheck`

Run: `pnpm --dir apps/web build`

Expected: PASS with no newly introduced failures.

- [ ] **Step 6: Verify the active browser page** reloads without the Manufact sections, opens PegaAI as the default provider, exposes a key field, and renders status-discovered online healthy models once a key is supplied.
