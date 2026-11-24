import type { UpstreamRecord } from './types.ts'

export const upstreamManifest = [
  {
    upstream: 'mcp-use',
    commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
    classification: 'dependency-only',
    packageNames: ['@mcp-use/inspector', '@mcp-use/client', '@mcp-use/agent'],
    attribution: 'mcp-use contributors',
    license: 'MIT',
    note: 'Consumed only as pinned published dependencies; no mcp-use source files are copied.',
  },
  {
    upstream: 'official-inspector',
    commit: 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
    classification: 'reference-only',
    repository: 'modelcontextprotocol/inspector',
    attribution: 'Official MCP Inspector contributors',
    license: 'pending',
    note: 'Behavioral reference only. No Official Inspector files are copied; future runtime code remains blocked pending file-level legal approval.',
  },
] as const satisfies readonly UpstreamRecord[]

export type { UpstreamRecord, ValidationError } from './types.js'
