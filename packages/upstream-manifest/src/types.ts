export type Upstream = 'mcp-use' | 'official-inspector'

export type SourceClassification =
  | 'dependency-only'
  | 'reference-only'
  | 'copied-file'
  | 'copied-documentation'

export type LicenseClassification = 'MIT' | 'Apache-2.0' | 'CC-BY-4.0' | 'pending'

export interface UpstreamRecord {
  upstream: Upstream
  commit: string
  classification: SourceClassification
  attribution: string
  license: LicenseClassification
  sourcePath?: string
  localPath?: string
  packageNames?: string[]
  repository?: string
  note: string
}

export interface ValidationError {
  index: number
  field: string
  message: string
}
