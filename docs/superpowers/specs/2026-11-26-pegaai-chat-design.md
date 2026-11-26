# PegaAI Chat Integration

## Intent

Replace Manufact chat onboarding in the local MCP Inspector with the deployed PegaAI OpenAI-compatible proxy while preserving the existing configurable chat workflow.

## Goals

- Remove the Manufact description and sign-in card from chat configuration.
- Default chat to an `openai-compatible` PegaAI provider.
- Keep the AICC bearer key under per-user local storage; never embed or persist a shared key in the Inspector server or browser bundle.
- Expose PegaAI through a same-origin Inspector route so browser CORS does not depend on the proxy's allowed `Origin` list.
- Populate the model picker from AICC model status, limiting choices to online, healthy, text-to-text LLMs served through the generic `/pegaai/v1` endpoint.
- Preserve the existing BYOK provider options.

## Non-goals

- Serving or proxying specialty TTS, image, ASR, OCR, embedding, or reranking endpoints.
- Providing a server-managed AICC key or user quota system.
- Guaranteeing model authorization from public status metadata; the user's AICC key remains authoritative.

## Constraints

- The deployed tunnel forwards client `Authorization` headers and does not substitute a server key.
- The tunnel uses plaintext HTTP on the approved LAN and must remain subject to company network policy.
- The Inspector integration must not leak API keys to URLs, query strings, telemetry, or logs.
- The same-origin proxy must reject redirects and accept only the configured PegaAI upstream origin.

## Approaches

Direct browser access was rejected because it requires broadening the tunnel's accepted browser origins and duplicates transport policy in the browser. A shared server key was rejected because it contradicts the tunnel's per-user credential model. The selected approach is a narrow same-origin Inspector proxy plus local BYOK storage.

## Design

The Inspector server will proxy only `/mcp/inspector/api/pegaai/*` to a validated PegaAI upstream, defaulting to `http://10.176.2.139:4714`. It will forward the bearer key, content, and streaming response while removing browser/origin and hop-by-hop headers. The chat default configuration will use `/mcp/inspector/api/pegaai/v1` as its OpenAI-compatible base URL and `Pega-Chat` as the initial model. For that PegaAI base URL, the API key is required and the model picker loads the public status endpoint, filters out unhealthy and non-LLM entries, and falls back to standard `/v1/models` discovery when status is unavailable. Saving a selected model continues to use the existing local-storage path, and all other providers remain available.

## Verification

Focused tests will first prove that the same-origin adapter forwards streaming and credentials without redirecting, model status is filtered correctly, and chat defaults use PegaAI. Existing proxy-policy, typecheck, unit, and browser tests will then gate completion.
