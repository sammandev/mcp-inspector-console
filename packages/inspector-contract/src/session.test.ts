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

describe('upstream-independent inspector contract', () => {
  test('discriminates the three supported connection profiles', () => {
    const profiles: ConnectionProfile[] = [
      { id: 'stdio-1', transport: 'stdio', command: 'node', args: ['server.js'] },
      { id: 'http-1', transport: 'streamable-http', url: 'https://localhost:3000/mcp' },
      { id: 'sse-1', transport: 'sse', url: 'https://localhost:3000/sse' },
    ]

    expect(profiles.map(({ transport }) => transport)).toEqual([
      'stdio',
      'streamable-http',
      'sse',
    ])
  })

  test('owns serializable capability and transport DTOs', () => {
    const snapshot: SessionSnapshot = {
      sessionId: 'session-1',
      profileId: 'http-1',
      status: 'connected',
      transport: {
        type: 'streamable-http',
        url: 'https://localhost:3000/mcp',
      },
      capabilities: {
        prompts: true,
        resources: { subscribe: true },
        tools: {},
        logging: true,
      },
    }

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  test('composes a fake session from four small contract-only interfaces', () => {
    const lifecycle: SessionLifecycle = {
      connect: async () => {},
      disconnect: async () => {},
      reconnect: async () => {},
    }
    const operations: SessionOperations = {
      listPrompts: async () => [],
      getPrompt: async () => ({ name: 'none', messages: [] }),
      listResources: async () => [],
      readResource: async () => ({ contents: [] }),
      listResourceTemplates: async () => [],
      listTools: async () => [],
      callTool: async () => ({ content: [] }),
    }
    const diagnostics: SessionDiagnostics = {
      getSnapshot: () => ({
        sessionId: 'session-1',
        profileId: 'stdio-1',
        status: 'connected',
        transport: { type: 'stdio', command: 'node' },
        capabilities: {},
      }),
      ping: async () => ({ latencyMs: 1 }),
      getAuthState: () => ({ status: 'not-required' }),
    }
    const subscriptions: SessionSubscriptions = {
      subscribe: () => () => {},
    }
    const session: UnifiedInspectorSession = {
      profileId: 'stdio-1',
      sessionId: 'session-1',
      lifecycle,
      operations,
      diagnostics,
      subscriptions,
    }

    expect(session.operations).toBe(operations)
    expect(session.lifecycle).toBe(lifecycle)
    expectTypeOf<InspectorOperation>().toMatchTypeOf<string>()
    expectTypeOf<InspectorEvent>().toMatchTypeOf<object>()
  })

  test('narrows transport-specific profile fields', () => {
    const inspect = (profile: ConnectionProfile) => {
      switch (profile.transport) {
        case 'stdio':
          expectTypeOf(profile.command).toEqualTypeOf<string>()
          return profile.command
        case 'streamable-http':
        case 'sse':
          expectTypeOf(profile.url).toEqualTypeOf<string>()
          return profile.url
      }
    }

    expect(inspect({ id: 'stdio', transport: 'stdio', command: 'node' })).toBe('node')
  })

  test('rejects invalid transport, operation, event, and session shapes', () => {
    const stdio: ConnectionProfile = {
      id: 'stdio',
      transport: 'stdio',
      command: 'node',
      environment: { MODE: 'test' },
    }
    const invalidStdio: ConnectionProfile = {
      id: 'stdio',
      transport: 'stdio',
      command: 'node',
      // @ts-expect-error stdio profiles have a command, not a URL
      url: 'https://localhost/mcp',
    }
    // @ts-expect-error HTTP profiles cannot carry stdio environment variables
    const invalidHttp = { id: 'http', transport: 'sse', url: 'https://localhost/sse', environment: {} } satisfies ConnectionProfile
    // @ts-expect-error operations are a closed set of capability commands
    const invalidOperation: InspectorOperation = 'delete-everything'
    // @ts-expect-error event variants are contract-owned and closed
    const invalidEvent: InspectorEvent['type'] = 'server-exploded'
    // @ts-expect-error UnifiedInspectorSession requires all four composed interface areas
    const missingDiagnostics: UnifiedInspectorSession = {
      profileId: 'stdio',
      sessionId: 'session',
      lifecycle: {} as SessionLifecycle,
      operations: {} as SessionOperations,
      subscriptions: {} as SessionSubscriptions,
    }
    // @ts-expect-error stable session IDs are required on the composed interface
    const missingSessionId: UnifiedInspectorSession = {
      profileId: 'stdio',
      lifecycle: {} as SessionLifecycle,
      operations: {} as SessionOperations,
      diagnostics: {} as SessionDiagnostics,
      subscriptions: {} as SessionSubscriptions,
    }

    void invalidStdio
    void invalidHttp
    void invalidOperation
    void invalidEvent
    void missingDiagnostics
    void missingSessionId
  })
})
