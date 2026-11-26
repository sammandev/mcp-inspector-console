import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { ProviderName } from "@mcp-use/agent";
import { toast } from "sonner";
import type { LLMConfig } from "@/client/components/chat/types";
import { DEFAULT_MODELS, getDefaultBaseUrl } from "@/client/components/chat/types";
import { useAccount } from "./AccountProvider.js";
import { okSchema, providerSchema, type PublicProvider } from "./api.js";

export const REASONING_HEADER = "X-Inspector-Reasoning-Effort";
export const REASONING_EFFORTS = ["default", "minimal", "low", "medium", "high"] as const;
export type ReasoningChoice = typeof REASONING_EFFORTS[number];
// Not "server-managed": provider errors from the account relay are chat errors, not a hosted-cloud outage.
const ACCOUNT_RELAY_KEY = "account-relay";

function effortStorageKey(sessionId: string): string {
  return `mcp-inspector-reasoning-effort:${encodeURIComponent(sessionId)}`;
}
function readEfforts(sessionId: string): Record<string, ReasoningChoice> {
  try {
    const parsed = z.record(z.string(), z.enum(REASONING_EFFORTS)).safeParse(JSON.parse(localStorage.getItem(effortStorageKey(sessionId)) ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch { return {}; }
}
export function providerLabel(setting: Pick<PublicProvider, "name" | "baseUrl">): string {
  if (setting.name) return setting.name;
  if (setting.baseUrl.startsWith("/mcp/inspector/api/pegaai/")) return "PegaAI";
  try { return new URL(setting.baseUrl).host; } catch { return setting.baseUrl; }
}
const newestFirst = (a: PublicProvider, b: PublicProvider) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

export function useAccountConfig() {
  const { client } = useAccount();
  const [settings, setSettings] = useState<PublicProvider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [efforts, setEfforts] = useState<Record<string, ReasoningChoice>>(() => client ? readEfforts(client.sessionId) : {});
  const [configDialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const [tempProvider, setProvider] = useState<ProviderName>("openai-compatible");
  const [tempModel, setTempModel] = useState(DEFAULT_MODELS["openai-compatible"]);
  const [tempBaseUrl, setBaseUrl] = useState(getDefaultBaseUrl("openai-compatible"));
  const [tempApiKey, setTempApiKey] = useState("");
  const active = settings.find(value => value.id === activeId) ?? null;
  const effortKey = active ? `${active.id}:${active.model}` : "";
  const reasoningEffort: ReasoningChoice = efforts[effortKey] ?? "default";
  const llmConfig = useMemo<LLMConfig | null>(() => {
    if (!client || !active) return null;
    return { provider: active.provider, model: active.model, baseUrl: client.relayUrl(active.id),
      apiKey: ACCOUNT_RELAY_KEY, credentials: "same-origin", temperature: active.temperature,
      ...(reasoningEffort !== "default" ? { extraHeaders: { [REASONING_HEADER]: reasoningEffort } } : {}) };
  }, [client, active, reasoningEffort]);

  const edit = useCallback((setting: PublicProvider | null) => {
    setEditingId(setting?.id ?? null); setTempName(setting?.name ?? ""); setTempApiKey("");
    setProvider(setting?.provider ?? "openai-compatible");
    setBaseUrl(setting?.baseUrl ?? getDefaultBaseUrl("openai-compatible"));
    setTempModel(setting?.model ?? DEFAULT_MODELS["openai-compatible"]);
  }, []);
  useEffect(() => {
    if (!client) return;
    setEfforts(readEfforts(client.sessionId));
    void client.request("providers", z.array(providerSchema)).then(rows => {
      const compatible = rows.filter(row => row.provider === "openai-compatible");
      setSettings(compatible);
      const latest = [...compatible].sort(newestFirst)[0];
      if (latest) { setActiveId(latest.id); edit(latest); }
    }).catch(cause => { if (!client.signal.aborted) toast.error(cause instanceof Error ? cause.message : "Could not load provider settings"); });
  }, [client, edit]);

  const remember = (setting: PublicProvider) => setSettings(previous => [...previous.filter(value => value.id !== setting.id), setting]);
  function setConfigDialogOpen(open: boolean) {
    if (open) edit(active);
    setDialogOpen(open);
  }
  function selectEditingProvider(id: string | null) {
    edit(settings.find(value => value.id === id) ?? null);
  }
  function setTempProvider(provider: ProviderName) {
    setProvider(provider); setTempApiKey("");
    if (!editingId) { setBaseUrl(getDefaultBaseUrl(provider)); setTempModel(DEFAULT_MODELS[provider]); }
  }
  function setTempBaseUrl(baseUrl: string) {
    setBaseUrl(baseUrl); setTempApiKey("");
  }
  async function saveLLMConfig(): Promise<boolean> {
    if (!client) return false;
    try {
      const setting = await client.request("providers", providerSchema, "POST", {
        ...(editingId ? { id: editingId } : {}), ...(tempName.trim() ? { name: tempName.trim() } : {}),
        provider: tempProvider, model: tempModel, baseUrl: tempBaseUrl,
        ...(tempApiKey.trim() ? { apiKey: tempApiKey.trim() } : {}),
      });
      remember(setting); setActiveId(setting.id); setEditingId(setting.id); setTempApiKey(""); setDialogOpen(false);
      return true;
    } catch (cause) {
      if (!client.signal.aborted) toast.error(cause instanceof Error ? cause.message : "Could not save provider settings");
      return false;
    }
  }
  async function selectModel(id: string, model: string): Promise<boolean> {
    const setting = settings.find(value => value.id === id);
    if (!client || !setting) return false;
    if (setting.model === model) { setActiveId(id); return true; }
    try {
      const saved = await client.request("providers", providerSchema, "POST", {
        id, ...(setting.name ? { name: setting.name } : {}), provider: setting.provider, model, baseUrl: setting.baseUrl,
      });
      remember(saved); setActiveId(saved.id);
      return true;
    } catch (cause) {
      if (!client.signal.aborted) toast.error(cause instanceof Error ? cause.message : "Could not switch model");
      return false;
    }
  }
  function setReasoningEffort(effort: ReasoningChoice) {
    if (!client || !effortKey) return;
    setEfforts(previous => {
      const next = { ...previous };
      if (effort === "default") delete next[effortKey]; else next[effortKey] = effort;
      try { localStorage.setItem(effortStorageKey(client.sessionId), JSON.stringify(next)); } catch { /* preference stays in memory */ }
      return next;
    });
  }
  async function clearConfig() {
    if (!client || !editingId) return;
    await client.request(`providers/${editingId}`, okSchema, "DELETE");
    const remaining = settings.filter(value => value.id !== editingId);
    setSettings(remaining);
    const next = editingId === activeId ? [...remaining].sort(newestFirst)[0] ?? null : active;
    setActiveId(next?.id ?? null); edit(next);
  }
  const providers = useMemo(() => [...settings].sort(newestFirst), [settings]);
  return { llmConfig, authConfig: null, configDialogOpen, setConfigDialogOpen,
    tempProvider, setTempProvider, tempApiKey, setTempApiKey, tempModel, setTempModel,
    tempBaseUrl, setTempBaseUrl, tempAuthType: "none" as const, saveLLMConfig, clearConfig,
    providers, activeProviderId: activeId, editingProviderId: editingId, selectEditingProvider,
    tempName, setTempName, selectModel, reasoningEffort, setReasoningEffort };
}
