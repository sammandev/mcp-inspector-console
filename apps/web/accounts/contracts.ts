import { z } from "zod";

export const providerNames = ["openai", "openai-compatible", "anthropic", "google", "openrouter", "ollama"] as const;
export const reasoningEfforts = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = typeof reasoningEfforts[number];
export const providerInput = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/).optional(), name: z.string().trim().max(80).optional(),
  provider: z.enum(providerNames), model: z.string().trim().min(1).max(256),
  baseUrl: z.string().max(2048).default(""), apiKey: z.string().max(8192).optional(),
  removeKey: z.boolean().optional(), temperature: z.number().min(0).max(2).optional(),
}).strict();
export const chatInput = z.object({
  id: z.string().uuid().optional(), agentId: z.string().min(1).max(2048),
  title: z.string().min(1).max(256).optional(), agentName: z.string().max(256).optional(),
}).strict();
export interface AccountUser { id: string; username: string; email: string; kind: "admin" | "external" }
export interface AccountSession { id: string; user: AccountUser; expiresAt: number }
export type ProviderInput = z.infer<typeof providerInput>;
export type ProviderSetting = Omit<ProviderInput, "apiKey" | "removeKey"> & { id: string; keySaved: boolean };
export type SavedProvider = Omit<ProviderInput, "removeKey"> & { id: string };
export interface SavedChat {
  id: string; title: string; agent_id: string; agent_name: string;
  created_at: string; updated_at: string; messages: unknown[];
}
