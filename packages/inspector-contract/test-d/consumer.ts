import type {
  ConnectionProfile,
  InspectorEvent,
  InspectorOperation,
  SessionLifecycle,
  SessionOperations,
  SessionDiagnostics,
  SessionSubscriptions,
  UnifiedInspectorSession,
} from '@combined-mcp-inspector/contract'

const profile: ConnectionProfile = {
  id: 'stdio-consumer',
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
  environment: { NODE_ENV: 'test' },
}

const lifecycle: SessionLifecycle = {
  connect: async () => {},
  disconnect: async () => {},
  reconnect: async () => {},
}
const operations: SessionOperations = {
  listPrompts: async () => [],
  getPrompt: async () => ({ name: 'prompt', messages: [] }),
  listResources: async () => [],
  readResource: async () => ({ contents: [] }),
  listResourceTemplates: async () => [],
  listTools: async () => [],
  callTool: async () => ({ content: [] }),
}
const diagnostics: SessionDiagnostics = {
  getSnapshot: () => ({
    sessionId: 'session-consumer',
    profileId: profile.id,
    status: 'connected',
    transport: { type: 'stdio', command: profile.command },
    capabilities: {},
  }),
  ping: async () => ({ latencyMs: 1 }),
  getAuthState: () => ({ status: 'not-required' }),
}
const subscriptions: SessionSubscriptions = {
  subscribe: () => () => {},
}

const session: UnifiedInspectorSession = {
  profileId: profile.id,
  sessionId: 'session-consumer',
  lifecycle,
  operations,
  diagnostics,
  subscriptions,
}
const operation: InspectorOperation = 'list-tools'
const event: InspectorEvent = {
  sequence: 1,
  sessionId: session.sessionId,
  type: 'tools-list-changed',
  timestamp: '2026-11-24T00:00:00.000Z',
}

void operation
void event
