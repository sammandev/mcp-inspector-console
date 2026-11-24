import { describe, expect, expectTypeOf, test } from 'vitest'

import type {
  BackendConnectionProfile,
  BrowserSafeProfile,
  InspectorFailure,
  InspectorResult,
  SessionSnapshot,
  SessionOperations,
} from './index.js'
import { redactConnectionProfile, toBrowserSafeProfile } from './index.js'

describe('browser-safe contract boundary', () => {
  const backendProfile: BackendConnectionProfile = {
    id: 'remote',
    name: 'Remote',
    transport: 'streamable-http',
    url: 'https://user:password@example.test/mcp?token=query-secret',
    headers: {
      Authorization: 'Bearer header-secret',
      Cookie: 'session=cookie-secret',
      'X-Api-Key': 'api-secret',
      'X-Custom-Credential': 'custom-secret',
    },
    oauth: { accessToken: 'oauth-secret', refreshToken: 'refresh-secret' },
  }

  test('serializes only a redacted browser-safe profile', () => {
    const safe = toBrowserSafeProfile(backendProfile)
    const serialized = JSON.stringify(safe)

    expect(safe).toMatchObject({
      id: 'remote',
      transport: 'streamable-http',
      url: 'https://example.test/mcp',
      secretFields: ['oauth', 'headers.Authorization', 'headers.Cookie', 'headers.X-Api-Key', 'headers.X-Custom-Credential', 'url-credentials', 'url-query'],
    })
    expect(serialized).not.toMatch(/password|header-secret|cookie-secret|api-secret|custom-secret|oauth-secret|refresh-secret|query-secret/i)
    expectTypeOf<BrowserSafeProfile>().not.toHaveProperty('headers')
    expectTypeOf<BrowserSafeProfile>().not.toHaveProperty('environment')
    expectTypeOf<BrowserSafeProfile>().not.toHaveProperty('oauth')
  })

  test('redacts arbitrary secret-bearing profile JSON for diagnostics', () => {
    const redacted = redactConnectionProfile(backendProfile)
    const serialized = JSON.stringify(redacted)

    expect(serialized).toContain('[REDACTED]')
    expect(serialized).not.toMatch(/password|header-secret|cookie-secret|api-secret|custom-secret|oauth-secret|refresh-secret|query-secret/i)
  })

  test('models typed success and discriminated failure results', () => {
    const success: InspectorResult<string> = { ok: true, value: 'done' }
    const failure: InspectorResult<string> = {
      ok: false,
      error: { kind: 'authorization', code: 'approval-denied', message: 'Approval was denied.' },
    }

    expect(success.ok).toBe(true)
    if (!failure.ok) expectTypeOf(failure.error).toEqualTypeOf<InspectorFailure>()
    expect(failure.ok).toBe(false)
  })

  test('browser snapshot contains only the browser-safe profile and redacted diagnostics', () => {
    const snapshot: SessionSnapshot = {
      sessionId: 'session',
      profile: toBrowserSafeProfile(backendProfile),
      status: 'connected',
      transport: { type: 'streamable-http', url: 'https://example.test/mcp' },
      capabilities: { tools: {}, completions: true, tasks: true, roots: true, sampling: true, elicitation: true, skills: true },
      lifecycle: { generation: 1, connectedAt: '2026-11-24T00:00:00Z' },
      diagnostics: [{ type: 'auth', message: 'Bearer [REDACTED]' }],
    }

    expect(JSON.stringify(snapshot)).not.toMatch(/header-secret|cookie-secret|api-secret|custom-secret|oauth-secret|refresh-secret|query-secret|password/i)
  })

  test('operations cover promised Phase 1 capabilities without expanding the four session interfaces', () => {
    expectTypeOf<keyof SessionOperations>().toEqualTypeOf<
      | 'listTools' | 'callTool' | 'listResources' | 'readResource' | 'listResourceTemplates'
      | 'listPrompts' | 'getPrompt' | 'complete' | 'listRoots' | 'setRoots'
      | 'listTasks' | 'getTask' | 'cancelTask' | 'subscribeResource' | 'unsubscribeResource'
      | 'listSkills' | 'getSkill' | 'approveSampling' | 'rejectSampling' | 'approveElicitation'
      | 'rejectElicitation' | 'replay' | 'loadScenario' | 'exportDiagnostics'
    >()
  })
})
