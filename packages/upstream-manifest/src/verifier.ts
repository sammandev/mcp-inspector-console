import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { featureSources, ownerPhases, parityStatuses, type ParityItem } from '../../feature-parity/src/catalog.ts'
import { requiredCapabilities } from '../../feature-parity/src/requirements.test-fixture.ts'
import type { UpstreamRecord } from './types.ts'
import { validateManifest } from './validate.ts'

const requiredPins = {
  'mcp-use': '8ff4b865e0e5712c66d5077e93392807daca9354',
  'official-inspector': 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
} as const

const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ')
const isTrimmed = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value === value.trim()
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateParity(parity: readonly unknown[]) {
  const ids = new Set<string>()
  const coverage = new Set<string>()

  parity.forEach((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) throw new Error(`parity item ${index}: must be an object`)
    const item = candidate as Record<string, unknown>
    if (!isTrimmed(item.id) || !idPattern.test(item.id)) throw new Error(`parity item ${index} id is invalid`)
    if (ids.has(item.id)) throw new Error(`parity id ${item.id} is duplicated`)
    ids.add(item.id)
    if (!isTrimmed(item.feature)) throw new Error(`parity item ${index} feature must be nonblank`)
    if (!parityStatuses.includes(item.status as typeof parityStatuses[number])) throw new Error(`parity item ${index} status is invalid`)
    if (!ownerPhases.includes(item.ownerPhase as typeof ownerPhases[number])) throw new Error(`parity item ${index} ownerPhase is invalid`)
    if (!featureSources.includes(item.source as typeof featureSources[number])) throw new Error(`parity item ${index} source is invalid`)
    if (!isTrimmed(item.note)) throw new Error(`parity item ${index} note must be nonblank`)
    if (!Array.isArray(item.aliases) || item.aliases.length === 0) throw new Error(`parity item ${index} aliases must be a nonempty array`)
    for (const alias of item.aliases) {
      if (!isTrimmed(alias) || !idPattern.test(alias)) throw new Error(`parity item ${index} alias is invalid`)
      if (coverage.has(alias)) throw new Error(`parity capability ${alias} is duplicated`)
      coverage.add(alias)
    }
  })

  const missing = requiredCapabilities.filter((capability) => !coverage.has(capability))
  if (missing.length) throw new Error(`Parity catalog is missing required capabilities: ${missing.join(', ')}`)
  const unexpected = [...coverage].filter((capability) => !requiredCapabilities.includes(capability as typeof requiredCapabilities[number]))
  if (unexpected.length) throw new Error(`Parity catalog has unknown capability aliases: ${unexpected.join(', ')}`)

  const futureOfficial = parity as readonly ParityItem[]
  if (futureOfficial.some(({ source, ownerPhase, status }) =>
    source === 'official-inspector' && ownerPhase !== 'phase-0' && status !== 'blocked-license')) {
    throw new Error('Future Official runtime features must remain blocked-license')
  }
}

function validateInventories(parity: readonly unknown[], manifest: readonly unknown[]) {
  validateParity(parity)
  const manifestErrors = validateManifest(manifest)
  if (manifestErrors.length) {
    throw new Error(`Invalid upstream manifest: ${manifestErrors.map(({ index, field, message }) => `record ${index} ${field}: ${message}`).join('; ')}`)
  }

  const records = manifest as readonly UpstreamRecord[]
  for (const [upstream, commit] of Object.entries(requiredPins)) {
    const matches = records.filter((record) => record.upstream === upstream)
    if (matches.length !== 1) throw new Error(`Manifest requires exactly one pin for ${upstream}`)
    if (matches[0].commit !== commit) throw new Error(`${upstream} commit does not match required pin ${commit}`)
    const expectedClassification = upstream === 'mcp-use' ? 'dependency-only' : 'reference-only'
    if (matches[0].classification !== expectedClassification) throw new Error(`${upstream} must use ${expectedClassification} classification`)
  }
  const copiedOfficial = records.filter(({ upstream, classification }) =>
    upstream === 'official-inspector' && (classification === 'copied-file' || classification === 'copied-documentation'))
  if (copiedOfficial.length) throw new Error('Phase 0 permits zero copied Official Inspector files')
}

export function generateReports(parity: readonly unknown[], manifest: readonly unknown[]) {
  validateInventories(parity, manifest)
  const items = parity as readonly ParityItem[]
  const records = manifest as readonly UpstreamRecord[]
  const copiedOfficialCount = records.filter(({ upstream, classification }) =>
    upstream === 'official-inspector' && (classification === 'copied-file' || classification === 'copied-documentation')).length

  const parityRows = items.map((item) => `| ${item.id} | ${escapeCell(item.feature)} | ${item.aliases.map((alias) => `\`${alias}\``).join(' ')} | ${item.status} | ${item.ownerPhase} | ${item.source} | ${escapeCell(item.note)} |`)
  const parityReport = [
    '# Feature parity', '',
    '<!-- Generated by `pnpm verify:provenance`; do not edit directly. -->', '',
    `Reference revisions: mcp-use \`${requiredPins['mcp-use']}\`; Official Inspector \`${requiredPins['official-inspector']}\`.`, '',
    'Each combined feature has exactly one status, owner phase, and upstream origin/source. Capability aliases provide stable machine-readable coverage IDs.', '',
    '| ID | Feature | Capability aliases | Status | Owner phase | Source | Note |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...parityRows, '',
    '## Status meanings', '',
    '- `implemented`: present in Phase 0.',
    '- `phase-placeholder`: represented in the scaffold and owned by a later phase.',
    '- `rebuild`: intentionally recreated around published contracts or a combined design.',
    '- `non-applicable`: intentionally not part of the combined product.',
    '- `blocked-license`: future Official runtime reuse is pending positive file-level legal approval.', '',
  ].join('\n')

  const provenanceRows = records.map((record) => {
    const location = record.classification === 'dependency-only'
      ? (record.packageNames ?? []).join(', ')
      : record.repository ?? record.sourcePath ?? '—'
    return `| ${record.upstream} | \`${record.commit}\` | ${record.classification} | ${escapeCell(location)} | ${record.localPath ?? '—'} | ${record.license} | ${escapeCell(record.attribution)} | ${escapeCell(record.note)} |`
  })
  const provenanceReport = [
    '# Upstream provenance', '',
    '<!-- Generated by `pnpm verify:provenance`; do not edit directly. -->', '',
    `Official copied files: **${copiedOfficialCount}**`, '',
    'Phase 0 copies no Official Inspector files. Dependency-only mcp-use records identify package names rather than invented copied source identifiers. Future Official runtime code remains `blocked-license` until positive human/legal file-level classification.', '',
    '| Upstream | Pinned commit | Classification | Source/package | Local path | License | Attribution | Note |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...provenanceRows, '',
  ].join('\n')

  return { parity: parityReport, provenance: provenanceReport }
}

export async function verifyReports(root: string, parity: readonly unknown[], manifest: readonly unknown[]) {
  const expected = generateReports(parity, manifest)
  for (const [name, content] of [['feature-parity.md', expected.parity], ['upstream-provenance.md', expected.provenance]] as const) {
    const actual = await readFile(join(root, name), 'utf8')
    if (actual !== content) throw new Error(`${name} has drifted from the typed catalogs; run the provenance verifier generator`)
  }
}
