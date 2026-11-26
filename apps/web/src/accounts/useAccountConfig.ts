import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { ProviderName } from "@mcp-use/agent";
import { toast } from "sonner";
import type { LLMConfig } from "@/client/components/chat/types";
import { DEFAULT_MODELS, getDefaultBaseUrl } from "@/client/components/chat/types";
import { useAccount } from "./AccountProvider.js";
import { okSchema, providerSchema, type PublicProvider } from "./api.js";

export function useAccountConfig() {
  const { client } = useAccount();
  const [settings, setSettings] = useState<PublicProvider[]>([]);
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [tempProvider, setProvider] = useState<ProviderName>("openai-compatible");
  const [tempModel, setTempModel] = useState(DEFAULT_MODELS["openai-compatible"]);
  const [tempBaseUrl, setBaseUrl] = useState(getDefaultBaseUrl("openai-compatible"));
  const [tempApiKey, setTempApiKey] = useState("");
  const toLlm = useCallback((setting: PublicProvider): LLMConfig => {
    if (!client) throw new Error("Sign in to configure Chat");
    return { provider: setting.provider, model: setting.model, baseUrl: client.relayUrl(setting.id),
      apiKey: "server-managed", credentials: "same-origin", temperature: setting.temperature };
  }, [client]);
  useEffect(() => {
    if (!client) return;
    void client.request("providers", z.array(providerSchema)).then(rows => {
      const compatible = rows.filter(row => row.provider === "openai-compatible");
      setSettings(compatible);
      const latest = [...compatible].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
      if (latest) {
        setProvider(latest.provider); setTempModel(latest.model); setBaseUrl(latest.baseUrl);
        setLLMConfig(toLlm(latest));
      }
    }).catch(cause => { if (!client.signal.aborted) toast.error(cause instanceof Error ? cause.message : "Could not load provider settings"); });
  }, [client, toLlm]);
  function setTempProvider(provider: ProviderName) {
    const saved = settings.find(value => value.provider === provider);
    setProvider(provider); setTempApiKey("");
    setBaseUrl(saved?.baseUrl ?? getDefaultBaseUrl(provider));
    setTempModel(saved?.model ?? DEFAULT_MODELS[provider]);
  }
  function setTempBaseUrl(baseUrl: string) {
    setBaseUrl(baseUrl); setTempApiKey("");
    const saved = settings.find(value => value.provider === tempProvider && value.baseUrl === baseUrl);
    setTempModel(saved?.model ?? DEFAULT_MODELS[tempProvider]);
  }
  async function saveLLMConfig(): Promise<boolean> {
    if (!client) return false;
    try {
      const setting = await client.request("providers", providerSchema, "POST", {
        provider: tempProvider, model: tempModel, baseUrl: tempBaseUrl,
        ...(tempApiKey.trim() ? { apiKey: tempApiKey.trim() } : {}),
      });
      setSettings(previous => [...previous.filter(value => value.id !== setting.id), setting]);
      setLLMConfig(toLlm(setting)); setTempApiKey(""); setConfigDialogOpen(false);
      return true;
    } catch (cause) {
      if (!client.signal.aborted) toast.error(cause instanceof Error ? cause.message : "Could not save provider settings");
      return false;
    }
  }
  async function clearConfig() {
    if (!client) return;
    const saved = settings.find(value => value.provider === tempProvider && value.baseUrl === tempBaseUrl);
    if (saved) await client.request(`providers/${saved.id}`, okSchema, "DELETE");
    setSettings(previous => previous.filter(value => value.id !== saved?.id));
    setLLMConfig(null); setTempApiKey("");
  }
  return { llmConfig, authConfig: null, configDialogOpen, setConfigDialogOpen,
    tempProvider, setTempProvider, tempApiKey, setTempApiKey, tempModel, setTempModel,
    tempBaseUrl, setTempBaseUrl, tempAuthType: "none" as const, saveLLMConfig, clearConfig };
}
