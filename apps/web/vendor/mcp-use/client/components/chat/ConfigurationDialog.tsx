// Modified for the combined Inspector: remove hosted onboarding, support PegaAI model discovery and saved account configurations.
import { Check, ChevronsUpDown, Eye, EyeOff, Key, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useOptionalAccount } from "../../../../../src/accounts/AccountProvider.js";
import { providerSchema } from "../../../../../src/accounts/api.js";

import { Button } from "@/client/components/ui/button";
import { TabsSubtle, TabsSubtleItem } from "@/client/components/ui/tabs-subtle";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/client/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/client/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

import { cn } from "@/client/lib/utils";
import {
  buildOllamaApiUrl,
  normalizeOllamaBaseUrl,
  OllamaCorsError,
  type ProviderName,
} from "@mcp-use/agent";
import {
  getDefaultBaseUrl,
  providerRequiresApiKey,
  providerSupportsBaseUrl,
} from "./types";
import {
  getProviderLabel,
  ProviderIcon,
  formatManagedModelName,
} from "./providerMeta";
import { fetchPegaAiModelOptions, isPegaAiBaseUrl } from "./pegaAi";
import type { CloudModel } from "./useManagedCloudModel";

interface ModelOption {
  id: string;
  displayName?: string;
  aliases?: string[];
}

interface CachedModels {
  models: ModelOption[];
  timestamp: number;
}

const MODELS_CACHE_KEY = "mcp-inspector-models-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Helper functions for models cache
function getModelsCache(): Record<string, CachedModels> {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error("Failed to load models cache:", error);
  }
  return {};
}

function setModelsCache(provider: string, models: ModelOption[]) {
  try {
    const cache = getModelsCache();
    cache[provider] = {
      models,
      timestamp: Date.now(),
    };
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Failed to save models cache:", error);
  }
}

function getCachedModels(provider: string): ModelOption[] | null {
  try {
    const cache = getModelsCache();
    const cached = cache[provider];

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL_MS) {
        return cached.models;
      } else {
        // Cache expired, remove it
        delete cache[provider];
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(cache));
      }
    }
  } catch (error) {
    console.error("Failed to get cached models:", error);
  }
  return null;
}

function getModelsCacheKey(provider: ProviderName, baseUrl?: string): string {
  if (!providerSupportsBaseUrl(provider) || !baseUrl?.trim()) {
    return provider;
  }
  // Ollama normalizes trailing slashes and `/api` suffix to the same endpoint;
  // collapsing them in the cache key keeps a single entry per real endpoint.
  const keyPart =
    provider === "ollama"
      ? normalizeOllamaBaseUrl(baseUrl)
      : baseUrl.trim().toLowerCase();
  return `${provider}:${keyPart}`;
}

interface ConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tempProvider: ProviderName;
  tempModel: string;
  tempApiKey: string;
  tempBaseUrl: string;
  onProviderChange: (provider: ProviderName) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  onSave: () => void;
  onClear?: () => void;
  showClearButton?: boolean;
  buttonLabel?: string;
  /** Hosted inspector — use unified Configure Chat layout. */
  hostedInspector?: boolean;
  /** Legacy hosted compatibility input; local chat does not render sign-in UI. */
  freeTierInfo?: {
    onLoginClick: () => void;
  };
  /** Authenticated hosted tier — Manufact cloud models + source tabs. */
  managedCloudInfo?: {
    models: CloudModel[];
    selectedModelId: string;
    onModelChange: (modelId: string) => void;
    isLoading?: boolean;
  };
  /** When true, chat uses Manufact cloud; drives the default config tab. */
  useManagedCloud?: boolean;
  /** Persist Manufact cloud selection and switch chat to managed mode. */
  onSaveManagedCloud?: () => void;
  /** Inspector account mode: choose which saved configuration to edit, or a new one (null). */
  savedConfigurations?: SavedConfigurations;
}

export interface SavedConfigurations {
  options: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  name: string;
  onNameChange: (name: string) => void;
}
const NEW_CONFIGURATION = "__new__";

const CHAT_CONFIG_TABS_ID = "chat-config-source";
// Curate only this picker; cloud evals and BYOK still use the full catalog.
const CLOUD_PICKER_PROVIDERS = ["openai", "anthropic", "google"];

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<ModelOption[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, { headers });
  } catch {
    // fetch() rejects with a generic TypeError when CORS blocks the response,
    // when the server is unreachable, or on mixed-content.
    throw new Error(
      "Failed to reach the server. Check the URL is correct and that CORS is enabled on the server."
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Invalid URL — response was not JSON");
  }

  const data = await response.json();
  if (!Array.isArray(data?.data)) {
    throw new Error(
      "Unexpected response format — expected { data: [...] } from the OpenAI-compatible endpoint"
    );
  }
  return data.data.map((model: { id: string }) => ({ id: model.id }));
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAI models: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((model: { id: string }) => ({
    id: model.id,
  }));
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Anthropic models: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((model: { id: string; display_name?: string }) => ({
    id: model.id,
    displayName: model.display_name,
  }));
}

