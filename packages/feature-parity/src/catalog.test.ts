import { describe, expect, test } from 'vitest'

import { parityCatalog } from './catalog.js'
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

  test('keeps future Official runtime features blocked pending file-level approval', () => {
    const futureOfficialRuntime = parityCatalog.filter(({ source }) => source === 'official-inspector')

    expect(futureOfficialRuntime.length).toBeGreaterThan(0)
    expect(futureOfficialRuntime.every(({ status }) => status === 'blocked-license')).toBe(true)
  })
})
