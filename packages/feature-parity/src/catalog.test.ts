import { describe, expect, test } from 'vitest'

import { parityCatalog, type ParityItem } from './catalog.js'
import { requiredCapabilities } from './requirements.test-fixture.js'

describe('feature parity catalog', () => {
  test('has stable unique IDs and covers every independent design requirement', () => {
    const ids = parityCatalog.map(({ id }) => id)
    const coverage = parityCatalog.flatMap(({ aliases }) => aliases)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(coverage)).toEqual(new Set(requiredCapabilities))
  })

  test('records every combined feature with valid machine-checkable metadata', () => {
    for (const item of parityCatalog) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(item.feature.trim()).toBe(item.feature)
      expect(['implemented', 'phase-placeholder', 'rebuild', 'non-applicable', 'blocked-license']).toContain(item.status)
      expect(item.ownerPhase).toMatch(/^phase-[0-4]$/)
      expect(['mcp-use', 'official-inspector', 'combined']).toContain(item.source)
      expect(item.note.trim().length).toBeGreaterThan(0)
      expect(item.aliases.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('reimplements Official workflows as combined features without implementing Official runtime code', () => {
    const officialSourced = (parityCatalog as readonly ParityItem[]).filter(({ source }) => source === 'official-inspector')
    expect(officialSourced.every(({ status }) => status === 'blocked-license')).toBe(true)
    const officialWorkflows = ['protocol-network-diagnostics', 'process-stderr-diagnostics', 'oauth', 'roots', 'tasks',
      'completions', 'subscriptions-logging', 'apps-schema-conformance', 'configuration-io', 'cli-automation', 'load-testing']
    for (const id of officialWorkflows) {
      expect(parityCatalog.find((item) => item.id === id)).toMatchObject({ status: 'implemented', source: 'combined' })
    }
  })

  test('maps every supported Official workflow to its native or focused destination', () => {
    const destinations: Record<string, string> = {
      'protocol-network-diagnostics': 'Protocol',
      'process-stderr-diagnostics': 'Diagnostics',
      oauth: 'Auth',
      roots: 'Client',
      tasks: 'Client',
      completions: 'Prompts and Resources',
      'subscriptions-logging': 'Resources and Notifications',
      'apps-schema-conformance': 'Tools',
      'configuration-io': 'Diagnostics',
      'cli-automation': 'Diagnostics',
      'load-testing': 'Diagnostics',
    }

    for (const [id, destination] of Object.entries(destinations)) {
      expect(parityCatalog.find((item) => item.id === id)?.note).toContain(destination)
    }
  })
})