async function fetchGoogleModels(apiKey: string): Promise<ModelOption[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Google models: ${response.statusText}`);
  }

  const data = await response.json();
  return (data.models || []).map(
    (model: { name: string; displayName?: string }) => ({
      id: model.name,
      displayName: model.displayName,
    })
  );
}

async function fetchOpenRouterModels(apiKey: string): Promise<ModelOption[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter models: ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.data.map((model: { id: string; name?: string }) => ({
    id: model.id,
    displayName: model.name,
  }));
}

async function fetchOllamaModels(
  baseUrl: string,
  apiKey: string
): Promise<ModelOption[]> {
  let response: Response;
  try {
    response = await fetch(buildOllamaApiUrl(baseUrl, "/api/tags"), {
      headers: {
        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
    });
  } catch (error) {
    // Browser CORS / network failures surface as TypeError with no detail
    throw new OllamaCorsError(error);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
  }

  const data = await response.json();
  return (data.models || []).map(
    (model: { model?: string; name?: string }) => ({
      id: model.model || model.name || "",
    })
  );
}

export function ConfigurationDialog({
  open,
  onOpenChange,
  tempProvider,
  tempModel,
  tempApiKey,
  tempBaseUrl,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  onBaseUrlChange,
  onSave,
  onClear,
  showClearButton = false,
  buttonLabel: _buttonLabel = "Configure API Key",
  hostedInspector = false,
  freeTierInfo,
  managedCloudInfo,
  useManagedCloud = false,
  onSaveManagedCloud,
  savedConfigurations,
}: ConfigurationDialogProps) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const account = useOptionalAccount();
  const accountClient = account?.client;
  const [keySaved, setKeySaved] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [cloudComboboxOpen, setCloudComboboxOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [configTabIndex, setConfigTabIndex] = useState(useManagedCloud ? 0 : 1);
  const modelsCacheKey = getModelsCacheKey(tempProvider, tempBaseUrl);
  const isHostedLayout = Boolean(
    hostedInspector || freeTierInfo || managedCloudInfo
  );
  const isCloudTab = Boolean(managedCloudInfo && configTabIndex === 0);
  const editingId = savedConfigurations?.selectedId ?? null;
  useEffect(() => {
    if (!accountClient || !open) return;
    let cancelled = false;
    const sameEndpoint = (row: { provider: string; baseUrl: string }) =>
      row.provider === tempProvider && row.baseUrl.replace(/\/+$/, "") === tempBaseUrl.replace(/\/+$/, "");
    void accountClient.request("providers", z.array(providerSchema)).then(rows => {
      if (!cancelled) setKeySaved(rows.some(row => sameEndpoint(row) && row.keySaved &&
        (savedConfigurations ? row.id === editingId : true)));
    }).catch(cause => { if (!cancelled && !accountClient.signal.aborted) setModelError(cause instanceof Error ? cause.message : "Could not load saved key status"); });
    return () => { cancelled = true; };
  }, [accountClient, open, tempProvider, tempBaseUrl, editingId, Boolean(savedConfigurations)]);

  useEffect(() => {
    if (open) {
      setConfigTabIndex(useManagedCloud ? 0 : 1);
    }
  }, [open, useManagedCloud]);

  // Fetch models when API key / base URL is set and provider is selected
  useEffect(() => {
    const needsApiKey = providerRequiresApiKey(tempProvider, tempBaseUrl);
    const needsBaseUrl = providerSupportsBaseUrl(tempProvider);

    if (
      isCloudTab ||
      !open ||
      !tempProvider ||
      (needsApiKey && !tempApiKey.trim() && !accountClient) ||
      (needsBaseUrl && !tempBaseUrl.trim())
    ) {
      setModels([]);
      setModelError(null);
      setIsLoadingModels(false);
      return;
    }

    let cancelled = false;
    const mayUseCache = !tempApiKey.trim() && !accountClient;
    const loadModels = async () => {
      if (cancelled) return;
      if (mayUseCache) {
        const cachedModels = getCachedModels(modelsCacheKey);
        if (cachedModels) {
          setModels(cachedModels);
          setModelError(null);
          setIsLoadingModels(false);
          return;
        }
      }

      setIsLoadingModels(true);
      setModelError(null);

      try {
        let fetchedModels: ModelOption[] = [];
        if (accountClient) {
          fetchedModels = await accountClient.request("discover", z.array(z.object({ id: z.string(), displayName: z.string().optional() })), "POST", {
            ...(editingId ? { id: editingId } : {}),
            provider: tempProvider, model: tempModel, baseUrl: tempBaseUrl,
            ...(tempApiKey.trim() ? { apiKey: tempApiKey.trim() } : {}),
          });
        } else if (tempProvider === "openai-compatible") {
          fetchedModels = isPegaAiBaseUrl(tempBaseUrl)
            ? await fetchPegaAiModelOptions(tempBaseUrl, tempApiKey)
            : await fetchOpenAICompatibleModels(tempBaseUrl, tempApiKey);
        } else if (tempProvider === "openai") {
          fetchedModels = await fetchOpenAIModels(tempApiKey);
        } else if (tempProvider === "anthropic") {
          fetchedModels = await fetchAnthropicModels(tempApiKey);
        } else if (tempProvider === "google") {
          fetchedModels = await fetchGoogleModels(tempApiKey);
        } else if (tempProvider === "openrouter") {
          fetchedModels = await fetchOpenRouterModels(tempApiKey);
        } else if (tempProvider === "ollama") {
          fetchedModels = await fetchOllamaModels(tempBaseUrl, tempApiKey);
        }

        if (cancelled) return;
        if (mayUseCache) setModelsCache(modelsCacheKey, fetchedModels);
        setModels(fetchedModels);
      } catch (error) {
        if (cancelled) return;
        setModelError(
          error instanceof Error
            ? error.message
            : "Failed to fetch models. Please check your API key.",
        );
        setModels([]);
      } finally {
        if (!cancelled) setIsLoadingModels(false);
      }
    };

    setIsLoadingModels(true);
    const timeoutId = setTimeout(loadModels, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [tempApiKey, tempBaseUrl, tempProvider, open, modelsCacheKey, isCloudTab, accountClient, editingId]);

  const showBaseUrlField = providerSupportsBaseUrl(tempProvider);
  const apiKeyOptional = !providerRequiresApiKey(tempProvider, tempBaseUrl);
  const showModelSection =
    open &&
    (!providerRequiresApiKey(tempProvider, tempBaseUrl) ||
      !!tempApiKey.trim() || !!accountClient) &&
    (!showBaseUrlField || !!tempBaseUrl.trim());
  const apiKeyLabel = apiKeyOptional ? "API Key (optional)" : "API Key";
  const apiKeyPlaceholder = accountClient && keySaved ? "Leave empty to keep the saved key" : apiKeyOptional
    ? tempProvider === "ollama"
      ? "Leave empty for local Ollama"
      : "Enter your API key (optional)"
    : "Enter your API key";
  const baseUrlPlaceholder =
    tempProvider === "openai-compatible"
      ? "http://localhost:11434/v1"
      : getDefaultBaseUrl(tempProvider);
  const baseUrlHelp =
    tempProvider === "openai-compatible"
      ? "Base URL of your OpenAI-compatible /v1 endpoint."
      : null;
  const apiKeyHelp = accountClient
    ? `${keySaved ? "A key is saved for this provider. " : ""}Keys are encrypted in your account and used only by the server. Enter a new key to replace it; Clear Configuration removes it.`
    : tempProvider === "ollama"
      ? "Optional for local Ollama. Stored locally and never sent to the servers."
      : isPegaAiBaseUrl(tempBaseUrl)
        ? "Your API key is stored locally in this browser."
        : "Your API key is stored locally and never sent to the servers.";

  const cloudModelsByProvider = managedCloudInfo
    ? managedCloudInfo.models.reduce<Record<string, CloudModel[]>>(
        (acc, model) => {
          if (!acc[model.provider]) acc[model.provider] = [];
          acc[model.provider].push(model);
          return acc;
        },
        {}
      )
    : {};

  const selectedCloudModel = managedCloudInfo?.models.find(
    (m) => m.id === managedCloudInfo.selectedModelId
  );
  const cloudProviders = CLOUD_PICKER_PROVIDERS.filter(
    (provider) => cloudModelsByProvider[provider]?.length
  );
  const activeCloudProvider =
    selectedCloudModel?.provider ?? cloudProviders[0] ?? "";
  const isLegacyCloudSelection =
    !!selectedCloudModel &&
    !CLOUD_PICKER_PROVIDERS.includes(selectedCloudModel.provider);
  const cloudModelsForProvider = activeCloudProvider
    ? (cloudModelsByProvider[activeCloudProvider] ?? [])
    : [];
  const showClear =
    Boolean(onClear) &&
    showClearButton &&
    (!managedCloudInfo || configTabIndex === 1);

  const handleSaveClick = () => {
    if (isCloudTab && onSaveManagedCloud) {
      onSaveManagedCloud();
      return;
    }
    onSave();
  };

  const selectedLocalModel = models.find(
    (model) =>
      model.id === tempModel || Boolean(model.aliases?.includes(tempModel)),
  );
  const saveDisabled = isCloudTab
    ? Boolean(
        managedCloudInfo?.isLoading ||
        !managedCloudInfo?.selectedModelId ||
        managedCloudInfo?.models.length === 0
      )
    : (providerRequiresApiKey(tempProvider, tempBaseUrl) &&
        !tempApiKey.trim() && !keySaved) ||
      (showBaseUrlField && !tempBaseUrl.trim()) ||
      !tempModel.trim() ||
      isLoadingModels ||
      (models.length > 0 && !selectedLocalModel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="chat-config-dialog">
        <DialogHeader>
          <DialogTitle>
            {isHostedLayout ? "Configure Chat" : "LLM Provider Configuration"}
          </DialogTitle>
          <DialogDescription>
            {managedCloudInfo
              ? "Pick a managed cloud model or configure your own provider."
              : "Configure your OpenAI-compatible endpoint, model, and API key."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {managedCloudInfo && (
            <div className="flex justify-center">
              <TabsSubtle
                selectedIndex={configTabIndex}
                onSelect={setConfigTabIndex}
                idPrefix={CHAT_CONFIG_TABS_ID}
                className="w-fit"
              >
                <TabsSubtleItem index={0} label="Managed cloud" />
                <TabsSubtleItem index={1} label="API key" />
              </TabsSubtle>
            </div>
          )}
          {!isCloudTab && savedConfigurations && (
            <>
              <div className="space-y-2">
                <Label>Saved configuration</Label>
                <Select
                  value={savedConfigurations.selectedId ?? NEW_CONFIGURATION}
                  onValueChange={(v) => savedConfigurations.onSelect(v === NEW_CONFIGURATION ? null : String(v))}
                >
                  <SelectTrigger className="rounded-md" data-testid="chat-config-saved-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {savedConfigurations.options.map((option) => (
                      <SelectItem key={option.id} value={option.id} label={option.label}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_CONFIGURATION} label="New configuration">
                      New configuration
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input
                  value={savedConfigurations.name}
                  maxLength={80}
                  onChange={(e) => savedConfigurations.onNameChange(e.target.value)}
                  placeholder="e.g. Team gateway"
                  data-testid="chat-config-name-input"
                />
                <p className="text-xs text-muted-foreground">
                  Give each OpenAI-compatible endpoint or key its own name to keep several configurations.
                </p>
              </div>
            </>
          )}
          <div className={cn("space-y-2", managedCloudInfo && "!mt-2")}>
            <Label>Provider</Label>
            {isCloudTab ? (
              <Select
                value={activeCloudProvider}
                onValueChange={(provider) => {
                  const nextModel = managedCloudInfo?.models.find(
                    (model) => model.provider === provider
                  );
                  if (nextModel) {
                    managedCloudInfo?.onModelChange(nextModel.id);
                  }
                }}
              >
                <SelectTrigger
                  className="rounded-md"
                  leading={
                    activeCloudProvider ? (
                      <ProviderIcon
                        provider={activeCloudProvider}
                        className="shrink-0"
                      />
                    ) : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isLegacyCloudSelection && (
                    <SelectItem
                      value={activeCloudProvider}
                      label={getProviderLabel(activeCloudProvider)}
                      disabled
                    >
                      {getProviderLabel(activeCloudProvider)} (current)
                    </SelectItem>
                  )}
                  {cloudProviders.map((provider) => (
                    <SelectItem
                      key={provider}
                      value={provider}
                      label={getProviderLabel(provider)}
                    >
                      <div className="flex items-center gap-2">
                        <ProviderIcon provider={provider} />
                        <span>{getProviderLabel(provider)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={tempProvider}
                onValueChange={(v) => { if (v === "openai-compatible") onProviderChange(v); }}
              >
                <SelectTrigger
                  className="rounded-md"
                  leading={
                    <ProviderIcon
                      provider={tempProvider}
                      className="shrink-0"
                    />
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="openai-compatible"
                    label={getProviderLabel("openai-compatible")}
                  >
                    <div className="flex items-center gap-2">
                      <span>{getProviderLabel("openai-compatible")}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {!isCloudTab && showBaseUrlField && (
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={tempBaseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder={baseUrlPlaceholder}
                data-testid="chat-config-base-url-input"
              />
              {baseUrlHelp && (
                <p className="text-xs text-muted-foreground">{baseUrlHelp}</p>
              )}
            </div>
          )}

          {!isCloudTab && (
            <div className="space-y-2">
              <Label>{apiKeyLabel}</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={tempApiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder={apiKeyPlaceholder}
                  className="pr-10"
                  data-testid="chat-config-api-key-input"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{apiKeyHelp}</p>
            </div>
          )}

          {isCloudTab ? (
            <div className="space-y-2">
              <Label>Model</Label>
              {managedCloudInfo?.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading models…</span>
                </div>
              ) : cloudModelsForProvider.length > 0 ? (
                <Popover
                  open={cloudComboboxOpen}
                  modal={true}
                  onOpenChange={setCloudComboboxOpen}
                >
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cloudComboboxOpen}
                        className="w-full justify-between rounded-md"
                        data-testid="chat-config-cloud-model-select"
                        disabled={isLegacyCloudSelection}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2 truncate">
                          {selectedCloudModel ? (
                            <>
                              <ProviderIcon
                                provider={selectedCloudModel.provider}
                                className="shrink-0"
                              />
                              <span className="truncate">
                                {formatManagedModelName(
                                  selectedCloudModel.name,
                                  selectedCloudModel.provider
                                )}
                              </span>
                            </>
                          ) : (
                            "Select a model…"
                          )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    }
                    nativeButton
                  />
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search models…"
                        className="h-9"
                      />
                      <CommandList>
                        <CommandEmpty>No model found.</CommandEmpty>
                        <CommandGroup>
                          {cloudModelsForProvider.map((model) => (
                            <CommandItem
                              key={model.id}
                              value={model.id}
                              keywords={[model.name, model.id, model.provider]}
                              onSelect={(currentValue) => {
                                managedCloudInfo?.onModelChange(currentValue);
                                setCloudComboboxOpen(false);
                              }}
                            >
                              {formatManagedModelName(
                                model.name,
                                model.provider
                              )}
                              <Check
                                className={cn(
                                  "ml-auto h-4 w-4",
                                  managedCloudInfo?.selectedModelId === model.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Cloud models unavailable — try again or use your own key.
                </p>
              )}
            </div>
          ) : (
            showModelSection && (
              <div className="space-y-2">
                <Label>Model</Label>
                {isLoadingModels ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading models...</span>
                  </div>
                ) : modelError ? (
                  <div className="space-y-2">
                    <div className="text-sm text-destructive">{modelError}</div>
                    <Input
                      value={tempModel}
                      onChange={(e) => onModelChange(e.target.value)}
                      placeholder="Enter model name manually"
                      data-testid="chat-config-model-input"
                    />
                  </div>
                ) : models.length > 0 ? (
                  <Popover
                    open={comboboxOpen}
                    modal={true}
                    onOpenChange={setComboboxOpen}
                  >
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={comboboxOpen}
                          className="w-full justify-between rounded-md"
                          data-testid="chat-config-model-select"
                        >
                          <span className="truncate">
                            {tempModel
                              ? selectedLocalModel?.displayName ||
                                selectedLocalModel?.id ||
                                "Select a model..."
                              : "Select a model..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      }
                      nativeButton
                    />
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search models..."
                          className="h-9"
                        />
                        <CommandList>
                          <CommandEmpty>No model found.</CommandEmpty>
                          <CommandGroup>
                            {models.map((model) => (
                              <CommandItem
                                key={model.id}
                                value={model.id}
                                keywords={[
                                  model.displayName ?? "",
                                  ...(model.aliases ?? []),
                                ]}
                                onSelect={(currentValue) => {
                                  const isSelected =
                                    currentValue === tempModel ||
                                    Boolean(model.aliases?.includes(tempModel));
                                  onModelChange(isSelected ? "" : currentValue);
                                  setComboboxOpen(false);
                                }}
                              >
                                {model.displayName || model.id}
                                <Check
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    tempModel === model.id ||
                                      model.aliases?.includes(tempModel)
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Input
                    value={tempModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    placeholder="Enter model name manually"
                    data-testid="chat-config-model-input"
                  />
                )}
              </div>
            )
          )}

          <div className="flex justify-between">
            {showClear && (
              <Button variant="outline" onClick={onClear}>
                Clear Config
              </Button>
            )}
            <Button
              onClick={handleSaveClick}
              disabled={saveDisabled}
              className={showClear ? "ml-auto" : ""}
              data-testid="chat-config-save-button"
            >
              <Key className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
