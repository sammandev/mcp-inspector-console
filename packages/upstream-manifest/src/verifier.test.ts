import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { parityCatalog } from '../../feature-parity/src/catalog.js'
import { upstreamManifest } from './manifest.js'
import { generateReports, verifyReports } from './verifier.js'

const reportsFor = () => generateReports(parityCatalog, upstreamManifest)

describe('generated provenance reports', () => {
  test('generates deterministic reports from typed catalogs with aliases', () => {
    const reports = reportsFor()
    expect(reports.parity).toContain('8ff4b865e0e5712c66d5077e93392807daca9354')
    expect(reports.parity).toContain('eb54b447e5377a7a18acaea9602fced5cb4c5b9f')
    expect(reports.parity).toContain('| `protocol-transcript` `network-inspector` |')
    expect(reports.provenance).toContain('| dependency-only |')
    expect(reports.provenance).toContain('Official copied files: **0**')
    expect(reports).toEqual(reportsFor())
  })

  test.each(['feature-parity.md', 'upstream-provenance.md'] as const)('fails when %s drifts', async (name) => {
    const root = await mkdtemp(join(tmpdir(), 'combined-provenance-'))
    const reports = reportsFor()
    await writeFile(join(root, 'feature-parity.md'), reports.parity)
    await writeFile(join(root, 'upstream-provenance.md'), reports.provenance)
    await writeFile(join(root, name), `${await readFile(join(root, name), 'utf8')}\nmanual drift\n`)
    await expect(verifyReports(root, parityCatalog, upstreamManifest)).rejects.toThrow(new RegExp(name.replace('.', '\\.')))
  })

  test.each(['feature-parity.md', 'upstream-provenance.md'] as const)('fails when %s is missing', async (missing) => {
    const root = await mkdtemp(join(tmpdir(), 'combined-provenance-'))
    const reports = reportsFor()
    if (missing !== 'feature-parity.md') await writeFile(join(root, 'feature-parity.md'), reports.parity)
    if (missing !== 'upstream-provenance.md') await writeFile(join(root, 'upstream-provenance.md'), reports.provenance)
    await expect(verifyReports(root, parityCatalog, upstreamManifest)).rejects.toThrow(/ENOENT/)
  })

  test('verification check mode never writes missing reports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'combined-provenance-'))
    await expect(verifyReports(root, parityCatalog, upstreamManifest)).rejects.toThrow(/ENOENT/)
    await expect(readFile(join(root, 'feature-parity.md'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  test('rejects a second incompatible upstream pin', () => {
    expect(() => generateReports(parityCatalog, [
      ...upstreamManifest,
      { ...upstreamManifest[0], commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ])).toThrow(/exactly one.*mcp-use/i)
  })

  test('rejects a valid-looking record whose commit misses its upstream pin', () => {
    expect(() => generateReports(parityCatalog, upstreamManifest.map((record) =>
      record.upstream === 'mcp-use' ? { ...record, commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } : record,
    ))).toThrow(/mcp-use.*pin/i)
  })

  test.each([
    ['status', 'unknown-status'],
    ['ownerPhase', 'phase-9'],
    ['source', 'other-source'],
    ['id', ' bad id '],
    ['feature', '   '],
    ['note', '   '],
  ])('rejects invalid parity %s at runtime', (field, value) => {
    const parity = parityCatalog.map((item, index) => index === 0 ? { ...item, [field]: value } : item)
    expect(() => generateReports(parity as never, upstreamManifest)).toThrow(new RegExp(field))
  })

  test('rejects missing independent capability aliases', () => {
    const parity = parityCatalog.map((item) => item.id === 'protocol-network-diagnostics'
      ? { ...item, aliases: item.aliases.filter((alias) => alias !== 'network-inspector') }
      : item)
    expect(() => generateReports(parity as never, upstreamManifest)).toThrow(/network-inspector/)
  })
})
