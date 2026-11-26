import { useEffect, useState } from "react";
import { z } from "zod";
import { Check, Loader2, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover";
import { ModelConfigBadge } from "@/client/components/chat/providerMeta";
import { cn } from "@/client/lib/utils";
import type { AccountClient, PublicProvider } from "./api.js";
import { providerLabel, REASONING_EFFORTS, type ReasoningChoice } from "./useAccountConfig.js";

const modelsSchema = z.array(z.object({ id: z.string(), displayName: z.string().optional() }));
type Models = { status: "loading" } | { status: "ready"; models: z.infer<typeof modelsSchema> } | { status: "error"; message: string };
const effortLabel: Record<ReasoningChoice, string> = { default: "Default", minimal: "Minimal", low: "Low", medium: "Medium", high: "High" };

export interface ModelPickerProps {
  client: AccountClient;
  providers: PublicProvider[];
  activeProviderId: string | null;
  onSelectModel: (providerId: string, model: string) => Promise<boolean>;
  reasoningEffort: ReasoningChoice;
  onReasoningEffortChange: (effort: ReasoningChoice) => void;
  onManageProviders: () => void;
}

export function ModelPicker({ client, providers, activeProviderId, onSelectModel, reasoningEffort, onReasoningEffortChange, onManageProviders }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<Record<string, Models>>({});
  const [switching, setSwitching] = useState<string | null>(null);
  const active = providers.find(value => value.id === activeProviderId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    for (const setting of providers) {
      if (models[setting.id]?.status === "ready") continue;
      setModels(previous => ({ ...previous, [setting.id]: { status: "loading" } }));
      void client.request("discover", modelsSchema, "POST", {
        id: setting.id, ...(setting.name ? { name: setting.name } : {}),
        provider: setting.provider, model: setting.model, baseUrl: setting.baseUrl,
      }).then(list => { if (!cancelled) setModels(previous => ({ ...previous, [setting.id]: { status: "ready", models: list } })); })
        .catch(cause => { if (!cancelled) setModels(previous => ({ ...previous, [setting.id]: { status: "error", message: cause instanceof Error ? cause.message : "Could not load models" } })); });
    }
    return () => { cancelled = true; };
    // Reload only when the picker opens or saved configurations change; ready lists are kept.
  }, [open, client, providers]);

  async function choose(setting: PublicProvider, model: string) {
    const key = `${setting.id}:${model}`;
    setSwitching(key);
    try { if (await onSelectModel(setting.id, model)) setOpen(false); } finally { setSwitching(null); }
  }
  if (!active) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<ModelConfigBadge provider={active.provider} model={active.model} className="shrink-0"
        data-testid="chat-model-badge" aria-label={`Model: ${active.model}. Change model`} />} />
      <PopoverContent align="end" side="top" className="w-80 gap-3 p-3" data-testid="chat-model-picker">
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {providers.map(setting => {
            const state = models[setting.id];
            const list = state?.status === "ready" ? state.models : [];
            const ids = list.some(item => item.id === setting.model) ? list : [{ id: setting.model }, ...list];
            return (
              <div key={setting.id} role="group" aria-label={providerLabel(setting)}>
                <div className="mb-1 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <span className="truncate">{providerLabel(setting)}</span>
                  {state?.status === "loading" && <Loader2 className="size-3 animate-spin" aria-label="Loading models" />}
                </div>
                {state?.status === "error" && <p className="px-1 pb-1 text-xs text-destructive">{state.message}</p>}
                {ids.map(item => {
                  const selected = setting.id === activeProviderId && item.id === setting.model;
                  return (
                    <button key={item.id} type="button" role="menuitemradio" aria-checked={selected}
                      disabled={switching !== null}
                      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-accent disabled:opacity-60",
                        selected && "bg-accent")}
                      onClick={() => void choose(setting, item.id)}>
                      <span className="min-w-0 flex-1 truncate">{"displayName" in item && item.displayName ? item.displayName : item.id}</span>
                      {switching === `${setting.id}:${item.id}` ? <Loader2 className="size-3 animate-spin" />
                        : selected ? <Check className="size-3" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="space-y-1 border-t pt-2">
          <div className="px-1 text-xs font-medium text-muted-foreground" id="chat-reasoning-label">Reasoning</div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-labelledby="chat-reasoning-label">
            {REASONING_EFFORTS.map(effort => (
              <button key={effort} type="button" role="radio" aria-checked={reasoningEffort === effort}
                className={cn("rounded-md border px-2 py-1 text-xs hover:bg-accent", reasoningEffort === effort && "border-primary bg-accent font-medium")}
                onClick={() => onReasoningEffortChange(effort)}>{effortLabel[effort]}</button>
            ))}
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">Default sends no reasoning setting. Models without reasoning support may reject other values.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
          onClick={() => { setOpen(false); onManageProviders(); }}>
          <Settings2 className="size-3.5" aria-hidden /> Manage providers…
        </button>
      </PopoverContent>
    </Popover>
  );
}
