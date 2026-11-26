import { z } from "zod";
import type { PersistedMcpServerConfig, StorageProvider } from "@mcp-use/client/react";
import type { ChatSession, ChatStorageProvider, ListChatsParams } from "@/client/chat-history/types";
import type { Message } from "@/client/components/chat/types";
import { AccountClient, accountOAuthPrefix, okSchema } from "./api.js";

const chatSchema = z.object({
  id: z.string(), title: z.string(), agent_id: z.string(), agent_name: z.string(),
  created_at: z.string(), updated_at: z.string(),
});
const messageSchema = z.custom<Message>(value => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && (row.role === "user" || row.role === "assistant") &&
    typeof row.timestamp === "number" && (typeof row.content === "string" || Array.isArray(row.content));
});
const detailedChatSchema = chatSchema.extend({ messages: z.array(messageSchema) });
export class AccountChatStorageProvider implements ChatStorageProvider {
  private batches = new Map<string, { messages: Message[]; promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void }>();
  private writes = new Map<string, Promise<void>>();
  private deleted = new Set<string>();
  constructor(private readonly client: AccountClient) {}
  async listChats(params: ListChatsParams): Promise<{ items: ChatSession[]; total: number }> {
    const rows = await this.client.request("chats", z.array(chatSchema));
    const filtered = rows.filter(row => !params.agentId || row.agent_id === params.agentId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const start = params.skip ?? 0;
    return { items: filtered.slice(start, params.take === undefined ? undefined : start + params.take), total: filtered.length };
  }
  async getMessages(id: string): Promise<Message[]> {
    return (await this.client.request(`chats/${id}`, detailedChatSchema)).messages;
  }
  async createChat(params: { id?: string; agentId: string; title?: string; agentName?: string }): Promise<ChatSession> {
    return this.client.request("chats", chatSchema, "POST", params);
  }
  async updateChat(id: string, patch: { title?: string }): Promise<ChatSession> {
    return this.client.request(`chats/${id}`, chatSchema, "PATCH", patch);
  }
  async deleteChat(id: string): Promise<void> {
    this.deleted.add(id);
    try { await this.client.request(`chats/${id}`, okSchema, "DELETE"); }
    catch (error) { this.deleted.delete(id); throw error; }
  }
  saveMessages(id: string, messages: Message[]): Promise<void> {
    if (this.deleted.has(id)) return Promise.reject(new DOMException("Chat was deleted", "AbortError"));
    const pending = this.batches.get(id);
    if (pending) { pending.messages = structuredClone(messages); return pending.promise; }
    let resolve!: () => void, reject!: (error: unknown) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    this.batches.set(id, { messages: structuredClone(messages), promise, resolve, reject });
    setTimeout(() => this.flush(id), 500);
    return promise;
  }
  private flush(id: string): void {
    const batch = this.batches.get(id);
    if (!batch) return;
    this.batches.delete(id);
    const send = async () => {
      if (this.deleted.has(id)) throw new DOMException("Chat was deleted", "AbortError");
      await this.client.request(`chats/${id}`, chatSchema, "PATCH", { messages: batch.messages });
    };
    const previous = this.writes.get(id);
    // Each caller observes its write error; a later snapshot may still retry.
    const write = previous ? previous.then(send, send) : send();
    this.writes.set(id, write);
    const clear = () => { if (this.writes.get(id) === write) this.writes.delete(id); };
    void write.then(() => { clear(); batch.resolve(); }, error => { clear(); batch.reject(error); });
  }
}

// The SDK sanitizes writes down to non-secret fields, including inside proxyConfig and
// oauth, so nested objects are merged to keep previously saved credentials.
function mergeServer(previous: PersistedMcpServerConfig | undefined, next: PersistedMcpServerConfig): PersistedMcpServerConfig {
  const merged: Record<string, unknown> = { ...previous, ...next };
  for (const key of ["proxyConfig", "oauth"] as const) {
    const before = (previous as Record<string, unknown> | undefined)?.[key];
    const after = (next as Record<string, unknown>)[key];
    if (isPlainObject(before) && isPlainObject(after)) merged[key] = { ...before, ...after };
  }
  return merged as PersistedMcpServerConfig;
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const persistedSchema = z.custom<PersistedMcpServerConfig>(value =>
  Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    (!("url" in value) || typeof value.url === "string")));
export class AccountConnectionStorageProvider implements StorageProvider {
  private loaded = false;
  private pending = Promise.resolve();
  private servers: Record<string, PersistedMcpServerConfig> = {};
  constructor(readonly client: AccountClient) {}
  async load(): Promise<void> {
    const servers = await this.client.request("connections", z.record(z.string(), persistedSchema));
    this.servers = servers; this.loaded = true;
  }
  getServers(): Record<string, PersistedMcpServerConfig> {
    return Object.fromEntries(Object.entries(structuredClone(this.servers))
      .map(([id, config]) => [id, { ...config, storageKeyPrefix: accountOAuthPrefix(this.client.sessionId) }]));
  }
  private persist(): Promise<void> {
    if (!this.loaded) return Promise.reject(new Error("Account connections have not loaded"));
    const snapshot = structuredClone(this.servers);
    const write = this.pending.then(async () => {
      await this.client.request("connections", okSchema, "PUT", snapshot);
    });
    this.pending = write.catch(error => {
      if (!this.client.signal.aborted) {
        console.error("Account connection save failed");
        window.dispatchEvent(new CustomEvent("inspector-account-save-error", { detail: error instanceof Error ? error.message : "Connection save failed" }));
      }
    });
    return write;
  }
  setServers(servers: Record<string, PersistedMcpServerConfig>): Promise<void> {
    this.servers = Object.fromEntries(Object.entries(servers).map(([id, config]) => [id, mergeServer(this.servers[id], config)]));
    return this.persist();
  }
  setServer(id: string, config: PersistedMcpServerConfig): Promise<void> {
    this.servers[id] = mergeServer(this.servers[id], config);
    return this.persist();
  }
  removeServer(id: string): Promise<void> { delete this.servers[id]; return this.persist(); }
  clear(): Promise<void> { this.servers = {}; return this.persist(); }
}

let activeConnections: AccountConnectionStorageProvider | null = null;
export function accountConnections(): AccountConnectionStorageProvider | null { return activeConnections; }
export function activateAccountConnections(storage: AccountConnectionStorageProvider | null): void { activeConnections = storage; }
