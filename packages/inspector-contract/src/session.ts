import type {
  AuthState,
  InspectorEvent,
  JsonValue,
  PromptResult,
  PromptSummary,
  ResourceResult,
  ResourceSummary,
  ResourceTemplateSummary,
  SessionSnapshot,
  ToolResult,
  ToolSummary,
} from './types.js'

export interface SessionLifecycle {
  connect(): Promise<void>
  disconnect(): Promise<void>
  reconnect(): Promise<void>
}

export interface SessionOperations {
  listPrompts(): Promise<readonly PromptSummary[]>
  getPrompt(name: string, args?: Readonly<Record<string, string>>): Promise<PromptResult>
  listResources(): Promise<readonly ResourceSummary[]>
  readResource(uri: string): Promise<ResourceResult>
  listResourceTemplates(): Promise<readonly ResourceTemplateSummary[]>
  listTools(): Promise<readonly ToolSummary[]>
  callTool(name: string, args?: Readonly<Record<string, JsonValue>>): Promise<ToolResult>
}

export interface SessionDiagnostics {
  getSnapshot(): SessionSnapshot
  ping(): Promise<{ readonly latencyMs: number }>
  getAuthState(): AuthState
}

export interface SessionSubscriptions {
  subscribe(listener: (event: InspectorEvent) => void): () => void
}

export interface UnifiedInspectorSession {
  readonly profileId: string
  readonly sessionId: string
  readonly lifecycle: SessionLifecycle
  readonly operations: SessionOperations
  readonly diagnostics: SessionDiagnostics
  readonly subscriptions: SessionSubscriptions
}
