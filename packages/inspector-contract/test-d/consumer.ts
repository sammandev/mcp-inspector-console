import type {
  BackendConnectionProfile,
  BrowserSafeProfile,
  ConnectionProfile,
  InspectorEvent,
  InspectorOperation,
  SessionLifecycle,
  SessionOperations,
  SessionDiagnostics,
  SessionSubscriptions,
  UnifiedInspectorSession,
} from '@combined-mcp-inspector/contract'
import { toBrowserSafeProfile } from '@combined-mcp-inspector/contract'

const ok = <T>(value: T) => ({ ok: true, value } as const)
const backendProfile: BackendConnectionProfile = {
  id: 'stdio-consumer', transport: 'stdio', command: 'node', args: ['server.js'], environment: { NODE_ENV: 'test' },
}
const profile: ConnectionProfile = { id: backendProfile.id, transport: 'stdio', command: 'node', args: ['server.js'] }
const safeProfile: BrowserSafeProfile = toBrowserSafeProfile(backendProfile)

const lifecycle: SessionLifecycle = {
  connect: async () => ok(undefined), disconnect: async () => ok(undefined), reconnect: async () => ok(undefined),
}
const operations: SessionOperations = {
  listPrompts: async () => ok([]), getPrompt: async () => ok({ name: 'prompt', messages: [] }),
  listResources: async () => ok([]), readResource: async () => ok({ contents: [] }),
  listResourceTemplates: async () => ok([]), listTools: async () => ok([]), callTool: async () => ok({ content: [] }),
  complete: async () => ok({ values: [] }), listRoots: async () => ok([]), setRoots: async (roots) => ok(roots),
  listTasks: async () => ok([]), getTask: async (taskId) => ok({ taskId, status: 'completed' }),
  cancelTask: async (taskId) => ok({ taskId, status: 'cancelled' }), subscribeResource: async () => ok(undefined),
  unsubscribeResource: async () => ok(undefined), listSkills: async () => ok([]), getSkill: async (name) => ok({ name }),
  approveSampling: async (request) => ok({ requestId: request.requestId, decision: 'approved' }),
  rejectSampling: async (request) => ok({ requestId: request.requestId, decision: 'rejected' }),
  approveElicitation: async (request) => ok({ requestId: request.requestId, decision: 'approved' }),
  rejectElicitation: async (request) => ok({ requestId: request.requestId, decision: 'rejected' }),
  replay: async () => ok(null), loadScenario: async () => ok(null),
  exportDiagnostics: async () => ok({ snapshot: diagnostics.getSnapshot(), generatedAt: 'now' }),
}
const diagnostics: SessionDiagnostics = {
  getSnapshot: () => ({
    sessionId: 'session-consumer', profile: safeProfile, status: 'connected',
    transport: { type: 'stdio', command: profile.command }, capabilities: {}, lifecycle: { generation: 1 },
  }),
  ping: async () => ok({ latencyMs: 1 }), getAuthState: () => ok({ status: 'not-required' }),
}
const subscriptions: SessionSubscriptions = { subscribe: () => () => {} }
const session: UnifiedInspectorSession = { profileId: profile.id, sessionId: 'session-consumer', lifecycle, operations, diagnostics, subscriptions }
const operation: InspectorOperation = 'list-tools'
const event: InspectorEvent = { sequence: 1, sessionId: session.sessionId, type: 'tools-list-changed', timestamp: '2026-11-24T00:00:00.000Z' }

void operation
void event
