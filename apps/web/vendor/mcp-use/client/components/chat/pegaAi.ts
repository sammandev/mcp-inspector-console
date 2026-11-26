// Modified for the combined Inspector: provide PegaAI proxy and model-catalog behavior.
export const PEGA_AI_BASE_URL = "/mcp/inspector/api/pegaai/v1";
export const PEGA_AI_DEFAULT_MODEL = "Pega-Chat";

const PEGA_AI_PROXY_PATH = "/mcp/inspector/api/pegaai";
const PEGA_AI_MODEL_STATUS_PATH =
  "/maas/api/v1/model-status/public/models";

export interface ModelOption {
  id: string;
  displayName?: string;
  aliases?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isPegaAiBaseUrl(value: string): boolean {
  const normalized = normalizeBaseUrl(value);
  if (normalized === PEGA_AI_BASE_URL) return true;

  try {
    const url = new URL(normalized);
    if (
      typeof window === "undefined" ||
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return false;
    }
    return normalizeBaseUrl(url.pathname) === PEGA_AI_BASE_URL;
  } catch {
    return false;
  }
}

function getPegaAiStatusUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return `${normalized.slice(0, -3)}${PEGA_AI_MODEL_STATUS_PATH}`;
}

export function parsePegaAiModelOptions(payload: unknown): ModelOption[] {
  if (!isRecord(payload) || !Array.isArray(payload.online)) return [];

  const options: ModelOption[] = [];
  const seen = new Set<string>();
  for (const value of payload.online) {
    if (!isRecord(value)) continue;
    const modelId =
      typeof value.model_id === "string" ? value.model_id.trim() : "";
    const modalities = isRecord(value.modalities) ? value.modalities : null;
    const inputs = Array.isArray(modalities?.input) ? modalities.input : [];
    const outputs = Array.isArray(modalities?.output) ? modalities.output : [];

    let endpointPath = "";
    if (typeof value.api_endpoint === "string") {
      try {
        const endpoint = new URL(value.api_endpoint);
        if (
          (endpoint.protocol === "http:" || endpoint.protocol === "https:") &&
          !endpoint.username &&
          !endpoint.password &&
          !endpoint.search &&
          !endpoint.hash
        ) {
          endpointPath = normalizeBaseUrl(endpoint.pathname);
        }
      } catch {
        endpointPath = "";
      }
    }

    if (
      !modelId ||
      seen.has(modelId) ||
      value.status !== "online" ||
      value.health_status !== "running" ||
      value.model_type !== "llm" ||
      !inputs.includes("text") ||
      !outputs.includes("text") ||
      endpointPath !== "/pegaai/v1"
    ) {
      continue;
    }

    const displayName =
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : undefined;
    const aliases = Array.isArray(value.aliases)
      ? value.aliases.flatMap((alias) =>
          typeof alias === "string" && alias.trim() ? [alias.trim()] : [],
        )
      : [];
    seen.add(modelId);
    options.push({
      id: modelId,
      ...(displayName ? { displayName } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
    });
  }
  return options;
}

function parseOpenAiModelOptions(payload: unknown): ModelOption[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("Unexpected response format from the OpenAI-compatible endpoint");
  }

  return payload.data.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
      return [];
    }
    return [{ id: value.id.trim() }];
  });
}

function authHeaders(apiKey: string): HeadersInit {
  const key = apiKey.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export async function fetchPegaAiModelOptions(
  baseUrl: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ModelOption[]> {
  if (!isPegaAiBaseUrl(baseUrl)) {
    throw new Error("The configured base URL is not the PegaAI proxy route");
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl.endsWith(PEGA_AI_PROXY_PATH + "/v1")) {
    throw new Error("The configured PegaAI base URL must end in /v1");
  }

  try {
    const statusResponse = await fetcher(getPegaAiStatusUrl(baseUrl), {
      headers: authHeaders(apiKey),
      redirect: "error",
    });
    if (!statusResponse.ok) {
      throw new Error(`PegaAI model status failed: ${statusResponse.status}`);
    }
    const statusPayload: unknown = await statusResponse.json();
    if (!isRecord(statusPayload) || !Array.isArray(statusPayload.online)) {
      throw new Error("Unexpected PegaAI model status format");
    }
    return parsePegaAiModelOptions(statusPayload);
  } catch {
    const modelsResponse = await fetcher(`${normalizedBaseUrl}/models`, {
      headers: authHeaders(apiKey),
      redirect: "error",
    });
    if (!modelsResponse.ok) {
      throw new Error(
        `Failed to fetch PegaAI models: ${modelsResponse.statusText}`,
      );
    }
    return parseOpenAiModelOptions(await modelsResponse.json());
  }
}
