import { describe, expect, test } from 'vitest'

import { upstreamManifest } from './manifest.js'
import { validateManifest } from './validate.js'

const copiedRecord = {
  upstream: 'official-inspector',
  commit: 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
  classification: 'copied-file',
  sourcePath: 'core/example.ts',
  localPath: 'packages/official-runtime/src/example.ts',
  attribution: 'Official Inspector contributors',
  license: 'Apache-2.0',
  note: 'Approved per-file copy.',
}

const requiredCopiedFields = [
  'upstream', 'commit', 'classification', 'sourcePath', 'localPath', 'attribution', 'license', 'note',
] as const

describe('upstream provenance manifest', () => {
  test('accepts the Phase 0 manifest', () => {
    expect(validateManifest(upstreamManifest)).toEqual([])
  })

  test.each(requiredCopiedFields)('rejects copied-file records missing %s', (field) => {
    const record: Record<string, unknown> = { ...copiedRecord }
    delete record[field]
    expect(validateManifest([record])).toEqual(expect.arrayContaining([expect.objectContaining({ field })]))
  })

  test.each([
    ['upstream', 'other-upstream'],
    ['classification', 'vendored'],
    ['license', 'GPL-3.0'],
    ['commit', 'ABC'],
    ['commit', ' eb54b447e5377a7a18acaea9602fced5cb4c5b9f'],
    ['attribution', '   '],
    ['attribution', ' leading'],
    ['sourcePath', '/absolute/path.ts'],
    ['sourcePath', '../escape.ts'],
    ['sourcePath', 'core\\windows.ts'],
    ['sourcePath', 'core//file.ts'],
    ['localPath', 'packages/../escape.ts'],
    ['localPath', './packages/file.ts'],
    ['localPath', 'packages//file.ts'],
    ['note', ' trailing '],
    ['license', 'pending'],
  ])('rejects malformed copied record %s=%s', (field, value) => {
    const errors = validateManifest([{ ...copiedRecord, [field]: value }])
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]))
  })

  test('requires copied-documentation records to have positive licenses and paths', () => {
    const record = { ...copiedRecord, classification: 'copied-documentation', sourcePath: '', license: 'pending' }
    expect(validateManifest([record])).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'sourcePath' }),
      expect.objectContaining({ field: 'license' }),
    ]))
  })

  test('validates optional paths on reference-only records', () => {
    expect(validateManifest([{
      upstream: 'official-inspector',
      commit: 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
      classification: 'reference-only',
      sourcePath: '../invalid',
      attribution: 'Official MCP Inspector contributors',
      license: 'pending',
      note: 'Reference only.',
    }])).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sourcePath' })]))
  })

  test('rejects package references that are blank, malformed, or have copied paths', () => {
    for (const packageNames of [[], [' '], [' leading'], ['package name'], [42]]) {
      expect(validateManifest([{
        upstream: 'mcp-use',
        commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
        classification: 'dependency-only',
        packageNames,
        attribution: 'mcp-use contributors',
        license: 'MIT',
        note: 'Dependency only.',
      }])).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'packageNames' })]))
    }
    expect(validateManifest([{
      ...copiedRecord,
      upstream: 'mcp-use',
      classification: 'dependency-only',
      packageNames: ['@mcp-use/client'],
    }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'sourcePath' }),
      expect.objectContaining({ field: 'localPath' }),
    ]))
  })

  test('accepts distinct dependency-only package references', () => {
    expect(validateManifest([{
      upstream: 'mcp-use',
      commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
      classification: 'dependency-only',
      packageNames: ['@mcp-use/inspector', '@mcp-use/client'],
      attribution: 'mcp-use contributors',
      license: 'MIT',
      note: 'Dependency only.',
    }])).toEqual([])
  })
})
