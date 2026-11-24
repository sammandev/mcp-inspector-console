import type { UpstreamRecord } from './types.ts'

export const upstreamManifest = [
  {
    upstream: 'mcp-use',
    commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
    classification: 'dependency-only',
    packageNames: ['@mcp-use/inspector', '@mcp-use/client', '@mcp-use/agent'],
    attribution: 'mcp-use contributors',
    license: 'MIT',
    note: 'Pinned published packages consumed by the forked UI build and the server-side mount.',
  },
  {
    upstream: 'mcp-use',
    commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
    classification: 'copied-file',
    sourcePath: 'libraries/typescript/packages/inspector/src/client',
    localPath: 'apps/web/vendor/mcp-use/client',
    attribution: 'mcp-use contributors',
    license: 'MIT',
    note: 'Attributed UI fork; per-file checksums and marked modifications are recorded in apps/web/vendor/mcp-use/manifest.json.',
  },
  {
    upstream: 'mcp-use',
    commit: '8ff4b865e0e5712c66d5077e93392807daca9354',
    classification: 'copied-file',
    sourcePath: 'libraries/typescript/packages/inspector/public',
    localPath: 'apps/web/public/mcp-use',
    attribution: 'mcp-use contributors',
    license: 'MIT',
    note: 'Unmodified static assets used by the forked UI; checksums are recorded in apps/web/vendor/mcp-use/manifest.json.',
  },
  {
    upstream: 'official-inspector',
    commit: 'eb54b447e5377a7a18acaea9602fced5cb4c5b9f',
    classification: 'reference-only',
    repository: 'modelcontextprotocol/inspector',
    attribution: 'Official MCP Inspector contributors',
    license: 'pending',
    note: 'Behavioral reference only. No Official Inspector files are copied; its workflows are reimplemented with the MCP SDK.',
  },
] as const satisfies readonly UpstreamRecord[]

export type { UpstreamRecord, ValidationError } from './types.js'
