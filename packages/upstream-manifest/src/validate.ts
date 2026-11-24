import type { UpstreamRecord, ValidationError } from './types.ts'

const recordFields = ['upstream', 'commit', 'classification', 'attribution', 'license'] as const

export function validateManifest(records: readonly unknown[]): ValidationError[] {
  const errors: ValidationError[] = []

  records.forEach((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null) {
      errors.push({ index, field: 'record', message: 'record must be an object' })
      return
    }

    const record = candidate as Partial<UpstreamRecord> & Record<string, unknown>
    for (const field of recordFields) {
      if (typeof record[field] !== 'string' || record[field].length === 0) {
        errors.push({ index, field, message: `${field} is required` })
      }
    }

    if (record.upstream === 'mcp-use' && record.classification === 'dependency-only') {
      if (!Array.isArray(record.packageNames) || record.packageNames.length === 0 || record.packageNames.some((name) => typeof name !== 'string' || name.length === 0)) {
        errors.push({ index, field: 'packageNames', message: 'dependency-only records require package names' })
      }
    }

    if (record.classification === 'copied-file' || record.classification === 'copied-documentation') {
      for (const field of ['sourcePath', 'localPath'] as const) {
        if (typeof record[field] !== 'string' || record[field].length === 0) {
          errors.push({ index, field, message: `${field} is required for copied records` })
        }
      }
    }

    if (typeof record.commit === 'string' && !/^[0-9a-f]{40}$/.test(record.commit)) {
      errors.push({ index, field: 'commit', message: 'commit must be a full 40-character SHA' })
    }
  })

  return errors
}
