import type { LicenseClassification, SourceClassification, Upstream, UpstreamRecord, ValidationError } from './types.ts'

export const upstreamAllowlist = ['mcp-use', 'official-inspector'] as const satisfies readonly Upstream[]
export const classificationAllowlist = ['dependency-only', 'reference-only', 'copied-file', 'copied-documentation'] as const satisfies readonly SourceClassification[]
export const licenseAllowlist = ['MIT', 'Apache-2.0', 'CC-BY-4.0', 'pending'] as const satisfies readonly LicenseClassification[]

const requiredFields = ['upstream', 'commit', 'classification', 'attribution', 'license', 'note'] as const
const copiedFields = ['sourcePath', 'localPath'] as const
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value === value.trim()
const validPath = (value: unknown): value is string => nonBlank(value)
  && !value.includes('\\')
  && !value.includes('//')
  && !value.startsWith('/')
  && !value.startsWith('./')
  && !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
const validPackageName = (value: unknown): value is string => nonBlank(value)
  && /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/.test(value)

export function validateManifest(records: readonly unknown[]): ValidationError[] {
  const errors: ValidationError[] = []

  records.forEach((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      errors.push({ index, field: 'record', message: 'record must be an object' })
      return
    }

    const record = candidate as Partial<UpstreamRecord> & Record<string, unknown>
    for (const field of requiredFields) {
      if (!nonBlank(record[field])) errors.push({ index, field, message: `${field} must be a nonblank trimmed string` })
    }

    if (record.upstream !== undefined && !upstreamAllowlist.includes(record.upstream as Upstream)) {
      errors.push({ index, field: 'upstream', message: `upstream must be one of ${upstreamAllowlist.join(', ')}` })
    }
    if (record.classification !== undefined && !classificationAllowlist.includes(record.classification as SourceClassification)) {
      errors.push({ index, field: 'classification', message: `classification must be one of ${classificationAllowlist.join(', ')}` })
    }
    if (record.license !== undefined && !licenseAllowlist.includes(record.license as LicenseClassification)) {
      errors.push({ index, field: 'license', message: `license must be one of ${licenseAllowlist.join(', ')}` })
    }
    if (typeof record.commit === 'string' && !/^[0-9a-f]{40}$/.test(record.commit)) {
      errors.push({ index, field: 'commit', message: 'commit must be a lowercase full 40-character SHA' })
    }

    if (record.classification === 'dependency-only') {
      if (!Array.isArray(record.packageNames) || record.packageNames.length === 0 || record.packageNames.some((name) => !validPackageName(name))) {
        errors.push({ index, field: 'packageNames', message: 'dependency-only records require valid package names' })
      }
      for (const field of copiedFields) {
        if (record[field] !== undefined) errors.push({ index, field, message: `${field} is invalid for dependency-only records` })
      }
    }

    if (record.classification === 'reference-only') {
      if (!nonBlank(record.repository)) errors.push({ index, field: 'repository', message: 'repository must identify the reference source' })
      if (record.packageNames !== undefined) errors.push({ index, field: 'packageNames', message: 'packageNames is invalid for reference-only records' })
      if (record.localPath !== undefined) errors.push({ index, field: 'localPath', message: 'localPath is invalid for reference-only records' })
      if (record.sourcePath !== undefined && !validPath(record.sourcePath)) {
        errors.push({ index, field: 'sourcePath', message: 'sourcePath must be a normalized relative POSIX path' })
      }
    }

    if (record.classification === 'copied-file' || record.classification === 'copied-documentation') {
      for (const field of copiedFields) {
        if (!validPath(record[field])) errors.push({ index, field, message: `${field} must be a normalized relative POSIX path` })
      }
      if (record.license === 'pending') errors.push({ index, field: 'license', message: 'copied records require a positive file-level license classification' })
      if (record.packageNames !== undefined) errors.push({ index, field: 'packageNames', message: 'packageNames is invalid for copied records' })
    }
  })

  return errors
}
