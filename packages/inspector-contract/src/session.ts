import type {
  ApprovalResult,
  CompletionResult,
  DiagnosticBundle,
  ElicitationRequest,
  InspectorEvent,
  InspectorResult,
  JsonValue,
  LoadScenario,
  PromptResult,
  PromptSummary,
  ReplayRequest,
  ResourceResult,
  ResourceSummary,
  ResourceTemplateSummary,
  Root,
  SamplingRequest,
  SessionSnapshot,
  SkillSummary,
  TaskSummary,
  ToolResult,
  ToolSummary,
  AuthState,
} from './types.js'

export interface SessionLifecycle {
  connect(): Promise<InspectorResult<void>>
  disconnect(): Promise<InspectorResult<void>>
  reconnect(): Promise<InspectorResult<void>>
}

export interface SessionOperations {
  listPrompts(): Promise<InspectorResult<readonly PromptSummary[]>>
  getPrompt(name: string, args?: Readonly<Record<string, string>>): Promise<InspectorResult<PromptResult>>
  listResources(): Promise<InspectorResult<readonly ResourceSummary[]>>
  readResource(uri: string): Promise<InspectorResult<ResourceResult>>
  listResourceTemplates(): Promise<InspectorResult<readonly ResourceTemplateSummary[]>>
  listTools(): Promise<InspectorResult<readonly ToolSummary[]>>
  callTool(name: string, args?: Readonly<Record<string, JsonValue>>): Promise<InspectorResult<ToolResult>>
  complete(reference: { type: 'prompt'; name: string } | { type: 'resource'; uri: string }, argument: string, value: string): Promise<InspectorResult<CompletionResult>>
  listRoots(): Promise<InspectorResult<readonly Root[]>>
  setRoots(roots: readonly Root[]): Promise<InspectorResult<readonly Root[]>>
  listTasks(): Promise<InspectorResult<readonly TaskSummary[]>>
  getTask(taskId: string): Promise<InspectorResult<TaskSummary>>
  cancelTask(taskId: string): Promise<InspectorResult<TaskSummary>>
  subscribeResource(uri: string): Promise<InspectorResult<void>>
  unsubscribeResource(uri: string): Promise<InspectorResult<void>>
  listSkills(): Promise<InspectorResult<readonly SkillSummary[]>>
  getSkill(name: string): Promise<InspectorResult<SkillSummary>>
  approveSampling(request: SamplingRequest, response: JsonValue): Promise<InspectorResult<ApprovalResult>>
  rejectSampling(request: SamplingRequest, reason?: string): Promise<InspectorResult<ApprovalResult>>
  approveElicitation(request: ElicitationRequest, response: JsonValue): Promise<InspectorResult<ApprovalResult>>
  rejectElicitation(request: ElicitationRequest, reason?: string): Promise<InspectorResult<ApprovalResult>>
  replay(request: ReplayRequest): Promise<InspectorResult<JsonValue>>
  loadScenario(scenario: LoadScenario): Promise<InspectorResult<JsonValue>>
  exportDiagnostics(): Promise<InspectorResult<DiagnosticBundle>>
}

export interface SessionDiagnostics {
  getSnapshot(): SessionSnapshot
  ping(): Promise<InspectorResult<{ readonly latencyMs: number }>>
  getAuthState(): InspectorResult<AuthState>
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
