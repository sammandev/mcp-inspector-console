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
  readonly environment?: Readonly<Record<string, string>>
}

export interface StreamableHttpConnectionProfile extends ConnectionProfileBase {
  readonly transport: 'streamable-http'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface SseConnectionProfile extends ConnectionProfileBase {
  readonly transport: 'sse'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
}

export type ConnectionProfile =
  | StdioConnectionProfile
  | StreamableHttpConnectionProfile
  | SseConnectionProfile

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface SessionCapabilities {
  readonly prompts?: boolean
  readonly resources?: {
    readonly subscribe?: boolean
    readonly listChanged?: boolean
  }
  readonly tools?: {
    readonly listChanged?: boolean
  }
  readonly logging?: boolean
  readonly experimental?: Readonly<Record<string, JsonValue>>
}

export type SessionTransportSnapshot =
  | { readonly type: 'stdio'; readonly command: string; readonly args?: readonly string[] }
  | { readonly type: 'streamable-http'; readonly url: string }
  | { readonly type: 'sse'; readonly url: string }

export interface SessionSnapshot {
  readonly sessionId: string
  readonly profileId: string
  readonly status: SessionStatus
  readonly transport: SessionTransportSnapshot
  readonly capabilities: SessionCapabilities
  readonly serverInfo?: {
    readonly name: string
    readonly version: string
  }
  readonly lastError?: string
}

export interface TextContent {
  readonly type: 'text'
  readonly text: string
}

export interface JsonContent {
  readonly type: 'json'
  readonly data: JsonValue
}

export type InspectorContent = TextContent | JsonContent

export interface PromptSummary {
  readonly name: string
  readonly description?: string
}

export interface PromptMessage {
  readonly role: 'user' | 'assistant'
  readonly content: InspectorContent
}

export interface PromptResult {
  readonly name: string
  readonly messages: readonly PromptMessage[]
}

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

export interface ResourceResult {
  readonly contents: readonly ResourceContent[]
}

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

export type AuthState =
  | { readonly status: 'not-required' }
  | { readonly status: 'required'; readonly reason?: string }
  | { readonly status: 'authenticated' }
  | { readonly status: 'failed'; readonly reason: string }

export type InspectorOperation =
  | 'list-prompts'
  | 'get-prompt'
  | 'list-resources'
  | 'read-resource'
  | 'list-resource-templates'
  | 'list-tools'
  | 'call-tool'

export interface InspectorEvent {
  readonly sequence: number
  readonly sessionId: string
  readonly type:
    | 'status-changed'
    | 'capabilities-changed'
    | 'resource-updated'
    | 'resources-list-changed'
    | 'prompts-list-changed'
    | 'tools-list-changed'
    | 'diagnostic'
  readonly timestamp: string
  readonly data?: JsonValue
}
