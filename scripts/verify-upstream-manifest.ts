import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parityCatalog } from '../packages/feature-parity/src/catalog.ts'
import { upstreamManifest } from '../packages/upstream-manifest/src/manifest.ts'
import { generateReports, verifyReports } from '../packages/upstream-manifest/src/verifier.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docs = resolve(root, 'docs')
const shouldWrite = process.argv.includes('--write')

if (shouldWrite) {
  await mkdir(docs, { recursive: true })
  const reports = generateReports(parityCatalog, upstreamManifest)
  await writeFile(resolve(docs, 'feature-parity.md'), reports.parity)
  await writeFile(resolve(docs, 'upstream-provenance.md'), reports.provenance)
} else {
  await verifyReports(docs, parityCatalog, upstreamManifest)
}

console.log(shouldWrite ? 'Generated parity and provenance reports.' : 'Parity and provenance reports are current.')
