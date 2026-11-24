import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { parityCatalog } from '../../feature-parity/src/catalog.js'
import { upstreamManifest } from './manifest.js'
import { generateReports, verifyReports } from './verifier.js'

describe('generated provenance reports', () => {
  test('generates deterministic reports from typed catalogs', () => {
    const reports = generateReports(parityCatalog, upstreamManifest)

    expect(reports.parity).toContain('8ff4b865e0e5712c66d5077e93392807daca9354')
    expect(reports.parity).toContain('eb54b447e5377a7a18acaea9602fced5cb4c5b9f')
    expect(reports.provenance).toContain('| dependency-only |')
    expect(reports.provenance).toContain('Official copied files: **0**')
    expect(reports).toEqual(generateReports(parityCatalog, upstreamManifest))
  })

  test('fails when a generated report drifts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'combined-provenance-'))
    const reports = generateReports(parityCatalog, upstreamManifest)
    await writeFile(join(root, 'feature-parity.md'), `${reports.parity}\nmanual drift\n`)
    await writeFile(join(root, 'upstream-provenance.md'), reports.provenance)

    await expect(verifyReports(root, parityCatalog, upstreamManifest)).rejects.toThrow(/feature-parity\.md/)
  })
})
