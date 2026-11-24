import { describe, expect, test } from 'vitest'

import { parityCatalog } from './catalog.js'

const expectedFeatures = [
  'Provenance and scaffold',
  'Unified connection foundation',
  'Chat',
  'Tools',
  'Prompts',
  'Resources',
  'Skills',
  'Apps and widgets',
  'Sampling, elicitation, and notifications',
  'Saved requests and history',
  'Multi-server UX and theme behavior',
  'Protocol and network diagnostics',
  'Process and stderr diagnostics',
  'OAuth diagnostics',
  'Roots',
  'Tasks',
  'Completions',
  'Subscriptions and logging controls',
  'Apps and schema conformance',
  'Configuration import and export',
  'Automation and CLI assertions',
  'Load testing',
] as const

describe('feature parity catalog', () => {
  test('records every combined feature exactly once with a status, phase, and source', () => {
    expect(parityCatalog.map(({ feature }) => feature)).toEqual(expectedFeatures)
    expect(new Set(parityCatalog.map(({ feature }) => feature)).size).toBe(expectedFeatures.length)

    for (const item of parityCatalog) {
      expect(['implemented', 'phase-placeholder', 'rebuild', 'non-applicable', 'blocked-license']).toContain(item.status)
      expect(item.ownerPhase).toMatch(/^phase-[0-4]$/)
      expect(item.source).toMatch(/^(mcp-use|official-inspector|combined)$/)
      expect(item.note.length).toBeGreaterThan(0)
    }
  })

  test('keeps future Official runtime features blocked pending file-level approval', () => {
    const futureOfficialRuntime = parityCatalog.filter(
      ({ source }) => source === 'official-inspector',
    )

    expect(futureOfficialRuntime.length).toBeGreaterThan(0)
    expect(futureOfficialRuntime.every(({ status }) => status === 'blocked-license')).toBe(true)
  })
})
