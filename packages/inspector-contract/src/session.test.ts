import { describe, expect, expectTypeOf, test } from 'vitest'

import type {
  ConnectionProfile,
  InspectorEvent,
  InspectorOperation,
  SessionDiagnostics,
  SessionLifecycle,
  SessionOperations,
  SessionSnapshot,
  SessionSubscriptions,
  UnifiedInspectorSession,
} from './index.js'

const ok = <T>(value: T) => ({ ok: true, value } as const)

describe('upstream-independent inspector contract', () => {
  test('discriminates the three supported connection profiles', () => {
    const profiles: ConnectionProfile[] = [
      { id: 'stdio-1', transport: 'stdio', command: 'node', args: ['server.js'] },
      { id: 'http-1', transport: 'streamable-http', url: 'https://localhost:3000/mcp' },
      { id: 'sse-1', transport: 'sse', url: 'https://localhost:3000/sse' },
    ]
    expect(profiles.map(({ transport }) => transport)).toEqual(['stdio', 'streamable-http', 'sse'])
  })

  test('owns serializable capability and transport DTOs', () => {
    const snapshot: SessionSnapshot = {
      sessionId: 'session-1',
      profile: { id: 'http-1', transport: 'streamable-http', url: 'https://localhost:3000/mcp', secretFields: [] },
      status: 'connected',
      transport: { type: 'streamable-http', url: 'https://localhost:3000/mcp' },
      capabilities: { prompts: true, resources: { subscribe: true }, tools: {}, logging: true },
      lifecycle: { generation: 1 },
    }
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  test('composes a fake session from four small contract-only interfaces', () => {
    const lifecycle: SessionLifecycle = {
      connect: async () => ok(undefined), disconnect: async () => ok(undefined), reconnect: async () => ok(undefined),
    }
    const operations: SessionOperations = {
      listPrompts: async () => ok([]), getPrompt: async () => ok({ name: 'none', messages: [] }),
      listResources: async () => ok([]), readResource: async () => ok({ contents: [] }),
      listResourceTemplates: async () => ok([]), listTools: async () => ok([]), callTool: async () => ok({ content: [] }),
      complete: async () => ok({ values: [] }), listRoots: async () => ok([]), setRoots: async (roots) => ok(roots),
      listTasks: async () => ok([]), getTask: async (taskId) => ok({ taskId, status: 'completed' }),
      cancelTask: async (taskId) => ok({ taskId, status: 'cancelled' }), subscribeResource: async () => ok(undefined),
      unsubscribeResource: async () => ok(undefined), listSkills: async () => ok([]),
      getSkill: async (name) => ok({ name }), approveSampling: async (request) => ok({ requestId: request.requestId, decision: 'approved' }),
      rejectSampling: async (request) => ok({ requestId: request.requestId, decision: 'rejected' }),
      approveElicitation: async (request) => ok({ requestId: request.requestId, decision: 'approved' }),
      rejectElicitation: async (request) => ok({ requestId: request.requestId, decision: 'rejected' }),
      replay: async () => ok(null), loadScenario: async () => ok(null),
      exportDiagnostics: async () => ok({ snapshot: diagnostics.getSnapshot(), generatedAt: 'now' }),
    }
    const diagnostics: SessionDiagnostics = {
      getSnapshot: () => ({
        sessionId: 'session-1', profile: { id: 'stdio-1', transport: 'stdio', command: 'node', secretFields: [] },
        status: 'connected', transport: { type: 'stdio', command: 'node' }, capabilities: {}, lifecycle: { generation: 1 },
      }),
      ping: async () => ok({ latencyMs: 1 }), getAuthState: () => ok({ status: 'not-required' }),
    }
    const subscriptions: SessionSubscriptions = { subscribe: () => () => {} }
    const session: UnifiedInspectorSession = { profileId: 'stdio-1', sessionId: 'session-1', lifecycle, operations, diagnostics, subscriptions }

    expect(session.operations).toBe(operations)
    expect(session.lifecycle).toBe(lifecycle)
    expectTypeOf<InspectorOperation>().toMatchTypeOf<string>()
    expectTypeOf<InspectorEvent>().toMatchTypeOf<object>()
  })

  test('narrows transport-specific profile fields', () => {
    const inspect = (profile: ConnectionProfile) => {
      switch (profile.transport) {
        case 'stdio': expectTypeOf(profile.command).toEqualTypeOf<string>(); return profile.command
        case 'streamable-http':
        case 'sse': expectTypeOf(profile.url).toEqualTypeOf<string>(); return profile.url
      }
    }
    expect(inspect({ id: 'stdio', transport: 'stdio', command: 'node' })).toBe('node')
  })

  test('rejects invalid transport, operation, event, and session shapes', () => {
    const invalidStdio: ConnectionProfile = {
      id: 'stdio', transport: 'stdio', command: 'node',
      // @ts-expect-error stdio profiles have a command, not a URL
      url: 'https://localhost/mcp',
    }
    // @ts-expect-error backend secrets do not belong on the browser-safe profile
    const invalidHttp = { id: 'http', transport: 'sse', url: 'https://localhost/sse', environment: {} } satisfies ConnectionProfile
    // @ts-expect-error operations are a closed set of capability commands
    const invalidOperation: InspectorOperation = 'delete-everything'
    // @ts-expect-error event variants are contract-owned and closed
    const invalidEvent: InspectorEvent['type'] = 'server-exploded'
    // @ts-expect-error UnifiedInspectorSession requires all four composed interface areas
    const missingDiagnostics: UnifiedInspectorSession = { profileId: 'stdio', sessionId: 'session', lifecycle: {} as SessionLifecycle, operations: {} as SessionOperations, subscriptions: {} as SessionSubscriptions }

    void invalidStdio; void invalidHttp; void invalidOperation; void invalidEvent; void missingDiagnostics
  })
})
