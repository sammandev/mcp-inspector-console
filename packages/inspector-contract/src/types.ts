export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

interface ConnectionProfileBase {
  readonly id: string
  readonly name?: string
}

export interface StdioConnectionProfile extends ConnectionProfileBase {
  readonly transport: 'stdio'
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
}

export interface StreamableHttpConnectionProfile extends ConnectionProfileBase {
  readonly transport: 'streamable-http'
  readonly url: string
}

export interface SseConnectionProfile extends ConnectionProfileBase {
  readonly transport: 'sse'
  readonly url: string
}

export type ConnectionProfile =
  | StdioConnectionProfile
  | StreamableHttpConnectionProfile
  | SseConnectionProfile

export interface BackendSecretFields {
  readonly environment?: Readonly<Record<string, string>>
  readonly headers?: Readonly<Record<string, string>>
  readonly oauth?: Readonly<Record<string, string>>
}

export type BackendConnectionProfile = ConnectionProfile & BackendSecretFields

export type BrowserSafeProfile = ConnectionProfile & {
  readonly secretFields: readonly string[]
}

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error'

export interface SessionCapabilities {
  readonly prompts?: boolean
  readonly resources?: { readonly subscribe?: boolean; readonly listChanged?: boolean }
  readonly tools?: { readonly listChanged?: boolean }
  readonly logging?: boolean
  readonly completions?: boolean
  readonly roots?: boolean
  readonly tasks?: boolean
  readonly sampling?: boolean
  readonly elicitation?: boolean
  readonly skills?: boolean
  readonly experimental?: Readonly<Record<string, JsonValue>>
}

export type SessionTransportSnapshot =
  | { readonly type: 'stdio'; readonly command: string; readonly args?: readonly string[] }
  | { readonly type: 'streamable-http'; readonly url: string }
  | { readonly type: 'sse'; readonly url: string }

export interface SessionLifecycleMetadata {
  readonly generation: number
  readonly connectedAt?: string
  readonly disconnectedAt?: string
  readonly processId?: number
  readonly exitCode?: number | null
}

export interface DiagnosticEntry {
  readonly type: 'protocol' | 'network' | 'process' | 'log' | 'auth' | 'connection'
  readonly message: string
  readonly timestamp?: string
  readonly data?: JsonValue
}

export interface SessionSnapshot {
  readonly sessionId: string
  readonly profile: BrowserSafeProfile
  readonly status: SessionStatus
  readonly transport: SessionTransportSnapshot
  readonly capabilities: SessionCapabilities
  readonly serverInfo?: { readonly name: string; readonly version: string }
  readonly lifecycle: SessionLifecycleMetadata
  readonly diagnostics?: readonly DiagnosticEntry[]
  readonly lastError?: InspectorFailure
}

export interface TextContent { readonly type: 'text'; readonly text: string }
export interface JsonContent { readonly type: 'json'; readonly data: JsonValue }
export type InspectorContent = TextContent | JsonContent

export interface PromptSummary { readonly name: string; readonly description?: string }
export interface PromptMessage { readonly role: 'user' | 'assistant'; readonly content: InspectorContent }
export interface PromptResult { readonly name: string; readonly messages: readonly PromptMessage[] }
export interface ResourceSummary {
  readonly uri: string
  readonly name: string
  readonly description?: string
  readonly mimeType?: string
}
export interface ResourceTemplateSummary {
  readonly uriTemplate: string
  readonly name: string
  readonly description?: string
  readonly mimeType?: string
}
export interface ResourceContent {
  readonly uri: string
  readonly text?: string
  readonly blob?: string
  readonly mimeType?: string
}
export interface ResourceResult { readonly contents: readonly ResourceContent[] }
export interface ToolSummary {
  readonly name: string
  readonly description?: string
  readonly inputSchema: JsonValue
}
export interface ToolResult {
  readonly content: readonly InspectorContent[]
  readonly structuredContent?: JsonValue
  readonly isError?: boolean
}
export interface CompletionResult { readonly values: readonly string[]; readonly total?: number; readonly hasMore?: boolean }
export interface Root { readonly uri: string; readonly name?: string }
export interface TaskSummary {
  readonly taskId: string
  readonly status: 'working' | 'completed' | 'failed' | 'cancelled'
  readonly progress?: number
  readonly message?: string
}
export interface SkillSummary { readonly name: string; readonly description?: string }
export interface SamplingRequest { readonly requestId: string; readonly messages: readonly PromptMessage[] }
export interface ElicitationRequest { readonly requestId: string; readonly message: string; readonly schema?: JsonValue }
export interface ApprovalResult { readonly requestId: string; readonly decision: 'approved' | 'rejected' }

export type AuthState =
  | { readonly status: 'not-required' }
  | { readonly status: 'required'; readonly reason?: string }
  | { readonly status: 'authenticated'; readonly expiresAt?: string }
  | { readonly status: 'failed'; readonly reason: string }

export type InspectorOperation =
  | 'list-prompts' | 'get-prompt' | 'list-resources' | 'read-resource' | 'list-resource-templates'
  | 'list-tools' | 'call-tool' | 'complete' | 'list-roots' | 'set-roots'
  | 'list-tasks' | 'get-task' | 'cancel-task' | 'subscribe-resource' | 'unsubscribe-resource'
  | 'list-skills' | 'get-skill' | 'approve-sampling' | 'reject-sampling'
  | 'approve-elicitation' | 'reject-elicitation' | 'replay' | 'load-scenario' | 'export-diagnostics'

export interface InspectorFailure {
  readonly kind: 'connection' | 'protocol' | 'validation' | 'not-supported' | 'authorization' | 'timeout' | 'internal'
  readonly code: string
  readonly message: string
  readonly retryable?: boolean
  readonly details?: JsonValue
}

export type InspectorResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: InspectorFailure }

export interface InspectorEvent {
  readonly sequence: number
  readonly sessionId: string
  readonly type:
    | 'status-changed' | 'capabilities-changed' | 'resource-updated' | 'resources-list-changed'
    | 'prompts-list-changed' | 'tools-list-changed' | 'task-updated' | 'sampling-requested'
    | 'elicitation-requested' | 'auth-state-changed' | 'subscription-changed' | 'diagnostic'
  readonly timestamp: string
  readonly data?: JsonValue
}

export interface ReplayRequest { readonly operation: InspectorOperation; readonly payload?: JsonValue }
export interface LoadScenario { readonly name: string; readonly operations: readonly ReplayRequest[]; readonly concurrency?: number }
export interface DiagnosticBundle { readonly snapshot: SessionSnapshot; readonly generatedAt: string }
