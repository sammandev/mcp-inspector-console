import { describe, expect, test } from 'vitest'

import { upstreamManifest } from './manifest.js'
import { validateManifest } from './validate.js'

const copiedRecord = {
  upstream: 'official-inspector' as const,
  commit: 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
  classification: 'copied-file' as const,
  sourcePath: 'core/example.ts',
  localPath: 'packages/official-runtime/src/example.ts',
  attribution: 'Official Inspector contributors',
  license: 'pending' as const,
}

describe('upstream provenance manifest', () => {
  test('pins local upstream revisions and contains no copied Official files', () => {
    expect(validateManifest(upstreamManifest)).toEqual([])
    expect(upstreamManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({
        upstream: 'mcp-use',
        commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
        classification: 'dependency-only',
      }),
      expect.objectContaining({
        upstream: 'official-inspector',
        commit: 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
        classification: 'reference-only',
      }),
    ]))
    expect((upstreamManifest as readonly { upstream: string; classification: string }[]).filter(({ upstream, classification }) =>
      upstream === 'official-inspector' && classification === 'copied-file')).toEqual([])
  })

  test.each(['sourcePath', 'commit', 'classification', 'attribution'] as const)(
    'rejects copied-file records missing %s',
    (field) => {
      const record: Record<string, unknown> = { ...copiedRecord }
      delete record[field]

      expect(validateManifest([record])).toEqual(expect.arrayContaining([
        expect.objectContaining({ field }),
      ]))
    },
  )

  test('accepts dependency-only package references without pretending they are copied paths', () => {
    expect(validateManifest([{
      upstream: 'mcp-use',
      commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
      classification: 'dependency-only',
      packageNames: ['@mcp-use/inspector', '@mcp-use/client'],
      attribution: 'mcp-use contributors',
      license: 'MIT',
    }])).toEqual([])
  })
})
